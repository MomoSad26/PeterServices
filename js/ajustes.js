/* ---------------------------------------------------------------------- *
 * 17b. AJUSTES (siempre el último menú)
 *      Preferencias de ESTE dispositivo: no van en la base de datos ni en
 *      el respaldo. La lógica de aplicar el tema vive en prefs.js.
 * ---------------------------------------------------------------------- */
function renderAjustes(content){
  const prefs = leerPrefs();
  content.innerHTML = `
    <h1 class="section-title">Ajustes</h1>
    <div class="card">
      <div style="font-weight:800;margin-bottom:10px;">🎨 Apariencia</div>
      <div class="set-row">
        <div>
          <div class="set-label">Modo oscuro</div>
          <div class="subtle">Fondo oscuro, más cómodo de noche.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="aj-oscuro" ${prefs.modo_oscuro?'checked':''}>
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="divider" style="margin:12px 0;"></div>
      <div class="set-label">Color principal</div>
      <div class="swatches" id="aj-colores">
        ${Object.entries(PALETAS).map(([clave, p])=>`
          <button class="swatch ${prefs.color_principal===clave?'active':''}" data-color="${clave}" type="button" aria-label="${escapeHtml(p.nombre)}">
            <span class="swatch-dot" style="background:${p[800]};">${prefs.color_principal===clave?'✓':''}</span>
            ${escapeHtml(p.nombre)}
          </button>`).join('')}
      </div>
    </div>
    <div class="subtle" style="text-align:center;margin-top:10px;">Estas preferencias se guardan solo en este dispositivo y no se incluyen en el respaldo.</div>
  `;
  document.getElementById('aj-oscuro').addEventListener('change', (e)=>{
    const p = leerPrefs();
    p.modo_oscuro = e.target.checked;
    guardarPrefs(p);
    aplicarModoOscuro(p.modo_oscuro);
  });
  document.querySelectorAll('#aj-colores .swatch').forEach(btn=>{
    btn.onclick = ()=>{
      const p = leerPrefs();
      p.color_principal = btn.dataset.color;
      guardarPrefs(p);
      aplicarColorPrincipal(p.color_principal);
      renderAjustes(content);
    };
  });
}
