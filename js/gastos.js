/* ---------------------------------------------------------------------- *
 * 15. MENÚ 8 — GASTOS
 * ---------------------------------------------------------------------- */
function renderGastosList(content){
  renderListadoPaginado(content, {
    clave:'gastos', prefijo:'g', titulo:'Gastos', textoNuevo:'➕ Nuevo gasto',
    rowHtml: gastoRowHtml, vacioIcono:'🧾', vacioTexto:'Aún no hay gastos registrados',
    abrirFormulario: (onSaved)=>openGastoForm(onSaved),
    abrirDetalle: openGastoDetalle, abrirEdicion: openGastoEditModal,
  });
}
function gastoRowHtml(g){
  return `
    <div class="list-item" data-id="${g.id}">
      <div class="avatar">🧾</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(g.concepto)}</div>
        <div class="li-sub">${fmtDate(g.fecha_hora)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount neg">-${fmtMoney(g.cantidad)}</div>
        <div class="li-sub">${escapeDivisa(g.divisa)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${g.id}" aria-label="Editar gasto">✏️</button>
    </div>`;
}
function toLocalDatetimeValue(ts){
  const d = new Date(ts);
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function openGastoForm(onSaved, prefill){
  openModal(`
    <div class="modal-title">Registrar gasto</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Concepto o motivo *</label>
    <input type="text" id="gf-concepto" maxlength="200" placeholder="Ej: Alquiler">
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="gf-cantidad" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="gf-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha y hora *</label>
    <input type="datetime-local" id="gf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <label class="field-label">Nota</label>
    <textarea id="gf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="gf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="gf-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos({'gf-concepto':prefill.concepto, 'gf-cantidad':prefill.cantidad, 'gf-divisa':prefill.divisa, 'gf-nota':prefill.nota||''});
  }
  bindAddOnSelect(document.getElementById('gf-divisa'), addDivisa, divisaOptionsHtml);
  document.getElementById('gf-cancel').onclick = closeModal;
  document.getElementById('gf-save').onclick = ()=>{
    const concepto = document.getElementById('gf-concepto').value.trim();
    const cantidad = parseFloat(document.getElementById('gf-cantidad').value);
    const divisa = document.getElementById('gf-divisa').value;
    const fechaVal = document.getElementById('gf-fecha').value;
    const nota = document.getElementById('gf-nota').value.trim();
    if(!concepto || !cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const gasto = {id:nextId('gastos'), concepto, cantidad, divisa, nota, fecha_hora:new Date(fechaVal).getTime()};
    DB.gastos.push(gasto);
    applyGastoBalance(gasto, 1);
    save(); closeModal(); toast('Gasto guardado');
    onSaved && onSaved();
  };
}
function openGastoDetalle(id, onChange, opts={}){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g) return;
  openModal(`
    <div class="modal-title">Detalle de gasto</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Concepto</span><span class="v">${escapeHtml(g.concepto)}</span></div>
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(g.cantidad)} ${escapeDivisa(g.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(g.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(g.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="gd-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="gd-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="gd-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="gd-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('gd-duplicar').onclick = ()=> duplicarGasto(g.id, opts.alCrear || onChange);
  document.getElementById('gd-edit').onclick = ()=>{
    closeModal();
    openGastoEditModal(g.id, onChange);
  };
  document.getElementById('gd-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('gd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar el gasto "${escapeHtml(g.concepto)}" por ${fmtMoney(g.cantidad)} ${escapeDivisa(g.divisa)}?`, ()=> eliminarConDeshacer('Gasto eliminado', ()=>{
      applyGastoBalance(g, -1);
      DB.gastos = DB.gastos.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarGasto(id, onSaved){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openGastoForm(onSaved, copiaParaDuplicar(g));
}

function openGastoEditModal(id, onSaved){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g){ toast('Gasto no encontrado'); return; }
  openModal(`
    <div class="modal-title">Editar gasto</div>
    <label class="field-label">Concepto o motivo *</label>
    <input type="text" id="ge-concepto" maxlength="200" value="${escapeHtml(g.concepto)}">
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ge-cantidad" value="${g.cantidad}">
    <label class="field-label">Divisa *</label>
    <select id="ge-divisa" class="picker">${divisaOptionsHtml(g.divisa)}</select>
    <label class="field-label">Fecha y hora *</label>
    <input type="datetime-local" id="ge-fecha" value="${toLocalDatetimeValue(g.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ge-nota" maxlength="500" placeholder="Opcional">${escapeHtml(g.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ge-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ge-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ge-divisa'), addDivisa, divisaOptionsHtml);
  document.getElementById('ge-cancel').onclick = closeModal;
  document.getElementById('ge-save').onclick = ()=>{
    const concepto = document.getElementById('ge-concepto').value.trim();
    const cantidad = parseFloat(document.getElementById('ge-cantidad').value);
    const divisa = document.getElementById('ge-divisa').value;
    const fechaVal = document.getElementById('ge-fecha').value;
    const nota = document.getElementById('ge-nota').value.trim();
    if(!concepto || !cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    confirmDialog('¿Guardar los cambios de este gasto? Se ajustará el balance general.', ()=>{
      closeModal();
      applyGastoBalance(g, -1);
      g.concepto = concepto; g.cantidad = cantidad; g.divisa = divisa;
      g.fecha_hora = new Date(fechaVal).getTime(); g.nota = nota;
      applyGastoBalance(g, 1);
      save(); toast('Gasto actualizado');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}
