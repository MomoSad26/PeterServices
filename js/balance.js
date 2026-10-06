/* ---------------------------------------------------------------------- *
 * 16. MENÚ 10 — BALANCE
 * ---------------------------------------------------------------------- */
let balancePeriod = 'Hoy';
let balanceCustomDesde = null, balanceCustomHasta = null;

function periodStart(period){
  if(period==='Hoy') return todayRangeStart();
  if(period==='Semanal') return startOfWeek();
  if(period==='Mensual') return startOfMonth();
  if(period==='Anual') return startOfYear();
  if(period==='Personalizado') return balanceCustomDesde;
  return null;
}
function periodEnd(period){
  if(period==='Personalizado') return balanceCustomHasta;
  return null;
}

function computeFilteredBalance(period){
  const start = periodStart(period);
  const end = periodEnd(period);
  const totals = {};

  function inRange(ts){
    if(ts === null || ts === undefined) return false;
    if(start !== null && start !== undefined && ts < start) return false;
    if(end !== null && end !== undefined && ts > end) return false;
    return true;
  }

  function add(divisa, monto){
    if(!divisa) return;
    totals[divisa] = round2((totals[divisa] || 0) + Number(monto || 0));
  }

     // ENVÍOS
  DB.envios.filter(e => inRange(e.fecha_hora)).forEach(e => {
    const entrega = Number(e.cantidad_pagada || 0);
    const ganancia = Number(e.ganancia || 0);
    const mismaDivisa = mismasDivisas(e.divisa_entrega, e.divisa_ganancia);

    if(envioDescuentaAhora(e)){
      // Switch ON: se resta la entrega y se suma la ganancia (o el total
      // si es la misma divisa), igual que en el balance general.
      add(e.divisa_entrega, -entrega);
      if(mismaDivisa){
        add(e.divisa_ganancia, entrega + ganancia);
      } else {
        add(e.divisa_ganancia, ganancia);
      }
    } else {
      // Switch OFF: la ganancia se reconoce ya mismo, igual que en el
      // balance general. La entrega queda pendiente en Deudas.
      add(e.divisa_ganancia, ganancia);
    }
  });

  // VENTAS
  DB.ventas.filter(v => inRange(v.fecha_hora)).forEach(v => {
    add(v.divisa_vendida, -Number(v.cantidad_vendida || 0));
    if(!v.registra_deuda){
      add(v.divisa_recibida, Number(v.cantidad_recibida || 0));
    }
  });

  // COMPRAS
  DB.compras.filter(c => inRange(c.fecha_hora)).forEach(c => {
    add(c.divisa_comprada, Number(c.cantidad_comprada || 0));
    if(!c.registra_deuda){
      add(c.divisa_pagada, -Number(c.cantidad_pagada || 0));
    }
  });

  // GASTOS
  DB.gastos.filter(g => inRange(g.fecha_hora)).forEach(g => {
    add(g.divisa, -Number(g.cantidad || 0));
  });

  // IN/OUT
  DB.in_out.filter(io => inRange(io.fecha_hora)).forEach(io => {
    add(io.divisa, io.tipo === 'entrada' ? Number(io.cantidad || 0) : -Number(io.cantidad || 0));
  });

    // DEUDAS
  // DEUDAS
  DB.deudas.forEach(d => {
    if(d.tipo === 'me_deben'){
      if(meDebenRestaAlCrear(d) && inRange(d.creado_en || d.fecha)){
        add(d.divisa, -Number(d.monto || 0));
      }
      if(meDebenSumaAlCobrar(d) && d.estado === 'cobrado' && inRange(d.fecha_cierre)){
        add(d.divisa, Number(d.monto || 0));
      }
    } else if(d.tipo === 'pagar_a'){
      if(d.origen === 'envio'){
        const envio = DB.envios.find(e => e.id === d.origen_id);
        const mismaDivisaEnvio = envio && mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);
        if(envio && !mismaDivisaEnvio && d.estado === 'pagado' && inRange(d.fecha_cierre)){
          // La ganancia YA fue sumada al registrar el envío. Si la divisa
          // entregada es la misma que la de la ganancia, pagar la deuda
          // no debe volver a tocar el balance filtrado (sería contarlo
          // dos veces). Solo si son divisas distintas hay que restar la
          // entrega aquí, porque esa salida nunca se contó antes.
          add(d.divisa, -Number(d.monto || 0));
        }
      } else {
        const restaAlPagar = d.afecta_balance || d.origen === 'compra';
        if(restaAlPagar && d.estado === 'pagado' && inRange(d.fecha_cierre)){
          add(d.divisa, -Number(d.monto || 0));
        }
      }
    }
  });

  return totals;
} 

function renderBalance(content){
  content.innerHTML = `
    <h1 class="section-title">Balance del negocio</h1>
    <button class="btn btn-gold btn-block" id="b-registrar-envio" style="margin-bottom:16px;">➕ Registrar envío</button>

    <h3 style="font-size:14px;color:var(--heading);margin-bottom:8px;">Balance filtrado</h3>
    <div class="chip-row" id="b-period-chips">
      ${['Hoy','Semanal','Mensual','Anual','Personalizado'].map(p=>`<div class="chip ${balancePeriod===p?'active':''}" data-v="${p}">${p}</div>`).join('')}
    </div>
    <div id="b-custom-range" class="two-col" style="display:${balancePeriod==='Personalizado'?'grid':'none'};margin-bottom:12px;">
      <input type="date" id="b-desde" value="${balanceCustomDesde? fechaLocalISO(balanceCustomDesde):''}">
      <input type="date" id="b-hasta" value="${balanceCustomHasta? fechaLocalISO(balanceCustomHasta):''}">
    </div>
    <div class="bal-grid" id="b-filtered"></div>

    <div class="divider"></div>
    <h3 style="font-size:14px;color:var(--heading);margin-bottom:8px;">Balance general (saldo acumulado)</h3>
    <div class="subtle" style="margin-bottom:10px;">Toca un saldo para editarlo manualmente. Toca el nombre para ver su historial.</div>
    <div class="two-col" style="margin-bottom:12px;">
      <button class="btn btn-outline btn-block" id="b-add-divisa">➕ Agregar divisa</button>
      <button class="btn btn-outline btn-block" id="b-del-divisa">🗑️ Eliminar divisa</button>
    </div>
    <div class="bal-grid" id="b-general"></div>
  `;

  function refreshFiltered(){
    const totals = computeFilteredBalance(balancePeriod);
    const el = document.getElementById('b-filtered');
    const divisasConMovimiento = DB.divisas.filter(d => {
      const v = Number(totals[d.nombre] || 0);
      return v < -0.5 || v > 0.5;
    });
    el.innerHTML = divisasConMovimiento.length
      ? divisasConMovimiento.map(d=>{
          const v = totals[d.nombre] || 0;
          return `<div class="bal-card">
            <div class="name">${escapeHtml(d.nombre)}</div>
            <div class="amt ${v<0?'neg':(v>0?'pos':'')}">
              ${v>0?'+':''}${fmtMoney(v)}
            </div>
          </div>`;
        }).join('')
      : `<div class="empty-state" style="grid-column:1/-1;">
          <div class="ei">📊</div>
          Sin movimientos en este período
        </div>`;
  }

  function refreshGeneral(){
    const el = document.getElementById('b-general');
    el.innerHTML = DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0)).map(d=>`
      <div class="bal-card" data-divisa="${escapeHtml(d.nombre)}">
        <div class="name" data-action="ver">${escapeHtml(d.nombre)}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="amt ${d.saldo<0?'neg':''}" data-action="editar" style="flex:1;">${fmtMoney(d.saldo)}</div>
          <button class="eye-btn" data-action="historial" aria-label="Historial de movimientos">👁️</button>
        </div>
        <div class="bal-edit" data-action="editar">✎ Editar saldo</div>
      </div>`).join('');
    el.querySelectorAll('.bal-card').forEach(card=>{
      const nombre = card.dataset.divisa;
      card.querySelector('[data-action="ver"]').onclick = ()=>{
        historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:nombre};
        location.hash = '#/historial';
      };
      card.querySelectorAll('[data-action="editar"]').forEach(elx=>{
        elx.onclick = ()=>editarSaldoDivisa(nombre, refreshGeneral);
      });
      card.querySelector('[data-action="historial"]').onclick = ()=> openHistorialDivisa(nombre);
    });
  }

  document.getElementById('b-registrar-envio').onclick = ()=>{ location.hash = '#/envio'; };

  document.querySelectorAll('#b-period-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      balancePeriod = c.dataset.v;
      document.querySelectorAll('#b-period-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      document.getElementById('b-custom-range').style.display = balancePeriod==='Personalizado' ? 'grid' : 'none';
      refreshFiltered();
    };
  });
  document.getElementById('b-desde').addEventListener('change', e=>{ balanceCustomDesde = e.target.value? fechaInputAInicioDeDiaLocal(e.target.value):null; refreshFiltered(); });
  document.getElementById('b-hasta').addEventListener('change', e=>{ balanceCustomHasta = e.target.value? fechaInputAFinDeDiaLocal(e.target.value):null; refreshFiltered(); });

  document.getElementById('b-add-divisa').onclick = ()=>{
    promptText('Nueva divisa', (val)=>{
      if(!val) return;
      addDivisa(val);
      toast('Divisa agregada');
      refreshGeneral(); refreshFiltered();
    });
  };
  document.getElementById('b-del-divisa').onclick = ()=> openEliminarDivisaModal(()=>{ refreshGeneral(); refreshFiltered(); });

  refreshFiltered();
  refreshGeneral();
}

function openEliminarDivisaModal(onDone){
  const divisas = DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0));
  openModal(`
    <div class="modal-title">Eliminar divisa</div>
    <div class="subtle" style="margin:8px 0 12px;">Selecciona la divisa que deseas eliminar. Solo se puede eliminar si su saldo es 0.</div>
    <div id="ed-list">${divisas.length ? divisas.map(d=>`
      <div class="list-item" data-nombre="${escapeHtml(d.nombre)}">
        <div class="avatar">💱</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(d.nombre)}</div>
        </div>
        <div class="li-trail">
          <div class="li-amount ${d.saldo<0?'neg':''}">${fmtMoney(d.saldo)}</div>
        </div>
      </div>`).join('') : emptyState('💱','No hay divisas registradas')}</div>
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="ed-cancel">Cancelar</button></div>
  `);
  document.getElementById('ed-cancel').onclick = closeModal;
  document.querySelectorAll('#ed-list .list-item').forEach(li=>{
    li.onclick = ()=>{
      const nombre = li.dataset.nombre;
      const d = findDivisa(nombre);
      closeModal();
      if(!d) return;
      if(round2(d.saldo) !== 0){
        alertDialog('No se puede eliminar', `No se puede eliminar la divisa ${escapeHtml(nombre)} porque tiene un saldo de ${fmtMoney(d.saldo)}. Para eliminarla, primero debe ajustar el saldo a cero (ej: usando In/Out o editando manualmente el saldo).`);
        return;
      }
      const activos = contarRegistrosActivosDeDivisa(nombre);
      if(activos > 0){
        alertDialog('No se puede eliminar', `Esta divisa tiene ${activos} registro${activos===1?'':'s'} activo${activos===1?'':'s'} asociado${activos===1?'':'s'}. Archívelos primero si desea eliminarla.`);
        return;
      }
      const archivados = contarRegistrosArchivadosDeDivisa(nombre);
      if(archivados > 0){
        const esSingular = archivados===1;
        confirmDialog(
          `Esta divisa tiene ${archivados} registro${esSingular?'':'s'} archivado${esSingular?'':'s'} asociado${esSingular?'':'s'}. Al eliminarla, ${esSingular?'ese registro también se eliminará':'esos registros también se eliminarán'} permanentemente del historial. Los saldos de las demás divisas no se modificarán. ¿Continuar?`,
          ()=>{
            eliminarDivisaYArchivadosAsociados(nombre);
            toast(`Divisa eliminada junto con ${archivados} registro${esSingular?'':'s'} archivado${esSingular?'':'s'}`);
            onDone && onDone();
          },
          {okLabel:'Eliminar', cancelLabel:'Cancelar', danger:true}
        );
        return;
      }
      confirmDialog(`¿Estás seguro de que deseas eliminar la divisa ${escapeHtml(nombre)}? Esta acción no se puede deshacer.`, ()=>{
        DB.divisas = DB.divisas.filter(x=>x.nombre!==nombre);
        save(); toast('Divisa eliminada'); onDone && onDone();
      }, {okLabel:'Aceptar', cancelLabel:'Cancelar'});
    };
  });
}

function movimientosDeDivisa(nombre){
  const mov = [];
  
  // =====================================================
  // ENVÍOS
  // =====================================================
  DB.envios.forEach(e=>{
    const entrega = Number(e.cantidad_pagada||0);
    const ganancia = Number(e.ganancia||0);
    const mismaDivisa = mismasDivisas(e.divisa_entrega, e.divisa_ganancia);
    
    if(envioDescuentaAhora(e)){
      // SWITCH ON: descuento inmediato
      if(e.divisa_entrega === nombre){
        mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:-entrega, origen:'envio', origenId:e.id});
      }
      if(mismaDivisa && e.divisa_ganancia === nombre){
        mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:entrega + ganancia, origen:'envio', origenId:e.id});
      } else if(e.divisa_ganancia === nombre){
        mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:ganancia, origen:'envio', origenId:e.id});
      }
    } else if(e.divisa_ganancia === nombre){
      // SWITCH OFF: la ganancia entra inmediatamente
      mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:ganancia, origen:'envio', origenId:e.id});
    }
  });

  // =====================================================
  // VENTAS
  // =====================================================
  DB.ventas.forEach(v=>{
    if(v.divisa_vendida === nombre){
      mov.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`Venta → ${v.divisa_recibida}`, monto:-(v.cantidad_vendida||0), origen:'venta', origenId:v.id});
    }
    if(v.divisa_recibida === nombre && !v.registra_deuda){
      mov.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`Venta de ${v.divisa_vendida}`, monto:(v.cantidad_recibida||0), origen:'venta', origenId:v.id});
    }
  });

  // =====================================================
  // COMPRAS
  // =====================================================
  DB.compras.forEach(c=>{
    if(c.divisa_comprada === nombre){
      mov.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`Compra de ${c.divisa_pagada}`, monto:(c.cantidad_comprada||0), origen:'compra', origenId:c.id});
    }
    if(c.divisa_pagada === nombre && !c.registra_deuda){
      mov.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`Pago de compra`, monto:-(c.cantidad_pagada||0), origen:'compra', origenId:c.id});
    }
  });

  // =====================================================
  // GASTOS
  // =====================================================
  DB.gastos.forEach(g=>{
    if(g.divisa === nombre){
      mov.push({fecha:g.fecha_hora, tipo:'Gasto', concepto:g.concepto, monto:-(g.cantidad||0), origen:'gasto', origenId:g.id});
    }
  });

  // =====================================================
  // IN/OUT
  // =====================================================
  DB.in_out.forEach(io=>{
    if(io.divisa === nombre){
      mov.push({
        fecha:io.fecha_hora,
        tipo:'In/Out',
        concepto: io.nota || (io.tipo==='entrada' ? 'Entrada manual' : 'Salida manual'),
        monto: io.tipo==='entrada' ? (io.cantidad||0) : -(io.cantidad||0),
        origen:'in_out',
        origenId:io.id
      });
    }
  });

  // =====================================================
  // DEUDAS
  // =====================================================
  DB.deudas.forEach(d=>{
    // ------------------------------------------------
    // ME DEBEN
    // ------------------------------------------------
    if(d.tipo === 'me_deben'){
      if(d.divisa !== nombre) return;
      if(meDebenRestaAlCrear(d)){
        mov.push({fecha:d.creado_en||d.fecha, tipo:'Préstamo', concepto:`Préstamo a ${d.persona}`, monto:-(d.monto||0), origen:'deuda', origenId:d.id});
        if(d.estado === 'cobrado' && d.fecha_cierre){
          mov.push({fecha:d.fecha_cierre, tipo:'Préstamo', concepto:`Cobro de ${d.persona}`, monto:(d.monto||0), origen:'deuda', origenId:d.id});
        }
      } else if(meDebenSumaAlCobrar(d) && d.estado === 'cobrado' && d.fecha_cierre){
        const tipoMov = d.origen === 'venta' ? 'Venta cobrada' : 'Sumar al cobrar';
        mov.push({fecha:d.fecha_cierre, tipo:tipoMov, concepto:`Cobro de ${d.persona}`, monto:(d.monto||0), origen:'deuda', origenId:d.id});
      }

    // ------------------------------------------------
    // PAGAR A
    // ------------------------------------------------
    } else if(d.tipo === 'pagar_a'){
      
      // ------------------------------------------------------------
      // DEUDA ORIGINADA POR UN ENVÍO (SWITCH OFF)
      // ------------------------------------------------------------
      if(d.origen === 'envio'){
        // La ganancia de este envío ya aparece como movimiento en la
        // sección ENVÍOS de arriba (se reconoce al registrarlo). Pagar
        // la deuda solo genera un movimiento adicional si la divisa
        // entregada es DISTINTA de la divisa de la ganancia (porque
        // entonces esa salida de dinero nunca se había registrado). Si
        // es la misma divisa, pagar la deuda no mueve el balance y no
        // se agrega ningún movimiento extra aquí (evita contar la
        // ganancia dos veces).
        const envio = DB.envios.find(e => e.id === d.origen_id);
        const mismaDivisaEnvio = envio && mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);
        if(!mismaDivisaEnvio && d.estado === 'pagado' && d.fecha_cierre && d.divisa === nombre){
          mov.push({
            fecha:d.fecha_cierre,
            tipo:'Envío pagado',
            concepto:`Pago a ${d.persona}`,
            monto:-(d.monto||0),
            origen:'deuda',
            origenId:d.id
          });
        }

      // ------------------------------------------------------------
      // OTRAS DEUDAS DE PAGAR A:
      // ------------------------------------------------------------
      } else {
        if(d.divisa !== nombre) return;
        const restaAlPagar = d.afecta_balance || d.origen === 'compra';
        if(restaAlPagar && d.estado === 'pagado' && d.fecha_cierre){
          const tipoMov = d.origen === 'compra' ? 'Compra pagada' : 'Deuda pagada';
          mov.push({
            fecha:d.fecha_cierre,
            tipo:tipoMov,
            concepto:`Pago a ${d.persona}`,
            monto:-(d.monto||0),
            origen:'deuda',
            origenId:d.id
          });
        }
      }
    }
  });

  // =====================================================
  // ORDENAR Y CALCULAR SALDO ACUMULADO
  // =====================================================
  mov.sort((a,b) => b.fecha - a.fecha);
  const divisaObj = findDivisa(nombre);
  let saldoActual = divisaObj ? divisaObj.saldo : 0;
  mov.forEach(m => {
    m.saldoAcumulado = saldoActual;
    saldoActual = round2(saldoActual - m.monto);
  });
  
  return mov;
}

function volverDesdeDetalleMovimiento(){
  const divisa = retornoHistorialDivisa;
  retornoHistorialDivisa = null;
  closeModal();
  if(divisa) openHistorialDivisa(divisa);
}

function volverDesdeEnvioDetalle(){
  const divisa = retornoHistorialDivisa;
  retornoHistorialDivisa = null;
  if(divisa){
    location.hash = '#/balance';
    currentRouteView = 'balance';
    renderBalance(document.getElementById('app-content'));
    restoreScrollFor('balance');
    openHistorialDivisa(divisa);
  } else {
    history.back();
  }
}

let historialDivisaScrollPorDivisa = {}; // guarda el scroll interno de #hd-list, por nombre de divisa
let historialDivisaFiltro = 'todos'; // (antes era una global implícita sin declarar)

function openHistorialDivisa(nombre){
  historialDivisaFiltro = 'todos';
  const movimientos = movimientosDeDivisa(nombre);
  const scrollAlAbrir = historialDivisaScrollPorDivisa[nombre] || 0;

  openModal(`
    <div class="modal-title">Historial — ${escapeHtml(nombre)}</div>
    <div class="chip-row" id="hd-chips" style="margin-top:10px;">
      <div class="chip active" data-v="todos">📊 Todos</div>
      <div class="chip" data-v="ingresos">📈 Ingresos</div>
      <div class="chip" data-v="egresos">📉 Egresos</div>
    </div>
    <div id="hd-list" style="max-height:55vh;overflow-y:auto;"></div>
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="hd-cerrar">Cerrar</button></div>
  `);

  // Se registra el scroll en tiempo real (no solo al hacer clic en un movimiento),
  // así queda cubierto sin importar cómo se cierre el modal: botón "Cerrar",
  // tocando fuera del modal, o entrando al detalle de un movimiento y volviendo.
  document.getElementById('hd-list').addEventListener('scroll', (e)=>{
    historialDivisaScrollPorDivisa[nombre] = e.target.scrollTop;
  });

  function refresh(){
    const el = document.getElementById('hd-list');
    let items = movimientos;
    if(historialDivisaFiltro==='ingresos') items = movimientos.filter(m=>m.monto>0);
    if(historialDivisaFiltro==='egresos') items = movimientos.filter(m=>m.monto<0);
    el.innerHTML = items.length ? items.map((m,i)=>`
      <div class="card hd-mov-item" data-i="${i}" style="box-shadow:none;border:1px solid var(--line-main);padding:10px 12px;margin-bottom:8px;cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:14px;">${escapeHtml(m.tipo)}</div>
            <div class="subtle">${escapeHtml(m.concepto)}</div>
            <div class="subtle">${fmtDate(m.fecha)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800;font-size:15px;color:${m.monto<0?'var(--red-text)':'var(--green-text)'};">${m.monto<0?'-':'+'}${fmtMoney(Math.abs(m.monto))}</div>
            <div class="subtle">Saldo: ${fmtMoney(m.saldoAcumulado)}</div>
            <div class="subtle" style="margin-top:2px;">Ver detalle ›</div>
          </div>
        </div>
      </div>`).join('') : emptyState('📭','Sin movimientos en esta categoría');
    aplicarZebra(el, items.length);
    el.querySelectorAll('.hd-mov-item').forEach(card=>{
      card.onclick = ()=>{
        const m = items[Number(card.dataset.i)];
        if(m){
          retornoHistorialDivisa = nombre;
          irADetalleOriginal(m.origen, m.origenId);
        }
      };
    });
  }

  document.querySelectorAll('#hd-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      historialDivisaFiltro = c.dataset.v;
      document.querySelectorAll('#hd-chips .chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      refresh();
    };
  });
  document.getElementById('hd-cerrar').onclick = closeModal;
  refresh();
  if(scrollAlAbrir){
    const el = document.getElementById('hd-list');
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ el.scrollTop = scrollAlAbrir; }); });
  }
}

function irADetalleOriginal(origen, origenId){
  const existe = (
    (origen==='envio'  && DB.envios.some(x=>x.id===origenId)) ||
    (origen==='venta'  && DB.ventas.some(x=>x.id===origenId)) ||
    (origen==='compra' && DB.compras.some(x=>x.id===origenId)) ||
    (origen==='gasto'  && DB.gastos.some(x=>x.id===origenId)) ||
    (origen==='in_out' && DB.in_out.some(x=>x.id===origenId)) ||
    (origen==='deuda'  && DB.deudas.some(x=>x.id===origenId))
  );
  if(!existe){
    alertDialog('Registro no encontrado', 'No se pudo encontrar el registro original. Es posible que haya sido eliminado.');
    return;
  }
  closeModal();
  switch(origen){
    case 'envio':  location.hash = `#/envio-detalle/${origenId}`; break;
    case 'venta':  openVentaDetalle(origenId, route); break;
    case 'compra': openCompraDetalle(origenId, route); break;
    case 'gasto':  openGastoDetalle(origenId, route); break;
    case 'in_out': openInOutDetalle(origenId, route); break;
    case 'deuda':  openDeudaDetalle(origenId, route); break;
  }
}

function editarSaldoDivisa(nombre, onDone){
  const d = findDivisa(nombre);
  if(!d) return;
  openModal(`
    <div class="modal-title">Editar saldo — ${escapeHtml(nombre)}</div>
    <label class="field-label">Nuevo saldo</label>
    <input type="number" inputmode="decimal" step="0.01" id="es-valor" value="${d.saldo}">
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="es-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="es-save">Guardar</button>
    </div>
  `, {center:true});
  document.getElementById('es-cancel').onclick = closeModal;
  document.getElementById('es-save').onclick = ()=>{
    const val = parseFloat(document.getElementById('es-valor').value);
    if(isNaN(val)){ toast('Ingrese un valor válido'); return; }
    d.saldo = round2(val);
    save(); closeModal(); toast('Saldo actualizado');
    onDone && onDone();
  };
}
