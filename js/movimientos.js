/* ---------------------------------------------------------------------- *
 * 14. LISTADOS PAGINADOS: VENTAS, COMPRAS, GASTOS, IN/OUT
 *     Los cuatro comparten la misma estructura: botón "Nuevo", lista
 *     paginada (10 por página, fecha descendente) y detalle en un modal.
 * ---------------------------------------------------------------------- */
function renderListadoPaginado(content, cfg){
  const estado = paginacion[cfg.clave];
  content.innerHTML = `
    <h1 class="section-title">${busquedaFiltrandoLista(cfg.clave)?'Resultados de búsqueda — '+cfg.titulo:cfg.titulo}</h1>
    ${busquedaFiltrandoLista(cfg.clave) ? `<div class="subtle" style="margin:-4px 0 12px;">Resultados para: <strong>${escapeHtml(busquedaFiltroLista.consulta)}</strong></div>` : ''}
    ${cfg.intro || ''}
    <button class="btn btn-gold btn-block" id="${cfg.prefijo}-nuevo">${cfg.textoNuevo}</button>
    <div style="height:14px;"></div>
    <div id="${cfg.prefijo}-list"></div>
    <div id="${cfg.prefijo}-pag"></div>
  `;
  const listEl = document.getElementById(`${cfg.prefijo}-list`);
  function refresh(){
    if(!document.body.contains(listEl)) return; // el usuario ya cambió de pantalla
    const items = DB[cfg.clave]
      .filter(r=>busquedaFiltrandoLista(cfg.clave) || !r.archivado)
      .filter(r=>busquedaFiltrarRegistroLista(cfg.clave,r))
      .sort(ordenFechaDesc);
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
  // Un envío duplicado es nuevo: todavía no se le avisó a ningún mensajero.
  delete c.mensajero_notificado_id; delete c.mensajero_notificado_nombre; delete c.mensajero_notificado_fecha;
  return c;
}

/* ---------------------------------------------------------------------- *
 * OPERACIONES — Compras y Ventas comparten la ruta, no los datos ni la lógica.
 * ---------------------------------------------------------------------- */
let operacionesTab = 'compra';
function renderOperaciones(content){
  content.innerHTML = `
    <div class="tabs" id="operaciones-tabs" role="tablist" aria-label="Operaciones">
      <div class="tab ${operacionesTab==='compra'?'active':''}" data-tab="compra" role="tab" aria-selected="${operacionesTab==='compra'}">🛒 Compra</div>
      <div class="tab ${operacionesTab==='ventas'?'active':''}" data-tab="ventas" role="tab" aria-selected="${operacionesTab==='ventas'}">🛍️ Ventas</div>
    </div>
    <div id="operaciones-contenido"></div>
  `;
  const title=document.getElementById('topbar-title');
  if(title) title.textContent=operacionesTab==='ventas'?'Ventas':'Compra';
  const inner=document.getElementById('operaciones-contenido');
  if(operacionesTab==='ventas') renderVentasList(inner);
  else renderComprasList(inner);
  document.querySelectorAll('#operaciones-tabs .tab').forEach(tab=>{
    tab.onclick=()=>{
      const siguiente=tab.dataset.tab==='ventas'?'ventas':'compra';
      if(siguiente===operacionesTab) return;
      operacionesTab=siguiente;
      renderOperaciones(content);
    };
  });
}

/* Ventas, Compras, Gastos e In/Out viven en js/ventas.js, js/compras.js,
   js/gastos.js y js/in-out.js (se cargan justo después de este archivo). */
