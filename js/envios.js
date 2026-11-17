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
  const forma = p ? (p.forma_ganancia || 'Efectivo') : 'Efectivo';
  const referenciaInicial = p && Number(p.cantidad_enviada)>0 && Number(p.precio)>0
    ? round2(Number(p.cantidad_enviada)*Number(p.precio)) : '';
  const cantidadEntregaInicial = p && Object.prototype.hasOwnProperty.call(p,'cantidad_entrega_global')
    ? p.cantidad_entrega_global
    : (referenciaInicial!=='' ? referenciaInicial : (p?.cantidad_pagada ?? ''));
  const divisaEntregaInicial = p && Object.prototype.hasOwnProperty.call(p,'divisa_entrega_global')
    ? p.divisa_entrega_global : (p?.divisa_entrega ?? '');
  return `
    <h1 class="section-title">${opts.titulo}</h1>
    ${p ? `<div class="badge badge-gold" style="margin:-4px 0 6px;">📋 Duplicado — revise y guarde como envío nuevo</div>` : ''}

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="ef-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>

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

    <label class="field-label">Cantidad a entregar *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-cantidad-entregar" placeholder="Calculado automáticamente" value="${val(cantidadEntregaInicial)}">
    <div class="hint">Se calcula como Cantidad enviada × Precio. Si no agrega destinatarios, este será el importe de entrega.</div>

    <label class="field-label">Divisa de entrega *</label>
    <select id="ef-divisa-entrega" class="picker">${divisaOptionsHtml(divisaEntregaInicial)}</select>

    <label class="field-label">Destinatarios (splits de entrega, opcionales)</label>
    ${entregasEnvioHtml('ef', p ? obtenerSplitsEnvio(p) : [])}
    <div class="hint">Puede guardar sin destinatarios. Al agregar uno, se copian la cantidad y la divisa globales actuales; después cada split conserva sus propios valores.</div>

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-cotizado" placeholder="Opcional" value="${val(p?.cotizado_a)}">

    <label class="field-label">Ganancia principal *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-ganancia" placeholder="0.00" value="${val(p?.ganancia)}">
    <label class="field-label">Divisa de ganancia principal *</label>
    <select id="ef-divisa-ganancia" class="picker">${divisaOptionsHtml(p ? p.divisa_ganancia : '')}</select>
    <label class="field-label">Forma de ganancia principal *</label>
    <div class="pill-row" id="ef-forma">
      ${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${forma===f?'active':''}" data-v="${f}">${f}</div>`).join('')}
    </div>
    <div class="hint">Se calcula automáticamente: Cantidad enviada × (Cotizado a − Precio). Puede ajustarla.</div>

    <label class="field-label">GANANCIAS ADICIONALES</label>
    ${gananciasAdicionalesEnvioHtml('ef', p ? obtenerGananciasAdicionalesEnvio(p) : [])}

    <label class="field-label">Descontar divisa pagada del balance general al pagar</label>
    <div class="pill-row" id="ef-descuenta">
      <div class="pill ${descuenta?'':'active'}" data-v="0">No</div>
      <div class="pill ${descuenta?'active':''}" data-v="1">Sí</div>
    </div>
    <div class="hint">Si está en "No", cada split o la entrega global (cuando no hay destinatarios) crea su deuda en Deudas → Pagar a. Si está en "Sí", el descuento se aplica al registrar el envío.</div>

    <label class="field-label">Nota</label>
    <textarea id="ef-nota" maxlength="500" placeholder="Opcional">${p ? escapeHtml(p.nota||'') : ''}</textarea>

    <button class="btn btn-primary btn-block" id="ef-revisar" style="margin-top:22px;">Revisar y guardar</button>
  `;
}

/* ---- Campo opcional "Destinatario" (Menú Entregas) ----
   Lo usan el formulario de envío y la edición de envíos. `pref` es el
   prefijo de los ids (ef = nuevo envío, ee = edición). */
function destinatarioCampoHtml(pref, dest){
  return `
    <label class="field-label">Destinatario (quien recibe)</label>
    <div style="display:flex;gap:8px;align-items:stretch;">
      <div class="picker" id="${pref}-dest-picker" style="flex:1;min-width:0;">
        <span id="${pref}-dest-name" class="${dest?'':'ph'}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dest ? escapeHtml(dest.nombre) : 'Opcional'}</span>
      </div>
      <button type="button" class="btn btn-outline btn-sm" id="${pref}-dest-btn" style="flex:none;">${dest ? 'Cambiar' : 'Seleccionar destinatario'}</button>
      <button type="button" class="btn btn-ghost btn-sm" id="${pref}-dest-quitar" style="flex:none;${dest?'':'display:none;'}" aria-label="Quitar destinatario">✕</button>
    </div>`;
}
// Conecta el campo; devuelve una función que da el destinatario elegido (o null).
function wireDestinatarioCampo(pref, inicial){
  let dest = inicial || null;
  const nameEl = document.getElementById(`${pref}-dest-name`);
  const btn = document.getElementById(`${pref}-dest-btn`);
  const quitar = document.getElementById(`${pref}-dest-quitar`);
  function pintar(){
    nameEl.textContent = dest ? dest.nombre : 'Opcional';
    nameEl.classList.toggle('ph', !dest);
    btn.textContent = dest ? 'Cambiar' : 'Seleccionar destinatario';
    quitar.style.display = dest ? '' : 'none';
  }
  const elegir = ()=> openSelectorEntrega('destinatarios', (d)=>{ if(d){ dest = d; pintar(); } });
  document.getElementById(`${pref}-dest-picker`).onclick = elegir;
  btn.onclick = elegir;
  quitar.onclick = ()=>{ dest = null; pintar(); };
  return ()=> dest;
}

/* Entregas divididas y ganancias en varias divisas.
   Cada entrega conserva un id estable: su deuda se puede pagar o editar
   individualmente sin depender del orden en que aparezca en pantalla. */
let secuenciaIdSplitEnvio = 0;
function nuevoIdEntregaEnvio(){
  secuenciaIdSplitEnvio++;
  return 'ent-' + Date.now().toString(36) + '-' + secuenciaIdSplitEnvio.toString(36) + '-' + Math.random().toString(36).slice(2,8);
}
function normalizarEntregaEnvio(e,x,i){
  return {
    id:String(x?.id || `${e?.id||'envio'}-${i+1}`),
    destinatario_id:x?.destinatario_id??null,
    destinatario_nombre:String(x?.destinatario_nombre||''),
    cantidad:Number(x?.cantidad??0),
    divisa:String(x?.divisa||''),
    mensajero_notificado_id:x?.mensajero_notificado_id??null,
    mensajero_notificado_nombre:String(x?.mensajero_notificado_nombre||''),
    mensajero_notificado_fecha:x?.mensajero_notificado_fecha??null
  };
}
// Los registros antiguos sin un array de entregas conservan su entrega única.
// En los nuevos registros, un array vacío significa que se usa la entrega global.
function obtenerSplitsEnvio(e){
  if(Array.isArray(e?.entregas)) return e.entregas.map((x,i)=>normalizarEntregaEnvio(e,x,i));
  if(e && (Number(e.cantidad_pagada||0)>0 || e.divisa_entrega || e.destinatario_id!=null || e.destinatario_nombre)){
    return [normalizarEntregaEnvio(e,{
      id:e.id?`${e.id}-1`:'legacy-1',
      destinatario_id:e.destinatario_id??null,
      destinatario_nombre:e.destinatario_nombre||'',
      cantidad:e.cantidad_pagada||0,
      divisa:e.divisa_entrega||'',
      mensajero_notificado_id:e.mensajero_notificado_id??null,
      mensajero_notificado_nombre:e.mensajero_notificado_nombre||'',
      mensajero_notificado_fecha:e.mensajero_notificado_fecha??null
    },0)];
  }
  return [];
}
/* Nombre que muestra «Pagar a» para la deuda de una entrega de un envío.
   Regla única (creación, edición y arranque usan esta misma función):
   · 0 o 1 destinatario → nombre del CLIENTE (o trabajador).
   · 2 o más → nombre del DESTINATARIO de esa entrega, para distinguirlas;
     si esa entrega no tiene destinatario, el del cliente.
   Formato: «Nombre – cantidad divisa». La divisa se guarda con su nombre
   interno; la pantalla la convierte al nombre visible. */
function personaDeudaEnvio(e, entrega){
  const titular = entityNameForEnvio(e);
  const variosDestinatarios = obtenerSplitsEnvio(e).length >= 2;
  const nombre = (variosDestinatarios && entrega && entrega.destinatario_nombre) ? entrega.destinatario_nombre : titular;
  return `${nombre} – ${fmtMoney(entrega ? entrega.cantidad : 0)} ${entrega ? entrega.divisa : ''}`;
}

// Entregas efectivas para balance, deudas e historial: splits si existen;
// de lo contrario, se usa el importe y la divisa globales.
function obtenerEntregasEnvio(e){
  const splits=obtenerSplitsEnvio(e);
  if(splits.length) return splits;
  return [{
    id:String(e?.id?`${e.id}-global`:'envio-global'),
    destinatario_id:null,destinatario_nombre:'',
    cantidad:Number(e?.cantidad_entrega_global??e?.cantidad_pagada??0),
    divisa:String(e?.divisa_entrega_global??e?.divisa_entrega??''),
    mensajero_notificado_id:e?.mensajero_notificado_id??null,
    mensajero_notificado_nombre:String(e?.mensajero_notificado_nombre||''),
    mensajero_notificado_fecha:e?.mensajero_notificado_fecha??null
  }];
}
function obtenerGananciasAdicionalesEnvio(e){
  return Array.isArray(e?.ganancias_adicionales)?e.ganancias_adicionales.map(x=>({
    cantidad:Number(x?.cantidad||0),divisa:String(x?.divisa||''),forma:x?.forma||'Efectivo'
  })):[];
}
function envioTieneDivisa(e,nombre){
  return obtenerEntregasEnvio(e).some(x=>x.divisa===nombre)||e?.divisa_ganancia===nombre||
    obtenerGananciasAdicionalesEnvio(e).some(x=>x.divisa===nombre);
}
// «Agregar destinatario» si aún no hay ninguno; «Agregar otro…» si ya hay.
function textoBotonAgregarDestinatario(cantidad){
  return cantidad>0 ? '+ Agregar otro destinatario' : '+ Agregar destinatario';
}
function entregasEnvioHtml(pref,inicial){
  const cantidad=Array.isArray(inicial)?inicial.length:0;
  return `<div id="${pref}-entregas-list"></div><button type="button" class="btn btn-outline btn-block" id="${pref}-add-entrega">${textoBotonAgregarDestinatario(cantidad)}</button>`;
}
function wireEntregasEnvio(pref,inicial){
  let splits=(Array.isArray(inicial)?inicial:[]).map(x=>({...x,id:x.id||nuevoIdEntregaEnvio()}));
  const list=document.getElementById(`${pref}-entregas-list`);
  function render(){
    list.innerHTML=splits.map((x,i)=>`<div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:10px;margin:8px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><strong style="font-size:13px;">Destinatario ${i+1}</strong>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-split="${i}">🗑️</button></div>
      <button type="button" class="picker" data-pick-split="${i}" style="width:100%;margin:8px 0;">${escapeHtml(x.destinatario_nombre||'Opcional — seleccionar destinatario')}</button>
      <div class="two-col"><input type="number" inputmode="decimal" min="0.01" step="0.01" data-cant-split="${i}" placeholder="Cantidad *" value="${escapeHtml(String(x.cantidad??''))}">
      <select class="picker" data-div-split="${i}">${divisaOptionsHtml(x.divisa||'')}</select></div></div>`).join('');
    list.querySelectorAll('[data-div-split]').forEach(el=>bindAddOnSelect(el,addDivisa,divisaOptionsHtml));
    list.querySelectorAll('[data-cant-split]').forEach(el=>el.oninput=()=>{splits[Number(el.dataset.cantSplit)].cantidad=el.value;});
    list.querySelectorAll('[data-div-split]').forEach(el=>el.onchange=()=>{splits[Number(el.dataset.divSplit)].divisa=el.value;});
    list.querySelectorAll('[data-pick-split]').forEach(btn=>btn.onclick=()=>openSelectorEntrega('destinatarios',d=>{
      if(!d)return;const x=splits[Number(btn.dataset.pickSplit)];x.destinatario_id=d.id;x.destinatario_nombre=d.nombre;render();
    }));
    list.querySelectorAll('[data-remove-split]').forEach(btn=>btn.onclick=()=>{splits.splice(Number(btn.dataset.removeSplit),1);render();});
    const boton=document.getElementById(`${pref}-add-entrega`);
    if(boton)boton.textContent=textoBotonAgregarDestinatario(splits.length);
  }
  document.getElementById(`${pref}-add-entrega`).onclick=()=>{
    const cantidadGlobal=document.getElementById(`${pref}-cantidad-entregar`)?.value??'';
    const divisaGlobal=document.getElementById(`${pref}-divisa-entrega`)?.value??'';
    splits.push({id:nuevoIdEntregaEnvio(),destinatario_id:null,destinatario_nombre:'',cantidad:cantidadGlobal,divisa:divisaGlobal});
    render();
  };
  render();
  return ()=>splits.map(x=>({...x,cantidad:Number(x.cantidad),divisa:String(x.divisa||'')}));
}
function resumenGananciasEnvio(e){
  const totales=new Map();
  const principal=String(e?.divisa_ganancia||'');
  if(principal)totales.set(principal,Number(e?.ganancia||0));
  obtenerGananciasAdicionalesEnvio(e).forEach(g=>{
    if(g.divisa)totales.set(g.divisa,round2((totales.get(g.divisa)||0)+Number(g.cantidad||0)));
  });
  return [...totales.entries()].map(([divisa,monto])=>`${monto>0?'+':''}${fmtMoney(monto)} ${escapeDivisa(divisa)}`).join(' · ');
}
function resumenEntregasEnvio(e){
  const entregas=obtenerEntregasEnvio(e),totales=new Map();
  entregas.forEach(x=>totales.set(x.divisa,round2((totales.get(x.divisa)||0)+Number(x.cantidad||0))));
  const detalle=[...totales.entries()].map(([divisa,cantidad])=>`${fmtMoney(cantidad)} ${escapeDivisa(divisa)}`).join(' + ');
  return `${entregas.length} ${entregas.length===1?'entrega':'entregas'} · ${detalle}`;
}
function gananciasAdicionalesEnvioHtml(pref){
  return `<div id="${pref}-ganancias-extra"></div><button type="button" class="btn btn-outline btn-block" id="${pref}-add-ganancia">+ Agregar otra divisa de ganancia</button>`;
}
function wireGananciasAdicionalesEnvio(pref,inicial){
  let items=(Array.isArray(inicial)?inicial:[]).map(x=>({...x}));
  const list=document.getElementById(`${pref}-ganancias-extra`);
  function render(){
    list.innerHTML=items.map((x,i)=>`<div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:10px;margin:8px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;"><strong style="font-size:13px;">Ganancia adicional ${i+1}</strong><button type="button" class="btn btn-ghost btn-sm" data-remove-extra="${i}">🗑️</button></div>
      <div class="two-col" style="margin-top:8px;"><input type="number" inputmode="decimal" step="0.01" min="0.01" data-cant-extra="${i}" placeholder="Cantidad *" value="${escapeHtml(String(x.cantidad??''))}">
      <select class="picker" data-div-extra="${i}">${divisaOptionsHtml(x.divisa||'')}</select></div>
      <label class="field-label">Forma de ganancia *</label>
      <div class="pill-row" data-forma-extra="${i}">${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${(x.forma||'Efectivo')===f?'active':''}" data-v="${f}">${f}</div>`).join('')}</div></div>`).join('');
    list.querySelectorAll('[data-div-extra]').forEach(el=>bindAddOnSelect(el,addDivisa,divisaOptionsHtml));
    list.querySelectorAll('[data-cant-extra]').forEach(el=>el.oninput=()=>{items[Number(el.dataset.cantExtra)].cantidad=el.value;});
    list.querySelectorAll('[data-div-extra]').forEach(el=>el.onchange=()=>{items[Number(el.dataset.divExtra)].divisa=el.value;});
    list.querySelectorAll('[data-forma-extra]').forEach(box=>box.querySelectorAll('.pill').forEach(p=>p.onclick=()=>{
      items[Number(box.dataset.formaExtra)].forma=p.dataset.v;box.querySelectorAll('.pill').forEach(z=>z.classList.toggle('active',z===p));
    }));
    list.querySelectorAll('[data-remove-extra]').forEach(btn=>btn.onclick=()=>{items.splice(Number(btn.dataset.removeExtra),1);render();});
  }
  document.getElementById(`${pref}-add-ganancia`).onclick=()=>{items.push({cantidad:'',divisa:'',forma:'Efectivo'});render();};
  render();
  return ()=>items.map(x=>({...x,cantidad:Number(x.cantidad),divisa:String(x.divisa||''),forma:x.forma||'Efectivo'}));
}
function wireEnvioForm(content, {tipo, getEntity, setEntity, entityRequired, onSaved, prefill}){
  const cantEl = document.getElementById('ef-cantidad');
  const precioEl = document.getElementById('ef-precio');
  const referenciaEl = document.getElementById('ef-cantidad-entregar');
  const cotizadoEl = document.getElementById('ef-cotizado');
  const gananciaEl = document.getElementById('ef-ganancia');
  const divGananciaEl = document.getElementById('ef-divisa-ganancia');
  const monedaEl = document.getElementById('ef-moneda');
  const notaEl = document.getElementById('ef-nota');
  const getEntregas = wireEntregasEnvio('ef', prefill ? obtenerSplitsEnvio(prefill) : []);
  const getGananciasAdicionales = wireGananciasAdicionalesEnvio('ef', prefill ? obtenerGananciasAdicionalesEnvio(prefill) : []);
  let gananciaTouched = false;
  let referenciaTouched = false;
  let formaGanancia = 'Efectivo';
  let descuentaAhora = 0;
  if(prefill){
    formaGanancia = prefill.forma_ganancia || 'Efectivo';
    descuentaAhora = envioDescuentaAhora(prefill) ? 1 : 0;
    const cant = Number(prefill.cantidad_enviada)||0, precio = Number(prefill.precio)||0;
    const cot = prefill.cotizado_a;
    const gananciaAuto = (cot===null || cot===undefined) ? null : round2(cant*(cot-precio));
    gananciaTouched = gananciaAuto===null ? true : gananciaAuto !== round2(prefill.ganancia);
    const referenciaCalc=Number(prefill.cantidad_enviada)>0&&Number(prefill.precio)>0
      ? round2(Number(prefill.cantidad_enviada)*Number(prefill.precio)) : null;
    referenciaTouched=Object.prototype.hasOwnProperty.call(prefill,'cantidad_entrega_global') &&
      (prefill.cantidad_entrega_global===null || prefill.cantidad_entrega_global==='' ||
       referenciaCalc===null || Number(prefill.cantidad_entrega_global)!==Number(referenciaCalc));
  }

  bindAddOnSelect(monedaEl, addMoneda, monedaOptionsHtml);
  bindAddOnSelect(document.getElementById('ef-divisa-entrega'), addDivisa, divisaOptionsHtml);
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
    if(!referenciaTouched){
      referenciaEl.value = (cant>0 && precio>0) ? round2(cant*precio) : '';
    }
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
  gananciaEl.addEventListener('input', ()=>{ gananciaTouched = true; });
  referenciaEl.addEventListener('input', ()=>{ referenciaTouched = true; });

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
    const entregas = getEntregas();
    const ganancias_adicionales = getGananciasAdicionales();
    const cotizado_a = cotizadoEl.value.trim()==='' ? null : parseFloat(cotizadoEl.value);
    const ganancia = parseFloat(gananciaEl.value || 0);
    const divisa_ganancia = divGananciaEl.value;
    const nota = notaEl.value.trim();
    const fechaVal = document.getElementById('ef-fecha').value;
    const cantidadEntregaReferencia = referenciaEl.value.trim()==='' ? null : Number(referenciaEl.value);
    const divisa_entrega_global = document.getElementById('ef-divisa-entrega').value;

    const entregasValidas = entregas.length>0
      ? entregas.every(x=>Number.isFinite(x.cantidad)&&x.cantidad>0&&!!x.divisa&&x.divisa!=='__add__')
      : Number.isFinite(cantidadEntregaReferencia)&&cantidadEntregaReferencia>0&&!!divisa_entrega_global&&divisa_entrega_global!=='__add__';
    const extrasValidas = ganancias_adicionales.every(x=>Number.isFinite(x.cantidad)&&x.cantidad>0&&!!x.divisa&&x.divisa!=='__add__'&&['Efectivo','Transferencia','USD'].includes(x.forma));
    if(!Number.isFinite(cantidad_enviada)||cantidad_enviada<=0||!Number.isFinite(precio)||precio<=0||!Number.isFinite(ganancia)||
       !entregasValidas||!extrasValidas||!divisa_ganancia||divisa_ganancia==='__add__'||
       !['Efectivo','Transferencia','USD'].includes(formaGanancia)||!fechaVal){
      toast('Revise las cantidades, divisas y formas de ganancia.'); return;
    }

    const envio = {
      tipo,
      cliente_id: tipo==='cliente_directo' ? entity.id : (tipo==='trabajador'?null:undefined),
      trabajador_id: tipo==='trabajador' ? entity.id : null,
      cantidad_enviada, moneda, precio,
      cantidad_entrega_global:cantidadEntregaReferencia,
      divisa_entrega_global:divisa_entrega_global==='__add__'?'':divisa_entrega_global,
      cantidad_pagada:entregas[0]?.cantidad??cantidadEntregaReferencia,
      cotizado_a, ganancia, divisa_entrega:entregas[0]?.divisa||divisa_entrega_global, divisa_ganancia,
      forma_ganancia: formaGanancia, nota,
      fecha_hora: new Date(fechaVal).getTime(),
      descuenta_ahora: descuentaAhora,
      entregas: entregas.map(x=>({...x,id:x.id||nuevoIdEntregaEnvio()})),
      ganancias_adicionales,
      destinatario_id: entregas[0]?.destinatario_id??null,
      destinatario_nombre: entregas[0]?.destinatario_nombre||''
    };
    showEnvioSummary(envio, entity, onSaved, cantidadEntregaReferencia);
  };

  recalc();
}

function showEnvioSummary(envio, entity, onSaved, cantidadEntregaReferencia){
  const splits=obtenerSplitsEnvio(envio), entregas=obtenerEntregasEnvio(envio), extras=obtenerGananciasAdicionalesEnvio(envio);
  const referencia=cantidadEntregaReferencia===null||cantidadEntregaReferencia===undefined?'—':fmtMoney(cantidadEntregaReferencia);
  openModal(`
    <div class="modal-title">Confirme los datos del envío antes de guardar.</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:10px;">
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(envio.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">${envio.tipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(entity.nombre)}</span></div>
      <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(envio.cantidad_enviada)}</span></div>
      <div class="sumrow"><span class="k">Moneda</span><span class="v">${escapeHtml(envio.moneda)}</span></div>
      <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(envio.precio)}</span></div>
      ${splits.length
        ? `<div class="sumrow"><span class="k">Cantidad a entregar (plantilla)</span><span class="v">${referencia} ${escapeDivisa(envio.divisa_entrega_global)}</span></div>
          <div style="font-weight:800;margin:10px 0 4px;">Destinatarios</div>
          ${splits.map((x,i)=>`<div class="sumrow"><span class="k">${i+1}. ${escapeHtml(x.destinatario_nombre||'Destinatario opcional')}</span><span class="v">${fmtMoney(x.cantidad)} ${escapeDivisa(x.divisa)}</span></div>`).join('')}`
        : `<div class="sumrow"><span class="k">Entrega</span><span class="v">${fmtMoney(envio.cantidad_entrega_global)} ${escapeDivisa(envio.divisa_entrega_global)}</span></div>`}
      <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${envio.cotizado_a!==null?fmtMoney(envio.cotizado_a):'—'}</span></div>
      <div style="font-weight:800;margin:10px 0 4px;">Ganancia principal</div>
      <div class="sumrow"><span class="k">Monto</span><span class="v">${fmtMoney(envio.ganancia)} ${escapeDivisa(envio.divisa_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Forma</span><span class="v">${escapeHtml(envio.forma_ganancia)}</span></div>
      ${extras.length?`<div style="font-weight:800;margin:10px 0 4px;">Ganancias adicionales</div>${extras.map((g,i)=>`<div class="sumrow"><span class="k">${i+1}. ${escapeHtml(g.forma)}</span><span class="v">${fmtMoney(g.cantidad)} ${escapeDivisa(g.divisa)}</span></div>`).join('')}`:''}
      <div class="sumrow"><span class="k">Descontar al pagar</span><span class="v">${envio.descuenta_ahora?'Sí':'No — '+entregas.length+' deudas pendientes'}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(envio.nota||'Sin nota')}</span></div>
    </div>
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="es-volver">Volver a editar</button><button class="btn btn-primary btn-block" id="es-confirmar">Confirmar y guardar</button></div>
  `);
  document.getElementById('es-volver').onclick=closeModal;
  document.getElementById('es-confirmar').onclick=()=>{
    envio.id=nextId('envios');DB.envios.push(envio);
    const entregasEfectivas=obtenerEntregasEnvio(envio);
    if(!envio.descuenta_ahora) entregasEfectivas.forEach(split=>{
      crearDeudaAutomatica({tipo:'pagar_a',persona:personaDeudaEnvio(envio,split),
        monto:split.cantidad,divisa:split.divisa,fecha:envio.fecha_hora,nota:envio.nota||'Registrado desde envío',
        origen:'envio',origen_id:envio.id,origen_detalle_id:splits.length?split.id:null});
    });
    applyEnvioBalance(envio,1);save();closeModal();toast('Envío guardado correctamente');
    onSaved&&onSaved();
    if(envio.descuenta_ahora) ofrecerNotificarWhatsApp(envio,envio.fecha_hora,'✅ Envío guardado');
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
