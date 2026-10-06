/* ---------------------------------------------------------------------- *
 * 12b. PAGINACIÓN DE LISTADOS (10 por página)
 *      El estado de cada listado vive aquí, fuera de la pantalla, para que
 *      la página se recuerde al entrar a un detalle y volver.
 * ---------------------------------------------------------------------- */
const TAM_PAGINA = 10;
const paginacion = {
  historial:        {actual:1, antesDeFiltros:1, habiaFiltros:false},
  ventas:           {actual:1},
  compras:          {actual:1},
  gastos:           {actual:1},
  in_out:           {actual:1},
  deudas_historial: {actual:1},
};

// Orden determinista: por fecha descendente y, a igual fecha, por id
// descendente (así un ítem nunca "salta" de una página a otra).
function ordenFechaDesc(a, b){ return (b.fecha_hora||0)-(a.fecha_hora||0) || (b.id||0)-(a.id||0); }

function paginarArray(lista, estado, tam=TAM_PAGINA){
  const totalPaginas = Math.max(1, Math.ceil(lista.length/tam));
  // Si la página actual dejó de existir (se borró o archivó el último
  // registro de la última página), se pasa a la última disponible.
  if(estado.actual > totalPaginas) estado.actual = totalPaginas;
  if(!(estado.actual >= 1)) estado.actual = 1;
  const ini = (estado.actual-1)*tam;
  return {
    items: lista.slice(ini, ini+tam), totalPaginas, total: lista.length,
    desde: lista.length ? ini+1 : 0, hasta: Math.min(ini+tam, lista.length)
  };
}

// Páginas a mostrar: todas si son ≤ 7; si no, la primera, la última y una
// alrededor de la actual (… solo cuando se salta más de una página).
function paginasVisibles(actual, total){
  if(total <= 7) return Array.from({length:total}, (_,i)=>i+1);
  const set = new Set([1, total, actual-1, actual, actual+1]);
  const nums = [...set].filter(n=>n>=1 && n<=total).sort((a,b)=>a-b);
  const out = [];
  nums.forEach((n,i)=>{
    if(i>0){
      const gap = n - nums[i-1];
      if(gap === 2) out.push(n-1);      // falta una sola: se muestra el número
      else if(gap > 2) out.push('…');
    }
    out.push(n);
  });
  return out;
}

function scrollAlInicioDeLista(listEl){
  if(!listEl) return;
  const topbar = document.querySelector('.topbar');
  const offset = (topbar ? topbar.getBoundingClientRect().height : 56) + 8;
  const y = listEl.getBoundingClientRect().top + getScrollY() - offset;
  window.scrollTo(0, Math.max(0, y));
}

function renderControlPaginacion(contenedor, estado, pag, onCambio, listEl){
  if(!contenedor) return;
  if(pag.total <= TAM_PAGINA){ contenedor.innerHTML = ''; return; }
  const {totalPaginas} = pag;
  const actual = estado.actual;
  const permiteSalto = totalPaginas > 7;
  contenedor.innerHTML = `
    <div class="pag-wrap">
      <div class="subtle pag-info">Mostrando ${pag.desde}–${pag.hasta} de ${pag.total}</div>
      <div class="pag">
        <button class="pag-btn" data-go="${actual-1}" ${actual<=1?'disabled':''} aria-label="Página anterior">‹</button>
        ${paginasVisibles(actual, totalPaginas).map(n=> n==='…'
          ? `<span class="pag-dots">…</span>`
          : `<button class="pag-btn ${n===actual?'active':''}" data-go="${n}" ${n===actual && permiteSalto ? 'data-salto="1" title="Toque para ir a una página"' : ''}>${n}</button>`
        ).join('')}
        <button class="pag-btn" data-go="${actual+1}" ${actual>=totalPaginas?'disabled':''} aria-label="Página siguiente">›</button>
      </div>
    </div>`;
  function irA(n){
    if(n===estado.actual || n<1 || n>totalPaginas) return; // doble toque o fuera de rango: se ignora
    estado.actual = n;
    onCambio();
    scrollAlInicioDeLista(listEl);
  }
  contenedor.querySelectorAll('.pag-btn').forEach(btn=>{
    btn.onclick = ()=>{
      if(btn.disabled) return;
      const n = Number(btn.dataset.go);
      if(btn.dataset.salto){ abrirSalto(btn); return; }
      irA(n);
    };
  });
  // Tocar el número de la página actual abre un campo para saltar a otra.
  function abrirSalto(btn){
    const input = document.createElement('input');
    input.type = 'number'; input.inputMode = 'numeric';
    input.className = 'pag-input'; input.min = 1; input.max = totalPaginas;
    input.value = actual;
    btn.replaceWith(input);
    input.focus(); input.select();
    let terminado = false;
    function cerrarSinCambios(){
      if(terminado) return;
      terminado = true;
      onCambio(); // vuelve a pintar el control con el número normal
    }
    input.addEventListener('keydown', (e)=>{
      if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); cerrarSinCambios(); return; }
      if(e.key!=='Enter') return;
      e.preventDefault();
      const n = Number(input.value);
      if(!Number.isInteger(n) || n<1 || n>totalPaginas){
        toast(`Página no válida. Escriba un número del 1 al ${totalPaginas}.`);
        input.select();
        return;
      }
      terminado = true;
      if(n===estado.actual){ onCambio(); return; }
      irA(n);
    });
    // Tocar cualquier otro control cierra el campo sin aplicar cambios.
    input.addEventListener('blur', ()=> setTimeout(cerrarSinCambios, 0));
  }
}

/* Reglas de página al filtrar: al pasar de "sin filtros" a "con filtros" se
   recuerda la página en la que estaba el usuario; mientras haya filtros,
   cada cambio vuelve a la página 1; al quitar TODOS los filtros, se vuelve a
   la página recordada. */
function sincronizarPaginaConFiltros(estado, filtrosActivos, huboCambio){
  if(filtrosActivos){
    if(!estado.habiaFiltros){ estado.antesDeFiltros = estado.actual; estado.actual = 1; }
    else if(huboCambio) estado.actual = 1;
  } else if(estado.habiaFiltros){
    estado.actual = estado.antesDeFiltros || 1;
  }
  estado.habiaFiltros = filtrosActivos;
}
