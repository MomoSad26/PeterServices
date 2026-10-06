/* ---------------------------------------------------------------------- *
 * 10. MENÚ 2 — ENVÍO (CLIENTE DIRECTO) y ENVÍO DE TRABAJADOR
 * ---------------------------------------------------------------------- */
/* Datos para precargar el próximo formulario de envío (los pone "Duplicar").
   El formulario los toma al pintarse y route() los descarta después, así
   nunca quedan colgados para otra pantalla. */
let duplicadoEnvioPendiente = null; // {tipo, envio}
function tomarDuplicadoEnvio(tipo){
  const d = duplicadoEnvioPendiente;
  duplicadoEnvioPendiente = null;
  return d && d.tipo===tipo ? d.envio : null;
}

function envioFormHtml(opts){
  const p = opts.prefill || null;
  const val = (v)=> (v===null || v===undefined) ? '' : escapeHtml(String(v));
  const descuenta = p ? (envioDescuentaAhora(p) ? 1 : 0) : 0;
  const forma = p ? p.forma_ganancia : 'Efectivo';
  return `
    <h1 class="section-title">${opts.titulo}</h1>
    ${p ? `<div class="badge badge-gold" style="margin:-4px 0 6px;">📋 Duplicado — revise y guarde como envío nuevo</div>` : ''}

    <label class="field-label">${opts.entityLabel} *</label>
    ${opts.showEntityPicker ? `
      <div class="picker" id="ef-entity-picker">
        <span id="ef-entity-name" class="${opts.entityName?'':'ph'}">${escapeHtml(opts.entityName || 'Toca para seleccionar...')}</span>
        <span>🔍</span>
      </div>
      <button class="btn btn-outline btn-sm" id="ef-add-cliente" style="margin-top:8px;">➕ Cliente</button>
    ` : `
      <input type="text" value="${escapeHtml(opts.entityName)}" disabled>
    `}

    <label class="field-label">Cantidad enviada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-cantidad" placeholder="0.00" value="${val(p?.cantidad_enviada)}">

    <label class="field-label">Moneda *</label>
    <select id="ef-moneda" class="picker">${monedaOptionsHtml(p ? p.moneda : 'USD')}</select>

    <label class="field-label">Precio *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-precio" placeholder="0.00" value="${val(p?.precio)}">

    <label class="field-label">Cantidad pagada (Entregar) *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-pagada" placeholder="0.00" value="${val(p?.cantidad_pagada)}">
    <div class="hint">Se calcula automático: Cantidad enviada × Precio. Puede ajustarlo.</div>

    <label class="field-label">Divisa de entrega *</label>
    <select id="ef-divisa-entrega" class="picker">${divisaOptionsHtml(p ? p.divisa_entrega : '')}</select>

    <label class="field-label">Descontar divisa pagada del balance general al pagar</label>
    <div class="pill-row" id="ef-descuenta">
      <div class="pill ${descuenta?'':'active'}" data-v="0">No</div>
      <div class="pill ${descuenta?'active':''}" data-v="1">Sí</div>
    </div>
    <div class="hint">Si está en "No", la divisa de entrega no se descuenta ahora — se crea un registro pendiente en Deudas → Pagar a.</div>

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-cotizado" placeholder="Opcional" value="${val(p?.cotizado_a)}">

    <label class="field-label">Ganancia *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-ganancia" placeholder="0.00" value="${val(p?.ganancia)}">
    <div class="hint">Se calcula automático: Cantidad enviada × (Cotizado a − Precio). Puede ajustarlo.</div>

    <label class="field-label">Divisa de ganancia *</label>
    <select id="ef-divisa-ganancia" class="picker">${divisaOptionsHtml(p ? p.divisa_ganancia : '')}</select>

    <label class="field-label">Forma de ganancia *</label>
    <div class="pill-row" id="ef-forma">
      ${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${forma===f?'active':''}" data-v="${f}">${f}</div>`).join('')}
    </div>

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="ef-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>

    <label class="field-label">Nota</label>
    <textarea id="ef-nota" maxlength="500" placeholder="Opcional">${p ? escapeHtml(p.nota||'') : ''}</textarea>

    <button class="btn btn-primary btn-block" id="ef-revisar" style="margin-top:22px;">Revisar y guardar</button>
  `;
}

function wireEnvioForm(content, {tipo, getEntity, setEntity, entityRequired, onSaved, prefill}){
  const cantEl = document.getElementById('ef-cantidad');
  const precioEl = document.getElementById('ef-precio');
  const pagadaEl = document.getElementById('ef-pagada');
  const cotizadoEl = document.getElementById('ef-cotizado');
  const gananciaEl = document.getElementById('ef-ganancia');
  const divEntregaEl = document.getElementById('ef-divisa-entrega');
  const divGananciaEl = document.getElementById('ef-divisa-ganancia');
  const monedaEl = document.getElementById('ef-moneda');
  const notaEl = document.getElementById('ef-nota');
  let pagadaTouched = false, gananciaTouched = false;
  let formaGanancia = 'Efectivo';
  let descuentaAhora = 0;
  if(prefill){
    formaGanancia = prefill.forma_ganancia || 'Efectivo';
    descuentaAhora = envioDescuentaAhora(prefill) ? 1 : 0;
    // Si el original tenía la cantidad pagada o la ganancia ajustadas a mano
    // (distintas del cálculo automático), se respetan tal cual; si coinciden
    // con el cálculo, siguen recalculándose al cambiar cantidad o precio.
    const cant = Number(prefill.cantidad_enviada)||0, precio = Number(prefill.precio)||0;
    pagadaTouched = round2(cant*precio) !== round2(prefill.cantidad_pagada);
    const cot = prefill.cotizado_a;
    const gananciaAuto = (cot===null || cot===undefined) ? null : round2(cant*(cot-precio));
    gananciaTouched = gananciaAuto===null ? true : gananciaAuto !== round2(prefill.ganancia);
  }

  bindAddOnSelect(monedaEl, addMoneda, monedaOptionsHtml);
  bindAddOnSelect(divEntregaEl, addDivisa, divisaOptionsHtml);
  bindAddOnSelect(divGananciaEl, addDivisa, divisaOptionsHtml);

  document.querySelectorAll('#ef-forma .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#ef-forma .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      formaGanancia = p.dataset.v;
    };
  });
  document.querySelectorAll('#ef-descuenta .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#ef-descuenta .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      descuentaAhora = Number(p.dataset.v);
    };
  });

  function recalc(){
    const cant = parseFloat(cantEl.value)||0;
    const precio = parseFloat(precioEl.value)||0;
    const cotizado = cotizadoEl.value.trim()==='' ? null : parseFloat(cotizadoEl.value);
    if(!pagadaTouched) pagadaEl.value = cant && precio ? round2(cant*precio) : '';
    if(!gananciaTouched){
      gananciaEl.value = (cotizado!==null) ? round2(cant*(cotizado-precio)) : '';
    }
    if(cotizado!==null && cotizado < precio){
      cotizadoEl.classList.add('err');
      revisarBtn.disabled = true;
      revisarBtn.style.opacity = .5;
    } else {
      cotizadoEl.classList.remove('err');
      revisarBtn.disabled = false;
      revisarBtn.style.opacity = 1;
    }
  }
  const revisarBtn = document.getElementById('ef-revisar');
  [cantEl, precioEl, cotizadoEl].forEach(el=>el.addEventListener('input', recalc));
  pagadaEl.addEventListener('input', ()=>{ pagadaTouched = true; });
  gananciaEl.addEventListener('input', ()=>{ gananciaTouched = true; });

  if(entityRequired){
    const pickerEl = document.getElementById('ef-entity-picker');
    pickerEl.onclick = ()=>{
      openEntityPicker('cliente', (item)=>{
        setEntity(item);
        document.getElementById('ef-entity-name').textContent = item.nombre;
        document.getElementById('ef-entity-name').classList.remove('ph');
      });
    };
    document.getElementById('ef-add-cliente').onclick = ()=>{
      openClienteFormModal(null, (cliente)=>{
        setEntity(cliente);
        document.getElementById('ef-entity-name').textContent = cliente.nombre;
        document.getElementById('ef-entity-name').classList.remove('ph');
      });
    };
  }

  revisarBtn.onclick = ()=>{
    const entity = getEntity();
    if(entityRequired && !entity){ toast('Seleccione un cliente'); return; }
    const cantidad_enviada = parseFloat(cantEl.value);
    const moneda = monedaEl.value.toUpperCase();
    const precio = parseFloat(precioEl.value);
    const cantidad_pagada = parseFloat(pagadaEl.value);
    const divisa_entrega = divEntregaEl.value;
    const cotizado_a = cotizadoEl.value.trim()==='' ? null : parseFloat(cotizadoEl.value);
    const ganancia = parseFloat(gananciaEl.value || 0);
    const divisa_ganancia = divGananciaEl.value;
    const nota = notaEl.value.trim();
    const fechaVal = document.getElementById('ef-fecha').value;

    if(!cantidad_enviada || !precio || isNaN(cantidad_pagada) || !divisa_entrega || !divisa_ganancia || divisa_entrega==='__add__' || divisa_ganancia==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }

    const envio = {
      tipo,
      cliente_id: tipo==='cliente_directo' ? entity.id : (tipo==='trabajador'?null:undefined),
      trabajador_id: tipo==='trabajador' ? entity.id : null,
      cantidad_enviada, moneda, precio, cantidad_pagada,
      cotizado_a, ganancia, divisa_entrega, divisa_ganancia,
      forma_ganancia: formaGanancia, nota,
      fecha_hora: new Date(fechaVal).getTime(),
      descuenta_ahora: descuentaAhora
    };
    showEnvioSummary(envio, entity, onSaved);
  };

  recalc();
}

function showEnvioSummary(envio, entity, onSaved){
  openModal(`
    <div class="modal-title">Confirme los datos del envío antes de guardar.</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:10px;">
      <div class="sumrow"><span class="k">${envio.tipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(entity.nombre)}</span></div>
      <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(envio.cantidad_enviada)} ${escapeHtml(envio.moneda)}</span></div>
      <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(envio.precio)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(envio.cantidad_pagada)}</span></div>
      <div class="sumrow"><span class="k">Divisa de entrega</span><span class="v">${escapeHtml(envio.divisa_entrega)}</span></div>
      <div class="sumrow"><span class="k">Descontar ahora</span><span class="v">${envio.descuenta_ahora?'Sí':'No — queda pendiente en Deudas'}</span></div>
      <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${envio.cotizado_a!==null?fmtMoney(envio.cotizado_a):'—'}</span></div>
      <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(envio.ganancia)}</span></div>
      <div class="sumrow"><span class="k">Divisa de ganancia</span><span class="v">${escapeHtml(envio.divisa_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Forma de ganancia</span><span class="v">${escapeHtml(envio.forma_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(envio.fecha_hora)}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="es-volver">Volver a editar</button>
      <button class="btn btn-primary btn-block" id="es-confirmar">Confirmar y guardar</button>
    </div>
  `);
  document.getElementById('es-volver').onclick = closeModal;
  document.getElementById('es-confirmar').onclick = ()=>{
    envio.id = nextId('envios');
    DB.envios.push(envio);
    let deudaCreada = null;
    if(!envio.descuenta_ahora){
      deudaCreada = crearDeudaAutomatica({
        tipo:'pagar_a', persona:`${entity.nombre} – ${fmtMoney(envio.cantidad_enviada)} ${envio.moneda}`, monto:envio.cantidad_pagada,
        divisa:envio.divisa_entrega, fecha:envio.fecha_hora, nota: envio.nota || 'Registrado desde envío',
        origen:'envio', origen_id:envio.id
      });
    }
    applyEnvioBalance(envio, 1, deudaCreada);
    save();
    closeModal();
    toast('Envío guardado correctamente');
    onSaved && onSaved();
  };
}

function renderEnvioClienteForm(content, clienteIdPrecargado){
  const prefill = tomarDuplicadoEnvio('cliente_directo');
  // Cliente precargado: el del envío duplicado, o el de #/envio/cliente/ID.
  const idCliente = prefill ? prefill.cliente_id : clienteIdPrecargado;
  let entity = idCliente ? (DB.clientes.find(c=>c.id===idCliente && c.activo) || null) : null;
  content.innerHTML = envioFormHtml({titulo:'Envío a cliente', entityLabel:'Cliente', entityName: entity ? entity.nombre : '', showEntityPicker:true, prefill});
  wireEnvioForm(content, {
    tipo:'cliente_directo',
    getEntity: ()=>entity,
    setEntity: (e)=>{entity=e;},
    entityRequired:true,
    prefill,
    // Tras guardar, el formulario queda limpio; si se llegó desde el
    // detalle de un cliente, ese cliente sigue seleccionado.
    onSaved: ()=>{ renderEnvioClienteForm(content, clienteIdPrecargado); }
  });
  if(prefill && idCliente && !entity) toast('El cliente original ya no existe. Seleccione un cliente.');
}
