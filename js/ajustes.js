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
    <div class="card" style="margin-top:14px;">
      <div style="font-weight:800;margin-bottom:10px;">ℹ️ Acerca de la app</div>
      <div class="sumrow"><span class="k">Versión instalada</span><span class="v" id="aj-version">${versionApkInstalada() ? '1.0.'+versionApkInstalada() : 'Versión web'}</span></div>
      <button class="btn btn-outline btn-block" id="aj-actualizar" style="margin-top:12px;">🔄 Buscar actualizaciones</button>
    </div>
  `;
  document.getElementById('aj-actualizar').onclick = async ()=>{
    const btn = document.getElementById('aj-actualizar');
    btn.disabled = true;
    try{
      const r = await revisarActualizacionApk({forzar:true});
      if(r==='al_dia') toast('✅ Ya tienes la última versión');
      else if(r==='sin_conexion') toast('No se pudo comprobar. Revise su conexión a internet.');
      else if(r==='no_apk'){
        // Versión web/PWA: se le pide al navegador que busque archivos nuevos;
        // si los hay, aparece el aviso habitual "Hay una nueva versión".
        try{ const reg = await navigator.serviceWorker.getRegistration(); if(reg) await reg.update(); }catch(e){}
        toast('Comprobado. Si hay una versión nueva, aparecerá el aviso para actualizar.');
      }
    } finally {
      if(document.body.contains(btn)) btn.disabled = false;
    }
  };
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
