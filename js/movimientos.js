/* ---------------------------------------------------------------------- *
 * 14. LISTADOS PAGINADOS: VENTAS, COMPRAS, GASTOS, IN/OUT
 *     Los cuatro comparten la misma estructura: botón "Nuevo", lista
 *     paginada (10 por página, fecha descendente) y detalle en un modal.
 * ---------------------------------------------------------------------- */
function renderListadoPaginado(content, cfg){
  const estado = paginacion[cfg.clave];
  content.innerHTML = `
    <h1 class="section-title">${cfg.titulo}</h1>
    ${cfg.intro || ''}
    <button class="btn btn-gold btn-block" id="${cfg.prefijo}-nuevo">${cfg.textoNuevo}</button>
    <div style="height:14px;"></div>
    <div id="${cfg.prefijo}-list"></div>
    <div id="${cfg.prefijo}-pag"></div>
  `;
  const listEl = document.getElementById(`${cfg.prefijo}-list`);
  function refresh(){
    if(!document.body.contains(listEl)) return; // el usuario ya cambió de pantalla
    const items = DB[cfg.clave].filter(r=>!r.archivado).sort(ordenFechaDesc);
    const pag = paginarArray(items, estado);
    listEl.innerHTML = items.length ? pag.items.map(cfg.rowHtml).join('') : emptyState(cfg.vacioIcono, cfg.vacioTexto);
    aplicarZebra(listEl, items.length);
    renderControlPaginacion(document.getElementById(`${cfg.prefijo}-pag`), estado, pag, refresh, listEl);
    listEl.querySelectorAll('.list-item').forEach(el=>{
      el.onclick = (ev)=>{
        if(ev.target.closest('.edit-btn')) return;
        cfg.abrirDetalle(Number(el.dataset.id), refresh, {alCrear: irAPaginaUno});
      };
    });
    listEl.querySelectorAll('.edit-btn').forEach(btn=>{
      btn.onclick = (ev)=>{
        ev.stopPropagation();
        cfg.abrirEdicion(Number(btn.dataset.id), refresh);
      };
    });
  }
  // Un registro nuevo creado DESDE este listado lleva a la página 1 para verlo.
  function irAPaginaUno(){ estado.actual = 1; refresh(); }
  document.getElementById(`${cfg.prefijo}-nuevo`).onclick = ()=> cfg.abrirFormulario(irAPaginaUno);
  refresh();
}

/* ---- Duplicar: precarga de formularios de creación ----
   Rellena los campos (inputs/selects por id) y marca la opción activa de
   los selectores de "pastillas". La fecha NUNCA se copia: el formulario
   ya trae la fecha y hora actual. */
function precargarFormularioConDatos(campos, pills){
  Object.entries(campos||{}).forEach(([id, v])=>{
    const el = document.getElementById(id);
    if(!el || v===undefined || v===null) return;
    if(el.tagName==='SELECT' && ![...el.options].some(o=>o.value===String(v))) return; // la divisa ya no existe
    el.value = v;
  });
  Object.entries(pills||{}).forEach(([contenedorId, v])=>{
    document.querySelectorAll(`#${contenedorId} .pill`).forEach(p=> p.classList.toggle('active', p.dataset.v===String(v)));
  });
}
function avisoDuplicadoHtml(){
  return `<div class="badge badge-gold" style="margin:4px 0 2px;">📋 Duplicado — se guardará como un registro nuevo</div>`;
}
// Copia de un registro para duplicarlo: sin id, sin archivado ni fechas
// propias; la deuda asociada NUNCA se copia (el nuevo crea la suya al guardar).
function copiaParaDuplicar(registro){
  const c = JSON.parse(JSON.stringify(registro));
  delete c.id; delete c.archivado; delete c.archivado_en; delete c.fecha_hora;
  return c;
}

/* ---------------------------------------------------------------------- *
 * 14a. MENÚ 7 — VENTAS (con switch "deuda pendiente")
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
  return `
    <div class="list-item" data-id="${v.id}">
      <div class="avatar">💱</div>
      <div class="li-main">
        <div class="li-title">${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)} → ${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}</div>
        <div class="li-sub">${fmtDate(v.fecha_hora)} · ${ventaEstado(v)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${v.id}" aria-label="Editar venta">✏️</button>
    </div>`;
}
function openVentaForm(onSaved, prefill){
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
    const venta = {id:nextId('ventas'), cantidad_vendida, divisa_vendida, cantidad_recibida, divisa_recibida, nota, fecha_hora, registra_deuda:registraDeuda};
    DB.ventas.push(venta);
    adjustBalance(divisa_vendida, -cantidad_vendida);
    if(registraDeuda){
      crearDeudaAutomatica({
        tipo:'me_deben', persona:`Venta de ${fmtMoney(cantidad_vendida)} ${divisa_vendida}`, monto:cantidad_recibida,
        divisa:divisa_recibida, fecha:fecha_hora, nota: nota || 'Registrado desde venta',
        origen:'venta', origen_id:venta.id, tipo_me_deben: MEDEBEN_SUMAR_AL_COBRAR
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
      <div class="sumrow"><span class="k">Cantidad vendida</span><span class="v">${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)}</span></div>
      <div class="sumrow"><span class="k">Cantidad recibida</span><span class="v">${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(v.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Estado</span><span class="v">${ventaEstado(v)}</span></div>
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
    confirmDialog(`¿Eliminar la venta de ${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)} → ${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}?`, ()=> eliminarConDeshacer('Venta eliminada', ()=>{
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
    const nuevo = {cantidad_vendida, divisa_vendida, cantidad_recibida, divisa_recibida, fecha_hora:new Date(fechaVal).getTime(), nota};
    confirmDialog('¿Guardar los cambios de esta venta? Se ajustará el balance general y la deuda asociada, si existe.', ()=>{
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

  adjustBalance(v.divisa_vendida, -v.cantidad_vendida);
  if(v.registra_deuda){
    if(deudaExistente){
      deudaExistente.monto = v.cantidad_recibida;
      deudaExistente.divisa = v.divisa_recibida;
      deudaExistente.persona = `Venta de ${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida}`;
      deudaExistente.fecha = v.fecha_hora;
      deudaExistente.nota = v.nota || 'Registrado desde venta';
      if(deudaExistente.estado==='cobrado'){
        adjustBalance(deudaExistente.divisa, deudaExistente.monto);
      }
    }
  } else {
    adjustBalance(v.divisa_recibida, v.cantidad_recibida);
  }

  save();
}

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
        <div class="li-title">${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)} → ${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}</div>
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
      <div class="sumrow"><span class="k">Cantidad comprada</span><span class="v">${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)}</span></div>
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
    confirmDialog(`¿Eliminar la compra de ${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)} → ${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}?`, ()=> eliminarConDeshacer('Compra eliminada', ()=>{
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
        <div class="li-sub">${escapeHtml(g.divisa)}</div>
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
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(g.cantidad)} ${escapeHtml(g.divisa)}</span></div>
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
    confirmDialog(`¿Eliminar el gasto "${escapeHtml(g.concepto)}" por ${fmtMoney(g.cantidad)} ${escapeHtml(g.divisa)}?`, ()=> eliminarConDeshacer('Gasto eliminado', ()=>{
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
      applyGastoBalance(g, -1);
      g.concepto = concepto; g.cantidad = cantidad; g.divisa = divisa;
      g.fecha_hora = new Date(fechaVal).getTime(); g.nota = nota;
      applyGastoBalance(g, 1);
      save(); toast('Gasto actualizado');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

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
        <div class="li-sub">${escapeHtml(io.divisa)}</div>
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
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(io.cantidad)} ${escapeHtml(io.divisa)}</span></div>
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
    confirmDialog(`¿Eliminar el movimiento ${io.tipo==='entrada'?'📥 Entrada':'📤 Salida'} de ${fmtMoney(io.cantidad)} ${escapeHtml(io.divisa)}${io.nota ? ' ('+escapeHtml(io.nota)+')' : ''}?`, ()=> eliminarConDeshacer('Movimiento eliminado', ()=>{
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
      adjustBalance(io.divisa, io.tipo==='entrada' ? -io.cantidad : io.cantidad);
      io.tipo = tipo; io.cantidad = cantidad; io.divisa = divisa;
      io.fecha_hora = new Date(fechaVal).getTime(); io.nota = nota;
      adjustBalance(io.divisa, io.tipo==='entrada' ? io.cantidad : -io.cantidad);
      save(); toast('Movimiento actualizado');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}
