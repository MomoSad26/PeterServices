/* ---------------------------------------------------------------------- *
 * 11b. MENÚ ENTREGAS (🛵) — DESTINATARIOS Y MENSAJEROS
 *      · Destinatario: quien RECIBE el dinero (se elige en el envío).
 *      · Mensajero: quien lo ENTREGA (se le avisa desde Deudas → Pagar a).
 *      Eliminar = desactivar (activo = 0), igual que clientes y
 *      trabajadores: los envíos antiguos conservan el nombre como historial.
 * ---------------------------------------------------------------------- */
let entregasTab = 'destinatarios'; // 'destinatarios' | 'mensajeros'

const ENTREGAS_TIPOS = {
  destinatarios: {
    tabla:'destinatarios', singular:'destinatario', titulo:'Destinatarios', icono:'👤',
    vacio:'Aún no hay destinatarios registrados', eliminado:'Destinatario eliminado',
  },
  mensajeros: {
    tabla:'mensajeros', singular:'mensajero', titulo:'Mensajeros', icono:'🛵',
    vacio:'Aún no hay mensajeros registrados', eliminado:'Mensajero eliminado',
  },
};

function entregasActivos(tabla){
  return (DB[tabla]||[]).filter(x=>x.activo).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
function destinatarioPorId(id){ return id==null ? null : (DB.destinatarios||[]).find(d=>d.id===id) || null; }
function mensajeroPorId(id){ return id==null ? null : (DB.mensajeros||[]).find(m=>m.id===id) || null; }

function destinatarioSubtitulo(d){
  const partes = [];
  if(d.nombre_completo) partes.push(d.nombre_completo);
  if(d.direccion) partes.push(d.direccion);
  return partes.join(' · ') || 'Sin dirección';
}
function entregaRowHtml(tipo, x){
  const sub = tipo==='destinatarios' ? destinatarioSubtitulo(x) : (x.telefono || 'Sin teléfono');
  return `
    <div class="list-item" data-id="${x.id}">
      <div class="avatar">${tipo==='mensajeros' ? '🛵' : initials(x.nombre)}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(x.nombre)}</div>
        <div class="li-sub">${escapeHtml(sub)}</div>
      </div>
    </div>`;
}

function renderEntregas(content, param){
  if(param==='destinatarios' || param==='mensajeros') entregasTab = param;
  const cfg = ENTREGAS_TIPOS[entregasTab];
  content.innerHTML = `
    <h1 class="section-title">Entregas</h1>
    <div class="tabs" id="ent-tabs">
      <div class="tab ${entregasTab==='destinatarios'?'active':''}" data-v="destinatarios">👤 Destinatarios</div>
      <div class="tab ${entregasTab==='mensajeros'?'active':''}" data-v="mensajeros">🛵 Mensajeros</div>
    </div>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="ent-search" placeholder="Buscar ${cfg.singular} por nombre...">
    </div>
    <div id="ent-list"></div>
    <button class="fab" id="fab-add-entrega" aria-label="Agregar ${cfg.singular}">+</button>
  `;
  const searchEl = document.getElementById('ent-search');
  function refrescar(){
    const el = document.getElementById('ent-list');
    if(!el) return;
    // Búsqueda tolerante SOLO por el nombre corto (no por el nombre completo).
    const items = entregasActivos(cfg.tabla).filter(x=>coincideBusqueda(x.nombre, searchEl.value));
    el.innerHTML = items.length ? items.map(x=>entregaRowHtml(entregasTab, x)).join('') : emptyState(cfg.icono, searchEl.value.trim() ? 'Sin resultados' : cfg.vacio);
    aplicarZebra(el, items.length);
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = ()=> openEntregaDetalle(entregasTab, Number(li.dataset.id), refrescar);
    });
  }
  searchEl.addEventListener('input', refrescar);
  activarSugerencias(searchEl, {
    obtenerCandidatos: ()=> entregasActivos(cfg.tabla).map(x=>({
      nombre:x.nombre,
      sub: entregasTab==='destinatarios' ? (x.nombre_completo||'') : (x.telefono||''),
      avatar: entregasTab==='mensajeros' ? '🛵' : undefined,
    })),
    onElegir: refrescar
  });
  document.querySelectorAll('#ent-tabs .tab').forEach(t=>{
    t.onclick = ()=>{ entregasTab = t.dataset.v; renderEntregas(content); actualizarFabEnvio(); };
  });
  document.getElementById('fab-add-entrega').onclick = ()=>{
    const abrir = entregasTab==='destinatarios' ? openDestinatarioFormModal : openMensajeroFormModal;
    abrir(null, refrescar);
  };
  refrescar();
}

/* ---- Formularios ---- */
function openDestinatarioFormModal(id, onSaved){
  const editing = id ? destinatarioPorId(id) : null;
  openModal(`
    <div class="modal-title">${editing?'Editar destinatario':'Agregar destinatario'}</div>
    <label class="field-label">Nombre *</label>
    <input type="text" id="dsf-nombre" maxlength="100" value="${escapeHtml(editing?.nombre||'')}" placeholder="Por este nombre se busca">
    <label class="field-label">Nombre completo</label>
    <input type="text" id="dsf-completo" maxlength="150" value="${escapeHtml(editing?.nombre_completo||'')}" placeholder="Opcional">
    <label class="field-label">Número de carnet de identidad</label>
    <input type="text" id="dsf-carnet" maxlength="30" value="${escapeHtml(editing?.carnet||'')}" placeholder="Opcional">
    <label class="field-label">Teléfono</label>
    <input type="tel" id="dsf-tel" maxlength="25" value="${escapeHtml(editing?.telefono||'')}" placeholder="Opcional — se envía al mensajero">
    <label class="field-label">Dirección</label>
    <textarea id="dsf-dir" maxlength="300" placeholder="Opcional">${escapeHtml(editing?.direccion||'')}</textarea>
    <label class="field-label">Nota</label>
    <textarea id="dsf-nota" maxlength="500" placeholder="Opcional">${escapeHtml(editing?.nota||'')}</textarea>
    <div id="dsf-error" style="color:var(--red-text);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="dsf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="dsf-save">Guardar</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('dsf-nombre')?.focus(), 150);
  document.getElementById('dsf-cancel').onclick = closeModal;
  document.getElementById('dsf-save').onclick = ()=>{
    const nombre = document.getElementById('dsf-nombre').value.trim();
    if(!nombre){
      const err = document.getElementById('dsf-error');
      err.textContent = 'El nombre del destinatario es obligatorio.'; err.style.display = 'block';
      return;
    }
    const datos = {
      nombre,
      nombre_completo: document.getElementById('dsf-completo').value.trim(),
      carnet: document.getElementById('dsf-carnet').value.trim(),
      telefono: document.getElementById('dsf-tel').value.trim(),
      direccion: document.getElementById('dsf-dir').value.trim(),
      nota: document.getElementById('dsf-nota').value.trim(),
    };
    let dest;
    if(editing){ Object.assign(editing, datos); dest = editing; }
    else { dest = {id:nextId('destinatarios'), ...datos, fecha_registro:Date.now(), activo:1}; DB.destinatarios.push(dest); }
    save(); closeModal();
    toast(editing ? 'Destinatario actualizado' : 'Destinatario agregado');
    onSaved && onSaved(dest);
  };
}

function openMensajeroFormModal(id, onSaved){
  const editing = id ? mensajeroPorId(id) : null;
  openModal(`
    <div class="modal-title">${editing?'Editar mensajero':'Agregar mensajero'}</div>
    <label class="field-label">Nombre *</label>
    <input type="text" id="msf-nombre" maxlength="100" value="${escapeHtml(editing?.nombre||'')}" placeholder="Nombre del mensajero">
    <label class="field-label">Teléfono</label>
    <input type="tel" id="msf-tel" maxlength="25" value="${escapeHtml(editing?.telefono||'')}" placeholder="Recomendado: con código de país, ej. +53 5...">
    <div class="hint">Sin teléfono no se le puede enviar la entrega por WhatsApp.</div>
    <label class="field-label">Nota</label>
    <textarea id="msf-nota" maxlength="500" placeholder="Opcional">${escapeHtml(editing?.nota||'')}</textarea>
    <div id="msf-error" style="color:var(--red-text);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="msf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="msf-save">Guardar</button>
    </div>
  `);
  setTimeout(()=>document.getElementById('msf-nombre')?.focus(), 150);
  document.getElementById('msf-cancel').onclick = closeModal;
  document.getElementById('msf-save').onclick = ()=>{
    const nombre = document.getElementById('msf-nombre').value.trim();
    if(!nombre){
      const err = document.getElementById('msf-error');
      err.textContent = 'El nombre del mensajero es obligatorio.'; err.style.display = 'block';
      return;
    }
    const datos = {nombre, telefono: document.getElementById('msf-tel').value.trim(), nota: document.getElementById('msf-nota').value.trim()};
    let m;
    if(editing){ Object.assign(editing, datos); m = editing; }
    else { m = {id:nextId('mensajeros'), ...datos, fecha_registro:Date.now(), activo:1}; DB.mensajeros.push(m); }
    save(); closeModal();
    toast(editing ? 'Mensajero actualizado' : 'Mensajero agregado');
    onSaved && onSaved(m);
  };
}

/* ---- Detalle (con Editar y Eliminar) ---- */
function openEntregaDetalle(tipo, id, onChange){
  const cfg = ENTREGAS_TIPOS[tipo];
  const x = tipo==='destinatarios' ? destinatarioPorId(id) : mensajeroPorId(id);
  if(!x) return;
  const fila = (k, v)=> `<div class="sumrow"><span class="k">${k}</span><span class="v" style="white-space:pre-line;">${escapeHtml(v || '—')}</span></div>`;
  const filas = tipo==='destinatarios'
    ? fila('Nombre', x.nombre) + fila('Nombre completo', x.nombre_completo) + fila('Carnet de identidad', x.carnet) +
      fila('Teléfono', x.telefono) + fila('Dirección', x.direccion) + fila('Nota', x.nota) + fila('Registrado', fmtDate(x.fecha_registro))
    : fila('Nombre', x.nombre) + fila('Teléfono', x.telefono) + fila('Nota', x.nota) + fila('Registrado', fmtDate(x.fecha_registro));
  openModal(`
    <div class="modal-title">${cfg.icono} ${escapeHtml(x.nombre)}</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:8px;">${filas}</div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ent-cerrar">Cerrar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="ent-editar">✏️ Editar</button>
      <button class="btn btn-danger btn-block" id="ent-eliminar">🗑️ Eliminar</button>
    </div>
  `);
  document.getElementById('ent-cerrar').onclick = closeModal;
  document.getElementById('ent-editar').onclick = ()=>{
    closeModal();
    (tipo==='destinatarios' ? openDestinatarioFormModal : openMensajeroFormModal)(x.id, ()=>onChange && onChange());
  };
  document.getElementById('ent-eliminar').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar al ${cfg.singular} ${escapeHtml(x.nombre)}? Los envíos en los que aparece conservan su nombre como historial.`, ()=>{
      eliminarConDeshacer(cfg.eliminado, ()=>{ x.activo = 0; save(); });
      onChange && onChange();
    });
  };
}

/* ---- Selectores (para el envío y para "Enviar al mensajero") ---- */
function openSelectorEntrega(tipo, onPick){
  const cfg = ENTREGAS_TIPOS[tipo];
  function lista(filtro){
    let items = entregasActivos(cfg.tabla).filter(x=>coincideBusqueda(x.nombre, filtro));
    if(normalizarTexto(filtro)){
      items.sort((a,b)=> rangoCoincidencia(a.nombre, filtro)-rangoCoincidencia(b.nombre, filtro) || a.nombre.localeCompare(b.nombre,'es'));
    }
    if(!items.length) return `<div class="empty-state"><div class="ei">🔍</div>${normalizarTexto(filtro) ? 'Sin resultados' : escapeHtml(cfg.vacio)}</div>`;
    return items.map(x=>entregaRowHtml(tipo, x).replace('class="list-item"', `class="list-item" data-pick="${x.id}"`)).join('');
  }
  openModal(`
    <div class="modal-title">Seleccionar ${cfg.singular}</div>
    <div class="search-wrap" style="margin-top:12px;">
      <span class="search-icon">🔍</span>
      <input type="text" id="sel-ent-search" placeholder="Buscar por nombre..." autocomplete="off">
    </div>
    <button class="btn btn-outline btn-block" id="sel-ent-nuevo" style="margin-bottom:10px;">➕ Nuevo ${cfg.singular}</button>
    <div id="sel-ent-list">${lista('')}</div>
  `);
  const listEl = document.getElementById('sel-ent-list');
  function enlazar(){
    listEl.querySelectorAll('[data-pick]').forEach(el=>{
      el.onclick = ()=>{
        const id = Number(el.dataset.pick);
        const item = tipo==='destinatarios' ? destinatarioPorId(id) : mensajeroPorId(id);
        closeModal();
        onPick(item);
      };
    });
  }
  document.getElementById('sel-ent-search').addEventListener('input', e=>{ listEl.innerHTML = lista(e.target.value); enlazar(); });
  document.getElementById('sel-ent-nuevo').onclick = ()=>{
    (tipo==='destinatarios' ? openDestinatarioFormModal : openMensajeroFormModal)(null, (nuevo)=>{
      // El formulario ya se cerró: cerrar también el selector y devolver el nuevo.
      closeModal();
      onPick(nuevo);
    });
  };
  enlazar();
  setTimeout(()=>document.getElementById('sel-ent-search')?.focus(), 150);
}

/* ---- Enviar la entrega al mensajero por WhatsApp ---- */
// Monto tal como en el ejemplo acordado: solo el número, sin divisa ni separador de miles.
function montoParaMensajero(n){ return String(round2(Number(n)||0)); }
function mensajeEntregaParaMensajero(destinatario, envio){
  const lineas = [`👤 ${destinatario.nombre_completo || destinatario.nombre}`];
  if(destinatario.telefono) lineas.push(`📱 ${destinatario.telefono}`);
  if(destinatario.direccion) lineas.push(`🧭 ${destinatario.direccion}`);
  lineas.push(`💰 ${montoParaMensajero(envio.cantidad_pagada)}`);
  return lineas.join('\n');
}
// Destinatario vigente del envío (null si no tiene o si fue eliminado).
function destinatarioActivoDeEnvio(envio){
  const d = envio ? destinatarioPorId(envio.destinatario_id) : null;
  return d && d.activo ? d : null;
}
function enviarEntregaAMensajero(envio, onNotificado){
  const destinatario = destinatarioActivoDeEnvio(envio);
  if(!destinatario){ alertDialog('Sin destinatario', 'Este envío no tiene un destinatario asociado.'); return; }
  openSelectorEntrega('mensajeros', (m)=>{
    if(!m) return;
    const numero = limpiarNumeroWhatsApp(m.telefono);
    if(!numero){
      alertDialog('Mensajero sin teléfono', 'Este mensajero no tiene teléfono configurado. Edítalo para poder notificarlo por WhatsApp.');
      return;
    }
    // Se guarda solo la ÚLTIMA notificación (se sobrescribe si se reenvía).
    envio.mensajero_notificado_id = m.id;
    envio.mensajero_notificado_nombre = m.nombre;
    envio.mensajero_notificado_fecha = Date.now();
    save();
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensajeEntregaParaMensajero(destinatario, envio))}`;
    if(window.AndroidBridge && window.AndroidBridge.openExternal) window.AndroidBridge.openExternal(url);
    else window.open(url, '_blank');
    toast(`🛵 Entrega enviada a ${m.nombre}`);
    onNotificado && onNotificado();
  });
}
function mensajeroNotificadoTexto(envio){
  if(!envio || !envio.mensajero_notificado_fecha) return '';
  const m = mensajeroPorId(envio.mensajero_notificado_id);
  const nombre = m ? m.nombre : (envio.mensajero_notificado_nombre || '(eliminado)');
  return `${nombre} (${fmtDate(envio.mensajero_notificado_fecha)})`;
}
// Nombre del destinatario para mostrar en el envío (historial incluido).
function destinatarioNombreDeEnvio(envio){
  if(!envio || envio.destinatario_id==null) return '';
  const d = destinatarioPorId(envio.destinatario_id);
  if(d) return d.nombre + (d.activo ? '' : ' (eliminado)');
  return (envio.destinatario_nombre || '') + ' (eliminado)';
}
