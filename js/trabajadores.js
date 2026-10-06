/* ---------------------------------------------------------------------- *
 * 11. MENÚ 3 — TRABAJADORES
 * ---------------------------------------------------------------------- */
function renderTrabajadoresList(content){
  content.innerHTML = `
    <h1 class="section-title">Trabajadores</h1>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="tr-search" placeholder="Buscar trabajador..." >
    </div>
    <div id="tr-list">${renderTrabajadorListInner('')}</div>
    <button class="fab" id="fab-add-tr" aria-label="Agregar trabajador">+</button>
  `;
  function refrescarLista(){
    const el = document.getElementById('tr-list');
    el.innerHTML = renderTrabajadorListInner(document.getElementById('tr-search').value);
    aplicarZebra(el);
    bindTrRows();
  }
  aplicarZebra(document.getElementById('tr-list'));
  const searchEl = document.getElementById('tr-search');
  searchEl.addEventListener('input', refrescarLista);
  activarSugerencias(searchEl, {
    obtenerCandidatos: ()=> DB.trabajadores.filter(t=>t.activo).map(t=>({nombre:t.nombre, sub:'Trabajador', avatar:'👷'})),
    onElegir: refrescarLista
  });
  document.getElementById('fab-add-tr').onclick = ()=>openTrabajadorFormModal(null, ()=>route());
  bindTrRows();

  function bindTrRows(){
    document.querySelectorAll('#tr-list .list-item').forEach(el=>{
      el.onclick = (e)=>{
        if(e.target.closest('.trash-btn')) return;
        location.hash = `#/trabajador-detalle/${el.dataset.id}`;
      };
    });
    document.querySelectorAll('#tr-list .trash-btn').forEach(el=>{
      el.onclick = (e)=>{
        e.stopPropagation();
        const t = DB.trabajadores.find(x=>x.id===Number(el.dataset.id));
        confirmDialog(`¿Eliminar al trabajador ${escapeHtml(t.nombre)}${t.telefono ? ' ('+escapeHtml(t.telefono)+')' : ''}?`, ()=>{
          eliminarConDeshacer('Trabajador eliminado', ()=>{ t.activo = 0; save(); });
          refrescarLista();
        });
      };
    });
  }
}
function renderTrabajadorListInner(searchTerm){
  searchTerm = searchTerm||'';
  const items = DB.trabajadores.filter(t=>t.activo)
    .filter(t=>coincideBusqueda(t.nombre, searchTerm))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  return items.length ? items.map(t=>`
    <div class="list-item" data-id="${t.id}">
      <div class="avatar">👷</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(t.nombre)}</div>
        <div class="li-sub">${escapeHtml(t.telefono || 'Sin teléfono')}</div>
      </div>
      <button class="trash-btn" data-id="${t.id}" aria-label="Eliminar">🗑️</button>
    </div>`).join('') : emptyState('👷','Aún no hay trabajadores registrados');
}

function openTrabajadorFormModal(id, onSaved){
  const editing = id ? DB.trabajadores.find(t=>t.id===id) : null;
  openModal(`
    <div class="modal-title">${editing?'Editar trabajador':'Agregar trabajador'}</div>
    <label class="field-label">Nombre *</label>
    <input type="text" id="tf-nombre" maxlength="100" value="${escapeHtml(editing?.nombre||'')}" placeholder="Nombre del trabajador">
    <label class="field-label">Teléfono</label>
    <input type="tel" id="tf-tel" maxlength="20" value="${escapeHtml(editing?.telefono||'')}" placeholder="Opcional">
    <div id="tf-error" style="color:var(--red-text);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="tf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="tf-save">Guardar</button>
    </div>
  `);
  document.getElementById('tf-cancel').onclick = closeModal;
  document.getElementById('tf-save').onclick = ()=>{
    const nombre = document.getElementById('tf-nombre').value.trim();
    if(!nombre){
      const err = document.getElementById('tf-error');
      err.textContent = 'El nombre del trabajador es obligatorio.'; err.style.display='block';
      return;
    }
    const telefono = document.getElementById('tf-tel').value.trim();
    let trabajador;
    if(editing){ editing.nombre = nombre; editing.telefono = telefono; trabajador = editing; }
    else { trabajador = {id:nextId('trabajadores'), nombre, telefono, fecha_registro:Date.now(), activo:1}; DB.trabajadores.push(trabajador); }
    save(); closeModal();
    toast(editing?'Trabajador actualizado':'Trabajador agregado');
    onSaved && onSaved(trabajador);
  };
}

function renderTrabajadorDetalle(content, id){
  const t = DB.trabajadores.find(x=>x.id===id);
  if(!t){ content.innerHTML = emptyState('❓','Trabajador no encontrado'); return; }
  content.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back-btn">← Volver</button>
    <div class="card" style="margin-top:10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="avatar" style="width:52px;height:52px;font-size:22px;">👷</div>
        <div>
          <div style="font-weight:800;font-size:18px;">${escapeHtml(t.nombre)}</div>
          <div class="subtle">${escapeHtml(t.telefono || 'Sin teléfono')}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="sumrow"><span class="k">Registrado</span><span class="v">${fmtDate(t.fecha_registro)}</span></div>
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn btn-outline btn-block" id="td-edit">Editar</button>
        <button class="btn btn-danger btn-block" id="td-del">Eliminar</button>
      </div>
    </div>
    ${resumenEnviosHtml(DB.envios.filter(e=>e.trabajador_id===id && (e.tipo==='trabajador' || e.tipo==='precio_especial')))}
    <button class="btn btn-gold btn-block" id="td-registrar" style="margin-top:16px;">📤 Registrar envío de este trabajador</button>

    <h3 style="margin:18px 0 10px;font-size:15px;color:var(--heading);">Últimos envíos</h3>
    <div id="td-envios">
      ${(()=>{
        const envios = DB.envios.filter(e=>e.tipo==='trabajador' && e.trabajador_id===id).sort((a,b)=>b.fecha_hora-a.fecha_hora).slice(0,10);
        return envios.length ? envios.map(e=>`
          <div class="list-item" data-eid="${e.id}">
            <div class="avatar">📤</div>
            <div class="li-main">
              <div class="li-title">${fmtDateShort(e.fecha_hora)} · ${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</div>
              <div class="li-sub">Ganancia: ${fmtMoney(envioGananciaMostrada(e))} ${escapeHtml(e.divisa_ganancia)}</div>
            </div>
          </div>`).join('') : emptyState('📤','Este trabajador aún no tiene envíos registrados');
      })()}
    </div>
  `;
  document.getElementById('back-btn').onclick = ()=> history.back();
  document.getElementById('td-edit').onclick = ()=>openTrabajadorFormModal(t.id, ()=>renderTrabajadorDetalle(content,id));
  document.getElementById('td-del').onclick = ()=>{
    confirmDialog(`¿Eliminar al trabajador ${escapeHtml(t.nombre)}${t.telefono ? ' ('+escapeHtml(t.telefono)+')' : ''}?`, ()=>{
      eliminarConDeshacer('Trabajador eliminado', ()=>{ t.activo=0; save(); });
      location.hash='#/trabajadores';
    });
  };
  document.getElementById('td-registrar').onclick = ()=> location.hash = `#/envio-trabajador/${id}`;
  content.querySelectorAll('#td-envios .list-item').forEach(el=>{
    el.onclick = ()=> location.hash = `#/envio-detalle/${el.dataset.eid}`;
  });
}

function renderEnvioTrabajadorForm(content, trabajadorId){
  const t = DB.trabajadores.find(x=>x.id===trabajadorId);
  if(!t){ content.innerHTML = emptyState('❓','Trabajador no encontrado'); return; }
  const prefill = tomarDuplicadoEnvio('trabajador');
  content.innerHTML = envioFormHtml({titulo:'Envío de trabajador', entityLabel:'Trabajador', entityName:t.nombre, showEntityPicker:false, prefill});
  wireEnvioForm(content, {
    tipo:'trabajador',
    getEntity: ()=>t,
    setEntity: ()=>{},
    entityRequired:false,
    prefill,
    onSaved: ()=>{ renderEnvioTrabajadorForm(content, trabajadorId); }
  });
}
