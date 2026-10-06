/* ---------------------------------------------------------------------- *
 * 9. MENÚ 1 — CLIENTES
 * ---------------------------------------------------------------------- */
function renderClientesList(content, searchTerm){
  searchTerm = searchTerm || '';
  const items = DB.clientes
    .filter(c=>c.activo)
    .filter(c=>coincideBusqueda(c.nombre, searchTerm))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));

  content.innerHTML = `
    <h1 class="section-title">Clientes</h1>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="cli-search" placeholder="Buscar cliente..." value="${escapeHtml(searchTerm)}">
    </div>
    <div id="cli-list" class="${zebraClase(items.length)}">${items.length ? items.map(clienteRowHtml).join('') : emptyState('👤','Aún no hay clientes registrados')}</div>
    <button class="fab" id="fab-add-cliente" aria-label="Agregar cliente">+</button>
  `;
  function refrescarLista(){
    const el = document.getElementById('cli-list');
    el.innerHTML = renderClienteListInner(document.getElementById('cli-search').value);
    aplicarZebra(el);
    bindClienteRowClicks();
  }
  const searchEl = document.getElementById('cli-search');
  searchEl.addEventListener('input', refrescarLista);
  activarSugerencias(searchEl, {
    obtenerCandidatos: ()=> DB.clientes.filter(c=>c.activo).map(c=>({nombre:c.nombre, sub:c.pais||''})),
    onElegir: refrescarLista
  });
  document.getElementById('fab-add-cliente').onclick = ()=>openClienteFormModal(null, ()=>route());
  bindClienteRowClicks();

  function bindClienteRowClicks(){
    document.querySelectorAll('#cli-list .list-item').forEach(el=>{
      el.onclick = (e)=>{
        if(e.target.closest('.trash-btn') || e.target.closest('.edit-btn')) return;
        location.hash = `#/cliente-detalle/${el.dataset.id}`;
      };
    });
    document.querySelectorAll('#cli-list .edit-btn').forEach(el=>{
      el.onclick = (e)=>{
        e.stopPropagation();
        openClienteFormModal(Number(el.dataset.id), refrescarLista);
      };
    });
    document.querySelectorAll('#cli-list .trash-btn').forEach(el=>{
      el.onclick = (e)=>{
        e.stopPropagation();
        const c = DB.clientes.find(x=>x.id===Number(el.dataset.id));
        confirmDialog(`¿Eliminar al cliente ${escapeHtml(c.nombre)} (${escapeHtml(c.pais)})?`, ()=>{
          eliminarConDeshacer('Cliente eliminado', ()=>{ c.activo = 0; save(); });
          refrescarLista();
        });
      };
    });
  }
}
function renderClienteListInner(searchTerm){
  searchTerm = searchTerm || '';
  const items = DB.clientes.filter(c=>c.activo)
    .filter(c=>coincideBusqueda(c.nombre, searchTerm))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  return items.length ? items.map(clienteRowHtml).join('') : emptyState('👤','Aún no hay clientes registrados');
}
function clienteRowHtml(c){
  return `
    <div class="list-item" data-id="${c.id}">
      <div class="avatar">${initials(c.nombre)}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(c.nombre)}</div>
        <div class="li-sub">${escapeHtml(c.telefono || 'Sin teléfono')}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${c.id}" aria-label="Editar">✏️</button>
      <button class="icon-action-btn trash-btn" data-id="${c.id}" aria-label="Eliminar">🗑️</button>
    </div>`;
}
function emptyState(icon, text){
  return `<div class="empty-state"><div class="ei">${icon}</div>${escapeHtml(text)}</div>`;
}

/* Filas alternadas (zebra): solo en listados de MÁS de 6 ítems. En listados
   paginados se pasa el total del resultado filtrado, no solo la página. */
function zebraClase(total){ return total > 6 ? 'list-zebra' : ''; }
function aplicarZebra(el, total){
  if(!el) return;
  if(total === undefined) total = el.querySelectorAll(':scope > .list-item, :scope > .hd-mov-item').length;
  el.classList.toggle('list-zebra', total > 6);
}

function openClienteFormModal(clienteId, onSaved){
  const editing = clienteId ? DB.clientes.find(c=>c.id===clienteId) : null;
  openModal(`
    <div class="modal-title">${editing?'Editar cliente':'Agregar cliente'}</div>
    <label class="field-label">Nombre *</label>
    <input type="text" id="cf-nombre" maxlength="100" value="${escapeHtml(editing?.nombre||'')}" placeholder="Nombre del cliente">
    <label class="field-label">País *</label>
    <select id="cf-pais" class="picker">${paisOptionsHtml(editing?.pais)}</select>
    <label class="field-label">Número de contacto</label>
    <input type="tel" id="cf-tel" maxlength="20" value="${escapeHtml(editing?.telefono||'')}" placeholder="Opcional">
    <label class="field-label">Notas</label>
    <textarea id="cf-notas" maxlength="500" placeholder="Opcional">${escapeHtml(editing?.notas||'')}</textarea>
    <div id="cf-error" style="color:var(--red-text);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="cf-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('cf-pais'), addPais, paisOptionsHtml);
  document.getElementById('cf-cancel').onclick = closeModal;
  document.getElementById('cf-save').onclick = ()=>{
    const nombre = document.getElementById('cf-nombre').value.trim();
    const pais = document.getElementById('cf-pais').value;
    const errEl = document.getElementById('cf-error');
    if(!nombre){ errEl.textContent = 'El nombre del cliente es obligatorio.'; errEl.style.display='block'; return; }
    if(!pais || pais==='__add__'){ errEl.textContent = 'El país es obligatorio.'; errEl.style.display='block'; return; }
    const telefono = document.getElementById('cf-tel').value.trim();
    const notas = document.getElementById('cf-notas').value.trim();
    const guardar = ()=>{
      let cliente;
      if(editing){
        editing.nombre = nombre; editing.pais = pais; editing.telefono = telefono; editing.notas = notas;
        cliente = editing;
      } else {
        cliente = {id:nextId('clientes'), nombre, pais, telefono, notas, fecha_registro:Date.now(), activo:1};
        DB.clientes.push(cliente);
      }
      save();
      closeModal();
      toast(editing? 'Cliente actualizado' : 'Cliente agregado');
      onSaved && onSaved(cliente);
    };
    const duplicado = !editing && DB.clientes.find(c=>c.activo && c.pais===pais && normalizarTexto(c.nombre)===normalizarTexto(nombre));
    if(duplicado){
      confirmDialog(`Ya existe un cliente llamado "${escapeHtml(duplicado.nombre)}" en ${escapeHtml(pais)}. ¿Deseas registrarlo de todas formas?`, guardar, {okLabel:'Registrar igual', cancelLabel:'Cancelar', danger:false});
      return;
    }
    guardar();
  };
}

/* ---- Resumen de totales (ficha de cliente / trabajador) ----
   Incluye los envíos archivados: archivar solo los oculta de los listados,
   siguen siendo parte de la historia del cliente. Como un cliente puede
   enviar en varias monedas y la ganancia puede ir a varias divisas, los
   montos se suman POR moneda/divisa (nunca se mezclan). */
function sumarPor(lista, campoClave, campoMonto){
  const out = {};
  lista.forEach(x=>{ const k = x[campoClave] || '—'; out[k] = round2((out[k]||0) + Number(x[campoMonto]||0)); });
  return out;
}
function montosPorDivisaHtml(obj){
  const claves = Object.keys(obj);
  return claves.length ? claves.map(k=>`${fmtMoney(obj[k])} ${escapeHtml(k)}`).join(' · ') : '—';
}
function resumenEnviosHtml(enviosTodos){
  const inicioMes = startOfMonth();
  const delMes = enviosTodos.filter(e=>e.fecha_hora >= inicioMes);
  const bloque = (titulo, lista)=>`
    <div style="font-weight:800;font-size:13px;color:var(--ink-soft-main);text-transform:uppercase;letter-spacing:.3px;margin-top:4px;">${titulo}</div>
    <div class="sumrow"><span class="k">Envíos</span><span class="v">${lista.length}</span></div>
    <div class="sumrow"><span class="k">Enviado</span><span class="v">${montosPorDivisaHtml(sumarPor(lista,'moneda','cantidad_enviada'))}</span></div>
    <div class="sumrow"><span class="k">Ganancia dejada</span><span class="v" style="color:var(--green-text);">${montosPorDivisaHtml(sumarPor(lista,'divisa_ganancia','ganancia'))}</span></div>`;
  return `
    <div class="card" style="margin-top:12px;">
      <div style="font-weight:800;margin-bottom:6px;">📈 Resumen</div>
      ${bloque('Este mes', delMes)}
      <div class="divider" style="margin:10px 0;"></div>
      ${bloque('Total histórico', enviosTodos)}
    </div>`;
}

function renderClienteDetalle(content, id){
  const c = DB.clientes.find(x=>x.id===id);
  if(!c){ content.innerHTML = emptyState('❓','Cliente no encontrado'); return; }
  const enviosTodos = DB.envios
    .filter(e => (e.tipo==='cliente_directo' || e.tipo==='precio_especial') && e.cliente_id===id)
    .sort((a,b)=>b.fecha_hora-a.fecha_hora);
  const envios = enviosTodos.slice(0,10);

  content.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back-btn">← Volver</button>
    <div class="card" style="margin-top:10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="avatar" style="width:52px;height:52px;font-size:19px;">${initials(c.nombre)}</div>
        <div>
          <div style="font-weight:800;font-size:18px;">${escapeHtml(c.nombre)}</div>
          <div class="subtle">${escapeHtml(c.pais)}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="sumrow"><span class="k">Contacto</span><span class="v">${escapeHtml(c.telefono || 'No especificado')}</span></div>
      <div class="sumrow"><span class="k">Notas</span><span class="v">${escapeHtml(c.notas || 'Sin notas')}</span></div>
      <div class="sumrow"><span class="k">Registrado</span><span class="v">${fmtDate(c.fecha_registro)}</span></div>
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn btn-outline btn-block" id="cd-edit">Editar</button>
        <button class="btn btn-danger btn-block" id="cd-del">Eliminar</button>
      </div>
    </div>
    ${resumenEnviosHtml(enviosTodos)}
    ${c.activo ? `<button class="btn btn-gold btn-block" id="cd-registrar" style="margin-top:16px;">📤 Registrar envío para este cliente</button>` : ''}

    <h3 style="margin:18px 0 10px;font-size:15px;color:var(--heading);">Últimos envíos</h3>
    <div id="cd-envios">
      ${envios.length ? envios.map(e=>`
        <div class="list-item" data-eid="${e.id}">
          <div class="avatar">${e.tipo==='precio_especial'?'⭐':'📤'}</div>
          <div class="li-main">
            <div class="li-title">${fmtDateShort(e.fecha_hora)} · ${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</div>
            <div class="li-sub">Ganancia: ${fmtMoney(envioGananciaMostrada(e))} ${escapeHtml(e.divisa_ganancia)}</div>
          </div>
        </div>`).join('') : emptyState('📤','Este cliente aún no ha realizado envíos')}
    </div>
  `;
  document.getElementById('back-btn').onclick = ()=> history.back();
  document.getElementById('cd-edit').onclick = ()=> openClienteFormModal(c.id, ()=>renderClienteDetalle(content, id));
  document.getElementById('cd-del').onclick = ()=>{
    confirmDialog(`¿Eliminar al cliente ${escapeHtml(c.nombre)} (${escapeHtml(c.pais)})?`, ()=>{
      eliminarConDeshacer('Cliente eliminado', ()=>{ c.activo = 0; save(); });
      location.hash = '#/clientes';
    });
  };
  const registrarBtn = document.getElementById('cd-registrar');
  if(registrarBtn) registrarBtn.onclick = ()=>{ location.hash = `#/envio/cliente/${c.id}`; };
  content.querySelectorAll('#cd-envios .list-item').forEach(el=>{
    el.onclick = ()=> location.hash = `#/envio-detalle/${el.dataset.eid}`;
  });
}
