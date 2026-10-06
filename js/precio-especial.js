/* ---------------------------------------------------------------------- *
 * 12. MENÚ 4 — PRECIO ESPECIAL
 * ---------------------------------------------------------------------- */
function renderPrecioEspecialForm(content){
  let entity = null, entityTipo = null;
  const p = tomarDuplicadoEnvio('precio_especial');
  const val = (v)=> (v===null || v===undefined) ? '' : escapeHtml(String(v));
  if(p){
    if(p.trabajador_id){ entity = DB.trabajadores.find(t=>t.id===p.trabajador_id && t.activo) || null; entityTipo = entity ? 'trabajador' : null; }
    else if(p.cliente_id){ entity = DB.clientes.find(c=>c.id===p.cliente_id && c.activo) || null; entityTipo = entity ? 'cliente' : null; }
  }
  const forma = p ? p.forma_ganancia : 'Efectivo';
  content.innerHTML = `
    <h1 class="section-title">⭐ Precio especial</h1>
    ${p ? `<div class="badge badge-gold" style="margin:-4px 0 6px;">📋 Duplicado — revise y guarde como envío nuevo</div>` : ''}

    <label class="field-label">Cliente o trabajador *</label>
    <div class="picker" id="pe-entity-picker">
      <span id="pe-entity-name" class="${entity?'':'ph'}">${entity ? `${entityTipo==='trabajador'?'👷 ':''}${escapeHtml(entity.nombre)}` : 'Toca para seleccionar...'}</span>
      <span>🔍</span>
    </div>

    <label class="field-label">Cantidad enviada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-cantidad" placeholder="0.00" value="${val(p?.cantidad_enviada)}">

    <label class="field-label">Moneda *</label>
    <select id="pe-moneda" class="picker">${monedaOptionsHtml(p ? p.moneda : 'USD')}</select>

    <label class="field-label">Precio *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-precio" placeholder="0.00" value="${val(p?.precio)}">

    <label class="field-label">Cantidad pagada (Entregar) *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-pagada" placeholder="0.00" value="${val(p?.cantidad_pagada)}">
    <div class="hint">Editable manualmente. No hay cálculo automático.</div>

    <label class="field-label">Divisa de entrega *</label>
    <select id="pe-divisa-entrega" class="picker">${divisaOptionsHtml(p ? p.divisa_entrega : '')}</select>

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-cotizado" placeholder="Opcional — informativo" value="${val(p?.cotizado_a)}">

    <label class="field-label">Ganancia *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-ganancia" placeholder="0.00" value="${val(p?.ganancia)}">
    <div class="hint">Editable manualmente. No hay cálculo automático. Puede ser negativa.</div>

    <label class="field-label">Divisa de ganancia *</label>
    <select id="pe-divisa-ganancia" class="picker">${divisaOptionsHtml(p ? p.divisa_ganancia : '')}</select>

    <label class="field-label">Forma de ganancia *</label>
    <div class="pill-row" id="pe-forma">
      ${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${forma===f?'active':''}" data-v="${f}">${f}</div>`).join('')}
    </div>

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="pe-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>

    <label class="field-label">Nota</label>
    <textarea id="pe-nota" maxlength="500" placeholder="Opcional">${p ? escapeHtml(p.nota||'') : ''}</textarea>

    <button class="btn btn-primary btn-block" id="pe-revisar" style="margin-top:22px;">Revisar y guardar</button>
  `;

  document.getElementById('pe-entity-picker').onclick = ()=>{
    openEntityPicker('combinado', (item, tipo)=>{
      entity = item; entityTipo = tipo;
      const label = document.getElementById('pe-entity-name');
      label.textContent = `${tipo==='trabajador'?'👷 ':''}${item.nombre}`;
      label.classList.remove('ph');
    });
  };

  bindAddOnSelect(document.getElementById('pe-moneda'), addMoneda, monedaOptionsHtml);
  bindAddOnSelect(document.getElementById('pe-divisa-entrega'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('pe-divisa-ganancia'), addDivisa, divisaOptionsHtml);

  let formaGanancia = forma || 'Efectivo';
  document.querySelectorAll('#pe-forma .pill').forEach(pill=>{
    pill.onclick = ()=>{
      document.querySelectorAll('#pe-forma .pill').forEach(x=>x.classList.remove('active'));
      pill.classList.add('active'); formaGanancia = pill.dataset.v;
    };
  });
  if(p && !entity) toast('El cliente o trabajador original ya no existe. Seleccione otro.');

  document.getElementById('pe-revisar').onclick = ()=>{
    if(!entity){ toast('Debe seleccionar al menos un cliente o un trabajador.'); return; }
    const cantidad_enviada = parseFloat(document.getElementById('pe-cantidad').value);
    const moneda = document.getElementById('pe-moneda').value.toUpperCase();
    const precio = parseFloat(document.getElementById('pe-precio').value);
    const cantidad_pagada = parseFloat(document.getElementById('pe-pagada').value);
    const divisa_entrega = document.getElementById('pe-divisa-entrega').value;
    const cotizadoRaw = document.getElementById('pe-cotizado').value.trim();
    const cotizado_a = cotizadoRaw==='' ? null : parseFloat(cotizadoRaw);
    const gananciaRaw = document.getElementById('pe-ganancia').value.trim();
    const divisa_ganancia = document.getElementById('pe-divisa-ganancia').value;
    const nota = document.getElementById('pe-nota').value.trim();
    const fechaVal = document.getElementById('pe-fecha').value;

    if(!cantidad_enviada || !moneda || !precio || gananciaRaw==='' || isNaN(cantidad_pagada) ||
       !divisa_entrega || !divisa_ganancia || divisa_entrega==='__add__' || divisa_ganancia==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const ganancia = parseFloat(gananciaRaw);
    const fecha_hora = new Date(fechaVal).getTime();

    const envio = {
      tipo:'precio_especial',
      cliente_id: entityTipo==='cliente' ? entity.id : null,
      trabajador_id: entityTipo==='trabajador' ? entity.id : null,
      cantidad_enviada, moneda, precio, cantidad_pagada, cotizado_a, ganancia,
      divisa_entrega, divisa_ganancia, forma_ganancia: formaGanancia, nota,
      fecha_hora, descuenta_ahora: 1
    };

    function goToSummary(){
      openModal(`
        <div class="modal-title">Estás registrando un envío especial.</div>
        <div class="modal-msg">La ganancia será de <strong>${fmtMoney(ganancia)} ${escapeHtml(divisa_ganancia)}</strong>. Forma de ganancia: <strong>${escapeHtml(formaGanancia)}</strong>.</div>
        <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
          <div class="sumrow"><span class="k">${entityTipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(entity.nombre)}</span></div>
          <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(cantidad_enviada)} ${escapeHtml(moneda)}</span></div>
          <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(precio)}</span></div>
          <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(cantidad_pagada)} ${escapeHtml(divisa_entrega)}</span></div>
          <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${cotizado_a!==null?fmtMoney(cotizado_a):'—'}</span></div>
          <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(ganancia)} ${escapeHtml(divisa_ganancia)}</span></div>
          <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(fecha_hora)}</span></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline btn-block" id="pe-volver">Volver a editar</button>
          <button class="btn btn-primary btn-block" id="pe-confirmar">Confirmar y guardar</button>
        </div>
      `);
      document.getElementById('pe-volver').onclick = closeModal;
      document.getElementById('pe-confirmar').onclick = ()=>{
        envio.id = nextId('envios');
        DB.envios.push(envio);
        applyEnvioBalance(envio, 1);
        save(); closeModal();
        toast('Envío guardado correctamente');
        renderPrecioEspecialForm(content);
      };
    }

    if(ganancia < 0){
      confirmDialog(`La ganancia es negativa: -$${fmtMoney(Math.abs(ganancia))}. ¿Confirmar este envío con pérdida?`, goToSummary, {okLabel:'Confirmar', cancelLabel:'Corregir', danger:false});
    } else {
      goToSummary();
    }
  };
}
