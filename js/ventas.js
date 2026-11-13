/* ---------------------------------------------------------------------- *
 * 14a. LISTADO DE VENTAS (con switch "deuda pendiente")
 * ---------------------------------------------------------------------- */
function renderVentasList(content){
  renderListadoPaginado(content, {
    clave:'ventas', prefijo:'v', titulo:'Ventas', textoNuevo:'➕ Nueva venta',
    rowHtml: ventaRowHtml, vacioIcono:'💱', vacioTexto:'Aún no hay ventas registradas',
    abrirFormulario: (onSaved)=>openVentaForm(onSaved),
    abrirDetalle: openVentaDetalle, abrirEdicion: openVentaEditModal,
  });
}
function ventaEstado(v){
  if(!v.registra_deuda) return 'Pagado';
  const d = DB.deudas.find(x=>x.origen==='venta' && x.origen_id===v.id);
  if(d && d.estado==='cobrado') return 'Cobrado';
  return 'Pendiente de cobro';
}
function ventaRowHtml(v){
  const comprador=nombreCompradorDeVenta(v);
  return `
    <div class="list-item" data-id="${v.id}">
      <div class="avatar">💱</div>
      <div class="li-main">
        <div class="li-title">${comprador?`${escapeHtml(comprador)} · `:''}${fmtMoney(v.cantidad_vendida)} ${escapeDivisa(v.divisa_vendida)} → ${fmtMoney(v.cantidad_recibida)} ${escapeDivisa(v.divisa_recibida)}</div>
        <div class="li-sub">${fmtDate(v.fecha_hora)} · ${ventaEstado(v)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${v.id}" aria-label="Editar venta">✏️</button>
    </div>`;
}
function ventaCompradorSnapshot(comprador){
  if(!comprador) return {comprador_id:null,comprador_nombre:'',comprador_nombre_completo:'',comprador_telefono:'',comprador_direccion:''};
  return {
    comprador_id:comprador.id??comprador.comprador_id??null,
    comprador_nombre:comprador.nombre??comprador.comprador_nombre??'',
    comprador_nombre_completo:comprador.nombre_completo??comprador.comprador_nombre_completo??'',
    comprador_telefono:comprador.telefono??comprador.comprador_telefono??'',
    comprador_direccion:comprador.direccion??comprador.comprador_direccion??''
  };
}
function ventaCompradorCampoHtml(prefijo, comprador){
  return `<div style="display:flex;gap:8px;align-items:center;">
    <button type="button" class="picker" style="flex:1;display:flex;justify-content:space-between;align-items:center;" id="${prefijo}-comprador-picker"><span>${escapeHtml(comprador?.nombre||'Seleccionar comprador')}</span><span>🔍</span></button>
    ${comprador?`<button type="button" class="btn btn-outline" id="${prefijo}-comprador-clear">Quitar</button>`:''}
  </div>`;
}
function openVentaForm(onSaved, prefill){
  let compradorSel=prefill?.comprador_id!=null?(compradorPorId(prefill.comprador_id)||{id:prefill.comprador_id,nombre:prefill.comprador_nombre||'',nombre_completo:prefill.comprador_nombre_completo||'',telefono:prefill.comprador_telefono||'',direccion:prefill.comprador_direccion||''}):null;
  openModal(`
    <div class="modal-title">Registrar venta</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Cantidad vendida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="vf-cvendida" placeholder="0.00">
    <label class="field-label">Divisa vendida *</label>
    <select id="vf-dvendida" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Cantidad recibida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="vf-crecibida" placeholder="0.00">
    <label class="field-label">Divisa recibida *</label>
    <select id="vf-drecibida" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Registrar cantidad recibida como deuda pendiente</label>
    <div class="pill-row" id="vf-switch">
      <div class="pill active" data-v="0">No</div>
      <div class="pill" data-v="1">Sí</div>
    </div>
    <div class="hint">Si activa esta opción, la cantidad recibida NO se suma ahora al balance — se crea un registro pendiente en Deudas → Me deben.</div>
    <label class="field-label">Comprador (opcional)</label>
    <div id="vf-comprador-wrap">${ventaCompradorCampoHtml('vf',compradorSel)}</div>
    <label class="field-label">Fecha y hora de la venta *</label>
    <input type="datetime-local" id="vf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="vf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="vf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="vf-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos(
      {'vf-cvendida':prefill.cantidad_vendida, 'vf-dvendida':prefill.divisa_vendida, 'vf-crecibida':prefill.cantidad_recibida, 'vf-drecibida':prefill.divisa_recibida, 'vf-nota':prefill.nota||''},
      {'vf-switch': prefill.registra_deuda ? 1 : 0});
  }
  bindAddOnSelect(document.getElementById('vf-dvendida'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('vf-drecibida'), addDivisa, divisaOptionsHtml);
  function renderComprador(){
    const wrap=document.getElementById('vf-comprador-wrap'); if(!wrap)return;
    wrap.innerHTML=ventaCompradorCampoHtml('vf',compradorSel);
    document.getElementById('vf-comprador-picker').onclick=()=>openSelectorComprador(c=>{compradorSel=c;renderComprador();});
    const clear=document.getElementById('vf-comprador-clear');
    if(clear) clear.onclick=()=>{compradorSel=null;renderComprador();};
  }
  renderComprador();
  let registraDeuda = prefill && prefill.registra_deuda ? 1 : 0;
  document.querySelectorAll('#vf-switch .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#vf-switch .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      registraDeuda = Number(p.dataset.v);
    };
  });
  document.getElementById('vf-cancel').onclick = closeModal;
  document.getElementById('vf-save').onclick = ()=>{
    const cantidad_vendida = parseFloat(document.getElementById('vf-cvendida').value);
    const divisa_vendida = document.getElementById('vf-dvendida').value;
    const cantidad_recibida = parseFloat(document.getElementById('vf-crecibida').value);
    const divisa_recibida = document.getElementById('vf-drecibida').value;
    const fechaVal = document.getElementById('vf-fecha').value;
    const nota = document.getElementById('vf-nota').value.trim();
    if(!cantidad_vendida || !divisa_vendida || divisa_vendida==='__add__' || !cantidad_recibida || !divisa_recibida || divisa_recibida==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const fecha_hora = new Date(fechaVal).getTime();
    const venta = {id:nextId('ventas'), cantidad_vendida, divisa_vendida, cantidad_recibida, divisa_recibida, nota, fecha_hora, registra_deuda:registraDeuda, ...ventaCompradorSnapshot(compradorSel)};
    DB.ventas.push(venta);
    adjustBalance(divisa_vendida, -cantidad_vendida);
    if(registraDeuda){
      crearDeudaAutomatica({
        tipo:'me_deben', persona:`Venta de ${fmtMoney(cantidad_vendida)} ${divisa_vendida}`, monto:cantidad_recibida,
        divisa:divisa_recibida, fecha:fecha_hora, nota: nota || 'Registrado desde venta',
        origen:'venta', origen_id:venta.id, tipo_me_deben: MEDEBEN_SUMAR_AL_COBRAR,
        ...ventaCompradorSnapshot(compradorSel)
      });
    } else {
      adjustBalance(divisa_recibida, cantidad_recibida);
    }
    save(); closeModal(); toast('Venta guardada');
    onSaved && onSaved();
  };
}
function openVentaDetalle(id, onChange, opts={}){
  const v = DB.ventas.find(x=>x.id===id);
  if(!v) return;
  openModal(`
    <div class="modal-title">Detalle de venta</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Cantidad vendida</span><span class="v">${fmtMoney(v.cantidad_vendida)} ${escapeDivisa(v.divisa_vendida)}</span></div>
      <div class="sumrow"><span class="k">Cantidad recibida</span><span class="v">${fmtMoney(v.cantidad_recibida)} ${escapeDivisa(v.divisa_recibida)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(v.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Estado</span><span class="v">${ventaEstado(v)}</span></div>
      ${nombreCompradorDeVenta(v)?`<div class="sumrow"><span class="k">Comprador</span><span class="v">${escapeHtml(nombreCompradorDeVenta(v))}${nombreCompletoCompradorDeVenta(v)?` · ${escapeHtml(nombreCompletoCompradorDeVenta(v))}`:''}</span></div>`:''}
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(v.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="vd-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="vd-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="vd-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="vd-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('vd-duplicar').onclick = ()=> duplicarVenta(v.id, opts.alCrear || onChange);
  document.getElementById('vd-edit').onclick = ()=>{
    closeModal();
    openVentaEditModal(v.id, onChange);
  };
  document.getElementById('vd-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('vd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar la venta de ${fmtMoney(v.cantidad_vendida)} ${escapeDivisa(v.divisa_vendida)} → ${fmtMoney(v.cantidad_recibida)} ${escapeDivisa(v.divisa_recibida)}?`, ()=> eliminarConDeshacer('Venta eliminada', ()=>{
      adjustBalance(v.divisa_vendida, v.cantidad_vendida);
      if(v.registra_deuda){
        const deudaAsociada = DB.deudas.find(d=>d.origen==='venta' && d.origen_id===v.id);
        if(deudaAsociada){
          if(deudaAsociada.estado==='cobrado') adjustBalance(deudaAsociada.divisa, -deudaAsociada.monto);
          DB.deudas = DB.deudas.filter(x=>x.id!==deudaAsociada.id);
        }
      } else {
        adjustBalance(v.divisa_recibida, -v.cantidad_recibida);
      }
      DB.ventas = DB.ventas.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarVenta(id, onSaved){
  const v = DB.ventas.find(x=>x.id===id);
  if(!v){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openVentaForm(onSaved, copiaParaDuplicar(v));
}

function openVentaEditModal(id, onSaved){
  const v = DB.ventas.find(x=>x.id===id);
  if(!v){ toast('Venta no encontrada'); return; }
  let compradorSel=v.comprador_id!=null?(compradorPorId(v.comprador_id)||{id:v.comprador_id,nombre:v.comprador_nombre||'',nombre_completo:v.comprador_nombre_completo||'',telefono:v.comprador_telefono||'',direccion:v.comprador_direccion||''}):null;
  openModal(`
    <div class="modal-title">Editar venta</div>
    <label class="field-label">Cantidad vendida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ve-cvendida" value="${v.cantidad_vendida}">
    <label class="field-label">Divisa vendida *</label>
    <select id="ve-dvendida" class="picker">${divisaOptionsHtml(v.divisa_vendida)}</select>
    <label class="field-label">Cantidad recibida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ve-crecibida" value="${v.cantidad_recibida}">
    <label class="field-label">Divisa recibida *</label>
    <select id="ve-drecibida" class="picker">${divisaOptionsHtml(v.divisa_recibida)}</select>
    ${v.registra_deuda ? `<div class="hint">Esta venta tiene una deuda pendiente asociada en Deudas → Me deben. Al guardar, esa deuda se actualizará con los nuevos valores.</div>` : ''}
    <label class="field-label">Comprador (opcional)</label>
    <div id="ve-comprador-wrap">${ventaCompradorCampoHtml('ve',compradorSel)}</div>
    <label class="field-label">Fecha y hora de la venta *</label>
    <input type="datetime-local" id="ve-fecha" value="${toLocalDatetimeValue(v.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ve-nota" maxlength="500" placeholder="Opcional">${escapeHtml(v.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ve-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ve-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ve-dvendida'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('ve-drecibida'), addDivisa, divisaOptionsHtml);
  function renderComprador(){
    const wrap=document.getElementById('ve-comprador-wrap'); if(!wrap)return;
    wrap.innerHTML=ventaCompradorCampoHtml('ve',compradorSel);
    document.getElementById('ve-comprador-picker').onclick=()=>openSelectorComprador(c=>{compradorSel=c;renderComprador();});
    const clear=document.getElementById('ve-comprador-clear');
    if(clear) clear.onclick=()=>{compradorSel=null;renderComprador();};
  }
  renderComprador();
  document.getElementById('ve-cancel').onclick = closeModal;
  document.getElementById('ve-save').onclick = ()=>{
    const cantidad_vendida = parseFloat(document.getElementById('ve-cvendida').value);
    const divisa_vendida = document.getElementById('ve-dvendida').value;
    const cantidad_recibida = parseFloat(document.getElementById('ve-crecibida').value);
    const divisa_recibida = document.getElementById('ve-drecibida').value;
    const fechaVal = document.getElementById('ve-fecha').value;
    const nota = document.getElementById('ve-nota').value.trim();
    if(!cantidad_vendida || !divisa_vendida || divisa_vendida==='__add__' || !cantidad_recibida || !divisa_recibida || divisa_recibida==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const nuevo = {cantidad_vendida, divisa_vendida, cantidad_recibida, divisa_recibida, fecha_hora:new Date(fechaVal).getTime(), nota, ...ventaCompradorSnapshot(compradorSel)};
    confirmDialog('¿Guardar los cambios de esta venta? Se ajustará el balance general y la deuda asociada, si existe.', ()=>{
      closeModal();
      guardarEdicionVenta(v, nuevo);
      toast('Venta actualizada');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

function guardarEdicionVenta(v, nuevo){
  const deudaExistente = v.registra_deuda ? DB.deudas.find(d=>d.origen==='venta' && d.origen_id===v.id) : null;

  adjustBalance(v.divisa_vendida, v.cantidad_vendida);
  if(v.registra_deuda){
    if(deudaExistente && deudaExistente.estado==='cobrado'){
      adjustBalance(deudaExistente.divisa, -deudaExistente.monto);
    }
  } else {
    adjustBalance(v.divisa_recibida, -v.cantidad_recibida);
  }

  v.cantidad_vendida = nuevo.cantidad_vendida;
  v.divisa_vendida = nuevo.divisa_vendida;
  v.cantidad_recibida = nuevo.cantidad_recibida;
  v.divisa_recibida = nuevo.divisa_recibida;
  v.fecha_hora = nuevo.fecha_hora;
  v.nota = nuevo.nota;
  Object.assign(v, ventaCompradorSnapshot(nuevo.comprador_id!=null?compradorPorId(nuevo.comprador_id):null));

  adjustBalance(v.divisa_vendida, -v.cantidad_vendida);
  if(v.registra_deuda){
    if(deudaExistente){
      deudaExistente.monto = v.cantidad_recibida;
      deudaExistente.divisa = v.divisa_recibida;
      deudaExistente.persona = `Venta de ${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida}`;
      deudaExistente.fecha = v.fecha_hora;
      deudaExistente.nota = v.nota || 'Registrado desde venta';
      Object.assign(deudaExistente, ventaCompradorSnapshot(v));
      if(deudaExistente.estado==='cobrado'){
        adjustBalance(deudaExistente.divisa, deudaExistente.monto);
      }
    }
  } else {
    adjustBalance(v.divisa_recibida, v.cantidad_recibida);
  }

  save();
}
