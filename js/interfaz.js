/* ---------------------------------------------------------------------- *
 * 5. MODALES / DIÁLOGOS GENÉRICOS
 * ---------------------------------------------------------------------- */
/* Pila de posiciones de scroll de la página de fondo, una por cada modal
   abierto. Así, sin tener que tocar cada pantalla individualmente, al cerrar
   cualquier modal (Balance, Historial por divisa, detalle de venta/compra/
   gasto/In-Out/deuda, etc.) se restaura exactamente donde estaba el usuario. */
const modalScrollStack = [];

function closeModal(){
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  if(modalScrollStack.length){
    const y = modalScrollStack.pop();
    requestAnimationFrame(()=>{ window.scrollTo(0, y); });
  }
}

function openModal(html, {center=false} = {}){
  modalScrollStack.push(getScrollY());
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop ${center?'center':''}" id="modal-backdrop">
      <div class="modal-sheet" id="modal-sheet">${html}</div>
    </div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e)=>{
    if(e.target.id === 'modal-backdrop') closeModal();
  });
}
// Permite cerrar cualquier modal con la tecla Escape (un solo listener para
// toda la app, no uno por cada modal que se abre).
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  const root = document.getElementById('modal-root');
  if(root && root.innerHTML.trim()) closeModal();
});

function confirmDialog(msg, onConfirm, opts={}){
  const okLabel = opts.okLabel || 'Eliminar';
  const cancelLabel = opts.cancelLabel || 'Cancelar';
  const danger = opts.danger !== false;
  openModal(`
    <div class="modal-msg" style="font-size:15px;color:var(--ink-main);font-weight:600;margin-bottom:0;">${msg}</div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cd-cancel">${cancelLabel}</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'} btn-block" id="cd-ok">${okLabel}</button>
    </div>
  `, {center:true});
  document.getElementById('cd-cancel').onclick = closeModal;
  document.getElementById('cd-ok').onclick = ()=>{ closeModal(); onConfirm(); };
}

function alertDialog(title, msg){
  openModal(`
    <div class="modal-title">${escapeHtml(title)}</div>
    <div class="modal-msg">${msg}</div>
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="ad-ok">Entendido</button></div>
  `, {center:true});
  document.getElementById('ad-ok').onclick = closeModal;
}

/* ---------------------------------------------------------------------- *
 * 6. SELECTOR CON BÚSQUEDA (clientes / trabajadores / cliente+trabajador)
 * ---------------------------------------------------------------------- */
function openEntityPicker(modo, onPick){
  const clientesActivos = DB.clientes.filter(c=>c.activo).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const trabajadoresActivos = DB.trabajadores.filter(t=>t.activo).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));

  function renderList(filter){
    const f = filter||'';
    let items = [];
    if(modo==='cliente' || modo==='combinado'){
      items = items.concat(clientesActivos.filter(c=>coincideBusqueda(c.nombre, f)).map(c=>({...c, __tipo:'cliente'})));
    }
    if(modo==='trabajador' || modo==='combinado'){
      items = items.concat(trabajadoresActivos.filter(t=>coincideBusqueda(t.nombre, f)).map(t=>({...t, __tipo:'trabajador'})));
    }
    // Esta lista ya funciona como las sugerencias del buscador (tocar un
    // resultado lo selecciona y cierra el selector); al escribir, se ponen
    // primero los nombres que EMPIEZAN por lo escrito.
    if(normalizarTexto(f)){
      items.sort((a,b)=> rangoCoincidencia(a.nombre, f)-rangoCoincidencia(b.nombre, f) || a.nombre.localeCompare(b.nombre,'es'));
    }
    if(items.length===0){
      return `<div class="empty-state"><div class="ei">🔍</div>Sin resultados</div>`;
    }
    return items.map(it => `
      <div class="list-item" data-pick-id="${it.id}" data-pick-tipo="${it.__tipo}">
        <div class="avatar">${it.__tipo==='trabajador'?'👷':initials(it.nombre)}</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(it.nombre)}</div>
          <div class="li-sub">${it.__tipo==='trabajador' ? 'Trabajador' : escapeHtml(it.pais||'')}</div>
        </div>
      </div>`).join('');
  }

  const title = modo==='trabajador' ? 'Seleccionar trabajador' : (modo==='combinado' ? 'Seleccionar cliente o trabajador' : 'Seleccionar cliente');

  openModal(`
    <div class="modal-title">${title}</div>
    <div class="search-wrap" style="margin-top:12px;">
      <span class="search-icon">🔍</span>
      <input type="text" id="picker-search" placeholder="Buscar por nombre..." autocomplete="off">
    </div>
    ${(modo==='cliente'||modo==='combinado') ? `<button class="btn btn-outline btn-block" id="picker-new-cliente" style="margin-bottom:10px;">➕ Nuevo cliente</button>` : ''}
    ${(modo==='trabajador'||modo==='combinado') ? `<button class="btn btn-outline btn-block" id="picker-new-trabajador" style="margin-bottom:10px;">➕ Nuevo trabajador</button>` : ''}
    <div id="picker-list">${renderList('')}</div>
  `);

  const listEl = document.getElementById('picker-list');
  document.getElementById('picker-search').addEventListener('input', (e)=>{
    listEl.innerHTML = renderList(e.target.value);
    bindPickHandlers();
  });
  function bindPickHandlers(){
    listEl.querySelectorAll('[data-pick-id]').forEach(el=>{
      el.onclick = ()=>{
        const id = Number(el.getAttribute('data-pick-id'));
        const tipo = el.getAttribute('data-pick-tipo');
        const item = tipo==='cliente' ? DB.clientes.find(c=>c.id===id) : DB.trabajadores.find(t=>t.id===id);
        closeModal();
        onPick(item, tipo);
      };
    });
  }
  bindPickHandlers();
  const newBtn = document.getElementById('picker-new-cliente');
  if(newBtn){
    newBtn.onclick = ()=>{
      openClienteFormModal(null, (cliente)=>{
        onPick(cliente, 'cliente');
      });
    };
  }
  const newBtnTr = document.getElementById('picker-new-trabajador');
  if(newBtnTr){
    newBtnTr.onclick = ()=>{
      openTrabajadorFormModal(null, (trabajador)=>{
        onPick(trabajador, 'trabajador');
      });
    };
  }
  setTimeout(()=>document.getElementById('picker-search')?.focus(), 150);
}

/* ---------------------------------------------------------------------- *
 * 6b. AUTOCOMPLETADO EN BUSCADORES DE LISTADOS
 *     Debajo del campo aparecen hasta 5 nombres que coinciden. Al tocar uno,
 *     el campo se completa con el nombre exacto y la lista se filtra.
 * ---------------------------------------------------------------------- */
function activarSugerencias(inputEl, {obtenerCandidatos, onElegir}){
  const wrap = inputEl.closest('.search-wrap') || inputEl.parentElement;
  let box = null;
  function cerrar(){ if(box){ box.remove(); box = null; } }
  function abrir(){
    const termino = inputEl.value;
    if(!normalizarTexto(termino)){ cerrar(); return; }
    const sugerencias = sugerirCoincidencias(obtenerCandidatos(), termino, 'nombre', 5);
    // Si lo escrito ya es exactamente el único resultado, no hace falta sugerir nada.
    if(sugerencias.length===1 && normalizarTexto(sugerencias[0].nombre)===normalizarTexto(termino)){ cerrar(); return; }
    if(!box){
      box = document.createElement('div');
      box.className = 'suggest-box';
      wrap.appendChild(box);
    }
    box.innerHTML = sugerencias.length ? sugerencias.map((it,i)=>`
      <div class="suggest-item" data-i="${i}">
        <div class="avatar">${it.avatar || initials(it.nombre)}</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(it.nombre)}</div>
          ${it.sub ? `<div class="li-sub">${escapeHtml(it.sub)}</div>` : ''}
        </div>
      </div>`).join('') : `<div class="suggest-empty">Sin resultados</div>`;
    box.querySelectorAll('.suggest-item').forEach(el=>{
      // pointerdown + preventDefault: se elige ANTES de que el campo pierda el foco.
      el.addEventListener('pointerdown', (ev)=>{
        ev.preventDefault();
        const it = sugerencias[Number(el.dataset.i)];
        cerrar();
        inputEl.value = it.nombre;
        onElegir(it);
      });
    });
  }
  inputEl.setAttribute('autocomplete', 'off');
  inputEl.addEventListener('input', abrir);
  inputEl.addEventListener('focus', abrir);
  inputEl.addEventListener('blur', ()=> setTimeout(cerrar, 150));
  inputEl.addEventListener('keydown', (e)=>{ if(e.key==='Escape' || e.key==='Enter') cerrar(); });
}

/* ---------------------------------------------------------------------- *
 * 7. SELECT CON OPCIÓN "AGREGAR..." (divisas / monedas / países)
 * ---------------------------------------------------------------------- */
function divisaOptionsHtml(selected){
  return DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0))
    .map(d=>`<option value="${escapeHtml(d.nombre)}" ${d.nombre===selected?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')
    + `<option value="__add__">➕ Agregar divisa...</option>`;
}
function monedaOptionsHtml(selected){
  return DB.monedas.map(m=>`<option value="${escapeHtml(m.nombre)}" ${m.nombre===selected?'selected':''}>${escapeHtml(m.nombre)}</option>`).join('')
    + `<option value="__add__">➕ Agregar moneda...</option>`;
}
function paisOptionsHtml(selected){
  return DB.paises.map(p=>`<option value="${escapeHtml(p.nombre)}" ${p.nombre===selected?'selected':''}>${escapeHtml(p.nombre)}</option>`).join('')
    + `<option value="__add__">➕ Agregar país...</option>`;
}

function bindAddOnSelect(selectEl, addFn, refreshOptionsFn){
  selectEl.addEventListener('change', ()=>{
    if(selectEl.value === '__add__'){
      promptText('Nuevo valor', (val)=>{
        if(!val){ selectEl.value = selectEl.dataset.prev || ''; return; }
        addFn(val);
        selectEl.innerHTML = refreshOptionsFn(val);
        selectEl.dataset.prev = val;
        selectEl.dispatchEvent(new Event('change-programmatic'));
      }, ()=>{ selectEl.value = selectEl.dataset.prev || ''; });
    } else {
      selectEl.dataset.prev = selectEl.value;
    }
  });
  selectEl.dataset.prev = selectEl.value;
}

function promptText(title, onOk, onCancel){
  openModal(`
    <div class="modal-title">${escapeHtml(title)}</div>
    <div class="field" style="margin-top:12px;">
      <input type="text" id="pt-input" placeholder="Escriba aquí...">
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="pt-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="pt-ok">Agregar</button>
    </div>
  `, {center:true});
  const input = document.getElementById('pt-input');
  setTimeout(()=>input.focus(), 150);
  document.getElementById('pt-cancel').onclick = ()=>{ closeModal(); onCancel && onCancel(); };
  document.getElementById('pt-ok').onclick = ()=>{
    const v = input.value.trim();
    closeModal();
    onOk(v);
  };
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ document.getElementById('pt-ok').click(); }});
}
