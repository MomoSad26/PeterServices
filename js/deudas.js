/* ---------------------------------------------------------------------- *
 * 18. MENÚ 9 — DEUDAS
 * ---------------------------------------------------------------------- */
function crearDeudaAutomatica({tipo, persona, monto, divisa, fecha, nota, origen, origen_id, tipo_me_deben}){
  const deuda = {
    id: nextId('deudas'), tipo, persona, monto, divisa, fecha,
    creado_en: Date.now(),
    afecta_balance: 0,
    estado: 'pendiente', fecha_cierre: null, nota,
    origen, origen_id
  };
  if(tipo==='me_deben' && tipo_me_deben!==undefined && tipo_me_deben!==null){
    deuda.tipo_me_deben = tipo_me_deben;
  }
  DB.deudas.push(deuda);
  return deuda;
}

const MEDEBEN_INFORMATIVO = 0, MEDEBEN_PRESTAMO = 1, MEDEBEN_SUMAR_AL_COBRAR = 2;
function meDebenTipo(d){
  if(d.tipo_me_deben!==undefined && d.tipo_me_deben!==null) return d.tipo_me_deben;
  if(d.afecta_balance) return MEDEBEN_PRESTAMO;
  if(d.origen==='venta') return MEDEBEN_SUMAR_AL_COBRAR;
  return MEDEBEN_INFORMATIVO;
}
function meDebenRestaAlCrear(d){ return meDebenTipo(d)===MEDEBEN_PRESTAMO; }
function meDebenSumaAlCobrar(d){ const t = meDebenTipo(d); return t===MEDEBEN_PRESTAMO || t===MEDEBEN_SUMAR_AL_COBRAR; }
function meDebenLabel(d){
  const t = meDebenTipo(d);
  if(t===MEDEBEN_PRESTAMO) return 'Préstamo';
  if(t===MEDEBEN_SUMAR_AL_COBRAR) return 'Sumar al cobrar';
  return 'Informativo';
}
function meDebenBadgeHtml(d){
  const t = meDebenTipo(d);
  const cls = t===MEDEBEN_PRESTAMO ? 'badge-prestamo' : (t===MEDEBEN_SUMAR_AL_COBRAR ? 'badge-sumar' : 'badge-informativo');
  return `<span class="badge ${cls}">${meDebenLabel(d)}</span>`;
}

function eliminarDeudaAutomaticaSiPendiente(origen, origen_id){
  DB.deudas = DB.deudas.filter(d => !(d.origen===origen && d.origen_id===origen_id && d.estado==='pendiente'));
}

let deudasTab = 'pagar_a';
let deudasOrden = 'fecha'; // 'fecha' | 'az' — persiste al cambiar de pestaña dentro de Deudas

function renderDeudas(content){
  content.innerHTML = `
    <h1 class="section-title">Deudas</h1>
    <div class="tabs" id="deudas-tabs">
      <div class="tab ${deudasTab==='pagar_a'?'active':''}" data-v="pagar_a">Pagar a: <span class="tab-count" id="deudas-count-pagar">0</span></div>
      <div class="tab ${deudasTab==='me_deben'?'active':''}" data-v="me_deben">Me deben: <span class="tab-count" id="deudas-count-cobrar">0</span></div>
      <div class="tab ${deudasTab==='historial'?'active':''}" data-v="historial">Historial</div>
    </div>
    <div class="chip-row" id="deudas-orden">
      <div class="chip ${deudasOrden==='fecha'?'active':''}" data-v="fecha">📅 Por fecha</div>
      <div class="chip ${deudasOrden==='az'?'active':''}" data-v="az">🔤 A-Z</div>
    </div>
    <div id="deudas-totales"></div>
    <div id="deudas-list"></div>
    <div id="deudas-pag"></div>
    ${deudasTab!=='historial' ? `<button class="fab" id="fab-add-deuda" aria-label="Agregar">+</button>` : ''}
  `;

  // A igual nombre (o fecha), por id descendente: orden determinista para la paginación.
  function ordenarPorPersona(lista){
    return lista.slice().sort((a,b)=> String(a.persona||'').localeCompare(String(b.persona||''), 'es', {sensitivity:'base'}) || (b.id||0)-(a.id||0));
  }

  function refresh(){
    const el = document.getElementById('deudas-list');
    const pagarCount = DB.deudas.filter(d=>d.tipo==='pagar_a' && d.estado==='pendiente').length;
    const cobrarCount = DB.deudas.filter(d=>d.tipo==='me_deben' && d.estado==='pendiente').length;
    document.getElementById('deudas-count-pagar').textContent = pagarCount;
    document.getElementById('deudas-count-cobrar').textContent = cobrarCount;
    let items;
    const totalesEl = document.getElementById('deudas-totales');
    const pagEl = document.getElementById('deudas-pag');
    if(deudasTab==='historial'){
      // Solo el Historial se pagina; los contadores de las pestañas siguen
      // mostrando el total real de pendientes.
      totalesEl.innerHTML = '';
      items = DB.deudas.filter(d=>d.estado==='pagado'||d.estado==='cobrado');
      items = deudasOrden==='az' ? ordenarPorPersona(items) : items.sort((a,b)=>(b.fecha_cierre||0)-(a.fecha_cierre||0) || (b.id||0)-(a.id||0));
      const estado = paginacion.deudas_historial;
      const pag = paginarArray(items, estado);
      el.innerHTML = items.length ? pag.items.map(deudaHistorialRowHtml).join('') :
        emptyState('🗂️','Aún no hay registros pagados o cobrados');
      aplicarZebra(el, items.length);
      renderControlPaginacion(pagEl, estado, pag, refresh, el);
    } else {
      pagEl.innerHTML = '';
      items = DB.deudas.filter(d=>d.tipo===deudasTab && d.estado==='pendiente');
      const porDivisa = {};
      items.forEach(d=>{ porDivisa[d.divisa] = (porDivisa[d.divisa]||0) + Number(d.monto||0); });
      const divisasConTotal = Object.keys(porDivisa);
      totalesEl.innerHTML = divisasConTotal.length ? `
        <div class="card" style="padding:12px 14px;margin-bottom:10px;">
          <div class="subtle" style="margin-bottom:4px;">${deudasTab==='pagar_a'?'Total por pagar':'Total por cobrar'}</div>
          <div style="font-weight:800;font-size:15px;color:var(--accent-text);">
            ${divisasConTotal.map(dv=>`${fmtMoney(porDivisa[dv])} ${escapeHtml(dv)}`).join(' · ')}
          </div>
        </div>` : '';
      items = deudasOrden==='az' ? ordenarPorPersona(items) : items.sort((a,b)=>(b.creado_en||b.fecha)-(a.creado_en||a.fecha) || (b.id||0)-(a.id||0));
      el.innerHTML = items.length ? items.map(deudaRowHtml).join('') :
        emptyState(deudasTab==='pagar_a'?'💸':'🤝', deudasTab==='pagar_a' ? 'No hay deudas pendientes por pagar' : 'No hay registros pendientes por cobrar');
      aplicarZebra(el, items.length);
    }
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = ()=> openDeudaDetalle(Number(li.dataset.id), refresh);
    });
  }
  document.querySelectorAll('#deudas-tabs .tab').forEach(t=>{
    t.onclick = ()=>{
      deudasTab = t.dataset.v;
      renderDeudas(content);
    };
  });
  document.querySelectorAll('#deudas-orden .chip').forEach(c=>{
    c.onclick = ()=>{
      if(deudasOrden !== c.dataset.v) paginacion.deudas_historial.actual = 1; // cambiar el orden vuelve a la página 1
      deudasOrden = c.dataset.v;
      document.querySelectorAll('#deudas-orden .chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      refresh();
    };
  });
  const fab = document.getElementById('fab-add-deuda');
  if(fab) fab.onclick = ()=> openDeudaForm(deudasTab, refresh);
  refresh();
  actualizarFabEnvio(); // la pestaña Historial no tiene botón "+"
}

function estadoBadgeHtml(estado){
  if(estado==='pendiente') return `<span class="badge badge-gold">Pendiente</span>`;
  if(estado==='pagado') return `<span class="badge badge-teal">Pagado</span>`;
  if(estado==='cobrado') return `<span class="badge badge-teal">Cobrado</span>`;
  return '';
}

function deudaDescuentaAlPagar(d){
  if(d.origen==='envio'){
    const envio = DB.envios.find(e => e.id === d.origen_id);
    // Si la divisa entregada es igual a la de la ganancia, la ganancia
    // ya representa el efecto completo: pagar esta deuda NO descuenta
    // nada más del balance.
    if(envio) return !mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);
    return true;
  }
  if(d.origen==='compra') return true;
  return !!d.afecta_balance;
}
function afectaBalanceBadgeHtml(d){
  if(d.tipo!=='pagar_a') return '';
  return deudaDescuentaAlPagar(d)
    ? `<span class="badge badge-descuenta">Descontar al pagar</span>`
    : `<span class="badge badge-no-descuenta">No descontar al pagar</span>`;
}
function deudaRowHtml(d){
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${d.tipo==='pagar_a'?'💸':'🤝'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(d.persona)}</div>
        <div class="li-sub">${fmtDateShort(d.fecha)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
        <div style="margin-top:4px;">${d.tipo==='pagar_a' ? afectaBalanceBadgeHtml(d) : meDebenBadgeHtml(d)}</div>
      </div>
    </div>`;
}
function deudaHistorialRowHtml(d){
  const esMeDeben = d.tipo==='me_deben';
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${esMeDeben?'🤝':'💸'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(d.persona)}</div>
        <div class="li-sub">${esMeDeben?'Cobrado':'Pagado'} el ${fmtDateShort(d.fecha_cierre)} · Registrado ${fmtDateShort(d.fecha)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
        <div style="margin-top:4px;">${d.tipo==='pagar_a' ? afectaBalanceBadgeHtml(d) : meDebenBadgeHtml(d)}</div>
      </div>
    </div>`;
}

function openDeudaForm(tipo, onSaved){
  const esMeDeben = tipo==='me_deben';
  openModal(`
    <div class="modal-title">${esMeDeben ? 'Nuevo registro — Me deben' : 'Nueva deuda — Pagar a'}</div>
    <label class="field-label">Persona / Entidad *</label>
    <input type="text" id="df-persona" maxlength="100" placeholder="Nombre de la persona o entidad">
    <label class="field-label">Monto *</label>
    <input type="number" inputmode="decimal" step="0.01" id="df-monto" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="df-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha *</label>
    <input type="date" id="df-fecha" value="${fechaLocalISO()}">
    ${esMeDeben ? `
      <label class="field-label">Tipo de registro</label>
      <div class="pill-row" id="df-afecta">
        <div class="pill active" data-v="0">Informativo</div>
        <div class="pill" data-v="1">Préstamo</div>
        <div class="pill" data-v="2">Sumar al cobrar</div>
      </div>
      <div class="hint" id="df-afecta-hint">Informativo: no afecta el balance. Préstamo: resta el monto ahora y lo vuelve a sumar al cobrar. Sumar al cobrar: no afecta ahora, pero suma el monto al balance general cuando lo marque como cobrado.</div>
    ` : `
      <label class="field-label">Descontar del balance general al pagar</label>
      <div class="pill-row" id="df-afecta">
        <div class="pill active" data-v="0">No</div>
        <div class="pill" data-v="1">Sí</div>
      </div>
      <div class="hint">Si activa esta opción, el monto no se resta ahora — se resta cuando marque este registro como "Pagado".</div>
    `}
    <label class="field-label">Nota</label>
    <textarea id="df-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="df-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="df-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('df-divisa'), addDivisa, divisaOptionsHtml);
  let afectaBalance = 0;
  document.querySelectorAll('#df-afecta .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#df-afecta .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      afectaBalance = Number(p.dataset.v);
    };
  });
  document.getElementById('df-cancel').onclick = closeModal;
  document.getElementById('df-save').onclick = ()=>{
    const persona = document.getElementById('df-persona').value.trim();
    const monto = parseFloat(document.getElementById('df-monto').value);
    const divisa = document.getElementById('df-divisa').value;
    const fechaVal = document.getElementById('df-fecha').value;
    const nota = document.getElementById('df-nota').value.trim();
    if(!persona || !monto || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const ahora = Date.now();
    const deuda = {
      id: nextId('deudas'), tipo, persona, monto, divisa,
      fecha: fechaInputAInicioDeDiaLocal(fechaVal),
      creado_en: ahora,
      afecta_balance: esMeDeben ? (afectaBalance===MEDEBEN_PRESTAMO ? 1 : 0) : afectaBalance,
      estado: 'pendiente', fecha_cierre: null, nota,
      origen: null, origen_id: null
    };
    if(esMeDeben) deuda.tipo_me_deben = afectaBalance;
    DB.deudas.push(deuda);
    if(esMeDeben && meDebenRestaAlCrear(deuda)){
      adjustBalance(divisa, -monto);
    }
    save(); closeModal();
    toast(esMeDeben ? 'Registro guardado' : 'Deuda guardada');
    onSaved && onSaved();
  };
}

function openDeudaDetalle(id, onChange){
  const d = DB.deudas.find(x=>x.id===id);
  if(!d) return;
  const esMeDeben = d.tipo==='me_deben';
  openModal(`
    <div class="modal-title">${esMeDeben?'Me deben':'Pagar a'} — ${escapeHtml(d.persona)}</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:8px;">
      <div class="sumrow"><span class="k">Persona / Entidad</span><span class="v">${escapeHtml(d.persona)}</span></div>
      <div class="sumrow"><span class="k">Monto</span><span class="v">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha del registro</span><span class="v">${fmtDateShort(d.fecha)}</span></div>
      <div class="sumrow"><span class="k">Etiqueta</span><span class="v">${esMeDeben ? meDebenBadgeHtml(d) : afectaBalanceBadgeHtml(d)}</span></div>
      <div class="sumrow"><span class="k">Estado</span><span class="v">${estadoBadgeHtml(d.estado)}</span></div>
      ${d.fecha_cierre ? `<div class="sumrow"><span class="k">${esMeDeben?'Fecha de cobro':'Fecha de pago'}</span><span class="v">${fmtDate(d.fecha_cierre)}</span></div>` : ''}
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(d.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions" id="dd-actions-top"></div>
    <div class="modal-actions" id="dd-actions-bottom"></div>
  `);
  const actionsTop = document.getElementById('dd-actions-top');
  const actionsBottom = document.getElementById('dd-actions-bottom');
  actionsTop.innerHTML = `
    <button class="btn btn-outline btn-block" id="dd-aceptar">✅ Aceptar</button>
    <button class="btn btn-danger btn-block" id="dd-del">Eliminar</button>
  `;
  if(d.estado==='pendiente'){
    actionsBottom.innerHTML = `<button class="btn btn-gold btn-block" id="dd-cerrar">${esMeDeben?'Marcar como cobrado':'Marcar como pagado'}</button>`;
  }
  document.getElementById('dd-aceptar').onclick = volverDesdeDetalleMovimiento;

  const cerrarBtn = document.getElementById('dd-cerrar');
  if(cerrarBtn){
    cerrarBtn.onclick = ()=>{
      if(!esMeDeben){
        const envioOrigen = d.origen==='envio' ? DB.envios.find(x=>x.id===d.origen_id) : null;
        if(envioOrigen){
          // La ganancia de este envío ya se sumó al balance cuando se
          // registró (ver applyEnvioBalance, CASO 2). Marcar la deuda
          // como pagada es solo un registro de que la entrega ya se
          // hizo:
          //  - Si la divisa entregada y la divisa de la ganancia son
          //    LA MISMA, no se toca el balance (la ganancia ya
          //    representa el efecto neto completo de la operación).
          //  - Si son divisas DISTINTAS, sí hay que restar la entrega
          //    de su propia divisa, porque esa salida de dinero nunca
          //    se había registrado (la ganancia se sumó en otra divisa).
          const mismaDivisaEnvio = mismasDivisas(envioOrigen.divisa_entrega, envioOrigen.divisa_ganancia);
          const msg = mismaDivisaEnvio
            ? `Confirmar que se realizó la entrega de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}? La ganancia de este envío ya fue reconocida al registrarlo, así que esta acción NO modifica el balance general.`
            : `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}? Esta acción RESTARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} del balance general (la ganancia ya fue reconocida en otra divisa al registrar el envío).`;
          confirmDialog(msg, ()=>{
            d.estado = 'pagado'; d.fecha_cierre = Date.now();
            if(!mismaDivisaEnvio){
              adjustBalance(d.divisa, -d.monto);
            }
            save(); closeModal(); toast('Envío marcado como pagado — pasó al Historial'); onChange && onChange();
          }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
          return;
        }
        const restaAlPagar = d.afecta_balance || d.origen==='compra';
        const msg = restaAlPagar
          ? `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}? Esta acción RESTARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} del balance general.`
          : `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}?`;
        confirmDialog(msg, ()=>{
          d.estado = 'pagado'; d.fecha_cierre = Date.now();
          if(restaAlPagar) adjustBalance(d.divisa, -d.monto);
          save(); closeModal(); toast('Deuda marcada como pagada — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else if(meDebenSumaAlCobrar(d)){
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} de ${escapeHtml(d.persona)}? Esta acción SUMARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} al balance general.`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          adjustBalance(d.divisa, d.monto);
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else {
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} de ${escapeHtml(d.persona)}?`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      }
    };
  }
  document.getElementById('dd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar este registro de ${escapeHtml(d.persona)}?`, ()=> eliminarConDeshacer('Deuda eliminada', ()=>{
      if(d.tipo==='me_deben'){
        if(meDebenRestaAlCrear(d)){
          if(d.estado==='pendiente') adjustBalance(d.divisa, d.monto);
        } else if(meDebenSumaAlCobrar(d) && d.estado==='cobrado'){
          adjustBalance(d.divisa, -d.monto);
        }
      } else if(d.tipo==='pagar_a' && d.estado==='pagado'){
        if(d.origen==='envio'){
          const envioOrigen = DB.envios.find(x=>x.id===d.origen_id);
          const mismaDivisaEnvio = envioOrigen && mismasDivisas(envioOrigen.divisa_entrega, envioOrigen.divisa_ganancia);
          if(!mismaDivisaEnvio){
            adjustBalance(d.divisa, d.monto);
          }
        } else {
          const restaAlPagar = d.afecta_balance || d.origen==='compra';
          if(restaAlPagar) adjustBalance(d.divisa, d.monto);
        }
      }
      DB.deudas = DB.deudas.filter(x=>x.id!==d.id);
      save(); onChange && onChange();
    }));
  };
}
