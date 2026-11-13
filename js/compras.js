/* ---------------------------------------------------------------------- *
 * 14b. MENÚ 6 — COMPRAS
 * ---------------------------------------------------------------------- */
function renderComprasList(content){
  renderListadoPaginado(content, {
    clave:'compras', prefijo:'c', titulo:'Compras', textoNuevo:'➕ Nueva compra',
    rowHtml: compraRowHtml, vacioIcono:'🛒', vacioTexto:'Aún no hay compras registradas',
    abrirFormulario: (onSaved)=>openCompraForm(onSaved),
    abrirDetalle: openCompraDetalle, abrirEdicion: openCompraEditModal,
  });
}
function compraRowHtml(c){
  return `
    <div class="list-item" data-id="${c.id}">
      <div class="avatar">🛒</div>
      <div class="li-main">
        <div class="li-title">${fmtMoney(c.cantidad_pagada)} ${escapeDivisa(c.divisa_pagada)} → ${fmtMoney(c.cantidad_comprada)} ${escapeDivisa(c.divisa_comprada)}</div>
        <div class="li-sub">${fmtDate(c.fecha_hora)} ${c.registra_deuda?'· Pago pendiente':''}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${c.id}" aria-label="Editar compra">✏️</button>
    </div>`;
}
function openCompraForm(onSaved, prefill){
  openModal(`
    <div class="modal-title">Registrar compra</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Cantidad comprada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="cf-ccomprada" placeholder="0.00">
    <label class="field-label">Divisa comprada *</label>
    <select id="cf-dcomprada" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Cantidad pagada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="cf-cpagada" placeholder="0.00">
    <label class="field-label">Divisa pagada *</label>
    <select id="cf-dpagada" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Registrar cantidad pagada como deuda pendiente</label>
    <div class="pill-row" id="cf-switch">
      <div class="pill active" data-v="0">No</div>
      <div class="pill" data-v="1">Sí</div>
    </div>
    <div class="hint">Si activa esta opción, la cantidad pagada NO se resta ahora del balance — se crea un registro pendiente en Deudas → Pagar a.</div>
    <label class="field-label">Fecha y hora de la compra *</label>
    <input type="datetime-local" id="cf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="cf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="cf-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos(
      {'cf-ccomprada':prefill.cantidad_comprada, 'cf-dcomprada':prefill.divisa_comprada, 'cf-cpagada':prefill.cantidad_pagada, 'cf-dpagada':prefill.divisa_pagada, 'cf-nota':prefill.nota||''},
      {'cf-switch': prefill.registra_deuda ? 1 : 0});
  }
  bindAddOnSelect(document.getElementById('cf-dcomprada'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('cf-dpagada'), addDivisa, divisaOptionsHtml);
  let registraDeuda = prefill && prefill.registra_deuda ? 1 : 0;
  document.querySelectorAll('#cf-switch .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#cf-switch .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      registraDeuda = Number(p.dataset.v);
    };
  });
  document.getElementById('cf-cancel').onclick = closeModal;
  document.getElementById('cf-save').onclick = ()=>{
    const cantidad_comprada = parseFloat(document.getElementById('cf-ccomprada').value);
    const divisa_comprada = document.getElementById('cf-dcomprada').value;
    const cantidad_pagada = parseFloat(document.getElementById('cf-cpagada').value);
    const divisa_pagada = document.getElementById('cf-dpagada').value;
    const fechaVal = document.getElementById('cf-fecha').value;
    const nota = document.getElementById('cf-nota').value.trim();
    if(!cantidad_comprada || !divisa_comprada || divisa_comprada==='__add__' || !cantidad_pagada || !divisa_pagada || divisa_pagada==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const fecha_hora = new Date(fechaVal).getTime();
    const compra = {id:nextId('compras'), cantidad_comprada, divisa_comprada, cantidad_pagada, divisa_pagada, nota, fecha_hora, registra_deuda:registraDeuda};
    DB.compras.push(compra);
    adjustBalance(divisa_comprada, cantidad_comprada);
    if(registraDeuda){
      crearDeudaAutomatica({
        tipo:'pagar_a', persona:`Compra pendiente #${compra.id}`, monto:cantidad_pagada,
        divisa:divisa_pagada, fecha:fecha_hora, nota: nota || 'Registrado desde compra',
        origen:'compra', origen_id:compra.id
      });
    } else {
      adjustBalance(divisa_pagada, -cantidad_pagada);
    }
    save(); closeModal(); toast('Compra guardada');
    onSaved && onSaved();
  };
}
function openCompraDetalle(id, onChange, opts={}){
  const c = DB.compras.find(x=>x.id===id);
  if(!c) return;
  openModal(`
    <div class="modal-title">Detalle de compra</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Cantidad comprada</span><span class="v">${fmtMoney(c.cantidad_comprada)} ${escapeDivisa(c.divisa_comprada)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(c.cantidad_pagada)} ${escapeDivisa(c.divisa_pagada)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(c.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Pago pendiente</span><span class="v">${c.registra_deuda?'Sí — ver en Deudas':'No'}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(c.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cd2-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="cd2-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="cd2-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="cd2-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('cd2-duplicar').onclick = ()=> duplicarCompra(c.id, opts.alCrear || onChange);
  document.getElementById('cd2-edit').onclick = ()=>{
    closeModal();
    openCompraEditModal(c.id, onChange);
  };
  document.getElementById('cd2-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('cd2-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar la compra de ${fmtMoney(c.cantidad_pagada)} ${escapeDivisa(c.divisa_pagada)} → ${fmtMoney(c.cantidad_comprada)} ${escapeDivisa(c.divisa_comprada)}?`, ()=> eliminarConDeshacer('Compra eliminada', ()=>{
      adjustBalance(c.divisa_comprada, -c.cantidad_comprada);
      if(c.registra_deuda){
        const deudaAsociada = DB.deudas.find(d=>d.origen==='compra' && d.origen_id===c.id);
        if(deudaAsociada){
          if(deudaAsociada.estado==='pagado') adjustBalance(deudaAsociada.divisa, deudaAsociada.monto);
          DB.deudas = DB.deudas.filter(x=>x.id!==deudaAsociada.id);
        }
      } else {
        adjustBalance(c.divisa_pagada, c.cantidad_pagada);
      }
      DB.compras = DB.compras.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarCompra(id, onSaved){
  const c = DB.compras.find(x=>x.id===id);
  if(!c){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openCompraForm(onSaved, copiaParaDuplicar(c));
}

function openCompraEditModal(id, onSaved){
  const c = DB.compras.find(x=>x.id===id);
  if(!c){ toast('Compra no encontrada'); return; }
  openModal(`
    <div class="modal-title">Editar compra</div>
    <label class="field-label">Cantidad comprada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ce-ccomprada" value="${c.cantidad_comprada}">
    <label class="field-label">Divisa comprada *</label>
    <select id="ce-dcomprada" class="picker">${divisaOptionsHtml(c.divisa_comprada)}</select>
    <label class="field-label">Cantidad pagada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ce-cpagada" value="${c.cantidad_pagada}">
    <label class="field-label">Divisa pagada *</label>
    <select id="ce-dpagada" class="picker">${divisaOptionsHtml(c.divisa_pagada)}</select>
    ${c.registra_deuda ? `<div class="hint">Esta compra tiene un pago pendiente asociado en Deudas → Pagar a. Al guardar, esa deuda se actualizará con los nuevos valores.</div>` : ''}
    <label class="field-label">Fecha y hora de la compra *</label>
    <input type="datetime-local" id="ce-fecha" value="${toLocalDatetimeValue(c.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ce-nota" maxlength="500" placeholder="Opcional">${escapeHtml(c.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ce-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ce-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ce-dcomprada'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('ce-dpagada'), addDivisa, divisaOptionsHtml);
  document.getElementById('ce-cancel').onclick = closeModal;
  document.getElementById('ce-save').onclick = ()=>{
    const cantidad_comprada = parseFloat(document.getElementById('ce-ccomprada').value);
    const divisa_comprada = document.getElementById('ce-dcomprada').value;
    const cantidad_pagada = parseFloat(document.getElementById('ce-cpagada').value);
    const divisa_pagada = document.getElementById('ce-dpagada').value;
    const fechaVal = document.getElementById('ce-fecha').value;
    const nota = document.getElementById('ce-nota').value.trim();
    if(!cantidad_comprada || !divisa_comprada || divisa_comprada==='__add__' || !cantidad_pagada || !divisa_pagada || divisa_pagada==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const nuevo = {cantidad_comprada, divisa_comprada, cantidad_pagada, divisa_pagada, fecha_hora:new Date(fechaVal).getTime(), nota};
    confirmDialog('¿Guardar los cambios de esta compra? Se ajustará el balance general y la deuda asociada, si existe.', ()=>{
      closeModal();
      guardarEdicionCompra(c, nuevo);
      toast('Compra actualizada');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

function guardarEdicionCompra(c, nuevo){
  const deudaExistente = c.registra_deuda ? DB.deudas.find(d=>d.origen==='compra' && d.origen_id===c.id) : null;

  adjustBalance(c.divisa_comprada, -c.cantidad_comprada);
  if(c.registra_deuda){
    if(deudaExistente && deudaExistente.estado==='pagado'){
      adjustBalance(deudaExistente.divisa, deudaExistente.monto);
    }
  } else {
    adjustBalance(c.divisa_pagada, c.cantidad_pagada);
  }

  c.cantidad_comprada = nuevo.cantidad_comprada;
  c.divisa_comprada = nuevo.divisa_comprada;
  c.cantidad_pagada = nuevo.cantidad_pagada;
  c.divisa_pagada = nuevo.divisa_pagada;
  c.fecha_hora = nuevo.fecha_hora;
  c.nota = nuevo.nota;

  adjustBalance(c.divisa_comprada, c.cantidad_comprada);
  if(c.registra_deuda){
    if(deudaExistente){
      deudaExistente.monto = c.cantidad_pagada;
      deudaExistente.divisa = c.divisa_pagada;
      deudaExistente.persona = `Compra pendiente #${c.id}`;
      deudaExistente.fecha = c.fecha_hora;
      deudaExistente.nota = c.nota || 'Registrado desde compra';
      if(deudaExistente.estado==='pagado'){
        adjustBalance(deudaExistente.divisa, -deudaExistente.monto);
      }
    }
  } else {
    adjustBalance(c.divisa_pagada, -c.cantidad_pagada);
  }

  save();
}
