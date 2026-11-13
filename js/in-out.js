/* ---------------------------------------------------------------------- *
 * 15b. MENÚ 9 — IN/OUT
 * ---------------------------------------------------------------------- */
function renderInOut(content){
  renderListadoPaginado(content, {
    clave:'in_out', prefijo:'io', titulo:'In/Out', textoNuevo:'➕ Registrar movimiento',
    intro:`<div class="subtle" style="margin-bottom:12px;">Entradas y salidas manuales de divisas, sin asociarlas a un envío, compra, venta o gasto.</div>`,
    rowHtml: inOutRowHtml, vacioIcono:'🔄', vacioTexto:'Aún no hay movimientos registrados',
    abrirFormulario: (onSaved)=>openInOutForm(onSaved),
    abrirDetalle: openInOutDetalle, abrirEdicion: openInOutEditModal,
  });
}
function inOutRowHtml(io){
  const esEntrada = io.tipo==='entrada';
  return `
    <div class="list-item" data-id="${io.id}">
      <div class="avatar">${esEntrada?'📥':'📤'}</div>
      <div class="li-main">
        <div class="li-title">${esEntrada?'Entrada':'Salida'} · ${escapeHtml(io.nota || 'Sin nota')}</div>
        <div class="li-sub">${fmtDate(io.fecha_hora)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${esEntrada?'':'neg'}">${esEntrada?'+':'-'}${fmtMoney(io.cantidad)}</div>
        <div class="li-sub">${escapeDivisa(io.divisa)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${io.id}" aria-label="Editar movimiento">✏️</button>
    </div>`;
}
function openInOutForm(onSaved, prefill){
  openModal(`
    <div class="modal-title">Registrar In/Out</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Tipo de movimiento *</label>
    <div class="pill-row" id="io-tipo">
      <div class="pill active" data-v="entrada">📥 Entrada</div>
      <div class="pill" data-v="salida">📤 Salida</div>
    </div>
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="io-cantidad" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="io-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha y hora del ajuste *</label>
    <input type="datetime-local" id="io-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="io-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="io-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="io-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos({'io-cantidad':prefill.cantidad, 'io-divisa':prefill.divisa, 'io-nota':prefill.nota||''}, {'io-tipo':prefill.tipo});
  }
  bindAddOnSelect(document.getElementById('io-divisa'), addDivisa, divisaOptionsHtml);
  let tipo = prefill && prefill.tipo==='salida' ? 'salida' : 'entrada';
  document.querySelectorAll('#io-tipo .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#io-tipo .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      tipo = p.dataset.v;
    };
  });
  document.getElementById('io-cancel').onclick = closeModal;
  document.getElementById('io-save').onclick = ()=>{
    const cantidad = parseFloat(document.getElementById('io-cantidad').value);
    const divisa = document.getElementById('io-divisa').value;
    const fechaVal = document.getElementById('io-fecha').value;
    const nota = document.getElementById('io-nota').value.trim();
    if(!cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const io = {id:nextId('in_out'), tipo, cantidad, divisa, nota, fecha_hora:new Date(fechaVal).getTime()};
    DB.in_out.push(io);
    adjustBalance(divisa, tipo==='entrada' ? cantidad : -cantidad);
    save(); closeModal(); toast('Movimiento guardado');
    onSaved && onSaved();
  };
}
function openInOutDetalle(id, onChange, opts={}){
  const io = DB.in_out.find(x=>x.id===id);
  if(!io) return;
  const esEntrada = io.tipo==='entrada';
  openModal(`
    <div class="modal-title">Detalle de movimiento</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Tipo</span><span class="v">${esEntrada?'📥 Entrada':'📤 Salida'}</span></div>
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(io.cantidad)} ${escapeDivisa(io.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(io.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(io.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="iod-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="iod-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="iod-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="iod-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('iod-duplicar').onclick = ()=> duplicarInOut(io.id, opts.alCrear || onChange);
  document.getElementById('iod-edit').onclick = ()=>{
    closeModal();
    openInOutEditModal(io.id, onChange);
  };
  document.getElementById('iod-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('iod-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar el movimiento ${io.tipo==='entrada'?'📥 Entrada':'📤 Salida'} de ${fmtMoney(io.cantidad)} ${escapeDivisa(io.divisa)}${io.nota ? ' ('+escapeHtml(io.nota)+')' : ''}?`, ()=> eliminarConDeshacer('Movimiento eliminado', ()=>{
      adjustBalance(io.divisa, esEntrada ? -io.cantidad : io.cantidad);
      DB.in_out = DB.in_out.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarInOut(id, onSaved){
  const io = DB.in_out.find(x=>x.id===id);
  if(!io){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openInOutForm(onSaved, copiaParaDuplicar(io));
}

function openInOutEditModal(id, onSaved){
  const io = DB.in_out.find(x=>x.id===id);
  if(!io){ toast('Movimiento no encontrado'); return; }
  openModal(`
    <div class="modal-title">Editar movimiento</div>
    <label class="field-label">Tipo de movimiento *</label>
    <div class="pill-row" id="ioe-tipo">
      <div class="pill ${io.tipo==='entrada'?'active':''}" data-v="entrada">📥 Entrada</div>
      <div class="pill ${io.tipo==='salida'?'active':''}" data-v="salida">📤 Salida</div>
    </div>
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ioe-cantidad" value="${io.cantidad}">
    <label class="field-label">Divisa *</label>
    <select id="ioe-divisa" class="picker">${divisaOptionsHtml(io.divisa)}</select>
    <label class="field-label">Fecha y hora del ajuste *</label>
    <input type="datetime-local" id="ioe-fecha" value="${toLocalDatetimeValue(io.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ioe-nota" maxlength="500" placeholder="Opcional">${escapeHtml(io.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ioe-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ioe-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ioe-divisa'), addDivisa, divisaOptionsHtml);
  let tipo = io.tipo;
  document.querySelectorAll('#ioe-tipo .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#ioe-tipo .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      tipo = p.dataset.v;
    };
  });
  document.getElementById('ioe-cancel').onclick = closeModal;
  document.getElementById('ioe-save').onclick = ()=>{
    const cantidad = parseFloat(document.getElementById('ioe-cantidad').value);
    const divisa = document.getElementById('ioe-divisa').value;
    const fechaVal = document.getElementById('ioe-fecha').value;
    const nota = document.getElementById('ioe-nota').value.trim();
    if(!cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    confirmDialog('¿Guardar los cambios de este movimiento? Se ajustará el balance general.', ()=>{
      closeModal();
      adjustBalance(io.divisa, io.tipo==='entrada' ? -io.cantidad : io.cantidad);
      io.tipo = tipo; io.cantidad = cantidad; io.divisa = divisa;
      io.fecha_hora = new Date(fechaVal).getTime(); io.nota = nota;
      adjustBalance(io.divisa, io.tipo==='entrada' ? io.cantidad : -io.cantidad);
      save(); toast('Movimiento actualizado');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}
