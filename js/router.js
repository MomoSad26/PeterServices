/* ---------------------------------------------------------------------- *
 * 8. ROUTER
 * ---------------------------------------------------------------------- */
const TITLES = {
  clientes:'Clientes', envio:'Nuevo envío', trabajadores:'Trabajadores',
  'precio-especial':'Precio especial', historial:'Historial de envíos',
  compras:'Compras', ventas:'Ventas', gastos:'Gastos', 'in-out':'In/Out',
  balance:'Balance', respaldos:'Respaldos', deudas:'Deudas', ajustes:'Ajustes'
};

function parseHash(){
  const h = location.hash.replace(/^#\//,'') || 'balance';
  const [view, ...rest] = h.split('/');
  return {view: view || 'clientes', param: rest.join('/')};
}

function setActiveMenu(view){
  document.querySelectorAll('.menu-list a').forEach(a=>{
    a.classList.toggle('active', a.dataset.view === view);
  });
  document.getElementById('topbar-title').textContent = TITLES[view] || 'Remesas';
}

/* ---- Preservar posición de scroll al navegar entre vistas (rutas) ---- */
const scrollMemory = {};
let currentRouteView = null;
function getScrollY(){ return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0; }
function saveCurrentScroll(){
  if(currentRouteView) scrollMemory[currentRouteView] = getScrollY();
}
function restoreScrollFor(view){
  if(scrollMemory[view] === undefined) return;
  const y = scrollMemory[view];
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ window.scrollTo(0, y); }); });
}

function route(){
  if(!DB) return; // aún cargando la base de datos (ver bootstrap())
  const {view, param} = parseHash();
  saveCurrentScroll();
  setActiveMenu(view);
  closeSideMenu();
  modalScrollStack.length = 0; // evita arrastrar posiciones de modales de la vista anterior
  currentRouteView = view;
  const content = document.getElementById('app-content');
  switch(view){
    case 'clientes': renderClientesList(content, param); break;
    case 'cliente-detalle': renderClienteDetalle(content, Number(param)); break;
    case 'envio': {
      // #/envio/cliente/123 → formulario con ese cliente ya seleccionado.
      const m = /^cliente\/(\d+)$/.exec(param||'');
      renderEnvioClienteForm(content, m ? Number(m[1]) : null);
      break;
    }
    case 'precio-especial': renderPrecioEspecialForm(content); break;
    case 'trabajadores': renderTrabajadoresList(content); break;
    case 'trabajador-detalle': renderTrabajadorDetalle(content, Number(param)); break;
    case 'envio-trabajador': renderEnvioTrabajadorForm(content, Number(param)); break;
    case 'historial': renderHistorial(content, param); break;
    case 'envio-detalle': renderEnvioDetalle(content, Number(param)); break;
    case 'ventas': renderVentasList(content); break;
    case 'compras': renderComprasList(content); break;
    case 'gastos': renderGastosList(content); break;
    case 'in-out': renderInOut(content); break;
    case 'balance': renderBalance(content); break;
    case 'respaldos': renderRespaldos(content); break;
    case 'deudas': renderDeudas(content); break;
    case 'ajustes': renderAjustes(content); break;
    default: renderClientesList(content);
  }
  duplicadoEnvioPendiente = null; // si la vista no lo usó, se descarta
  actualizarFabEnvio();
  restoreScrollFor(view);
}

/* ---- Botón flotante "Registrar envío" ----
   Visible en las pantallas de listados. Si la pantalla ya tiene su propio
   botón "+" (Clientes, Trabajadores, Deudas), se coloca encima de él. */
const VISTAS_CON_FAB_ENVIO = ['clientes','trabajadores','historial','compras','ventas','gastos','in-out','deudas'];
function actualizarFabEnvio(){
  const fab = document.getElementById('fab-envio');
  if(!fab) return;
  const visible = VISTAS_CON_FAB_ENVIO.includes(currentRouteView);
  fab.classList.toggle('visible', visible);
  fab.classList.toggle('stacked', visible && !!document.querySelector('#app-content .fab'));
}

function openSideMenu(){
  document.getElementById('side-menu').classList.add('open');
  document.getElementById('side-overlay').classList.add('open');
}
function closeSideMenu(){
  document.getElementById('side-menu').classList.remove('open');
  document.getElementById('side-overlay').classList.remove('open');
}

window.addEventListener('hashchange', route);

async function bootstrap(){
  try{
    DB = await loadDBAsync();
  }catch(e){
    console.error('Error inicializando la base de datos, se usa una base nueva en memoria', e);
    DB = defaultDB();
  }
  normalizarNombresDeudasAutomaticas();

  document.getElementById('btn-menu').addEventListener('click', openSideMenu);
  document.getElementById('fab-envio').addEventListener('click', ()=>{ location.hash = '#/envio'; });
  document.getElementById('side-overlay').addEventListener('click', closeSideMenu);
  document.querySelectorAll('.menu-list a').forEach(a=>{
    a.addEventListener('click', closeSideMenu);
  });
  if(!location.hash) location.hash = '#/balance';
  route();
  setTimeout(revisarRespaldoSemanal, 1500);
  setTimeout(revisarActualizacionApk, 3000);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible'){ revisarRespaldoSemanal(); revisarActualizacionApk(); }
  });
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(registrarAvisoDeActualizacion).catch(()=>{});
  }
}

/* Avisa al usuario cuando hay una versión nueva de la app lista, en vez de
   reemplazar los archivos en uso sin avisar (lo que podía dejar la pantalla
   a medio actualizar). El usuario decide cuándo recargar. */
function registrarAvisoDeActualizacion(reg){
  function avisar(worker){
    if(!worker) return;
    worker.addEventListener('statechange', ()=>{
      if(worker.state === 'installed' && navigator.serviceWorker.controller){
        mostrarBannerActualizacion(()=>{
          worker.postMessage({type:'SKIP_WAITING'});
        });
      }
    });
  }
  if(reg.waiting && navigator.serviceWorker.controller){
    mostrarBannerActualizacion(()=> reg.waiting.postMessage({type:'SKIP_WAITING'}));
  }
  reg.addEventListener('updatefound', ()=> avisar(reg.installing));
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(recargando) return;
    recargando = true;
    location.reload();
  });
}
/* ---- Aviso de versión nueva de la APK ----
   La APK no se actualiza sola: consulta (como mucho cada 6 horas y solo si
   hay internet) la última versión publicada en GitHub Releases y, si es más
   nueva que la instalada, ofrece descargarla. Instalarla encima conserva
   todos los datos. En el navegador no aplica: ahí avisa el service worker. */
const RELEASES_API = 'https://api.github.com/repos/MomoSad26/PeterServices/releases/latest';
const APK_DESCARGA = 'https://github.com/MomoSad26/PeterServices/releases/latest/download/Remesas.apk';
const REVISION_APK_KEY = 'remesas_revision_apk_v1'; // {revisado, versionDisponible}
const REVISION_APK_CADA_MS = 6*3600*1000;

function versionApkInstalada(){
  try{ return Number(window.AndroidBridge.getVersionCode()) || 0; }catch(e){ return 0; }
}
async function revisarActualizacionApk(){
  if(!(window.AndroidBridge && window.AndroidBridge.getVersionCode)) return;
  const instalada = versionApkInstalada();
  if(!instalada) return;
  let estado = {};
  try{ estado = JSON.parse(localStorage.getItem(REVISION_APK_KEY) || '{}') || {}; }catch(e){}
  if(navigator.onLine !== false && Date.now() - (estado.revisado||0) >= REVISION_APK_CADA_MS){
    try{
      const res = await fetch(RELEASES_API, {cache:'no-store', headers:{'Accept':'application/vnd.github+json'}});
      if(res.ok){
        const rel = await res.json();
        const m = /(\d+)\s*$/.exec(String(rel.tag_name||''));   // "v1.0.104" → 104 (= versionCode)
        estado = {revisado: Date.now(), versionDisponible: m ? Number(m[1]) : 0};
        try{ localStorage.setItem(REVISION_APK_KEY, JSON.stringify(estado)); }catch(e){}
      }
    }catch(e){ /* sin conexión: se vuelve a intentar más tarde */ }
  }
  if((estado.versionDisponible||0) > instalada) mostrarAvisoApkNueva(estado.versionDisponible);
}
function mostrarAvisoApkNueva(version){
  if(document.getElementById('apk-banner') || mostrarAvisoApkNueva._cerrado) return;
  const div = document.createElement('div');
  div.id = 'apk-banner';
  div.className = 'floating-banner';
  div.innerHTML = `<span style="flex:1;">🆕 Hay una versión nueva de la app (1.0.${version}).</span>
    <button class="btn btn-gold btn-sm" id="apk-banner-ok">Descargar</button>
    <button class="btn btn-sm" id="apk-banner-x" style="background:transparent;color:#fff;" aria-label="Cerrar">✕</button>`;
  document.body.appendChild(div);
  document.getElementById('apk-banner-x').onclick = ()=>{ mostrarAvisoApkNueva._cerrado = true; div.remove(); };
  document.getElementById('apk-banner-ok').onclick = ()=>{
    div.remove();
    try{ window.AndroidBridge.openExternal(APK_DESCARGA); }catch(e){ location.href = APK_DESCARGA; }
    alertDialog('Instalar la actualización', 'Cuando termine la descarga, ábrala e instálela encima de la actual. <strong>Sus datos se conservan.</strong>');
  };
}

function mostrarBannerActualizacion(onUpdate){
  if(document.getElementById('update-banner')) return;
  const div = document.createElement('div');
  div.id = 'update-banner';
  div.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:200;background:var(--toast-bg);color:#fff;padding:12px 14px;border-radius:12px;box-shadow:var(--shadow);display:flex;align-items:center;gap:10px;font-size:13.5px;';
  div.innerHTML = `<span style="flex:1;">🔄 Hay una nueva versión de la app lista.</span><button class="btn btn-gold btn-sm" id="update-banner-btn">Actualizar</button>`;
  document.body.appendChild(div);
  document.getElementById('update-banner-btn').onclick = ()=>{ div.remove(); onUpdate(); };
}

document.addEventListener('DOMContentLoaded', bootstrap);
