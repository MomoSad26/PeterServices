/* ---------------------------------------------------------------------- *
 * 13. MENÚ 5 — HISTORIAL DE ENVÍOS
 * ---------------------------------------------------------------------- */
let historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:'Todas'};
let retornoHistorialDivisa = null; // (bug preexistente: nunca se declaraba, causaba ReferenceError al volver de un envío)
let historialDivisaPendienteAlEntrarBalance = null; // reapertura diferida al terminar la navegación de vuelta

function entityNameForEnvio(e){
  if(e.trabajador_id){
    const t = DB.trabajadores.find(x=>x.id===e.trabajador_id);
    return t ? (t.nombre + (t.activo?'':' (eliminado)')) : '(eliminado)';
  } else {
    const c = DB.clientes.find(x=>x.id===e.cliente_id);
    return c ? (c.nombre + (c.activo?'':' (eliminado)')) : '(eliminado)';
  }
}

function applyHistorialFilters(list){
  const f = historialFilters;
  return list.filter(e=>{
    if(e.archivado && !busquedaFiltrandoLista('envios')) return false;
    if(busquedaFiltrandoLista('envios') && !busquedaFiltrarRegistroLista('envios',e)) return false;
    if(f.q){
      const name = entityNameForEnvio(e);
      if(!coincideBusqueda(name, f.q)) return false;
    }
    if(f.tipo==='Clientes' && e.tipo!=='cliente_directo') return false;
    if(f.tipo==='Trabajadores' && e.tipo!=='trabajador') return false;
    if(f.tipo==='Especiales' && e.tipo!=='precio_especial') return false;
    if(f.forma!=='Todas' && e.forma_ganancia!==f.forma && !obtenerGananciasAdicionalesEnvio(e).some(g=>g.forma===f.forma)) return false;
    if(f.divisa!=='Todas' && !envioTieneDivisa(e,f.divisa)) return false;
    if(f.fecha==='Hoy'){
      const inicioHoy=todayRangeStart();
      const manana=new Date(inicioHoy);
      manana.setDate(manana.getDate()+1);
      if(e.fecha_hora < inicioHoy || e.fecha_hora >= manana.getTime()) return false;
    }
    if(f.fecha==='Semanal' && e.fecha_hora < startOfWeek()) return false;
    if(f.fecha==='Mensual' && e.fecha_hora < startOfMonth()) return false;
    if(f.fecha==='Personalizado'){
      if(f.fechaDesde && e.fecha_hora < f.fechaDesde) return false;
      if(f.fechaHasta && e.fecha_hora > f.fechaHasta) return false;
    }
    return true;
  }).sort(ordenFechaDesc);
}

// "Personalizado" sin fechas se comporta como sin filtro de fecha.
function historialFiltrosActivos(){
  const f = historialFilters;
  const fechaActiva = ['Hoy','Semanal','Mensual'].includes(f.fecha) || (f.fecha==='Personalizado' && (f.fechaDesde || f.fechaHasta));
  return !!(normalizarTexto(f.q) || f.tipo!=='Todos' || f.forma!=='Todas' || f.divisa!=='Todas' || fechaActiva);
}

function renderHistorial(content, presetParam){
  if(presetParam==='reset'){
    historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:'Todas'};
  }
  content.innerHTML = `
    <h1 class="section-title">Historial de envíos</h1>
    ${busquedaFiltrandoLista('envios') ? `<div class="subtle" style="margin:-4px 0 12px;">Resultados para: <strong>${escapeHtml(busquedaFiltroLista.consulta)}</strong></div>` : ''}
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="h-search" placeholder="Buscar por nombre..." value="${escapeHtml(historialFilters.q)}">
    </div>
    <div class="chip-row" id="h-tipo-chips">
      ${['Todos','Clientes','Trabajadores','Especiales'].map(t=>`<div class="chip ${historialFilters.tipo===t?'active':''}" data-v="${t}">${t}</div>`).join('')}
    </div>
    <div class="chip-row" id="h-fecha-chips">
      ${['Hoy','Semanal','Mensual','Personalizado','Todo'].map(t=>`<div class="chip ${historialFilters.fecha===t?'active':''}" data-v="${t}">${t}</div>`).join('')}
    </div>
    <div id="h-custom-range" class="two-col" style="margin-bottom:12px;display:${historialFilters.fecha==='Personalizado'?'grid':'none'};">
      <input type="date" id="h-desde" value="${historialFilters.fechaDesde? fechaLocalISO(historialFilters.fechaDesde):''}">
      <input type="date" id="h-hasta" value="${historialFilters.fechaHasta? fechaLocalISO(historialFilters.fechaHasta):''}">
    </div>
    <div class="two-col" style="margin-bottom:12px;">
      <select id="h-forma" class="picker">
        ${['Todas','Efectivo','Transferencia','USD'].map(f=>`<option value="${f}" ${historialFilters.forma===f?'selected':''}>${f==='Todas'?'Forma: Todas':f}</option>`).join('')}
      </select>
      <select id="h-divisa" class="picker">
        <option value="Todas" ${historialFilters.divisa==='Todas'?'selected':''}>Divisa: Todas</option>
        ${DB.divisas.map(d=>`<option value="${escapeHtml(d.nombre)}" ${historialFilters.divisa===d.nombre?'selected':''}>${escapeDivisa(d.nombre)}</option>`).join('')}
      </select>
    </div>
    <div id="h-list"></div>
    <div id="h-pag"></div>
  `;

  const estadoPag = paginacion.historial;
  sincronizarPaginaConFiltros(estadoPag, historialFiltrosActivos(), false);
  function cambioDeFiltro(){
    sincronizarPaginaConFiltros(estadoPag, historialFiltrosActivos(), true);
    refreshList();
  }

  function refreshList(){
    const list = applyHistorialFilters(DB.envios);
    const el = document.getElementById('h-list');
    const pag = paginarArray(list, estadoPag);
    el.innerHTML = list.length ? pag.items.map(envioRowHtml).join('') : emptyState('📭','No se encontraron envíos con los filtros aplicados.');
    aplicarZebra(el, list.length);
    renderControlPaginacion(document.getElementById('h-pag'), estadoPag, pag, refreshList, el);
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = (ev)=>{
        if(ev.target.closest('.edit-btn')) return;
        location.hash = `#/envio-detalle/${li.dataset.id}`;
      };
    });
    el.querySelectorAll('.edit-btn').forEach(btn=>{
      btn.onclick = (ev)=>{
        ev.stopPropagation();
        openEnvioEditModal(Number(btn.dataset.id), refreshList);
      };
    });
  }

  const searchEl = document.getElementById('h-search');
  searchEl.addEventListener('input', e=>{ historialFilters.q = e.target.value; cambioDeFiltro(); });
  activarSugerencias(searchEl, {
    // Solo se sugieren clientes y trabajadores que tienen envíos en el historial.
    obtenerCandidatos: ()=>{
      const conEnvios = DB.envios.filter(e=>!e.archivado);
      const idsCli = new Set(conEnvios.filter(e=>!e.trabajador_id && e.cliente_id!=null).map(e=>e.cliente_id));
      const idsTr = new Set(conEnvios.filter(e=>e.trabajador_id).map(e=>e.trabajador_id));
      return [
        ...DB.clientes.filter(c=>idsCli.has(c.id)).map(c=>({nombre:c.nombre, sub:c.pais||''})),
        ...DB.trabajadores.filter(t=>idsTr.has(t.id)).map(t=>({nombre:t.nombre, sub:'Trabajador', avatar:'👷'})),
      ];
    },
    onElegir: ()=>{ historialFilters.q = searchEl.value; cambioDeFiltro(); }
  });
  document.querySelectorAll('#h-tipo-chips .chip').forEach(c=>{
    c.onclick = ()=>{ historialFilters.tipo = c.dataset.v; document.querySelectorAll('#h-tipo-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); cambioDeFiltro(); };
  });
  document.querySelectorAll('#h-fecha-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      historialFilters.fecha = c.dataset.v;
      document.querySelectorAll('#h-fecha-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      document.getElementById('h-custom-range').style.display = c.dataset.v==='Personalizado' ? 'grid' : 'none';
      cambioDeFiltro();
    };
  });
  // Fechas del filtro con componentes LOCALES (new Date('AAAA-MM-DD') sería
  // medianoche UTC y en Cuba/Miami correría el rango un día).
  document.getElementById('h-desde').addEventListener('change', e=>{ historialFilters.fechaDesde = e.target.value ? fechaInputAInicioDeDiaLocal(e.target.value) : null; cambioDeFiltro(); });
  document.getElementById('h-hasta').addEventListener('change', e=>{ historialFilters.fechaHasta = e.target.value ? fechaInputAFinDeDiaLocal(e.target.value) : null; cambioDeFiltro(); });
  document.getElementById('h-forma').addEventListener('change', e=>{ historialFilters.forma = e.target.value; cambioDeFiltro(); });
  document.getElementById('h-divisa').addEventListener('change', e=>{ historialFilters.divisa = e.target.value; cambioDeFiltro(); });

  refreshList();
}

function envioRowHtml(e){
  const icon = e.tipo==='trabajador' ? '👷' : (e.tipo==='precio_especial' ? '⭐' : '📤');
  return `
    <div class="list-item" data-id="${e.id}">
      <div class="avatar">${icon}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(entityNameForEnvio(e))}</div>
        <div class="li-sub">${fmtDate(e.fecha_hora)} · ${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount">${fmtMoney(envioGananciaMostrada(e))}</div>
        <div class="li-sub">Principal · ${escapeDivisa(e.divisa_ganancia)}</div>
        ${obtenerGananciasAdicionalesEnvio(e).map(g=>`<div class="li-sub">+${fmtMoney(g.cantidad)} ${escapeDivisa(g.divisa)}</div>`).join('')}
      </div>
      <button class="icon-action-btn edit-btn" data-id="${e.id}" aria-label="Editar envío">✏️</button>
    </div>`;
}

function renderEnvioDetalle(content, id){
  const e = DB.envios.find(x=>x.id===id);
  if(!e){ content.innerHTML = emptyState('❓','Envío no encontrado'); return; }
  const nombreEntidad = entityNameForEnvio(e);
  content.innerHTML = `
    ${e.tipo==='precio_especial' ? `<div class="badge badge-gold" style="margin:10px 0;">⭐ Precio especial</div>` : ''}
    <div class="card">
      <div class="sumrow"><span class="k">${e.tipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(nombreEntidad)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(e.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</span></div>
      <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(e.precio)}</span></div>
      <div style="font-weight:800;margin:10px 0 4px;">Entregas</div>
      ${obtenerEntregasEnvio(e).map((x,i)=>{
        const deuda=DB.deudas.find(d=>d.origen==='envio'&&d.origen_id===e.id&&
          (d.origen_detalle_id==null?i===0:String(d.origen_detalle_id)===String(x.id)));
        return `<div class="sumrow"><span class="k">${i+1}. ${escapeHtml(x.destinatario_nombre||'Destinatario no especificado')}</span><span class="v">${fmtMoney(x.cantidad)} ${escapeDivisa(x.divisa)} ${deuda?'· '+(deuda.estado==='pagado'?'Pagado':'Pendiente'):''}</span></div>`+
          (x.mensajero_notificado_fecha?`<div class="subtle" style="margin:-3px 0 7px 8px;">Mensajero notificado: ${escapeHtml(mensajeroNotificadoTexto(x))}</div>`:'');
      }).join('')}
      ${e.tipo!=='precio_especial' ? `<div class="sumrow"><span class="k">Descuento</span><span class="v">${envioDescuentaAhora(e)?'Inmediato':'Cada entrega queda en Deudas → Pagar a'}</span></div>` : ''}
      <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${e.cotizado_a!==null && e.cotizado_a!==undefined ? fmtMoney(e.cotizado_a) : '—'}</span></div>
      <div class="sumrow"><span class="k">Ganancia principal</span><span class="v">${fmtMoney(envioGananciaMostrada(e))} ${escapeDivisa(e.divisa_ganancia)} · ${escapeHtml(e.forma_ganancia||'')}</span></div>
      ${obtenerGananciasAdicionalesEnvio(e).map((g,i)=>`<div class="sumrow"><span class="k">Ganancia adicional ${i+1} · ${escapeHtml(g.forma)}</span><span class="v">${fmtMoney(g.cantidad)} ${escapeDivisa(g.divisa)}</span></div>`).join('')}
      ${e.mensajero_notificado_fecha ? `<div class="sumrow"><span class="k">Mensajero notificado</span><span class="v">${escapeHtml(mensajeroNotificadoTexto(e))}</span></div>` : ''}
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(e.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions" style="margin-top:14px;">
      <button class="btn btn-outline btn-block" id="ed-aceptar">✅ Aceptar</button>
      <button class="btn btn-danger btn-block" id="ed-del">Eliminar envío</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="ed-edit">✏️ Editar envío</button>
      <button class="btn btn-primary btn-block" id="ed-duplicar">📋 Duplicar</button>
    </div>
  `;
  document.getElementById('ed-aceptar').onclick = volverDesdeEnvioDetalle;
  document.getElementById('ed-duplicar').onclick = ()=> duplicarEnvio(e.id);
  document.getElementById('ed-edit').onclick = ()=>{
    openEnvioEditModal(e.id, ()=>renderEnvioDetalle(content, id));
  };
  document.getElementById('ed-del').onclick = ()=>{
    confirmDialog(`¿Eliminar el envío de ${escapeHtml(nombreEntidad)}?`, ()=>{
      eliminarConDeshacer('Envío eliminado', ()=>{
        const deudasAsociadas=DB.deudas.filter(d=>d.origen==='envio'&&d.origen_id===e.id);
        applyEnvioBalance(e,-1);
        deudasAsociadas.forEach(d=>{if(deudaEnvioPagadaRestoBalance(d,e))adjustBalance(d.divisa,Number(d.monto||0));});
        DB.deudas=DB.deudas.filter(d=>!(d.origen==='envio'&&d.origen_id===e.id));
        DB.envios = DB.envios.filter(x=>x.id!==e.id);
        save();
      });
      // Al eliminar desde el detalle se crea una nueva entrada de historial:
      // Atrás puede volver al detalle antiguo, que mostrará "Envío no encontrado".
      // La ruta de historial restaura el scroll guardado al abrir este detalle.
      retornoHistorialDivisa = null;
      if(location.hash !== '#/historial') location.hash = '#/historial';
      else route();
    });
  };
}

/* ¿Al marcar como pagada esta deuda de envío se restó su monto del balance?
   Solo si la divisa entregada es DISTINTA de la divisa de la ganancia (si es
   la misma, pagarla no toca el balance). Se evalúa con los datos del envío
   que se pasen, para poder usarla antes y después de editarlo. */
function deudaEnvioPagadaRestoBalance(deuda,envio){
  return !!deuda&&deuda.estado==='pagado'&&!!envio&&deudaEnvioDescuentaBalance(deuda,envio);
}

function duplicarEnvio(id){
  const e = DB.envios.find(x=>x.id===id);
  if(!e){ alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  const copia = copiaParaDuplicar(e);
  retornoHistorialDivisa = null;
  if(e.tipo==='trabajador'){
    const t = DB.trabajadores.find(x=>x.id===e.trabajador_id && x.activo);
    if(!t){ alertDialog('No se pudo duplicar', 'El trabajador de este envío fue eliminado.'); return; }
    duplicadoEnvioPendiente = {tipo:'trabajador', envio:copia};
    location.hash = `#/envio-trabajador/${t.id}`;
  } else if(e.tipo==='precio_especial'){
    duplicadoEnvioPendiente = {tipo:'precio_especial', envio:copia};
    location.hash = '#/precio-especial';
  } else {
    duplicadoEnvioPendiente = {tipo:'cliente_directo', envio:copia};
    location.hash = '#/envio';
  }
}

/* ---------------------------------------------------------------------- *
 * 13b. EDICIÓN DE ENVÍOS (desde Menú 5 — Historial de envíos)
 * ---------------------------------------------------------------------- */
function openEnvioEditModal(id,onSaved){
  const e=DB.envios.find(x=>x.id===id);
  if(!e){toast('Envío no encontrado');return;}
  let entityTipo=e.trabajador_id?'trabajador':'cliente';
  let entity=entityTipo==='trabajador'?DB.trabajadores.find(x=>x.id===e.trabajador_id):DB.clientes.find(x=>x.id===e.cliente_id);
  if(!entity)entity={id:null,nombre:'(eliminado)'};
  const pickerModo=e.tipo==='trabajador'?'trabajador':(e.tipo==='cliente_directo'?'cliente':'combinado');
  const entityLabel=e.tipo==='trabajador'?'Trabajador':(e.tipo==='cliente_directo'?'Cliente':'Cliente o trabajador');

  openModal(`
    <div class="modal-title">Editar envío</div>
    <label class="field-label">${entityLabel} *</label>
    <div class="picker" id="ee-entity-picker"><span id="ee-entity-name">${entityTipo==='trabajador'?'👷 ':''}${escapeHtml(entity.nombre)}</span><span>🔍</span></div>
    <label class="field-label">ENTREGAS (una por destinatario) *</label>
    ${entregasEnvioHtml('ee',obtenerEntregasEnvio(e))}
    <div class="hint">Cada entrega tiene su propio destinatario, cantidad y divisa.</div>
    <label class="field-label">Cantidad enviada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-cantidad" value="${e.cantidad_enviada}">
    <label class="field-label">Moneda *</label>
    <select id="ee-moneda" class="picker">${monedaOptionsHtml(e.moneda)}</select>
    <label class="field-label">Precio *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-precio" value="${e.precio}">
    ${e.tipo!=='precio_especial'?`
      <label class="field-label">Descontar las entregas del balance al guardar</label>
      <div class="pill-row" id="ee-descuenta">
        <div class="pill ${!envioDescuentaAhora(e)?'active':''}" data-v="0">No — crear deudas</div>
        <div class="pill ${envioDescuentaAhora(e)?'active':''}" data-v="1">Sí — descontar ahora</div>
      </div>
    `:''}
    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-cotizado" value="${e.cotizado_a!==null&&e.cotizado_a!==undefined?e.cotizado_a:''}" placeholder="Opcional">
    <label class="field-label">Ganancia principal *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-ganancia" value="${e.ganancia}">
    <label class="field-label">Divisa de ganancia principal *</label>
    <select id="ee-divisa-ganancia" class="picker">${divisaOptionsHtml(e.divisa_ganancia)}</select>
    <label class="field-label">Forma de ganancia principal *</label>
    <div class="pill-row" id="ee-forma">${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${e.forma_ganancia===f?'active':''}" data-v="${f}">${f}</div>`).join('')}</div>
    <label class="field-label">GANANCIAS ADICIONALES</label>
    ${gananciasAdicionalesEnvioHtml('ee')}
    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="ee-fecha" value="${toLocalDatetimeValue(e.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ee-nota" maxlength="500" placeholder="Opcional">${escapeHtml(e.nota||'')}</textarea>
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="ee-cancel">Cancelar</button><button class="btn btn-primary btn-block" id="ee-save">Guardar cambios</button></div>
  `);

  bindAddOnSelect(document.getElementById('ee-moneda'),addMoneda,monedaOptionsHtml);
  bindAddOnSelect(document.getElementById('ee-divisa-ganancia'),addDivisa,divisaOptionsHtml);
  const getEntregas=wireEntregasEnvio('ee',obtenerEntregasEnvio(e));
  const getGananciasAdicionales=wireGananciasAdicionalesEnvio('ee',obtenerGananciasAdicionalesEnvio(e));
  document.getElementById('ee-entity-picker').onclick=()=>openEntityPicker(pickerModo,(item,tipo)=>{
    entity=item;entityTipo=pickerModo==='combinado'?tipo:pickerModo;
    document.getElementById('ee-entity-name').textContent=`${entityTipo==='trabajador'?'👷 ':''}${item.nombre}`;
  });
  let formaGanancia=e.forma_ganancia||'Efectivo';
  document.querySelectorAll('#ee-forma .pill').forEach(p=>p.onclick=()=>{
    document.querySelectorAll('#ee-forma .pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');formaGanancia=p.dataset.v;
  });
  let descuentaAhoraSel=envioDescuentaAhora(e)?1:0;
  document.querySelectorAll('#ee-descuenta .pill').forEach(p=>p.onclick=()=>{
    document.querySelectorAll('#ee-descuenta .pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');descuentaAhoraSel=Number(p.dataset.v);
  });
  const cantidadEl=document.getElementById('ee-cantidad');
  const precioEl=document.getElementById('ee-precio');
  const cotizadoEl=document.getElementById('ee-cotizado');
  const gananciaEl=document.getElementById('ee-ganancia');
  const saveBtn=document.getElementById('ee-save');
  const cotInicial=e.cotizado_a;
  const gananciaAutoInicial=(cotInicial===null||cotInicial===undefined)?null:
    round2(Number(e.cantidad_enviada||0)*(Number(cotInicial)-Number(e.precio||0)));
  let gananciaTouched=gananciaAutoInicial===null?true:gananciaAutoInicial!==round2(e.ganancia);
  function validarCotizado(){
    const cotRaw=cotizadoEl.value.trim(),cot=cotRaw===''?null:Number(cotRaw);
    const invalid=e.tipo!=='precio_especial'&&cot!==null&&(!Number.isFinite(cot)||cot<Number(precioEl.value));
    cotizadoEl.classList.toggle('err',!!invalid);saveBtn.disabled=!!invalid;saveBtn.style.opacity=invalid?.5:1;
  }
  function recalc(){
    if(e.tipo!=='precio_especial'&&!gananciaTouched){
      const cotRaw=cotizadoEl.value.trim();
      if(cotRaw!=='')gananciaEl.value=round2(Number(cantidadEl.value||0)*(Number(cotRaw)-Number(precioEl.value||0)));
    }
    validarCotizado();
  }
  [cantidadEl,precioEl,cotizadoEl].forEach(el=>el.addEventListener('input',recalc));
  gananciaEl.addEventListener('input',()=>{gananciaTouched=true;});
  document.getElementById('ee-cancel').onclick=closeModal;
  saveBtn.onclick=()=>{
    if(!entity||entity.id===null){toast('Seleccione un cliente o trabajador válido.');return;}
    const cantidad_enviada=Number(cantidadEl.value),precio=Number(precioEl.value);
    const moneda=document.getElementById('ee-moneda').value.toUpperCase();
    const entregas=getEntregas(),ganancias_adicionales=getGananciasAdicionales();
    const cotRaw=cotizadoEl.value.trim(),cotizado_a=cotRaw===''?null:Number(cotRaw);
    const ganancia=Number(gananciaEl.value),divisa_ganancia=document.getElementById('ee-divisa-ganancia').value;
    const fechaVal=document.getElementById('ee-fecha').value,nota=document.getElementById('ee-nota').value.trim();
    const entregasValidas=entregas.length>0&&entregas.every(x=>Number.isFinite(x.cantidad)&&x.cantidad>0&&x.divisa&&x.divisa!=='__add__');
    const extrasValidas=ganancias_adicionales.every(x=>Number.isFinite(x.cantidad)&&x.cantidad>0&&x.divisa&&x.divisa!=='__add__'&&['Efectivo','Transferencia','USD'].includes(x.forma));
    if(!Number.isFinite(cantidad_enviada)||cantidad_enviada<=0||!Number.isFinite(precio)||precio<=0||
       !entregasValidas||!extrasValidas||!Number.isFinite(ganancia)||!divisa_ganancia||divisa_ganancia==='__add__'||
       !['Efectivo','Transferencia','USD'].includes(formaGanancia)||!fechaVal){
      toast('Revise las cantidades, divisas y formas de ganancia.');return;
    }
    if(e.tipo!=='precio_especial'&&cotizado_a!==null&&(!Number.isFinite(cotizado_a)||cotizado_a<precio)){
      toast('Cotizado a debe ser mayor o igual al precio.');return;
    }
    const nuevo={entity,entityTipo,cantidad_enviada,moneda,precio,entregas:entregas.map(x=>({...x,id:x.id||nuevoIdEntregaEnvio()})),
      cantidad_pagada:entregas[0].cantidad,divisa_entrega:entregas[0].divisa,ganancias_adicionales,
      cotizado_a,ganancia,divisa_ganancia,forma_ganancia:formaGanancia,fecha_hora:new Date(fechaVal).getTime(),nota,
      descuenta_ahora:e.tipo==='precio_especial'?1:descuentaAhoraSel};
    confirmDialog('¿Guardar los cambios de este envío? Se actualizarán las entregas, sus deudas y las ganancias del balance.',()=>{
      closeModal();guardarEdicionEnvio(e,nuevo);toast('Envío actualizado');onSaved&&onSaved();
    },{okLabel:'Guardar',cancelLabel:'Cancelar',danger:false});
  };
}

function guardarEdicionEnvio(e,nuevo){
  const deudasAnteriores=DB.deudas.filter(d=>d.origen==='envio'&&d.origen_id===e.id);
  // Revertir el envío anterior y cualquier pago que hubiera cambiado el saldo.
  applyEnvioBalance(e,-1);
  deudasAnteriores.forEach(d=>{
    if(d.estado==='pagado'&&deudaEnvioDescuentaBalance(d,e))adjustBalance(d.divisa,Number(d.monto||0));
  });

  Object.assign(e,{
    cliente_id:nuevo.entityTipo==='cliente'?nuevo.entity.id:null,
    trabajador_id:nuevo.entityTipo==='trabajador'?nuevo.entity.id:null,
    cantidad_enviada:nuevo.cantidad_enviada,moneda:nuevo.moneda,precio:nuevo.precio,
    cotizado_a:nuevo.cotizado_a,ganancia:nuevo.ganancia,divisa_ganancia:nuevo.divisa_ganancia,
    forma_ganancia:nuevo.forma_ganancia,fecha_hora:nuevo.fecha_hora,nota:nuevo.nota,
    entregas:nuevo.entregas.map(x=>({...x})),
    ganancias_adicionales:(nuevo.ganancias_adicionales||[]).map(x=>({...x})),
    cantidad_pagada:nuevo.entregas[0]?.cantidad||0,
    divisa_entrega:nuevo.entregas[0]?.divisa||'',
    destinatario_id:nuevo.entregas[0]?.destinatario_id??null,
    destinatario_nombre:nuevo.entregas[0]?.destinatario_nombre||''
  });
  if(e.tipo!=='precio_especial')e.descuenta_ahora=nuevo.descuenta_ahora?1:0;

  if(envioDescuentaAhora(e)){
    DB.deudas=DB.deudas.filter(d=>!(d.origen==='envio'&&d.origen_id===e.id));
  }else{
    const usadas=new Set();
    const deudaLegacy=deudasAnteriores.find(d=>d.origen_detalle_id==null);
    e.entregas.forEach((split,i)=>{
      let d=deudasAnteriores.find(x=>!usadas.has(x.id)&&String(x.origen_detalle_id)===String(split.id));
      if(!d&&i===0&&deudaLegacy&&!usadas.has(deudaLegacy.id))d=deudaLegacy;
      if(d){
        usadas.add(d.id);d.origen_detalle_id=split.id;
        d.persona=`${split.destinatario_nombre||entityNameForEnvio(e)} – ${fmtMoney(split.cantidad)} ${split.divisa}`;
        d.monto=split.cantidad;d.divisa=split.divisa;d.fecha=e.fecha_hora;d.nota=e.nota||'Registrado desde envío';
        if(d.estado==='pagado'&&deudaEnvioDescuentaBalance(d,e))adjustBalance(d.divisa,-Number(d.monto||0));
      }else{
        crearDeudaAutomatica({tipo:'pagar_a',
          persona:`${split.destinatario_nombre||entityNameForEnvio(e)} – ${fmtMoney(split.cantidad)} ${split.divisa}`,
          monto:split.cantidad,divisa:split.divisa,fecha:e.fecha_hora,nota:e.nota||'Registrado desde envío',
          origen:'envio',origen_id:e.id,origen_detalle_id:split.id});
      }
    });
    // Eliminar deudas de splits eliminados; sus efectos de pago ya se revirtieron arriba.
    DB.deudas=DB.deudas.filter(d=>!(d.origen==='envio'&&d.origen_id===e.id)||usadas.has(d.id)||e.entregas.some(x=>String(x.id)===String(d.origen_detalle_id)));
  }
  applyEnvioBalance(e,1);
  save();
}
