/* =========================================================================
   REMESAS — App de control de envíos, ventas, gastos y balance
   Almacenamiento 100% local (IndexedDB, con respaldo en localStorage
   y migración automática de datos antiguos). Sin conexión a internet.
   ========================================================================= */

/* ---------------------------------------------------------------------- *
 * 1. BASE DE DATOS LOCAL
 * ---------------------------------------------------------------------- */
const DB_KEY = 'remesas_db_v1';
const IDB_DB_NAME = 'remesas_app_db';
const IDB_STORE_NAME = 'kv';
let dbBackend = 'indexeddb'; // 'indexeddb' | 'localstorage' (respaldo si IndexedDB no está disponible)

function defaultDB(){
  const now = Date.now();
  return {
    divisas: [
      {id:1, nombre:'Zelle', simbolo:'$', orden:1, saldo:0},
      {id:2, nombre:'USD', simbolo:'$', orden:2, saldo:0},
      {id:3, nombre:'CUP efectivo', simbolo:'$', orden:3, saldo:0},
      {id:4, nombre:'CUP transferencia', simbolo:'$', orden:4, saldo:0},
      {id:5, nombre:'USDT', simbolo:'$', orden:5, saldo:0},
      {id:6, nombre:'MXN 🇲🇽', simbolo:'$', orden:6, saldo:0},
      {id:7, nombre:'BRL 🇧🇷', simbolo:'R$', orden:7, saldo:0},
      {id:8, nombre:'UYU 🇺🇾', simbolo:'$', orden:8, saldo:0},
    ],
    clientes: [],
    trabajadores: [],
    envios: [],
    ventas: [],
    compras: [],
    gastos: [],
    in_out: [],
    deudas: [],
    paises: [
      {id:1, nombre:'Estados Unidos', es_predefinido:1},
      {id:2, nombre:'México', es_predefinido:1},
      {id:3, nombre:'Brasil', es_predefinido:1},
      {id:4, nombre:'Uruguay', es_predefinido:1},
      {id:5, nombre:'Europa', es_predefinido:1},
    ],
    monedas: [
      {id:1, nombre:'USD'}, {id:2, nombre:'MXN'}, {id:3, nombre:'EUR'},
      {id:4, nombre:'BRL'}, {id:5, nombre:'UYU'},
    ],
    seq: {divisas:9, clientes:1, trabajadores:1, envios:1, ventas:1, compras:1, gastos:1, in_out:1, paises:6, monedas:6, deudas:1},
    meta: {creado: now, nombre_negocio: 'Mi negocio de remesas'}
  };
}

let DB = null; // se inicializa de forma asíncrona en bootstrap() antes de la primera ruta

function normalizarNombresDeudasAutomaticas(){
  let changed = false;
  DB.deudas.forEach(d=>{
    if(d.origen==='venta'){
      const v = DB.ventas.find(x=>x.id===d.origen_id);
      if(v){
        const persona = `Venta de ${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida}`;
        if(d.persona!==persona){ d.persona = persona; changed = true; }
      }
    } else if(d.origen==='envio'){
      const e = DB.envios.find(x=>x.id===d.origen_id);
      if(e){
        const persona = `${entityNameForEnvio(e)} – ${fmtMoney(e.cantidad_enviada)} ${e.moneda}`;
        if(d.persona!==persona){ d.persona = persona; changed = true; }
      }
    }
  });
  if(changed) save();
}

function mergeConDefaults(parsed){
  const base = defaultDB();
  for(const k of Object.keys(base)){ if(!(k in parsed)) parsed[k] = base[k]; }
  parsed.seq = Object.assign({}, base.seq, parsed.seq);
  parsed.meta = Object.assign({}, base.meta, parsed.meta);
  return parsed;
}

/* ---- Acceso de bajo nivel a IndexedDB (un solo registro con toda la BD) ---- */
function idbOpen(){
  return new Promise((resolve, reject)=>{
    if(!window.indexedDB){ reject(new Error('IndexedDB no disponible')); return; }
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(IDB_STORE_NAME); };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
function idbGet(key){
  return idbOpen().then(db => new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const req = tx.objectStore(IDB_STORE_NAME).get(key);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  }));
}
function idbSet(key, value){
  return idbOpen().then(db => new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).put(value, key);
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
  }));
}

/* ---- Respaldo síncrono en localStorage (solo si IndexedDB no está disponible) ---- */
function loadDBDesdeLocalStorageSync(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw){ const d = defaultDB(); localStorage.setItem(DB_KEY, JSON.stringify(d)); return d; }
    return mergeConDefaults(JSON.parse(raw));
  }catch(e){
    console.error('Error cargando datos locales, se inicia base nueva', e);
    const d = defaultDB();
    try{ localStorage.setItem(DB_KEY, JSON.stringify(d)); }catch(e2){}
    return d;
  }
}

/* ---- Carga inicial: IndexedDB, con migración automática desde localStorage ---- */
async function loadDBAsync(){
  try{
    const stored = await idbGet(DB_KEY);
    if(stored) return mergeConDefaults(stored);

    // No hay datos aún en IndexedDB: si existe un respaldo antiguo en
    // localStorage (versiones previas de la app), se migra una sola vez.
    let migrado = null;
    try{
      const raw = localStorage.getItem(DB_KEY);
      if(raw) migrado = mergeConDefaults(JSON.parse(raw));
    }catch(e){ /* respaldo antiguo corrupto: se ignora */ }

    const data = migrado || defaultDB();
    await idbSet(DB_KEY, data);
    if(migrado){
      try{ localStorage.removeItem(DB_KEY); }catch(e){}
    }
    return data;
  }catch(e){
    console.error('IndexedDB no disponible, usando localStorage como respaldo', e);
    dbBackend = 'localstorage';
    return loadDBDesdeLocalStorageSync();
  }
}

let escriturasPendientes = 0;
function actualizarIndicadorGuardado(){
  let el = document.getElementById('save-indicator');
  if(escriturasPendientes > 0){
    if(!el){
      el = document.createElement('div');
      el.id = 'save-indicator';
      el.style.cssText = 'position:fixed;top:calc(8px + env(safe-area-inset-top,0px));right:10px;z-index:150;background:rgba(15,61,62,.9);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;pointer-events:none;';
      el.textContent = '💾 Guardando…';
      document.body.appendChild(el);
    }
  } else if(el){
    el.remove();
  }
}
// Si el usuario cierra o navega fuera justo cuando aún hay una escritura en
// curso hacia IndexedDB (persist() es asíncrono), se le avisa para evitar
// perder ese último cambio.
window.addEventListener('beforeunload', (e)=>{
  if(escriturasPendientes > 0){
    e.preventDefault();
    e.returnValue = '';
  }
});

function persist(dbObj){
  const data = dbObj || DB;
  if(dbBackend === 'indexeddb'){
    escriturasPendientes++;
    const avisoLento = setTimeout(actualizarIndicadorGuardado, 150); // evita parpadeo en guardados rápidos (lo normal)
    idbSet(DB_KEY, data).catch(e=>{
      console.error('Error guardando en IndexedDB, se usa localStorage como respaldo', e);
      dbBackend = 'localstorage';
      try{ localStorage.setItem(DB_KEY, JSON.stringify(data)); }catch(e2){ console.error('Error guardando datos', e2); }
    }).finally(()=>{
      clearTimeout(avisoLento);
      escriturasPendientes = Math.max(0, escriturasPendientes-1);
      actualizarIndicadorGuardado();
    });
  } else {
    try{ localStorage.setItem(DB_KEY, JSON.stringify(data)); }catch(e){ console.error('Error guardando datos', e); }
  }
}
// Cuenta cada cambio guardado. Sirve para "Deshacer": solo se puede deshacer
// una eliminación si no hubo NINGÚN otro cambio después de ella.
let contadorCambios = 0;
function save(){ contadorCambios++; persist(DB); }

function tamanioBaseDatosBytes(){
  try{ return new Blob([JSON.stringify(DB)]).size; }catch(e){ return 0; }
}
function fmtBytes(bytes){
  if(!bytes) return '0 KB';
  const kb = bytes/1024;
  if(kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb/1024).toFixed(2)} MB`;
}

function nextId(tabla){
  let id = DB.seq[tabla] || 1;
  // Autocorrección: si por una importación o un dato corrupto el contador
  // quedó desactualizado, nunca se reutiliza un id que ya exista en la tabla.
  const arr = DB[tabla];
  if(Array.isArray(arr)){
    for(const r of arr){
      if(r && typeof r.id==='number' && r.id>=id) id = r.id+1;
    }
  }
  DB.seq[tabla] = id + 1;
  return id;
}

function numFinito(v, fallback=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ---------------------------------------------------------------------- *
 * 2. UTILIDADES
 * ---------------------------------------------------------------------- */
function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }

function fmtMoney(n){
  const v = round2(n||0);
  const neg = v < 0;
  const abs = Math.abs(v);
  const centavos = Math.round(abs * 100) % 100;
  let decimals;
  if (centavos === 0) decimals = 0;
  else if (centavos % 10 === 0) decimals = 1;
  else decimals = 2;
  const formatted = abs.toLocaleString('en-US', {minimumFractionDigits:decimals, maximumFractionDigits:decimals});
  return (neg?'-':'') + formatted;
}

function fmtDate(ts){
  if(!ts) return '';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
function fmtDateShort(ts){
  if(!ts) return '';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${String(d.getFullYear()).slice(2)}`;
}
// Para el value="" de <input type="date">. OJO: nunca usar
// toISOString().slice(0,10) para esto — toISOString() convierte a UTC
// primero, así que en zonas horarias negativas (ej. Cuba/Miami, UTC-4/UTC-5)
// durante las últimas horas del día muestra el día SIGUIENTE por error.
// Esto arma la fecha a partir de los componentes LOCALES.
function fechaLocalISO(fechaOrTs){
  const d = fechaOrTs===undefined ? new Date() : (fechaOrTs instanceof Date ? fechaOrTs : new Date(fechaOrTs));
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* Normaliza texto para búsquedas "a prueba de balas": ignora mayúsculas/
   minúsculas, tildes y otros diacríticos, y espacios de más (al inicio, al
   final o repetidos en medio). Se usa en TODOS los buscadores de la app
   (clientes, trabajadores, selector de envío, historial de envíos) para que
   "Ruben", "ruben ", " RUBÉN" o "rub" encuentren siempre a "Rubén". */
function normalizarTexto(str){
  return String(str||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
function coincideBusqueda(texto, termino){
  if(!termino) return true;
  return normalizarTexto(texto).includes(normalizarTexto(termino));
}
// 0 = el nombre (o una de sus palabras) EMPIEZA por el término, 1 = lo
// contiene en medio, -1 = no coincide. "car" → Carlos (0) antes que Óscar (1).
function rangoCoincidencia(texto, termino){
  const t = normalizarTexto(texto), q = normalizarTexto(termino);
  if(!q) return 0;
  if(t.startsWith(q)) return 0;
  if(t.split(' ').some(p=>p.startsWith(q))) return 0.5;
  return t.includes(q) ? 1 : -1;
}
// Devuelve los primeros `limite` items que coinciden, priorizando los que
// empiezan por el término; a igual prioridad, orden alfabético.
function sugerirCoincidencias(lista, termino, campoNombre='nombre', limite=5){
  if(!normalizarTexto(termino)) return [];
  return lista
    .map(it=>({it, r:rangoCoincidencia(it[campoNombre], termino)}))
    .filter(x=>x.r>=0)
    .sort((a,b)=> a.r-b.r || String(a.it[campoNombre]).localeCompare(String(b.it[campoNombre]),'es'))
    .slice(0, limite)
    .map(x=>x.it);
}

function initials(name){
  if(!name) return '?';
  const clean = name.replace(/[^\p{L}\p{N} ]/gu,'').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if(parts.length===0) return name.slice(0,1).toUpperCase();
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}

function toast(msg){
  const el = document.getElementById('toast');
  cancelarDeshacerPendiente();
  el.classList.remove('toast-action');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove('show'), 2200);
}

/* ---- Deshacer eliminación ----
   Antes de eliminar se guarda una copia completa de la base de datos. Si el
   usuario toca "Deshacer" a tiempo, se vuelve a esa copia: así se restauran
   EXACTAMENTE el registro, los saldos de todas las divisas y la deuda
   asociada (si la había), sin tener que repetir la lógica de balance de
   cada tipo de registro. Solo se puede deshacer la última eliminación. */
const DESHACER_MS = 5000;
let deshacerPendiente = null; // {snapshot, cambiosTrasEliminar, timer}

function cancelarDeshacerPendiente(){
  if(!deshacerPendiente) return;
  clearTimeout(deshacerPendiente.timer);
  deshacerPendiente = null;
}

function mostrarToastDeshacer(mensaje, onDeshacer){
  const el = document.getElementById('toast');
  cancelarDeshacerPendiente();
  clearTimeout(toast._t);
  el.classList.add('toast-action');
  el.innerHTML = `<span>🗑️ ${escapeHtml(mensaje)}</span><button class="toast-undo-btn" type="button">Deshacer</button>`;
  el.classList.add('show');
  const estado = {timer:null};
  deshacerPendiente = estado;
  el.querySelector('.toast-undo-btn').onclick = ()=>{
    if(deshacerPendiente !== estado) return;
    cancelarDeshacerPendiente();
    el.classList.remove('show');
    onDeshacer();
  };
  estado.timer = setTimeout(()=>{
    if(deshacerPendiente !== estado) return;
    deshacerPendiente = null;
    el.classList.remove('show');
  }, DESHACER_MS);
}

/* Ejecuta una eliminación (que debe incluir su propio save()) y ofrece
   deshacerla durante unos segundos. */
function eliminarConDeshacer(mensaje, eliminar){
  const snapshot = JSON.parse(JSON.stringify(DB));
  eliminar();
  const cambiosTrasEliminar = contadorCambios;
  mostrarToastDeshacer(mensaje, ()=>{
    if(contadorCambios !== cambiosTrasEliminar){
      toast('No se puede deshacer: hubo otros cambios después de eliminar.');
      return;
    }
    DB = snapshot;
    save();
    route();
    toast('Eliminación deshecha');
  });
}

function todayRangeStart(){
  const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
}
function startOfWeek(){
  const d = new Date(); const day = (d.getDay()+6)%7;
  d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d.getTime();
}
function startOfMonth(){
  const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime();
}
function startOfYear(){
  const d = new Date(); d.setMonth(0,1); d.setHours(0,0,0,0); return d.getTime();
}

/* ---------------------------------------------------------------------- *
 * 3. AJUSTE DE BALANCES
 * ---------------------------------------------------------------------- */
function findDivisa(nombre){
  return DB.divisas.find(d => d.nombre === nombre);
}
function adjustBalance(divisaNombre, delta){
  if(!divisaNombre || !delta) return;
  const d = findDivisa(divisaNombre);
  if(!d){
    console.warn(`adjustBalance: la divisa "${divisaNombre}" no existe — el balance no se pudo actualizar.`);
    return;
  }
  d.saldo = round2(d.saldo + delta);
}

// Cuenta SOLO los registros ACTIVOS (no archivados) que mencionan la divisa.
// Estos son los que bloquean el borrado.
function contarRegistrosActivosDeDivisa(nombre){
  let n = 0;
  n += DB.envios.filter(e=>!e.archivado && (e.divisa_entrega===nombre || e.divisa_ganancia===nombre)).length;
  n += DB.ventas.filter(v=>!v.archivado && (v.divisa_vendida===nombre || v.divisa_recibida===nombre)).length;
  n += DB.compras.filter(c=>!c.archivado && (c.divisa_comprada===nombre || c.divisa_pagada===nombre)).length;
  n += DB.gastos.filter(g=>!g.archivado && g.divisa===nombre).length;
  n += DB.in_out.filter(io=>!io.archivado && io.divisa===nombre).length;
  // Las deudas no tienen campo "archivado": su equivalente de "activo" es
  // estado 'pendiente' (una deuda ya pagada/cobrada es, en espíritu, historial).
  n += DB.deudas.filter(d=>d.estado==='pendiente' && d.divisa===nombre).length;
  return n;
}
// Cuenta los registros ARCHIVADOS que mencionan la divisa. Estos NO
// bloquean el borrado: se eliminan junto con la divisa si el usuario confirma.
function contarRegistrosArchivadosDeDivisa(nombre){
  let n = 0;
  n += DB.envios.filter(e=>e.archivado && (e.divisa_entrega===nombre || e.divisa_ganancia===nombre)).length;
  n += DB.ventas.filter(v=>v.archivado && (v.divisa_vendida===nombre || v.divisa_recibida===nombre)).length;
  n += DB.compras.filter(c=>c.archivado && (c.divisa_comprada===nombre || c.divisa_pagada===nombre)).length;
  n += DB.gastos.filter(g=>g.archivado && g.divisa===nombre).length;
  n += DB.in_out.filter(io=>io.archivado && io.divisa===nombre).length;
  // Para deudas, el equivalente de "archivado" es estado 'pagado' o 'cobrado'.
  n += DB.deudas.filter(d=>(d.estado==='pagado'||d.estado==='cobrado') && d.divisa===nombre).length;
  return n;
}
// Elimina la divisa y, en la misma operación, todos los registros ARCHIVADOS
// (o su equivalente: deudas ya pagadas/cobradas) que la mencionan. NUNCA
// llama a adjustBalance: el saldo de ninguna otra divisa se toca. Un solo
// save() al final.
function eliminarDivisaYArchivadosAsociados(nombre){
  DB.envios = DB.envios.filter(e=>!(e.archivado && (e.divisa_entrega===nombre || e.divisa_ganancia===nombre)));
  DB.ventas = DB.ventas.filter(v=>!(v.archivado && (v.divisa_vendida===nombre || v.divisa_recibida===nombre)));
  DB.compras = DB.compras.filter(c=>!(c.archivado && (c.divisa_comprada===nombre || c.divisa_pagada===nombre)));
  DB.gastos = DB.gastos.filter(g=>!(g.archivado && g.divisa===nombre));
  DB.in_out = DB.in_out.filter(io=>!(io.archivado && io.divisa===nombre));
  DB.deudas = DB.deudas.filter(d=>!((d.estado==='pagado'||d.estado==='cobrado') && d.divisa===nombre));
  DB.divisas = DB.divisas.filter(x=>x.nombre!==nombre);
  save();
}

function envioDescuentaAhora(e){
  return e.descuenta_ahora === undefined ? true : !!e.descuenta_ahora;
}

function normalizarNombreDivisaParaComparar(nombre){
  return String(nombre||'').trim().toLowerCase().replace(/\s+/g,' ');
}
function mismasDivisas(a,b){
  return Boolean(a) && Boolean(b) && normalizarNombreDivisaParaComparar(a)===normalizarNombreDivisaParaComparar(b);
}
function envioGananciaInmediata(e){
  return Number(e?.ganancia||0) !== 0;
}

function applyEnvioBalance(envio, sign, deuda=null){
  const entrega = Number(envio.cantidad_pagada||0);
  const ganancia = Number(envio.ganancia||0);
  const mismaDivisa = mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);

  // =====================================================
  // CASO 1: SWITCH ON (descuento inmediato)
  // =====================================================
  if(envioDescuentaAhora(envio)){
    // Restar la entrega
    adjustBalance(envio.divisa_entrega, -1 * sign * entrega);
    // Sumar la ganancia (o el total si misma divisa)
    if(mismaDivisa){
      adjustBalance(envio.divisa_ganancia, 1 * sign * (entrega + ganancia));
    } else {
      adjustBalance(envio.divisa_ganancia, 1 * sign * ganancia);
    }
    return;
  }

  // =====================================================
  // CASO 2: SWITCH OFF (va a "Pagar a:")
  // =====================================================
  // La ganancia se reconoce por completo AHORA, al registrar el envío.
  // La entrega queda pendiente en Deudas -> Pagar a, y su pago NO debe
  // volver a tocar el balance (eso se maneja aparte, en el momento de
  // marcar la deuda como pagada — ver el bloque "dd-cerrar").
  adjustBalance(envio.divisa_ganancia, 1 * sign * ganancia);
}

function envioGananciaMostrada(e){
  return round2(Number(e?.ganancia || 0));
}
function applyVentaBalance(venta, sign){
  adjustBalance(venta.divisa_vendida, -1 * sign * (venta.cantidad_vendida||0));
  adjustBalance(venta.divisa_recibida, 1 * sign * (venta.cantidad_recibida||0));
}
function applyGastoBalance(gasto, sign){
  adjustBalance(gasto.divisa, -1 * sign * (gasto.cantidad||0));
}

/* ---------------------------------------------------------------------- *
 * 4. AGREGAR ENTIDADES AUXILIARES (divisas, monedas, países)
 * ---------------------------------------------------------------------- */
function addDivisa(nombre){
  nombre = (nombre||'').trim();
  if(!nombre) return null;
  let d = DB.divisas.find(x=>x.nombre.toLowerCase()===nombre.toLowerCase());
  if(d) return d;
  d = {id:nextId('divisas'), nombre, simbolo:'', orden:DB.divisas.length+1, saldo:0};
  DB.divisas.push(d); save();
  return d;
}
function addMoneda(nombre){
  nombre = (nombre||'').trim().toUpperCase();
  if(!nombre) return null;
  let m = DB.monedas.find(x=>x.nombre.toUpperCase()===nombre);
  if(m) return m;
  m = {id:nextId('monedas'), nombre};
  DB.monedas.push(m); save();
  return m;
}
function addPais(nombre){
  nombre = (nombre||'').trim();
  if(!nombre) return null;
  let p = DB.paises.find(x=>x.nombre.toLowerCase()===nombre.toLowerCase());
  if(p) return p;
  p = {id:nextId('paises'), nombre, es_predefinido:0};
  DB.paises.push(p); save();
  return p;
}

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

function renderClienteDetalle(content, id){
  const c = DB.clientes.find(x=>x.id===id);
  if(!c){ content.innerHTML = emptyState('❓','Cliente no encontrado'); return; }
  const envios = DB.envios
    .filter(e => (e.tipo==='cliente_directo' || e.tipo==='precio_especial') && e.cliente_id===id)
    .sort((a,b)=>b.fecha_hora-a.fecha_hora)
    .slice(0,10);

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
  const forma = p ? p.forma_ganancia : 'Efectivo';
  return `
    <h1 class="section-title">${opts.titulo}</h1>
    ${p ? `<div class="badge badge-gold" style="margin:-4px 0 6px;">📋 Duplicado — revise y guarde como envío nuevo</div>` : ''}

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

    <label class="field-label">Cantidad pagada (Entregar) *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-pagada" placeholder="0.00" value="${val(p?.cantidad_pagada)}">
    <div class="hint">Se calcula automático: Cantidad enviada × Precio. Puede ajustarlo.</div>

    <label class="field-label">Divisa de entrega *</label>
    <select id="ef-divisa-entrega" class="picker">${divisaOptionsHtml(p ? p.divisa_entrega : '')}</select>

    <label class="field-label">Descontar divisa pagada del balance general al pagar</label>
    <div class="pill-row" id="ef-descuenta">
      <div class="pill ${descuenta?'':'active'}" data-v="0">No</div>
      <div class="pill ${descuenta?'active':''}" data-v="1">Sí</div>
    </div>
    <div class="hint">Si está en "No", la divisa de entrega no se descuenta ahora — se crea un registro pendiente en Deudas → Pagar a.</div>

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-cotizado" placeholder="Opcional" value="${val(p?.cotizado_a)}">

    <label class="field-label">Ganancia *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-ganancia" placeholder="0.00" value="${val(p?.ganancia)}">
    <div class="hint">Se calcula automático: Cantidad enviada × (Cotizado a − Precio). Puede ajustarlo.</div>

    <label class="field-label">Divisa de ganancia *</label>
    <select id="ef-divisa-ganancia" class="picker">${divisaOptionsHtml(p ? p.divisa_ganancia : '')}</select>

    <label class="field-label">Forma de ganancia *</label>
    <div class="pill-row" id="ef-forma">
      ${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${forma===f?'active':''}" data-v="${f}">${f}</div>`).join('')}
    </div>

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="ef-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>

    <label class="field-label">Nota</label>
    <textarea id="ef-nota" maxlength="500" placeholder="Opcional">${p ? escapeHtml(p.nota||'') : ''}</textarea>

    <button class="btn btn-primary btn-block" id="ef-revisar" style="margin-top:22px;">Revisar y guardar</button>
  `;
}

function wireEnvioForm(content, {tipo, getEntity, setEntity, entityRequired, onSaved, prefill}){
  const cantEl = document.getElementById('ef-cantidad');
  const precioEl = document.getElementById('ef-precio');
  const pagadaEl = document.getElementById('ef-pagada');
  const cotizadoEl = document.getElementById('ef-cotizado');
  const gananciaEl = document.getElementById('ef-ganancia');
  const divEntregaEl = document.getElementById('ef-divisa-entrega');
  const divGananciaEl = document.getElementById('ef-divisa-ganancia');
  const monedaEl = document.getElementById('ef-moneda');
  const notaEl = document.getElementById('ef-nota');
  let pagadaTouched = false, gananciaTouched = false;
  let formaGanancia = 'Efectivo';
  let descuentaAhora = 0;
  if(prefill){
    formaGanancia = prefill.forma_ganancia || 'Efectivo';
    descuentaAhora = envioDescuentaAhora(prefill) ? 1 : 0;
    // Si el original tenía la cantidad pagada o la ganancia ajustadas a mano
    // (distintas del cálculo automático), se respetan tal cual; si coinciden
    // con el cálculo, siguen recalculándose al cambiar cantidad o precio.
    const cant = Number(prefill.cantidad_enviada)||0, precio = Number(prefill.precio)||0;
    pagadaTouched = round2(cant*precio) !== round2(prefill.cantidad_pagada);
    const cot = prefill.cotizado_a;
    const gananciaAuto = (cot===null || cot===undefined) ? null : round2(cant*(cot-precio));
    gananciaTouched = gananciaAuto===null ? true : gananciaAuto !== round2(prefill.ganancia);
  }

  bindAddOnSelect(monedaEl, addMoneda, monedaOptionsHtml);
  bindAddOnSelect(divEntregaEl, addDivisa, divisaOptionsHtml);
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
    if(!pagadaTouched) pagadaEl.value = cant && precio ? round2(cant*precio) : '';
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
  pagadaEl.addEventListener('input', ()=>{ pagadaTouched = true; });
  gananciaEl.addEventListener('input', ()=>{ gananciaTouched = true; });

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
    const cantidad_pagada = parseFloat(pagadaEl.value);
    const divisa_entrega = divEntregaEl.value;
    const cotizado_a = cotizadoEl.value.trim()==='' ? null : parseFloat(cotizadoEl.value);
    const ganancia = parseFloat(gananciaEl.value || 0);
    const divisa_ganancia = divGananciaEl.value;
    const nota = notaEl.value.trim();
    const fechaVal = document.getElementById('ef-fecha').value;

    if(!cantidad_enviada || !precio || isNaN(cantidad_pagada) || !divisa_entrega || !divisa_ganancia || divisa_entrega==='__add__' || divisa_ganancia==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }

    const envio = {
      tipo,
      cliente_id: tipo==='cliente_directo' ? entity.id : (tipo==='trabajador'?null:undefined),
      trabajador_id: tipo==='trabajador' ? entity.id : null,
      cantidad_enviada, moneda, precio, cantidad_pagada,
      cotizado_a, ganancia, divisa_entrega, divisa_ganancia,
      forma_ganancia: formaGanancia, nota,
      fecha_hora: new Date(fechaVal).getTime(),
      descuenta_ahora: descuentaAhora
    };
    showEnvioSummary(envio, entity, onSaved);
  };

  recalc();
}

function showEnvioSummary(envio, entity, onSaved){
  openModal(`
    <div class="modal-title">Confirme los datos del envío antes de guardar.</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:10px;">
      <div class="sumrow"><span class="k">${envio.tipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(entity.nombre)}</span></div>
      <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(envio.cantidad_enviada)} ${escapeHtml(envio.moneda)}</span></div>
      <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(envio.precio)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(envio.cantidad_pagada)}</span></div>
      <div class="sumrow"><span class="k">Divisa de entrega</span><span class="v">${escapeHtml(envio.divisa_entrega)}</span></div>
      <div class="sumrow"><span class="k">Descontar ahora</span><span class="v">${envio.descuenta_ahora?'Sí':'No — queda pendiente en Deudas'}</span></div>
      <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${envio.cotizado_a!==null?fmtMoney(envio.cotizado_a):'—'}</span></div>
      <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(envio.ganancia)}</span></div>
      <div class="sumrow"><span class="k">Divisa de ganancia</span><span class="v">${escapeHtml(envio.divisa_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Forma de ganancia</span><span class="v">${escapeHtml(envio.forma_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(envio.fecha_hora)}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="es-volver">Volver a editar</button>
      <button class="btn btn-primary btn-block" id="es-confirmar">Confirmar y guardar</button>
    </div>
  `);
  document.getElementById('es-volver').onclick = closeModal;
  document.getElementById('es-confirmar').onclick = ()=>{
    envio.id = nextId('envios');
    DB.envios.push(envio);
    let deudaCreada = null;
    if(!envio.descuenta_ahora){
      deudaCreada = crearDeudaAutomatica({
        tipo:'pagar_a', persona:`${entity.nombre} – ${fmtMoney(envio.cantidad_enviada)} ${envio.moneda}`, monto:envio.cantidad_pagada,
        divisa:envio.divisa_entrega, fecha:envio.fecha_hora, nota: envio.nota || 'Registrado desde envío',
        origen:'envio', origen_id:envio.id
      });
    }
    applyEnvioBalance(envio, 1, deudaCreada);
    save();
    closeModal();
    toast('Envío guardado correctamente');
    onSaved && onSaved();
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

/* ---------------------------------------------------------------------- *
 * 12. MENÚ 4 — PRECIO ESPECIAL
 * ---------------------------------------------------------------------- */
function renderPrecioEspecialForm(content){
  let entity = null, entityTipo = null;
  const p = tomarDuplicadoEnvio('precio_especial');
  const val = (v)=> (v===null || v===undefined) ? '' : escapeHtml(String(v));
  if(p){
    if(p.trabajador_id){ entity = DB.trabajadores.find(t=>t.id===p.trabajador_id && t.activo) || null; entityTipo = entity ? 'trabajador' : null; }
    else if(p.cliente_id){ entity = DB.clientes.find(c=>c.id===p.cliente_id && c.activo) || null; entityTipo = entity ? 'cliente' : null; }
  }
  const forma = p ? p.forma_ganancia : 'Efectivo';
  content.innerHTML = `
    <h1 class="section-title">⭐ Precio especial</h1>
    ${p ? `<div class="badge badge-gold" style="margin:-4px 0 6px;">📋 Duplicado — revise y guarde como envío nuevo</div>` : ''}

    <label class="field-label">Cliente o trabajador *</label>
    <div class="picker" id="pe-entity-picker">
      <span id="pe-entity-name" class="${entity?'':'ph'}">${entity ? `${entityTipo==='trabajador'?'👷 ':''}${escapeHtml(entity.nombre)}` : 'Toca para seleccionar...'}</span>
      <span>🔍</span>
    </div>

    <label class="field-label">Cantidad enviada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-cantidad" placeholder="0.00" value="${val(p?.cantidad_enviada)}">

    <label class="field-label">Moneda *</label>
    <select id="pe-moneda" class="picker">${monedaOptionsHtml(p ? p.moneda : 'USD')}</select>

    <label class="field-label">Precio *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-precio" placeholder="0.00" value="${val(p?.precio)}">

    <label class="field-label">Cantidad pagada (Entregar) *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-pagada" placeholder="0.00" value="${val(p?.cantidad_pagada)}">
    <div class="hint">Editable manualmente. No hay cálculo automático.</div>

    <label class="field-label">Divisa de entrega *</label>
    <select id="pe-divisa-entrega" class="picker">${divisaOptionsHtml(p ? p.divisa_entrega : '')}</select>

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-cotizado" placeholder="Opcional — informativo" value="${val(p?.cotizado_a)}">

    <label class="field-label">Ganancia *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-ganancia" placeholder="0.00" value="${val(p?.ganancia)}">
    <div class="hint">Editable manualmente. No hay cálculo automático. Puede ser negativa.</div>

    <label class="field-label">Divisa de ganancia *</label>
    <select id="pe-divisa-ganancia" class="picker">${divisaOptionsHtml(p ? p.divisa_ganancia : '')}</select>

    <label class="field-label">Forma de ganancia *</label>
    <div class="pill-row" id="pe-forma">
      ${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${forma===f?'active':''}" data-v="${f}">${f}</div>`).join('')}
    </div>

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="pe-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>

    <label class="field-label">Nota</label>
    <textarea id="pe-nota" maxlength="500" placeholder="Opcional">${p ? escapeHtml(p.nota||'') : ''}</textarea>

    <button class="btn btn-primary btn-block" id="pe-revisar" style="margin-top:22px;">Revisar y guardar</button>
  `;

  document.getElementById('pe-entity-picker').onclick = ()=>{
    openEntityPicker('combinado', (item, tipo)=>{
      entity = item; entityTipo = tipo;
      const label = document.getElementById('pe-entity-name');
      label.textContent = `${tipo==='trabajador'?'👷 ':''}${item.nombre}`;
      label.classList.remove('ph');
    });
  };

  bindAddOnSelect(document.getElementById('pe-moneda'), addMoneda, monedaOptionsHtml);
  bindAddOnSelect(document.getElementById('pe-divisa-entrega'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('pe-divisa-ganancia'), addDivisa, divisaOptionsHtml);

  let formaGanancia = forma || 'Efectivo';
  document.querySelectorAll('#pe-forma .pill').forEach(pill=>{
    pill.onclick = ()=>{
      document.querySelectorAll('#pe-forma .pill').forEach(x=>x.classList.remove('active'));
      pill.classList.add('active'); formaGanancia = pill.dataset.v;
    };
  });
  if(p && !entity) toast('El cliente o trabajador original ya no existe. Seleccione otro.');

  document.getElementById('pe-revisar').onclick = ()=>{
    if(!entity){ toast('Debe seleccionar al menos un cliente o un trabajador.'); return; }
    const cantidad_enviada = parseFloat(document.getElementById('pe-cantidad').value);
    const moneda = document.getElementById('pe-moneda').value.toUpperCase();
    const precio = parseFloat(document.getElementById('pe-precio').value);
    const cantidad_pagada = parseFloat(document.getElementById('pe-pagada').value);
    const divisa_entrega = document.getElementById('pe-divisa-entrega').value;
    const cotizadoRaw = document.getElementById('pe-cotizado').value.trim();
    const cotizado_a = cotizadoRaw==='' ? null : parseFloat(cotizadoRaw);
    const gananciaRaw = document.getElementById('pe-ganancia').value.trim();
    const divisa_ganancia = document.getElementById('pe-divisa-ganancia').value;
    const nota = document.getElementById('pe-nota').value.trim();
    const fechaVal = document.getElementById('pe-fecha').value;

    if(!cantidad_enviada || !moneda || !precio || gananciaRaw==='' || isNaN(cantidad_pagada) ||
       !divisa_entrega || !divisa_ganancia || divisa_entrega==='__add__' || divisa_ganancia==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const ganancia = parseFloat(gananciaRaw);
    const fecha_hora = new Date(fechaVal).getTime();

    const envio = {
      tipo:'precio_especial',
      cliente_id: entityTipo==='cliente' ? entity.id : null,
      trabajador_id: entityTipo==='trabajador' ? entity.id : null,
      cantidad_enviada, moneda, precio, cantidad_pagada, cotizado_a, ganancia,
      divisa_entrega, divisa_ganancia, forma_ganancia: formaGanancia, nota,
      fecha_hora, descuenta_ahora: 1
    };

    function goToSummary(){
      openModal(`
        <div class="modal-title">Estás registrando un envío especial.</div>
        <div class="modal-msg">La ganancia será de <strong>${fmtMoney(ganancia)} ${escapeHtml(divisa_ganancia)}</strong>. Forma de ganancia: <strong>${escapeHtml(formaGanancia)}</strong>.</div>
        <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
          <div class="sumrow"><span class="k">${entityTipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(entity.nombre)}</span></div>
          <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(cantidad_enviada)} ${escapeHtml(moneda)}</span></div>
          <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(precio)}</span></div>
          <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(cantidad_pagada)} ${escapeHtml(divisa_entrega)}</span></div>
          <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${cotizado_a!==null?fmtMoney(cotizado_a):'—'}</span></div>
          <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(ganancia)} ${escapeHtml(divisa_ganancia)}</span></div>
          <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(fecha_hora)}</span></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline btn-block" id="pe-volver">Volver a editar</button>
          <button class="btn btn-primary btn-block" id="pe-confirmar">Confirmar y guardar</button>
        </div>
      `);
      document.getElementById('pe-volver').onclick = closeModal;
      document.getElementById('pe-confirmar').onclick = ()=>{
        envio.id = nextId('envios');
        DB.envios.push(envio);
        applyEnvioBalance(envio, 1);
        save(); closeModal();
        toast('Envío guardado correctamente');
        renderPrecioEspecialForm(content);
      };
    }

    if(ganancia < 0){
      confirmDialog(`La ganancia es negativa: -$${fmtMoney(Math.abs(ganancia))}. ¿Confirmar este envío con pérdida?`, goToSummary, {okLabel:'Confirmar', cancelLabel:'Corregir', danger:false});
    } else {
      goToSummary();
    }
  };
}

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

/* ---------------------------------------------------------------------- *
 * 13. MENÚ 5 — HISTORIAL DE ENVÍOS
 * ---------------------------------------------------------------------- */
let historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:'Todas'};
let retornoHistorialDivisa = null; // (bug preexistente: nunca se declaraba, causaba ReferenceError al volver de un envío)

function entityNameForEnvio(e){
  if(e.trabajador_id){
    const t = DB.trabajadores.find(x=>x.id===e.trabajador_id);
    return t ? (t.nombre + (t.activo?'':' (eliminado)')) : '(eliminado)';
  } else {
    const c = DB.clientes.find(x=>x.id===e.cliente_id);
    return c ? (c.nombre + (c.activo?'':' (eliminado)')) : '(eliminado)';
  }
}

function applyHistorialFilters(list){
  const f = historialFilters;
  return list.filter(e=>{
    if(e.archivado) return false;
    if(f.q){
      const name = entityNameForEnvio(e);
      if(!coincideBusqueda(name, f.q)) return false;
    }
    if(f.tipo==='Clientes' && e.tipo!=='cliente_directo') return false;
    if(f.tipo==='Trabajadores' && e.tipo!=='trabajador') return false;
    if(f.tipo==='Especiales' && e.tipo!=='precio_especial') return false;
    if(f.forma!=='Todas' && e.forma_ganancia!==f.forma) return false;
    if(f.divisa!=='Todas' && e.divisa_entrega!==f.divisa && e.divisa_ganancia!==f.divisa) return false;
    if(f.fecha==='Hoy' && e.fecha_hora < todayRangeStart()) return false;
    if(f.fecha==='Semanal' && e.fecha_hora < startOfWeek()) return false;
    if(f.fecha==='Mensual' && e.fecha_hora < startOfMonth()) return false;
    if(f.fecha==='Personalizado'){
      if(f.fechaDesde && e.fecha_hora < f.fechaDesde) return false;
      if(f.fechaHasta && e.fecha_hora > f.fechaHasta) return false;
    }
    return true;
  }).sort(ordenFechaDesc);
}

// "Personalizado" sin fechas se comporta como sin filtro de fecha.
function historialFiltrosActivos(){
  const f = historialFilters;
  const fechaActiva = ['Hoy','Semanal','Mensual'].includes(f.fecha) || (f.fecha==='Personalizado' && (f.fechaDesde || f.fechaHasta));
  return !!(normalizarTexto(f.q) || f.tipo!=='Todos' || f.forma!=='Todas' || f.divisa!=='Todas' || fechaActiva);
}

function renderHistorial(content, presetParam){
  if(presetParam==='reset'){
    historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:'Todas'};
  }
  content.innerHTML = `
    <h1 class="section-title">Historial de envíos</h1>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="h-search" placeholder="Buscar por nombre..." value="${escapeHtml(historialFilters.q)}">
    </div>
    <div class="chip-row" id="h-tipo-chips">
      ${['Todos','Clientes','Trabajadores','Especiales'].map(t=>`<div class="chip ${historialFilters.tipo===t?'active':''}" data-v="${t}">${t}</div>`).join('')}
    </div>
    <div class="chip-row" id="h-fecha-chips">
      ${['Hoy','Semanal','Mensual','Personalizado','Todo'].map(t=>`<div class="chip ${historialFilters.fecha===t?'active':''}" data-v="${t}">${t}</div>`).join('')}
    </div>
    <div id="h-custom-range" class="two-col" style="margin-bottom:12px;display:${historialFilters.fecha==='Personalizado'?'grid':'none'};">
      <input type="date" id="h-desde" value="${historialFilters.fechaDesde? fechaLocalISO(historialFilters.fechaDesde):''}">
      <input type="date" id="h-hasta" value="${historialFilters.fechaHasta? fechaLocalISO(historialFilters.fechaHasta):''}">
    </div>
    <div class="two-col" style="margin-bottom:12px;">
      <select id="h-forma" class="picker">
        ${['Todas','Efectivo','Transferencia','USD'].map(f=>`<option value="${f}" ${historialFilters.forma===f?'selected':''}>${f==='Todas'?'Forma: Todas':f}</option>`).join('')}
      </select>
      <select id="h-divisa" class="picker">
        <option value="Todas" ${historialFilters.divisa==='Todas'?'selected':''}>Divisa: Todas</option>
        ${DB.divisas.map(d=>`<option value="${escapeHtml(d.nombre)}" ${historialFilters.divisa===d.nombre?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')}
      </select>
    </div>
    <div id="h-list"></div>
    <div id="h-pag"></div>
  `;

  const estadoPag = paginacion.historial;
  sincronizarPaginaConFiltros(estadoPag, historialFiltrosActivos(), false);
  function cambioDeFiltro(){
    sincronizarPaginaConFiltros(estadoPag, historialFiltrosActivos(), true);
    refreshList();
  }

  function refreshList(){
    const list = applyHistorialFilters(DB.envios);
    const el = document.getElementById('h-list');
    const pag = paginarArray(list, estadoPag);
    el.innerHTML = list.length ? pag.items.map(envioRowHtml).join('') : emptyState('📭','No se encontraron envíos con los filtros aplicados.');
    aplicarZebra(el, list.length);
    renderControlPaginacion(document.getElementById('h-pag'), estadoPag, pag, refreshList, el);
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = (ev)=>{
        if(ev.target.closest('.edit-btn')) return;
        location.hash = `#/envio-detalle/${li.dataset.id}`;
      };
    });
    el.querySelectorAll('.edit-btn').forEach(btn=>{
      btn.onclick = (ev)=>{
        ev.stopPropagation();
        openEnvioEditModal(Number(btn.dataset.id), refreshList);
      };
    });
  }

  const searchEl = document.getElementById('h-search');
  searchEl.addEventListener('input', e=>{ historialFilters.q = e.target.value; cambioDeFiltro(); });
  activarSugerencias(searchEl, {
    // Solo se sugieren clientes y trabajadores que tienen envíos en el historial.
    obtenerCandidatos: ()=>{
      const conEnvios = DB.envios.filter(e=>!e.archivado);
      const idsCli = new Set(conEnvios.filter(e=>!e.trabajador_id && e.cliente_id!=null).map(e=>e.cliente_id));
      const idsTr = new Set(conEnvios.filter(e=>e.trabajador_id).map(e=>e.trabajador_id));
      return [
        ...DB.clientes.filter(c=>idsCli.has(c.id)).map(c=>({nombre:c.nombre, sub:c.pais||''})),
        ...DB.trabajadores.filter(t=>idsTr.has(t.id)).map(t=>({nombre:t.nombre, sub:'Trabajador', avatar:'👷'})),
      ];
    },
    onElegir: ()=>{ historialFilters.q = searchEl.value; cambioDeFiltro(); }
  });
  document.querySelectorAll('#h-tipo-chips .chip').forEach(c=>{
    c.onclick = ()=>{ historialFilters.tipo = c.dataset.v; document.querySelectorAll('#h-tipo-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); cambioDeFiltro(); };
  });
  document.querySelectorAll('#h-fecha-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      historialFilters.fecha = c.dataset.v;
      document.querySelectorAll('#h-fecha-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      document.getElementById('h-custom-range').style.display = c.dataset.v==='Personalizado' ? 'grid' : 'none';
      cambioDeFiltro();
    };
  });
  // Fechas del filtro con componentes LOCALES (new Date('AAAA-MM-DD') sería
  // medianoche UTC y en Cuba/Miami correría el rango un día).
  document.getElementById('h-desde').addEventListener('change', e=>{ historialFilters.fechaDesde = e.target.value ? fechaInputAInicioDeDiaLocal(e.target.value) : null; cambioDeFiltro(); });
  document.getElementById('h-hasta').addEventListener('change', e=>{ historialFilters.fechaHasta = e.target.value ? fechaInputAFinDeDiaLocal(e.target.value) : null; cambioDeFiltro(); });
  document.getElementById('h-forma').addEventListener('change', e=>{ historialFilters.forma = e.target.value; cambioDeFiltro(); });
  document.getElementById('h-divisa').addEventListener('change', e=>{ historialFilters.divisa = e.target.value; cambioDeFiltro(); });

  refreshList();
}

function envioRowHtml(e){
  const icon = e.tipo==='trabajador' ? '👷' : (e.tipo==='precio_especial' ? '⭐' : '📤');
  return `
    <div class="list-item" data-id="${e.id}">
      <div class="avatar">${icon}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(entityNameForEnvio(e))}</div>
        <div class="li-sub">${fmtDate(e.fecha_hora)} · ${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount">+${fmtMoney(envioGananciaMostrada(e))}</div>
        <div class="li-sub">${escapeHtml(e.divisa_ganancia)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${e.id}" aria-label="Editar envío">✏️</button>
    </div>`;
}

function renderEnvioDetalle(content, id){
  const e = DB.envios.find(x=>x.id===id);
  if(!e){ content.innerHTML = emptyState('❓','Envío no encontrado'); return; }
  const nombreEntidad = entityNameForEnvio(e);
  content.innerHTML = `
    ${e.tipo==='precio_especial' ? `<div class="badge badge-gold" style="margin:10px 0;">⭐ Precio especial</div>` : ''}
    <div class="card">
      <div class="sumrow"><span class="k">${e.tipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(nombreEntidad)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(e.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</span></div>
      <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(e.precio)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(e.cantidad_pagada)}</span></div>
      <div class="sumrow"><span class="k">Divisa de entrega</span><span class="v">${escapeHtml(e.divisa_entrega)}</span></div>
      ${e.tipo!=='precio_especial' ? `<div class="sumrow"><span class="k">Descuento</span><span class="v">${envioDescuentaAhora(e)?'Inmediato':'Pendiente en Deudas'}</span></div>` : ''}
      <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${e.cotizado_a!==null && e.cotizado_a!==undefined ? fmtMoney(e.cotizado_a) : '—'}</span></div>
      <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(envioGananciaMostrada(e))}</span></div>
      <div class="sumrow"><span class="k">Divisa de ganancia</span><span class="v">${escapeHtml(e.divisa_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Forma de ganancia</span><span class="v">${escapeHtml(e.forma_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(e.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions" style="margin-top:14px;">
      <button class="btn btn-outline btn-block" id="ed-aceptar">✅ Aceptar</button>
      <button class="btn btn-danger btn-block" id="ed-del">Eliminar envío</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="ed-edit">✏️ Editar envío</button>
      <button class="btn btn-primary btn-block" id="ed-duplicar">📋 Duplicar</button>
    </div>
  `;
  document.getElementById('ed-aceptar').onclick = volverDesdeEnvioDetalle;
  document.getElementById('ed-duplicar').onclick = ()=> duplicarEnvio(e.id);
  document.getElementById('ed-edit').onclick = ()=>{
    openEnvioEditModal(e.id, ()=>renderEnvioDetalle(content, id));
  };
  document.getElementById('ed-del').onclick = ()=>{
    confirmDialog(`¿Eliminar el envío de ${escapeHtml(nombreEntidad)}?`, ()=>{
      eliminarConDeshacer('Envío eliminado', ()=>{
        const deudaAsociada = DB.deudas.find(d=>d.origen==='envio' && d.origen_id===e.id);
        applyEnvioBalance(e, -1, deudaAsociada);
        if(deudaAsociada){
          // Solo se devuelve el pago si al pagarlo se restó del balance
          // (divisa de entrega distinta de la de ganancia; ver "dd-cerrar").
          if(deudaEnvioPagadaRestoBalance(deudaAsociada, e)) adjustBalance(deudaAsociada.divisa, deudaAsociada.monto);
          DB.deudas = DB.deudas.filter(x=>x.id!==deudaAsociada.id);
        }
        DB.envios = DB.envios.filter(x=>x.id!==e.id);
        save();
      });
      retornoHistorialDivisa = null;
      location.hash = '#/historial';
    });
  };
}

/* ¿Al marcar como pagada esta deuda de envío se restó su monto del balance?
   Solo si la divisa entregada es DISTINTA de la divisa de la ganancia (si es
   la misma, pagarla no toca el balance). Se evalúa con los datos del envío
   que se pasen, para poder usarla antes y después de editarlo. */
function deudaEnvioPagadaRestoBalance(deuda, envio){
  return !!deuda && deuda.estado==='pagado' && !!envio && !mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);
}

function duplicarEnvio(id){
  const e = DB.envios.find(x=>x.id===id);
  if(!e){ alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  const copia = copiaParaDuplicar(e);
  retornoHistorialDivisa = null;
  if(e.tipo==='trabajador'){
    const t = DB.trabajadores.find(x=>x.id===e.trabajador_id && x.activo);
    if(!t){ alertDialog('No se pudo duplicar', 'El trabajador de este envío fue eliminado.'); return; }
    duplicadoEnvioPendiente = {tipo:'trabajador', envio:copia};
    location.hash = `#/envio-trabajador/${t.id}`;
  } else if(e.tipo==='precio_especial'){
    duplicadoEnvioPendiente = {tipo:'precio_especial', envio:copia};
    location.hash = '#/precio-especial';
  } else {
    duplicadoEnvioPendiente = {tipo:'cliente_directo', envio:copia};
    location.hash = '#/envio';
  }
}

/* ---------------------------------------------------------------------- *
 * 13b. EDICIÓN DE ENVÍOS (desde Menú 5 — Historial de envíos)
 * ---------------------------------------------------------------------- */
function openEnvioEditModal(id, onSaved){
  const e = DB.envios.find(x=>x.id===id);
  if(!e){ toast('Envío no encontrado'); return; }

  let entityTipo = e.trabajador_id ? 'trabajador' : 'cliente';
  let entity = entityTipo==='trabajador'
    ? DB.trabajadores.find(x=>x.id===e.trabajador_id)
    : DB.clientes.find(x=>x.id===e.cliente_id);
  if(!entity) entity = {id:null, nombre:'(eliminado)'};

  const pickerModo = e.tipo==='trabajador' ? 'trabajador' : (e.tipo==='cliente_directo' ? 'cliente' : 'combinado');
  const entityLabel = e.tipo==='trabajador' ? 'Trabajador' : (e.tipo==='cliente_directo' ? 'Cliente' : 'Cliente o trabajador');

  openModal(`
    <div class="modal-title">Editar envío</div>

    <label class="field-label">${entityLabel} *</label>
    <div class="picker" id="ee-entity-picker">
      <span id="ee-entity-name">${entityTipo==='trabajador'?'👷 ':''}${escapeHtml(entity.nombre)}</span>
      <span>🔍</span>
    </div>

    <label class="field-label">Cantidad enviada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-cantidad" value="${e.cantidad_enviada}">

    <label class="field-label">Moneda *</label>
    <select id="ee-moneda" class="picker">${monedaOptionsHtml(e.moneda)}</select>

    <label class="field-label">Precio *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-precio" value="${e.precio}">

    <label class="field-label">Cantidad pagada (Entregar) *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-pagada" value="${e.cantidad_pagada}">

    <label class="field-label">Divisa de entrega *</label>
    <select id="ee-divisa-entrega" class="picker">${divisaOptionsHtml(e.divisa_entrega)}</select>

    ${e.tipo!=='precio_especial' ? `
    <label class="field-label">Descontar divisa pagada del balance general al pagar</label>
    <div class="pill-row" id="ee-descuenta">
      <div class="pill ${!envioDescuentaAhora(e)?'active':''}" data-v="0">No</div>
      <div class="pill ${envioDescuentaAhora(e)?'active':''}" data-v="1">Sí</div>
    </div>
    <div class="hint">Si cambia este valor, se ajustará el balance general y la deuda asociada en Deudas → Pagar a.</div>
    ` : ''}

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-cotizado" value="${e.cotizado_a!==null && e.cotizado_a!==undefined ? e.cotizado_a : ''}" placeholder="Opcional">

    <label class="field-label">Ganancia *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ee-ganancia" value="${e.ganancia}">

    <label class="field-label">Divisa de ganancia *</label>
    <select id="ee-divisa-ganancia" class="picker">${divisaOptionsHtml(e.divisa_ganancia)}</select>

    <label class="field-label">Forma de ganancia *</label>
    <div class="pill-row" id="ee-forma">
      ${['Efectivo','Transferencia','USD'].map(f=>`<div class="pill ${e.forma_ganancia===f?'active':''}" data-v="${f}">${f}</div>`).join('')}
    </div>

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="ee-fecha" value="${toLocalDatetimeValue(e.fecha_hora)}">

    <label class="field-label">Nota</label>
    <textarea id="ee-nota" maxlength="500" placeholder="Opcional">${escapeHtml(e.nota||'')}</textarea>

    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ee-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ee-save">Guardar cambios</button>
    </div>
  `);

  bindAddOnSelect(document.getElementById('ee-moneda'), addMoneda, monedaOptionsHtml);
  bindAddOnSelect(document.getElementById('ee-divisa-entrega'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('ee-divisa-ganancia'), addDivisa, divisaOptionsHtml);

  document.getElementById('ee-entity-picker').onclick = ()=>{
    openEntityPicker(pickerModo, (item, tipo)=>{
      entity = item;
      entityTipo = pickerModo==='combinado' ? tipo : pickerModo;
      const label = document.getElementById('ee-entity-name');
      label.textContent = `${entityTipo==='trabajador'?'👷 ':''}${item.nombre}`;
    });
  };

  let formaGanancia = e.forma_ganancia;
  document.querySelectorAll('#ee-forma .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#ee-forma .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      formaGanancia = p.dataset.v;
    };
  });

  let descuentaAhoraSel = envioDescuentaAhora(e) ? 1 : 0;
  document.querySelectorAll('#ee-descuenta .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#ee-descuenta .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      descuentaAhoraSel = Number(p.dataset.v);
    };
  });

  const precioEl = document.getElementById('ee-precio');
  const cotizadoEl = document.getElementById('ee-cotizado');
  const saveBtn = document.getElementById('ee-save');
  function validarCotizado(){
    if(e.tipo==='precio_especial'){ cotizadoEl.classList.remove('err'); saveBtn.disabled=false; saveBtn.style.opacity=1; return; }
    const precio = parseFloat(precioEl.value)||0;
    const cotizadoRaw = cotizadoEl.value.trim();
    const cotizado = cotizadoRaw==='' ? null : parseFloat(cotizadoRaw);
    if(cotizado!==null && cotizado < precio){
      cotizadoEl.classList.add('err');
      saveBtn.disabled = true; saveBtn.style.opacity = .5;
    } else {
      cotizadoEl.classList.remove('err');
      saveBtn.disabled = false; saveBtn.style.opacity = 1;
    }
  }
  [precioEl, cotizadoEl].forEach(el=>el.addEventListener('input', validarCotizado));
  validarCotizado();

  document.getElementById('ee-cancel').onclick = closeModal;
  document.getElementById('ee-save').onclick = ()=>{
    if(!entity || entity.id===null){ toast('Seleccione un cliente o trabajador válido.'); return; }
    const cantidad_enviada = parseFloat(document.getElementById('ee-cantidad').value);
    const moneda = document.getElementById('ee-moneda').value.toUpperCase();
    const precio = parseFloat(precioEl.value);
    const cantidad_pagada = parseFloat(document.getElementById('ee-pagada').value);
    const divisa_entrega = document.getElementById('ee-divisa-entrega').value;
    const cotizadoRaw = cotizadoEl.value.trim();
    const cotizado_a = cotizadoRaw==='' ? null : parseFloat(cotizadoRaw);
    const ganancia = parseFloat(document.getElementById('ee-ganancia').value);
    const divisa_ganancia = document.getElementById('ee-divisa-ganancia').value;
    const fechaVal = document.getElementById('ee-fecha').value;
    const nota = document.getElementById('ee-nota').value.trim();

    if(!cantidad_enviada || !precio || isNaN(cantidad_pagada) || !divisa_entrega || divisa_entrega==='__add__' ||
       !divisa_ganancia || divisa_ganancia==='__add__' || isNaN(ganancia) || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    if(e.tipo!=='precio_especial' && cotizado_a!==null && cotizado_a < precio){
      toast('Cotizado a debe ser mayor o igual al precio.'); return;
    }

    const nuevo = {
      entity, entityTipo, cantidad_enviada, moneda, precio, cantidad_pagada, divisa_entrega,
      cotizado_a, ganancia, divisa_ganancia, forma_ganancia: formaGanancia,
      fecha_hora: new Date(fechaVal).getTime(), nota,
      descuenta_ahora: e.tipo==='precio_especial' ? 1 : descuentaAhoraSel
    };

    confirmDialog('¿Guardar los cambios de este envío? Se ajustará el balance general y la deuda asociada, si existe.', ()=>{
      guardarEdicionEnvio(e, nuevo);
      toast('Envío actualizado');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

function guardarEdicionEnvio(e, nuevo){
  const deudaExistente = DB.deudas.find(d => d.origen==='envio' && d.origen_id===e.id);
  const newDescuentaAhora = !!nuevo.descuenta_ahora;

  applyEnvioBalance(e, -1, deudaExistente);
  // Se revierte el pago de la deuda SOLO si al pagarla se restó del balance
  // (antes se revertía siempre y, con la misma divisa de entrega y de
  // ganancia, el saldo quedaba descuadrado).
  if(deudaEnvioPagadaRestoBalance(deudaExistente, e)){
    adjustBalance(deudaExistente.divisa, deudaExistente.monto);
  }

  e.cliente_id = nuevo.entityTipo==='cliente' ? nuevo.entity.id : null;
  e.trabajador_id = nuevo.entityTipo==='trabajador' ? nuevo.entity.id : null;
  e.cantidad_enviada = nuevo.cantidad_enviada;
  e.moneda = nuevo.moneda;
  e.precio = nuevo.precio;
  e.cantidad_pagada = nuevo.cantidad_pagada;
  e.divisa_entrega = nuevo.divisa_entrega;
  e.cotizado_a = nuevo.cotizado_a;
  e.ganancia = nuevo.ganancia;
  e.divisa_ganancia = nuevo.divisa_ganancia;
  e.forma_ganancia = nuevo.forma_ganancia;
  e.fecha_hora = nuevo.fecha_hora;
  e.nota = nuevo.nota;
  if(e.tipo !== 'precio_especial') e.descuenta_ahora = newDescuentaAhora ? 1 : 0;

  const entityNombre = entityNameForEnvio(e);
  const personaDeuda = `${entityNombre} – ${fmtMoney(e.cantidad_enviada)} ${e.moneda}`;
  if(newDescuentaAhora){
    if(deudaExistente){
      DB.deudas = DB.deudas.filter(d=>d.id!==deudaExistente.id);
    }
  } else if(deudaExistente){
    deudaExistente.persona = personaDeuda;
    deudaExistente.monto = e.cantidad_pagada;
    deudaExistente.divisa = e.divisa_entrega;
    deudaExistente.fecha = e.fecha_hora;
    deudaExistente.nota = e.nota || 'Registrado desde envío';
    if(deudaEnvioPagadaRestoBalance(deudaExistente, e)){
      adjustBalance(deudaExistente.divisa, -deudaExistente.monto);
    }
  } else {
    crearDeudaAutomatica({
      tipo:'pagar_a', persona:personaDeuda, monto:e.cantidad_pagada,
      divisa:e.divisa_entrega, fecha:e.fecha_hora, nota:e.nota || 'Registrado desde envío',
      origen:'envio', origen_id:e.id
    });
  }

  const deudaNueva = !newDescuentaAhora
    ? DB.deudas.find(d=>d.origen==='envio' && d.origen_id===e.id)
    : null;
  applyEnvioBalance(e, 1, deudaNueva);

  save();
}


/* ---------------------------------------------------------------------- *
 * 14. LISTADOS PAGINADOS: VENTAS, COMPRAS, GASTOS, IN/OUT
 *     Los cuatro comparten la misma estructura: botón "Nuevo", lista
 *     paginada (10 por página, fecha descendente) y detalle en un modal.
 * ---------------------------------------------------------------------- */
function renderListadoPaginado(content, cfg){
  const estado = paginacion[cfg.clave];
  content.innerHTML = `
    <h1 class="section-title">${cfg.titulo}</h1>
    ${cfg.intro || ''}
    <button class="btn btn-gold btn-block" id="${cfg.prefijo}-nuevo">${cfg.textoNuevo}</button>
    <div style="height:14px;"></div>
    <div id="${cfg.prefijo}-list"></div>
    <div id="${cfg.prefijo}-pag"></div>
  `;
  const listEl = document.getElementById(`${cfg.prefijo}-list`);
  function refresh(){
    if(!document.body.contains(listEl)) return; // el usuario ya cambió de pantalla
    const items = DB[cfg.clave].filter(r=>!r.archivado).sort(ordenFechaDesc);
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
  return c;
}

/* ---------------------------------------------------------------------- *
 * 14a. MENÚ 7 — VENTAS (con switch "deuda pendiente")
 * ---------------------------------------------------------------------- */
function renderVentasList(content){
  renderListadoPaginado(content, {
    clave:'ventas', prefijo:'v', titulo:'Ventas', textoNuevo:'➕ Nueva venta',
    rowHtml: ventaRowHtml, vacioIcono:'💱', vacioTexto:'Aún no hay ventas registradas',
    abrirFormulario: (onSaved)=>openVentaForm(onSaved),
    abrirDetalle: openVentaDetalle, abrirEdicion: openVentaEditModal,
  });
}
function ventaEstado(v){
  if(!v.registra_deuda) return 'Pagado';
  const d = DB.deudas.find(x=>x.origen==='venta' && x.origen_id===v.id);
  if(d && d.estado==='cobrado') return 'Cobrado';
  return 'Pendiente de cobro';
}
function ventaRowHtml(v){
  return `
    <div class="list-item" data-id="${v.id}">
      <div class="avatar">💱</div>
      <div class="li-main">
        <div class="li-title">${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)} → ${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}</div>
        <div class="li-sub">${fmtDate(v.fecha_hora)} · ${ventaEstado(v)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${v.id}" aria-label="Editar venta">✏️</button>
    </div>`;
}
function openVentaForm(onSaved, prefill){
  openModal(`
    <div class="modal-title">Registrar venta</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Cantidad vendida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="vf-cvendida" placeholder="0.00">
    <label class="field-label">Divisa vendida *</label>
    <select id="vf-dvendida" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Cantidad recibida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="vf-crecibida" placeholder="0.00">
    <label class="field-label">Divisa recibida *</label>
    <select id="vf-drecibida" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Registrar cantidad recibida como deuda pendiente</label>
    <div class="pill-row" id="vf-switch">
      <div class="pill active" data-v="0">No</div>
      <div class="pill" data-v="1">Sí</div>
    </div>
    <div class="hint">Si activa esta opción, la cantidad recibida NO se suma ahora al balance — se crea un registro pendiente en Deudas → Me deben.</div>
    <label class="field-label">Fecha y hora de la venta *</label>
    <input type="datetime-local" id="vf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="vf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="vf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="vf-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos(
      {'vf-cvendida':prefill.cantidad_vendida, 'vf-dvendida':prefill.divisa_vendida, 'vf-crecibida':prefill.cantidad_recibida, 'vf-drecibida':prefill.divisa_recibida, 'vf-nota':prefill.nota||''},
      {'vf-switch': prefill.registra_deuda ? 1 : 0});
  }
  bindAddOnSelect(document.getElementById('vf-dvendida'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('vf-drecibida'), addDivisa, divisaOptionsHtml);
  let registraDeuda = prefill && prefill.registra_deuda ? 1 : 0;
  document.querySelectorAll('#vf-switch .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#vf-switch .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      registraDeuda = Number(p.dataset.v);
    };
  });
  document.getElementById('vf-cancel').onclick = closeModal;
  document.getElementById('vf-save').onclick = ()=>{
    const cantidad_vendida = parseFloat(document.getElementById('vf-cvendida').value);
    const divisa_vendida = document.getElementById('vf-dvendida').value;
    const cantidad_recibida = parseFloat(document.getElementById('vf-crecibida').value);
    const divisa_recibida = document.getElementById('vf-drecibida').value;
    const fechaVal = document.getElementById('vf-fecha').value;
    const nota = document.getElementById('vf-nota').value.trim();
    if(!cantidad_vendida || !divisa_vendida || divisa_vendida==='__add__' || !cantidad_recibida || !divisa_recibida || divisa_recibida==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const fecha_hora = new Date(fechaVal).getTime();
    const venta = {id:nextId('ventas'), cantidad_vendida, divisa_vendida, cantidad_recibida, divisa_recibida, nota, fecha_hora, registra_deuda:registraDeuda};
    DB.ventas.push(venta);
    adjustBalance(divisa_vendida, -cantidad_vendida);
    if(registraDeuda){
      crearDeudaAutomatica({
        tipo:'me_deben', persona:`Venta de ${fmtMoney(cantidad_vendida)} ${divisa_vendida}`, monto:cantidad_recibida,
        divisa:divisa_recibida, fecha:fecha_hora, nota: nota || 'Registrado desde venta',
        origen:'venta', origen_id:venta.id, tipo_me_deben: MEDEBEN_SUMAR_AL_COBRAR
      });
    } else {
      adjustBalance(divisa_recibida, cantidad_recibida);
    }
    save(); closeModal(); toast('Venta guardada');
    onSaved && onSaved();
  };
}
function openVentaDetalle(id, onChange, opts={}){
  const v = DB.ventas.find(x=>x.id===id);
  if(!v) return;
  openModal(`
    <div class="modal-title">Detalle de venta</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Cantidad vendida</span><span class="v">${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)}</span></div>
      <div class="sumrow"><span class="k">Cantidad recibida</span><span class="v">${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(v.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Estado</span><span class="v">${ventaEstado(v)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(v.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="vd-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="vd-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="vd-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="vd-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('vd-duplicar').onclick = ()=> duplicarVenta(v.id, opts.alCrear || onChange);
  document.getElementById('vd-edit').onclick = ()=>{
    closeModal();
    openVentaEditModal(v.id, onChange);
  };
  document.getElementById('vd-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('vd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar la venta de ${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)} → ${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}?`, ()=> eliminarConDeshacer('Venta eliminada', ()=>{
      adjustBalance(v.divisa_vendida, v.cantidad_vendida);
      if(v.registra_deuda){
        const deudaAsociada = DB.deudas.find(d=>d.origen==='venta' && d.origen_id===v.id);
        if(deudaAsociada){
          if(deudaAsociada.estado==='cobrado') adjustBalance(deudaAsociada.divisa, -deudaAsociada.monto);
          DB.deudas = DB.deudas.filter(x=>x.id!==deudaAsociada.id);
        }
      } else {
        adjustBalance(v.divisa_recibida, -v.cantidad_recibida);
      }
      DB.ventas = DB.ventas.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarVenta(id, onSaved){
  const v = DB.ventas.find(x=>x.id===id);
  if(!v){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openVentaForm(onSaved, copiaParaDuplicar(v));
}

function openVentaEditModal(id, onSaved){
  const v = DB.ventas.find(x=>x.id===id);
  if(!v){ toast('Venta no encontrada'); return; }
  openModal(`
    <div class="modal-title">Editar venta</div>
    <label class="field-label">Cantidad vendida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ve-cvendida" value="${v.cantidad_vendida}">
    <label class="field-label">Divisa vendida *</label>
    <select id="ve-dvendida" class="picker">${divisaOptionsHtml(v.divisa_vendida)}</select>
    <label class="field-label">Cantidad recibida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ve-crecibida" value="${v.cantidad_recibida}">
    <label class="field-label">Divisa recibida *</label>
    <select id="ve-drecibida" class="picker">${divisaOptionsHtml(v.divisa_recibida)}</select>
    ${v.registra_deuda ? `<div class="hint">Esta venta tiene una deuda pendiente asociada en Deudas → Me deben. Al guardar, esa deuda se actualizará con los nuevos valores.</div>` : ''}
    <label class="field-label">Fecha y hora de la venta *</label>
    <input type="datetime-local" id="ve-fecha" value="${toLocalDatetimeValue(v.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ve-nota" maxlength="500" placeholder="Opcional">${escapeHtml(v.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ve-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ve-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ve-dvendida'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('ve-drecibida'), addDivisa, divisaOptionsHtml);
  document.getElementById('ve-cancel').onclick = closeModal;
  document.getElementById('ve-save').onclick = ()=>{
    const cantidad_vendida = parseFloat(document.getElementById('ve-cvendida').value);
    const divisa_vendida = document.getElementById('ve-dvendida').value;
    const cantidad_recibida = parseFloat(document.getElementById('ve-crecibida').value);
    const divisa_recibida = document.getElementById('ve-drecibida').value;
    const fechaVal = document.getElementById('ve-fecha').value;
    const nota = document.getElementById('ve-nota').value.trim();
    if(!cantidad_vendida || !divisa_vendida || divisa_vendida==='__add__' || !cantidad_recibida || !divisa_recibida || divisa_recibida==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const nuevo = {cantidad_vendida, divisa_vendida, cantidad_recibida, divisa_recibida, fecha_hora:new Date(fechaVal).getTime(), nota};
    confirmDialog('¿Guardar los cambios de esta venta? Se ajustará el balance general y la deuda asociada, si existe.', ()=>{
      guardarEdicionVenta(v, nuevo);
      toast('Venta actualizada');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

function guardarEdicionVenta(v, nuevo){
  const deudaExistente = v.registra_deuda ? DB.deudas.find(d=>d.origen==='venta' && d.origen_id===v.id) : null;

  adjustBalance(v.divisa_vendida, v.cantidad_vendida);
  if(v.registra_deuda){
    if(deudaExistente && deudaExistente.estado==='cobrado'){
      adjustBalance(deudaExistente.divisa, -deudaExistente.monto);
    }
  } else {
    adjustBalance(v.divisa_recibida, -v.cantidad_recibida);
  }

  v.cantidad_vendida = nuevo.cantidad_vendida;
  v.divisa_vendida = nuevo.divisa_vendida;
  v.cantidad_recibida = nuevo.cantidad_recibida;
  v.divisa_recibida = nuevo.divisa_recibida;
  v.fecha_hora = nuevo.fecha_hora;
  v.nota = nuevo.nota;

  adjustBalance(v.divisa_vendida, -v.cantidad_vendida);
  if(v.registra_deuda){
    if(deudaExistente){
      deudaExistente.monto = v.cantidad_recibida;
      deudaExistente.divisa = v.divisa_recibida;
      deudaExistente.persona = `Venta de ${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida}`;
      deudaExistente.fecha = v.fecha_hora;
      deudaExistente.nota = v.nota || 'Registrado desde venta';
      if(deudaExistente.estado==='cobrado'){
        adjustBalance(deudaExistente.divisa, deudaExistente.monto);
      }
    }
  } else {
    adjustBalance(v.divisa_recibida, v.cantidad_recibida);
  }

  save();
}

/* ---------------------------------------------------------------------- *
 * 14b. MENÚ 6 — COMPRAS
 * ---------------------------------------------------------------------- */
function renderComprasList(content){
  renderListadoPaginado(content, {
    clave:'compras', prefijo:'c', titulo:'Compras', textoNuevo:'➕ Nueva compra',
    rowHtml: compraRowHtml, vacioIcono:'🛒', vacioTexto:'Aún no hay compras registradas',
    abrirFormulario: (onSaved)=>openCompraForm(onSaved),
    abrirDetalle: openCompraDetalle, abrirEdicion: openCompraEditModal,
  });
}
function compraRowHtml(c){
  return `
    <div class="list-item" data-id="${c.id}">
      <div class="avatar">🛒</div>
      <div class="li-main">
        <div class="li-title">${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)} → ${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}</div>
        <div class="li-sub">${fmtDate(c.fecha_hora)} ${c.registra_deuda?'· Pago pendiente':''}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${c.id}" aria-label="Editar compra">✏️</button>
    </div>`;
}
function openCompraForm(onSaved, prefill){
  openModal(`
    <div class="modal-title">Registrar compra</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Cantidad comprada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="cf-ccomprada" placeholder="0.00">
    <label class="field-label">Divisa comprada *</label>
    <select id="cf-dcomprada" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Cantidad pagada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="cf-cpagada" placeholder="0.00">
    <label class="field-label">Divisa pagada *</label>
    <select id="cf-dpagada" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Registrar cantidad pagada como deuda pendiente</label>
    <div class="pill-row" id="cf-switch">
      <div class="pill active" data-v="0">No</div>
      <div class="pill" data-v="1">Sí</div>
    </div>
    <div class="hint">Si activa esta opción, la cantidad pagada NO se resta ahora del balance — se crea un registro pendiente en Deudas → Pagar a.</div>
    <label class="field-label">Fecha y hora de la compra *</label>
    <input type="datetime-local" id="cf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="cf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="cf-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos(
      {'cf-ccomprada':prefill.cantidad_comprada, 'cf-dcomprada':prefill.divisa_comprada, 'cf-cpagada':prefill.cantidad_pagada, 'cf-dpagada':prefill.divisa_pagada, 'cf-nota':prefill.nota||''},
      {'cf-switch': prefill.registra_deuda ? 1 : 0});
  }
  bindAddOnSelect(document.getElementById('cf-dcomprada'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('cf-dpagada'), addDivisa, divisaOptionsHtml);
  let registraDeuda = prefill && prefill.registra_deuda ? 1 : 0;
  document.querySelectorAll('#cf-switch .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#cf-switch .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      registraDeuda = Number(p.dataset.v);
    };
  });
  document.getElementById('cf-cancel').onclick = closeModal;
  document.getElementById('cf-save').onclick = ()=>{
    const cantidad_comprada = parseFloat(document.getElementById('cf-ccomprada').value);
    const divisa_comprada = document.getElementById('cf-dcomprada').value;
    const cantidad_pagada = parseFloat(document.getElementById('cf-cpagada').value);
    const divisa_pagada = document.getElementById('cf-dpagada').value;
    const fechaVal = document.getElementById('cf-fecha').value;
    const nota = document.getElementById('cf-nota').value.trim();
    if(!cantidad_comprada || !divisa_comprada || divisa_comprada==='__add__' || !cantidad_pagada || !divisa_pagada || divisa_pagada==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const fecha_hora = new Date(fechaVal).getTime();
    const compra = {id:nextId('compras'), cantidad_comprada, divisa_comprada, cantidad_pagada, divisa_pagada, nota, fecha_hora, registra_deuda:registraDeuda};
    DB.compras.push(compra);
    adjustBalance(divisa_comprada, cantidad_comprada);
    if(registraDeuda){
      crearDeudaAutomatica({
        tipo:'pagar_a', persona:`Compra pendiente #${compra.id}`, monto:cantidad_pagada,
        divisa:divisa_pagada, fecha:fecha_hora, nota: nota || 'Registrado desde compra',
        origen:'compra', origen_id:compra.id
      });
    } else {
      adjustBalance(divisa_pagada, -cantidad_pagada);
    }
    save(); closeModal(); toast('Compra guardada');
    onSaved && onSaved();
  };
}
function openCompraDetalle(id, onChange, opts={}){
  const c = DB.compras.find(x=>x.id===id);
  if(!c) return;
  openModal(`
    <div class="modal-title">Detalle de compra</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Cantidad comprada</span><span class="v">${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(c.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Pago pendiente</span><span class="v">${c.registra_deuda?'Sí — ver en Deudas':'No'}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(c.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cd2-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="cd2-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="cd2-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="cd2-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('cd2-duplicar').onclick = ()=> duplicarCompra(c.id, opts.alCrear || onChange);
  document.getElementById('cd2-edit').onclick = ()=>{
    closeModal();
    openCompraEditModal(c.id, onChange);
  };
  document.getElementById('cd2-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('cd2-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar la compra de ${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)} → ${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}?`, ()=> eliminarConDeshacer('Compra eliminada', ()=>{
      adjustBalance(c.divisa_comprada, -c.cantidad_comprada);
      if(c.registra_deuda){
        const deudaAsociada = DB.deudas.find(d=>d.origen==='compra' && d.origen_id===c.id);
        if(deudaAsociada){
          if(deudaAsociada.estado==='pagado') adjustBalance(deudaAsociada.divisa, deudaAsociada.monto);
          DB.deudas = DB.deudas.filter(x=>x.id!==deudaAsociada.id);
        }
      } else {
        adjustBalance(c.divisa_pagada, c.cantidad_pagada);
      }
      DB.compras = DB.compras.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarCompra(id, onSaved){
  const c = DB.compras.find(x=>x.id===id);
  if(!c){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openCompraForm(onSaved, copiaParaDuplicar(c));
}

function openCompraEditModal(id, onSaved){
  const c = DB.compras.find(x=>x.id===id);
  if(!c){ toast('Compra no encontrada'); return; }
  openModal(`
    <div class="modal-title">Editar compra</div>
    <label class="field-label">Cantidad comprada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ce-ccomprada" value="${c.cantidad_comprada}">
    <label class="field-label">Divisa comprada *</label>
    <select id="ce-dcomprada" class="picker">${divisaOptionsHtml(c.divisa_comprada)}</select>
    <label class="field-label">Cantidad pagada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ce-cpagada" value="${c.cantidad_pagada}">
    <label class="field-label">Divisa pagada *</label>
    <select id="ce-dpagada" class="picker">${divisaOptionsHtml(c.divisa_pagada)}</select>
    ${c.registra_deuda ? `<div class="hint">Esta compra tiene un pago pendiente asociado en Deudas → Pagar a. Al guardar, esa deuda se actualizará con los nuevos valores.</div>` : ''}
    <label class="field-label">Fecha y hora de la compra *</label>
    <input type="datetime-local" id="ce-fecha" value="${toLocalDatetimeValue(c.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ce-nota" maxlength="500" placeholder="Opcional">${escapeHtml(c.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ce-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ce-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ce-dcomprada'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('ce-dpagada'), addDivisa, divisaOptionsHtml);
  document.getElementById('ce-cancel').onclick = closeModal;
  document.getElementById('ce-save').onclick = ()=>{
    const cantidad_comprada = parseFloat(document.getElementById('ce-ccomprada').value);
    const divisa_comprada = document.getElementById('ce-dcomprada').value;
    const cantidad_pagada = parseFloat(document.getElementById('ce-cpagada').value);
    const divisa_pagada = document.getElementById('ce-dpagada').value;
    const fechaVal = document.getElementById('ce-fecha').value;
    const nota = document.getElementById('ce-nota').value.trim();
    if(!cantidad_comprada || !divisa_comprada || divisa_comprada==='__add__' || !cantidad_pagada || !divisa_pagada || divisa_pagada==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const nuevo = {cantidad_comprada, divisa_comprada, cantidad_pagada, divisa_pagada, fecha_hora:new Date(fechaVal).getTime(), nota};
    confirmDialog('¿Guardar los cambios de esta compra? Se ajustará el balance general y la deuda asociada, si existe.', ()=>{
      guardarEdicionCompra(c, nuevo);
      toast('Compra actualizada');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

function guardarEdicionCompra(c, nuevo){
  const deudaExistente = c.registra_deuda ? DB.deudas.find(d=>d.origen==='compra' && d.origen_id===c.id) : null;

  adjustBalance(c.divisa_comprada, -c.cantidad_comprada);
  if(c.registra_deuda){
    if(deudaExistente && deudaExistente.estado==='pagado'){
      adjustBalance(deudaExistente.divisa, deudaExistente.monto);
    }
  } else {
    adjustBalance(c.divisa_pagada, c.cantidad_pagada);
  }

  c.cantidad_comprada = nuevo.cantidad_comprada;
  c.divisa_comprada = nuevo.divisa_comprada;
  c.cantidad_pagada = nuevo.cantidad_pagada;
  c.divisa_pagada = nuevo.divisa_pagada;
  c.fecha_hora = nuevo.fecha_hora;
  c.nota = nuevo.nota;

  adjustBalance(c.divisa_comprada, c.cantidad_comprada);
  if(c.registra_deuda){
    if(deudaExistente){
      deudaExistente.monto = c.cantidad_pagada;
      deudaExistente.divisa = c.divisa_pagada;
      deudaExistente.persona = `Compra pendiente #${c.id}`;
      deudaExistente.fecha = c.fecha_hora;
      deudaExistente.nota = c.nota || 'Registrado desde compra';
      if(deudaExistente.estado==='pagado'){
        adjustBalance(deudaExistente.divisa, -deudaExistente.monto);
      }
    }
  } else {
    adjustBalance(c.divisa_pagada, -c.cantidad_pagada);
  }

  save();
}

/* ---------------------------------------------------------------------- *
 * 15. MENÚ 8 — GASTOS
 * ---------------------------------------------------------------------- */
function renderGastosList(content){
  renderListadoPaginado(content, {
    clave:'gastos', prefijo:'g', titulo:'Gastos', textoNuevo:'➕ Nuevo gasto',
    rowHtml: gastoRowHtml, vacioIcono:'🧾', vacioTexto:'Aún no hay gastos registrados',
    abrirFormulario: (onSaved)=>openGastoForm(onSaved),
    abrirDetalle: openGastoDetalle, abrirEdicion: openGastoEditModal,
  });
}
function gastoRowHtml(g){
  return `
    <div class="list-item" data-id="${g.id}">
      <div class="avatar">🧾</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(g.concepto)}</div>
        <div class="li-sub">${fmtDate(g.fecha_hora)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount neg">-${fmtMoney(g.cantidad)}</div>
        <div class="li-sub">${escapeHtml(g.divisa)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${g.id}" aria-label="Editar gasto">✏️</button>
    </div>`;
}
function toLocalDatetimeValue(ts){
  const d = new Date(ts);
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function openGastoForm(onSaved, prefill){
  openModal(`
    <div class="modal-title">Registrar gasto</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Concepto o motivo *</label>
    <input type="text" id="gf-concepto" maxlength="200" placeholder="Ej: Alquiler">
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="gf-cantidad" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="gf-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha y hora *</label>
    <input type="datetime-local" id="gf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <label class="field-label">Nota</label>
    <textarea id="gf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="gf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="gf-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos({'gf-concepto':prefill.concepto, 'gf-cantidad':prefill.cantidad, 'gf-divisa':prefill.divisa, 'gf-nota':prefill.nota||''});
  }
  bindAddOnSelect(document.getElementById('gf-divisa'), addDivisa, divisaOptionsHtml);
  document.getElementById('gf-cancel').onclick = closeModal;
  document.getElementById('gf-save').onclick = ()=>{
    const concepto = document.getElementById('gf-concepto').value.trim();
    const cantidad = parseFloat(document.getElementById('gf-cantidad').value);
    const divisa = document.getElementById('gf-divisa').value;
    const fechaVal = document.getElementById('gf-fecha').value;
    const nota = document.getElementById('gf-nota').value.trim();
    if(!concepto || !cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const gasto = {id:nextId('gastos'), concepto, cantidad, divisa, nota, fecha_hora:new Date(fechaVal).getTime()};
    DB.gastos.push(gasto);
    applyGastoBalance(gasto, 1);
    save(); closeModal(); toast('Gasto guardado');
    onSaved && onSaved();
  };
}
function openGastoDetalle(id, onChange, opts={}){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g) return;
  openModal(`
    <div class="modal-title">Detalle de gasto</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Concepto</span><span class="v">${escapeHtml(g.concepto)}</span></div>
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(g.cantidad)} ${escapeHtml(g.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(g.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(g.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="gd-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="gd-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="gd-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="gd-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('gd-duplicar').onclick = ()=> duplicarGasto(g.id, opts.alCrear || onChange);
  document.getElementById('gd-edit').onclick = ()=>{
    closeModal();
    openGastoEditModal(g.id, onChange);
  };
  document.getElementById('gd-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('gd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar el gasto "${escapeHtml(g.concepto)}" por ${fmtMoney(g.cantidad)} ${escapeHtml(g.divisa)}?`, ()=> eliminarConDeshacer('Gasto eliminado', ()=>{
      applyGastoBalance(g, -1);
      DB.gastos = DB.gastos.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarGasto(id, onSaved){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openGastoForm(onSaved, copiaParaDuplicar(g));
}

function openGastoEditModal(id, onSaved){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g){ toast('Gasto no encontrado'); return; }
  openModal(`
    <div class="modal-title">Editar gasto</div>
    <label class="field-label">Concepto o motivo *</label>
    <input type="text" id="ge-concepto" maxlength="200" value="${escapeHtml(g.concepto)}">
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ge-cantidad" value="${g.cantidad}">
    <label class="field-label">Divisa *</label>
    <select id="ge-divisa" class="picker">${divisaOptionsHtml(g.divisa)}</select>
    <label class="field-label">Fecha y hora *</label>
    <input type="datetime-local" id="ge-fecha" value="${toLocalDatetimeValue(g.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ge-nota" maxlength="500" placeholder="Opcional">${escapeHtml(g.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ge-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ge-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ge-divisa'), addDivisa, divisaOptionsHtml);
  document.getElementById('ge-cancel').onclick = closeModal;
  document.getElementById('ge-save').onclick = ()=>{
    const concepto = document.getElementById('ge-concepto').value.trim();
    const cantidad = parseFloat(document.getElementById('ge-cantidad').value);
    const divisa = document.getElementById('ge-divisa').value;
    const fechaVal = document.getElementById('ge-fecha').value;
    const nota = document.getElementById('ge-nota').value.trim();
    if(!concepto || !cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    confirmDialog('¿Guardar los cambios de este gasto? Se ajustará el balance general.', ()=>{
      applyGastoBalance(g, -1);
      g.concepto = concepto; g.cantidad = cantidad; g.divisa = divisa;
      g.fecha_hora = new Date(fechaVal).getTime(); g.nota = nota;
      applyGastoBalance(g, 1);
      save(); toast('Gasto actualizado');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

/* ---------------------------------------------------------------------- *
 * 15b. MENÚ 9 — IN/OUT
 * ---------------------------------------------------------------------- */
function renderInOut(content){
  renderListadoPaginado(content, {
    clave:'in_out', prefijo:'io', titulo:'In/Out', textoNuevo:'➕ Registrar movimiento',
    intro:`<div class="subtle" style="margin-bottom:12px;">Entradas y salidas manuales de divisas, sin asociarlas a un envío, compra, venta o gasto.</div>`,
    rowHtml: inOutRowHtml, vacioIcono:'🔄', vacioTexto:'Aún no hay movimientos registrados',
    abrirFormulario: (onSaved)=>openInOutForm(onSaved),
    abrirDetalle: openInOutDetalle, abrirEdicion: openInOutEditModal,
  });
}
function inOutRowHtml(io){
  const esEntrada = io.tipo==='entrada';
  return `
    <div class="list-item" data-id="${io.id}">
      <div class="avatar">${esEntrada?'📥':'📤'}</div>
      <div class="li-main">
        <div class="li-title">${esEntrada?'Entrada':'Salida'} · ${escapeHtml(io.nota || 'Sin nota')}</div>
        <div class="li-sub">${fmtDate(io.fecha_hora)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${esEntrada?'':'neg'}">${esEntrada?'+':'-'}${fmtMoney(io.cantidad)}</div>
        <div class="li-sub">${escapeHtml(io.divisa)}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${io.id}" aria-label="Editar movimiento">✏️</button>
    </div>`;
}
function openInOutForm(onSaved, prefill){
  openModal(`
    <div class="modal-title">Registrar In/Out</div>
    ${prefill ? avisoDuplicadoHtml() : ''}
    <label class="field-label">Tipo de movimiento *</label>
    <div class="pill-row" id="io-tipo">
      <div class="pill active" data-v="entrada">📥 Entrada</div>
      <div class="pill" data-v="salida">📤 Salida</div>
    </div>
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="io-cantidad" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="io-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha y hora del ajuste *</label>
    <input type="datetime-local" id="io-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="io-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="io-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="io-save">Guardar</button>
    </div>
  `);
  if(prefill){
    precargarFormularioConDatos({'io-cantidad':prefill.cantidad, 'io-divisa':prefill.divisa, 'io-nota':prefill.nota||''}, {'io-tipo':prefill.tipo});
  }
  bindAddOnSelect(document.getElementById('io-divisa'), addDivisa, divisaOptionsHtml);
  let tipo = prefill && prefill.tipo==='salida' ? 'salida' : 'entrada';
  document.querySelectorAll('#io-tipo .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#io-tipo .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      tipo = p.dataset.v;
    };
  });
  document.getElementById('io-cancel').onclick = closeModal;
  document.getElementById('io-save').onclick = ()=>{
    const cantidad = parseFloat(document.getElementById('io-cantidad').value);
    const divisa = document.getElementById('io-divisa').value;
    const fechaVal = document.getElementById('io-fecha').value;
    const nota = document.getElementById('io-nota').value.trim();
    if(!cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const io = {id:nextId('in_out'), tipo, cantidad, divisa, nota, fecha_hora:new Date(fechaVal).getTime()};
    DB.in_out.push(io);
    adjustBalance(divisa, tipo==='entrada' ? cantidad : -cantidad);
    save(); closeModal(); toast('Movimiento guardado');
    onSaved && onSaved();
  };
}
function openInOutDetalle(id, onChange, opts={}){
  const io = DB.in_out.find(x=>x.id===id);
  if(!io) return;
  const esEntrada = io.tipo==='entrada';
  openModal(`
    <div class="modal-title">Detalle de movimiento</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;">
      <div class="sumrow"><span class="k">Tipo</span><span class="v">${esEntrada?'📥 Entrada':'📤 Salida'}</span></div>
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(io.cantidad)} ${escapeHtml(io.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(io.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(io.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="iod-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="iod-del">Eliminar</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="iod-edit">✏️ Editar</button>
      <button class="btn btn-primary btn-block" id="iod-duplicar">📋 Duplicar</button>
    </div>
  `);
  document.getElementById('iod-duplicar').onclick = ()=> duplicarInOut(io.id, opts.alCrear || onChange);
  document.getElementById('iod-edit').onclick = ()=>{
    closeModal();
    openInOutEditModal(io.id, onChange);
  };
  document.getElementById('iod-close').onclick = volverDesdeDetalleMovimiento;
  document.getElementById('iod-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar el movimiento ${io.tipo==='entrada'?'📥 Entrada':'📤 Salida'} de ${fmtMoney(io.cantidad)} ${escapeHtml(io.divisa)}${io.nota ? ' ('+escapeHtml(io.nota)+')' : ''}?`, ()=> eliminarConDeshacer('Movimiento eliminado', ()=>{
      adjustBalance(io.divisa, esEntrada ? -io.cantidad : io.cantidad);
      DB.in_out = DB.in_out.filter(x=>x.id!==id);
      save(); onChange && onChange();
    }));
  };
}

function duplicarInOut(id, onSaved){
  const io = DB.in_out.find(x=>x.id===id);
  if(!io){ closeModal(); alertDialog('No se pudo duplicar', 'No se pudo duplicar porque el registro original ya no existe.'); return; }
  closeModal();
  openInOutForm(onSaved, copiaParaDuplicar(io));
}

function openInOutEditModal(id, onSaved){
  const io = DB.in_out.find(x=>x.id===id);
  if(!io){ toast('Movimiento no encontrado'); return; }
  openModal(`
    <div class="modal-title">Editar movimiento</div>
    <label class="field-label">Tipo de movimiento *</label>
    <div class="pill-row" id="ioe-tipo">
      <div class="pill ${io.tipo==='entrada'?'active':''}" data-v="entrada">📥 Entrada</div>
      <div class="pill ${io.tipo==='salida'?'active':''}" data-v="salida">📤 Salida</div>
    </div>
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ioe-cantidad" value="${io.cantidad}">
    <label class="field-label">Divisa *</label>
    <select id="ioe-divisa" class="picker">${divisaOptionsHtml(io.divisa)}</select>
    <label class="field-label">Fecha y hora del ajuste *</label>
    <input type="datetime-local" id="ioe-fecha" value="${toLocalDatetimeValue(io.fecha_hora)}">
    <label class="field-label">Nota</label>
    <textarea id="ioe-nota" maxlength="500" placeholder="Opcional">${escapeHtml(io.nota||'')}</textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ioe-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ioe-save">Guardar cambios</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ioe-divisa'), addDivisa, divisaOptionsHtml);
  let tipo = io.tipo;
  document.querySelectorAll('#ioe-tipo .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#ioe-tipo .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      tipo = p.dataset.v;
    };
  });
  document.getElementById('ioe-cancel').onclick = closeModal;
  document.getElementById('ioe-save').onclick = ()=>{
    const cantidad = parseFloat(document.getElementById('ioe-cantidad').value);
    const divisa = document.getElementById('ioe-divisa').value;
    const fechaVal = document.getElementById('ioe-fecha').value;
    const nota = document.getElementById('ioe-nota').value.trim();
    if(!cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    confirmDialog('¿Guardar los cambios de este movimiento? Se ajustará el balance general.', ()=>{
      adjustBalance(io.divisa, io.tipo==='entrada' ? -io.cantidad : io.cantidad);
      io.tipo = tipo; io.cantidad = cantidad; io.divisa = divisa;
      io.fecha_hora = new Date(fechaVal).getTime(); io.nota = nota;
      adjustBalance(io.divisa, io.tipo==='entrada' ? io.cantidad : -io.cantidad);
      save(); toast('Movimiento actualizado');
      onSaved && onSaved();
    }, {okLabel:'Guardar', cancelLabel:'Cancelar', danger:false});
  };
}

/* ---------------------------------------------------------------------- *
 * 16. MENÚ 10 — BALANCE
 * ---------------------------------------------------------------------- */
let balancePeriod = 'Hoy';
let balanceCustomDesde = null, balanceCustomHasta = null;

function periodStart(period){
  if(period==='Hoy') return todayRangeStart();
  if(period==='Semanal') return startOfWeek();
  if(period==='Mensual') return startOfMonth();
  if(period==='Anual') return startOfYear();
  if(period==='Personalizado') return balanceCustomDesde;
  return null;
}
function periodEnd(period){
  if(period==='Personalizado') return balanceCustomHasta;
  return null;
}

function computeFilteredBalance(period){
  const start = periodStart(period);
  const end = periodEnd(period);
  const totals = {};

  function inRange(ts){
    if(ts === null || ts === undefined) return false;
    if(start !== null && start !== undefined && ts < start) return false;
    if(end !== null && end !== undefined && ts > end) return false;
    return true;
  }

  function add(divisa, monto){
    if(!divisa) return;
    totals[divisa] = round2((totals[divisa] || 0) + Number(monto || 0));
  }

     // ENVÍOS
  DB.envios.filter(e => inRange(e.fecha_hora)).forEach(e => {
    const entrega = Number(e.cantidad_pagada || 0);
    const ganancia = Number(e.ganancia || 0);
    const mismaDivisa = mismasDivisas(e.divisa_entrega, e.divisa_ganancia);

    if(envioDescuentaAhora(e)){
      // Switch ON: se resta la entrega y se suma la ganancia (o el total
      // si es la misma divisa), igual que en el balance general.
      add(e.divisa_entrega, -entrega);
      if(mismaDivisa){
        add(e.divisa_ganancia, entrega + ganancia);
      } else {
        add(e.divisa_ganancia, ganancia);
      }
    } else {
      // Switch OFF: la ganancia se reconoce ya mismo, igual que en el
      // balance general. La entrega queda pendiente en Deudas.
      add(e.divisa_ganancia, ganancia);
    }
  });

  // VENTAS
  DB.ventas.filter(v => inRange(v.fecha_hora)).forEach(v => {
    add(v.divisa_vendida, -Number(v.cantidad_vendida || 0));
    if(!v.registra_deuda){
      add(v.divisa_recibida, Number(v.cantidad_recibida || 0));
    }
  });

  // COMPRAS
  DB.compras.filter(c => inRange(c.fecha_hora)).forEach(c => {
    add(c.divisa_comprada, Number(c.cantidad_comprada || 0));
    if(!c.registra_deuda){
      add(c.divisa_pagada, -Number(c.cantidad_pagada || 0));
    }
  });

  // GASTOS
  DB.gastos.filter(g => inRange(g.fecha_hora)).forEach(g => {
    add(g.divisa, -Number(g.cantidad || 0));
  });

  // IN/OUT
  DB.in_out.filter(io => inRange(io.fecha_hora)).forEach(io => {
    add(io.divisa, io.tipo === 'entrada' ? Number(io.cantidad || 0) : -Number(io.cantidad || 0));
  });

    // DEUDAS
  // DEUDAS
  DB.deudas.forEach(d => {
    if(d.tipo === 'me_deben'){
      if(meDebenRestaAlCrear(d) && inRange(d.creado_en || d.fecha)){
        add(d.divisa, -Number(d.monto || 0));
      }
      if(meDebenSumaAlCobrar(d) && d.estado === 'cobrado' && inRange(d.fecha_cierre)){
        add(d.divisa, Number(d.monto || 0));
      }
    } else if(d.tipo === 'pagar_a'){
      if(d.origen === 'envio'){
        const envio = DB.envios.find(e => e.id === d.origen_id);
        const mismaDivisaEnvio = envio && mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);
        if(envio && !mismaDivisaEnvio && d.estado === 'pagado' && inRange(d.fecha_cierre)){
          // La ganancia YA fue sumada al registrar el envío. Si la divisa
          // entregada es la misma que la de la ganancia, pagar la deuda
          // no debe volver a tocar el balance filtrado (sería contarlo
          // dos veces). Solo si son divisas distintas hay que restar la
          // entrega aquí, porque esa salida nunca se contó antes.
          add(d.divisa, -Number(d.monto || 0));
        }
      } else {
        const restaAlPagar = d.afecta_balance || d.origen === 'compra';
        if(restaAlPagar && d.estado === 'pagado' && inRange(d.fecha_cierre)){
          add(d.divisa, -Number(d.monto || 0));
        }
      }
    }
  });

  return totals;
} 

function renderBalance(content){
  content.innerHTML = `
    <h1 class="section-title">Balance del negocio</h1>
    <button class="btn btn-gold btn-block" id="b-registrar-envio" style="margin-bottom:16px;">➕ Registrar envío</button>

    <h3 style="font-size:14px;color:var(--heading);margin-bottom:8px;">Balance filtrado</h3>
    <div class="chip-row" id="b-period-chips">
      ${['Hoy','Semanal','Mensual','Anual','Personalizado'].map(p=>`<div class="chip ${balancePeriod===p?'active':''}" data-v="${p}">${p}</div>`).join('')}
    </div>
    <div id="b-custom-range" class="two-col" style="display:${balancePeriod==='Personalizado'?'grid':'none'};margin-bottom:12px;">
      <input type="date" id="b-desde" value="${balanceCustomDesde? fechaLocalISO(balanceCustomDesde):''}">
      <input type="date" id="b-hasta" value="${balanceCustomHasta? fechaLocalISO(balanceCustomHasta):''}">
    </div>
    <div class="bal-grid" id="b-filtered"></div>

    <div class="divider"></div>
    <h3 style="font-size:14px;color:var(--heading);margin-bottom:8px;">Balance general (saldo acumulado)</h3>
    <div class="subtle" style="margin-bottom:10px;">Toca un saldo para editarlo manualmente. Toca el nombre para ver su historial.</div>
    <div class="two-col" style="margin-bottom:12px;">
      <button class="btn btn-outline btn-block" id="b-add-divisa">➕ Agregar divisa</button>
      <button class="btn btn-outline btn-block" id="b-del-divisa">🗑️ Eliminar divisa</button>
    </div>
    <div class="bal-grid" id="b-general"></div>
  `;

  function refreshFiltered(){
    const totals = computeFilteredBalance(balancePeriod);
    const el = document.getElementById('b-filtered');
    const divisasConMovimiento = DB.divisas.filter(d => {
      const v = Number(totals[d.nombre] || 0);
      return v < -0.5 || v > 0.5;
    });
    el.innerHTML = divisasConMovimiento.length
      ? divisasConMovimiento.map(d=>{
          const v = totals[d.nombre] || 0;
          return `<div class="bal-card">
            <div class="name">${escapeHtml(d.nombre)}</div>
            <div class="amt ${v<0?'neg':(v>0?'pos':'')}">
              ${v>0?'+':''}${fmtMoney(v)}
            </div>
          </div>`;
        }).join('')
      : `<div class="empty-state" style="grid-column:1/-1;">
          <div class="ei">📊</div>
          Sin movimientos en este período
        </div>`;
  }

  function refreshGeneral(){
    const el = document.getElementById('b-general');
    el.innerHTML = DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0)).map(d=>`
      <div class="bal-card" data-divisa="${escapeHtml(d.nombre)}">
        <div class="name" data-action="ver">${escapeHtml(d.nombre)}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="amt ${d.saldo<0?'neg':''}" data-action="editar" style="flex:1;">${fmtMoney(d.saldo)}</div>
          <button class="eye-btn" data-action="historial" aria-label="Historial de movimientos">👁️</button>
        </div>
        <div class="bal-edit" data-action="editar">✎ Editar saldo</div>
      </div>`).join('');
    el.querySelectorAll('.bal-card').forEach(card=>{
      const nombre = card.dataset.divisa;
      card.querySelector('[data-action="ver"]').onclick = ()=>{
        historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:nombre};
        location.hash = '#/historial';
      };
      card.querySelectorAll('[data-action="editar"]').forEach(elx=>{
        elx.onclick = ()=>editarSaldoDivisa(nombre, refreshGeneral);
      });
      card.querySelector('[data-action="historial"]').onclick = ()=> openHistorialDivisa(nombre);
    });
  }

  document.getElementById('b-registrar-envio').onclick = ()=>{ location.hash = '#/envio'; };

  document.querySelectorAll('#b-period-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      balancePeriod = c.dataset.v;
      document.querySelectorAll('#b-period-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      document.getElementById('b-custom-range').style.display = balancePeriod==='Personalizado' ? 'grid' : 'none';
      refreshFiltered();
    };
  });
  document.getElementById('b-desde').addEventListener('change', e=>{ balanceCustomDesde = e.target.value? fechaInputAInicioDeDiaLocal(e.target.value):null; refreshFiltered(); });
  document.getElementById('b-hasta').addEventListener('change', e=>{ balanceCustomHasta = e.target.value? fechaInputAFinDeDiaLocal(e.target.value):null; refreshFiltered(); });

  document.getElementById('b-add-divisa').onclick = ()=>{
    promptText('Nueva divisa', (val)=>{
      if(!val) return;
      addDivisa(val);
      toast('Divisa agregada');
      refreshGeneral(); refreshFiltered();
    });
  };
  document.getElementById('b-del-divisa').onclick = ()=> openEliminarDivisaModal(()=>{ refreshGeneral(); refreshFiltered(); });

  refreshFiltered();
  refreshGeneral();
}

function openEliminarDivisaModal(onDone){
  const divisas = DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0));
  openModal(`
    <div class="modal-title">Eliminar divisa</div>
    <div class="subtle" style="margin:8px 0 12px;">Selecciona la divisa que deseas eliminar. Solo se puede eliminar si su saldo es 0.</div>
    <div id="ed-list">${divisas.length ? divisas.map(d=>`
      <div class="list-item" data-nombre="${escapeHtml(d.nombre)}">
        <div class="avatar">💱</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(d.nombre)}</div>
        </div>
        <div class="li-trail">
          <div class="li-amount ${d.saldo<0?'neg':''}">${fmtMoney(d.saldo)}</div>
        </div>
      </div>`).join('') : emptyState('💱','No hay divisas registradas')}</div>
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="ed-cancel">Cancelar</button></div>
  `);
  document.getElementById('ed-cancel').onclick = closeModal;
  document.querySelectorAll('#ed-list .list-item').forEach(li=>{
    li.onclick = ()=>{
      const nombre = li.dataset.nombre;
      const d = findDivisa(nombre);
      closeModal();
      if(!d) return;
      if(round2(d.saldo) !== 0){
        alertDialog('No se puede eliminar', `No se puede eliminar la divisa ${escapeHtml(nombre)} porque tiene un saldo de ${fmtMoney(d.saldo)}. Para eliminarla, primero debe ajustar el saldo a cero (ej: usando In/Out o editando manualmente el saldo).`);
        return;
      }
      const activos = contarRegistrosActivosDeDivisa(nombre);
      if(activos > 0){
        alertDialog('No se puede eliminar', `Esta divisa tiene ${activos} registro${activos===1?'':'s'} activo${activos===1?'':'s'} asociado${activos===1?'':'s'}. Archívelos primero si desea eliminarla.`);
        return;
      }
      const archivados = contarRegistrosArchivadosDeDivisa(nombre);
      if(archivados > 0){
        const esSingular = archivados===1;
        confirmDialog(
          `Esta divisa tiene ${archivados} registro${esSingular?'':'s'} archivado${esSingular?'':'s'} asociado${esSingular?'':'s'}. Al eliminarla, ${esSingular?'ese registro también se eliminará':'esos registros también se eliminarán'} permanentemente del historial. Los saldos de las demás divisas no se modificarán. ¿Continuar?`,
          ()=>{
            eliminarDivisaYArchivadosAsociados(nombre);
            toast(`Divisa eliminada junto con ${archivados} registro${esSingular?'':'s'} archivado${esSingular?'':'s'}`);
            onDone && onDone();
          },
          {okLabel:'Eliminar', cancelLabel:'Cancelar', danger:true}
        );
        return;
      }
      confirmDialog(`¿Estás seguro de que deseas eliminar la divisa ${escapeHtml(nombre)}? Esta acción no se puede deshacer.`, ()=>{
        DB.divisas = DB.divisas.filter(x=>x.nombre!==nombre);
        save(); toast('Divisa eliminada'); onDone && onDone();
      }, {okLabel:'Aceptar', cancelLabel:'Cancelar'});
    };
  });
}

function movimientosDeDivisa(nombre){
  const mov = [];
  
  // =====================================================
  // ENVÍOS
  // =====================================================
  DB.envios.forEach(e=>{
    const entrega = Number(e.cantidad_pagada||0);
    const ganancia = Number(e.ganancia||0);
    const mismaDivisa = mismasDivisas(e.divisa_entrega, e.divisa_ganancia);
    
    if(envioDescuentaAhora(e)){
      // SWITCH ON: descuento inmediato
      if(e.divisa_entrega === nombre){
        mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:-entrega, origen:'envio', origenId:e.id});
      }
      if(mismaDivisa && e.divisa_ganancia === nombre){
        mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:entrega + ganancia, origen:'envio', origenId:e.id});
      } else if(e.divisa_ganancia === nombre){
        mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:ganancia, origen:'envio', origenId:e.id});
      }
    } else if(e.divisa_ganancia === nombre){
      // SWITCH OFF: la ganancia entra inmediatamente
      mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:ganancia, origen:'envio', origenId:e.id});
    }
  });

  // =====================================================
  // VENTAS
  // =====================================================
  DB.ventas.forEach(v=>{
    if(v.divisa_vendida === nombre){
      mov.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`Venta → ${v.divisa_recibida}`, monto:-(v.cantidad_vendida||0), origen:'venta', origenId:v.id});
    }
    if(v.divisa_recibida === nombre && !v.registra_deuda){
      mov.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`Venta de ${v.divisa_vendida}`, monto:(v.cantidad_recibida||0), origen:'venta', origenId:v.id});
    }
  });

  // =====================================================
  // COMPRAS
  // =====================================================
  DB.compras.forEach(c=>{
    if(c.divisa_comprada === nombre){
      mov.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`Compra de ${c.divisa_pagada}`, monto:(c.cantidad_comprada||0), origen:'compra', origenId:c.id});
    }
    if(c.divisa_pagada === nombre && !c.registra_deuda){
      mov.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`Pago de compra`, monto:-(c.cantidad_pagada||0), origen:'compra', origenId:c.id});
    }
  });

  // =====================================================
  // GASTOS
  // =====================================================
  DB.gastos.forEach(g=>{
    if(g.divisa === nombre){
      mov.push({fecha:g.fecha_hora, tipo:'Gasto', concepto:g.concepto, monto:-(g.cantidad||0), origen:'gasto', origenId:g.id});
    }
  });

  // =====================================================
  // IN/OUT
  // =====================================================
  DB.in_out.forEach(io=>{
    if(io.divisa === nombre){
      mov.push({
        fecha:io.fecha_hora,
        tipo:'In/Out',
        concepto: io.nota || (io.tipo==='entrada' ? 'Entrada manual' : 'Salida manual'),
        monto: io.tipo==='entrada' ? (io.cantidad||0) : -(io.cantidad||0),
        origen:'in_out',
        origenId:io.id
      });
    }
  });

  // =====================================================
  // DEUDAS
  // =====================================================
  DB.deudas.forEach(d=>{
    // ------------------------------------------------
    // ME DEBEN
    // ------------------------------------------------
    if(d.tipo === 'me_deben'){
      if(d.divisa !== nombre) return;
      if(meDebenRestaAlCrear(d)){
        mov.push({fecha:d.creado_en||d.fecha, tipo:'Préstamo', concepto:`Préstamo a ${d.persona}`, monto:-(d.monto||0), origen:'deuda', origenId:d.id});
        if(d.estado === 'cobrado' && d.fecha_cierre){
          mov.push({fecha:d.fecha_cierre, tipo:'Préstamo', concepto:`Cobro de ${d.persona}`, monto:(d.monto||0), origen:'deuda', origenId:d.id});
        }
      } else if(meDebenSumaAlCobrar(d) && d.estado === 'cobrado' && d.fecha_cierre){
        const tipoMov = d.origen === 'venta' ? 'Venta cobrada' : 'Sumar al cobrar';
        mov.push({fecha:d.fecha_cierre, tipo:tipoMov, concepto:`Cobro de ${d.persona}`, monto:(d.monto||0), origen:'deuda', origenId:d.id});
      }

    // ------------------------------------------------
    // PAGAR A
    // ------------------------------------------------
    } else if(d.tipo === 'pagar_a'){
      
      // ------------------------------------------------------------
      // DEUDA ORIGINADA POR UN ENVÍO (SWITCH OFF)
      // ------------------------------------------------------------
      if(d.origen === 'envio'){
        // La ganancia de este envío ya aparece como movimiento en la
        // sección ENVÍOS de arriba (se reconoce al registrarlo). Pagar
        // la deuda solo genera un movimiento adicional si la divisa
        // entregada es DISTINTA de la divisa de la ganancia (porque
        // entonces esa salida de dinero nunca se había registrado). Si
        // es la misma divisa, pagar la deuda no mueve el balance y no
        // se agrega ningún movimiento extra aquí (evita contar la
        // ganancia dos veces).
        const envio = DB.envios.find(e => e.id === d.origen_id);
        const mismaDivisaEnvio = envio && mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);
        if(!mismaDivisaEnvio && d.estado === 'pagado' && d.fecha_cierre && d.divisa === nombre){
          mov.push({
            fecha:d.fecha_cierre,
            tipo:'Envío pagado',
            concepto:`Pago a ${d.persona}`,
            monto:-(d.monto||0),
            origen:'deuda',
            origenId:d.id
          });
        }

      // ------------------------------------------------------------
      // OTRAS DEUDAS DE PAGAR A:
      // ------------------------------------------------------------
      } else {
        if(d.divisa !== nombre) return;
        const restaAlPagar = d.afecta_balance || d.origen === 'compra';
        if(restaAlPagar && d.estado === 'pagado' && d.fecha_cierre){
          const tipoMov = d.origen === 'compra' ? 'Compra pagada' : 'Deuda pagada';
          mov.push({
            fecha:d.fecha_cierre,
            tipo:tipoMov,
            concepto:`Pago a ${d.persona}`,
            monto:-(d.monto||0),
            origen:'deuda',
            origenId:d.id
          });
        }
      }
    }
  });

  // =====================================================
  // ORDENAR Y CALCULAR SALDO ACUMULADO
  // =====================================================
  mov.sort((a,b) => b.fecha - a.fecha);
  const divisaObj = findDivisa(nombre);
  let saldoActual = divisaObj ? divisaObj.saldo : 0;
  mov.forEach(m => {
    m.saldoAcumulado = saldoActual;
    saldoActual = round2(saldoActual - m.monto);
  });
  
  return mov;
}

function volverDesdeDetalleMovimiento(){
  const divisa = retornoHistorialDivisa;
  retornoHistorialDivisa = null;
  closeModal();
  if(divisa) openHistorialDivisa(divisa);
}

function volverDesdeEnvioDetalle(){
  const divisa = retornoHistorialDivisa;
  retornoHistorialDivisa = null;
  if(divisa){
    location.hash = '#/balance';
    currentRouteView = 'balance';
    renderBalance(document.getElementById('app-content'));
    restoreScrollFor('balance');
    openHistorialDivisa(divisa);
  } else {
    history.back();
  }
}

let historialDivisaScrollPorDivisa = {}; // guarda el scroll interno de #hd-list, por nombre de divisa
let historialDivisaFiltro = 'todos'; // (antes era una global implícita sin declarar)

function openHistorialDivisa(nombre){
  historialDivisaFiltro = 'todos';
  const movimientos = movimientosDeDivisa(nombre);
  const scrollAlAbrir = historialDivisaScrollPorDivisa[nombre] || 0;

  openModal(`
    <div class="modal-title">Historial — ${escapeHtml(nombre)}</div>
    <div class="chip-row" id="hd-chips" style="margin-top:10px;">
      <div class="chip active" data-v="todos">📊 Todos</div>
      <div class="chip" data-v="ingresos">📈 Ingresos</div>
      <div class="chip" data-v="egresos">📉 Egresos</div>
    </div>
    <div id="hd-list" style="max-height:55vh;overflow-y:auto;"></div>
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="hd-cerrar">Cerrar</button></div>
  `);

  // Se registra el scroll en tiempo real (no solo al hacer clic en un movimiento),
  // así queda cubierto sin importar cómo se cierre el modal: botón "Cerrar",
  // tocando fuera del modal, o entrando al detalle de un movimiento y volviendo.
  document.getElementById('hd-list').addEventListener('scroll', (e)=>{
    historialDivisaScrollPorDivisa[nombre] = e.target.scrollTop;
  });

  function refresh(){
    const el = document.getElementById('hd-list');
    let items = movimientos;
    if(historialDivisaFiltro==='ingresos') items = movimientos.filter(m=>m.monto>0);
    if(historialDivisaFiltro==='egresos') items = movimientos.filter(m=>m.monto<0);
    el.innerHTML = items.length ? items.map((m,i)=>`
      <div class="card hd-mov-item" data-i="${i}" style="box-shadow:none;border:1px solid var(--line-main);padding:10px 12px;margin-bottom:8px;cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:14px;">${escapeHtml(m.tipo)}</div>
            <div class="subtle">${escapeHtml(m.concepto)}</div>
            <div class="subtle">${fmtDate(m.fecha)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800;font-size:15px;color:${m.monto<0?'var(--red-text)':'var(--green-text)'};">${m.monto<0?'-':'+'}${fmtMoney(Math.abs(m.monto))}</div>
            <div class="subtle">Saldo: ${fmtMoney(m.saldoAcumulado)}</div>
            <div class="subtle" style="margin-top:2px;">Ver detalle ›</div>
          </div>
        </div>
      </div>`).join('') : emptyState('📭','Sin movimientos en esta categoría');
    aplicarZebra(el, items.length);
    el.querySelectorAll('.hd-mov-item').forEach(card=>{
      card.onclick = ()=>{
        const m = items[Number(card.dataset.i)];
        if(m){
          retornoHistorialDivisa = nombre;
          irADetalleOriginal(m.origen, m.origenId);
        }
      };
    });
  }

  document.querySelectorAll('#hd-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      historialDivisaFiltro = c.dataset.v;
      document.querySelectorAll('#hd-chips .chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      refresh();
    };
  });
  document.getElementById('hd-cerrar').onclick = closeModal;
  refresh();
  if(scrollAlAbrir){
    const el = document.getElementById('hd-list');
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ el.scrollTop = scrollAlAbrir; }); });
  }
}

function irADetalleOriginal(origen, origenId){
  const existe = (
    (origen==='envio'  && DB.envios.some(x=>x.id===origenId)) ||
    (origen==='venta'  && DB.ventas.some(x=>x.id===origenId)) ||
    (origen==='compra' && DB.compras.some(x=>x.id===origenId)) ||
    (origen==='gasto'  && DB.gastos.some(x=>x.id===origenId)) ||
    (origen==='in_out' && DB.in_out.some(x=>x.id===origenId)) ||
    (origen==='deuda'  && DB.deudas.some(x=>x.id===origenId))
  );
  if(!existe){
    alertDialog('Registro no encontrado', 'No se pudo encontrar el registro original. Es posible que haya sido eliminado.');
    return;
  }
  closeModal();
  switch(origen){
    case 'envio':  location.hash = `#/envio-detalle/${origenId}`; break;
    case 'venta':  openVentaDetalle(origenId, route); break;
    case 'compra': openCompraDetalle(origenId, route); break;
    case 'gasto':  openGastoDetalle(origenId, route); break;
    case 'in_out': openInOutDetalle(origenId, route); break;
    case 'deuda':  openDeudaDetalle(origenId, route); break;
  }
}

function editarSaldoDivisa(nombre, onDone){
  const d = findDivisa(nombre);
  if(!d) return;
  openModal(`
    <div class="modal-title">Editar saldo — ${escapeHtml(nombre)}</div>
    <label class="field-label">Nuevo saldo</label>
    <input type="number" inputmode="decimal" step="0.01" id="es-valor" value="${d.saldo}">
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="es-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="es-save">Guardar</button>
    </div>
  `, {center:true});
  document.getElementById('es-cancel').onclick = closeModal;
  document.getElementById('es-save').onclick = ()=>{
    const val = parseFloat(document.getElementById('es-valor').value);
    if(isNaN(val)){ toast('Ingrese un valor válido'); return; }
    d.saldo = round2(val);
    save(); closeModal(); toast('Saldo actualizado');
    onDone && onDone();
  };
}

/* ---------------------------------------------------------------------- *
 * 16b. CIFRADO DEL RESPALDO (.rmb) — AES-256-GCM con Web Crypto
 *      Formato: "RMBS" (4 bytes) + versión (1) + sal (16) + IV (12) + datos.
 *      La clave se deriva con PBKDF2 de una frase fija del código, así que
 *      cualquier instalación de la app puede abrir cualquier respaldo sin
 *      pedir contraseña. OJO: protege contra un curioso que abra el
 *      archivo, NO contra alguien que lea el código de la app (es público).
 *      NO CAMBIAR la frase: los respaldos anteriores dejarían de abrirse.
 * ---------------------------------------------------------------------- */
const CLAVE_RESPALDO = 'PeterServices-Remessas-2025-!Secure!';
const RMB_FIRMA = [0x52,0x4D,0x42,0x53]; // "RMBS"
const RMB_VERSION = 1;
const RMB_ITERACIONES = 150000;

async function derivarClaveRespaldo(sal){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(CLAVE_RESPALDO), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:sal, iterations:RMB_ITERACIONES, hash:'SHA-256'},
    base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
function cifradoDisponible(){ return !!(window.crypto && crypto.subtle); }

async function cifrarRespaldo(texto){
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivarClaveRespaldo(sal);
  const datos = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, clave, new TextEncoder().encode(texto)));
  const out = new Uint8Array(4 + 1 + 16 + 12 + datos.length);
  out.set(RMB_FIRMA, 0); out[4] = RMB_VERSION; out.set(sal, 5); out.set(iv, 21); out.set(datos, 33);
  return out;
}

function esRespaldoCifrado(bytes){
  return bytes.length > 33 && RMB_FIRMA.every((b,i)=>bytes[i]===b);
}

async function descifrarRespaldo(bytes){
  if(bytes[4] !== RMB_VERSION) throw new Error('Versión de respaldo no soportada');
  const sal = bytes.slice(5, 21), iv = bytes.slice(21, 33), datos = bytes.slice(33);
  const clave = await derivarClaveRespaldo(sal);
  const plano = await crypto.subtle.decrypt({name:'AES-GCM', iv}, clave, datos);
  return new TextDecoder().decode(plano);
}

// Lee un archivo de respaldo: cifrado (.rmb) o JSON antiguo sin cifrar.
async function leerArchivoRespaldo(file){
  const bytes = new Uint8Array(await file.arrayBuffer());
  if(esRespaldoCifrado(bytes)){
    if(!cifradoDisponible()) throw new Error('Este dispositivo no permite descifrar respaldos.');
    return JSON.parse(await descifrarRespaldo(bytes));
  }
  // Respaldo antiguo: JSON plano (se ignora un posible BOM y espacios iniciales).
  const texto = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
  if(!texto.trimStart().startsWith('{')) throw new Error('Formato desconocido');
  return JSON.parse(texto);
}

function descargarArchivo(bytesOTexto, nombre, tipo){
  const blob = new Blob([bytesOTexto], {type:tipo});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}

/* ---------------------------------------------------------------------- *
 * 17. MENÚ 9 — RESPALDOS
 * ---------------------------------------------------------------------- */
function diasDesde(ts){
  if(!ts) return Infinity;
  return Math.floor((Date.now()-ts)/86400000);
}

function fechaInputAInicioDeDiaLocal(fechaStr){
  const [y,m,d] = fechaStr.split('-').map(Number);
  return new Date(y, m-1, d, 0, 0, 0, 0).getTime();
}
function fechaInputAFinDeDiaLocal(fechaStr){
  // Un <input type="date"> entrega "YYYY-MM-DD". JS interpreta esas cadenas
  // como medianoche UTC (no local), lo que en husos horarios negativos
  // (ej. Cuba/Miami) corre el límite varias horas. Se arma a mano con
  // componentes locales para que "fin del día" sea el fin del día real.
  const [y,m,d] = fechaStr.split('-').map(Number);
  return new Date(y, m-1, d, 23, 59, 59, 999).getTime();
}

function renderRespaldos(content){
  const dias = diasDesde(DB.meta.ultimo_respaldo);
  const mostrarRecordatorio = dias >= 30;

  content.innerHTML = `
    <h1 class="section-title">Respaldos</h1>
    ${mostrarRecordatorio ? `
      <div class="card" style="border:1.5px solid var(--gold);">
        <div style="font-weight:700;margin-bottom:4px;">📦 Recordatorio de respaldo</div>
        <div class="subtle">${DB.meta.ultimo_respaldo ? `Han pasado ${dias} días desde tu último respaldo.` : 'Todavía no has exportado ningún respaldo.'} ¿Deseas exportar uno ahora?</div>
      </div>
    ` : ''}
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Nombre del negocio</div>
      <div class="subtle" style="margin-bottom:10px;">Aparece en el encabezado del reporte ejecutivo.</div>
      <input type="text" id="rp-negocio" value="${escapeHtml(DB.meta.nombre_negocio||'')}" maxlength="100" placeholder="Nombre de tu negocio">
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Exportar datos</div>
      <div class="subtle" style="margin-bottom:14px;">Genera un archivo cifrado (.rmb) con todos los clientes, trabajadores, envíos, ventas, gastos, deudas y divisas (activos e inactivos). No se puede leer abriéndolo con otro programa; se restaura desde aquí, en este o en otro teléfono.</div>
      <button class="btn btn-primary btn-block" id="rp-export">⬇️ Exportar respaldo cifrado (.rmb)</button>
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Reporte ejecutivo</div>
      <div class="subtle" style="margin-bottom:14px;">Balance por divisa, últimos 10 movimientos y totales acumulados, en un archivo Excel.</div>
      <button class="btn btn-gold btn-block" id="rp-excel">📊 Exportar reporte ejecutivo (Excel)</button>
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Importar desde archivo</div>
      <div class="subtle" style="margin-bottom:14px;">Fusiona un respaldo con los datos actuales sin borrar nada.</div>
      <!-- Sin "accept": en Android un tipo desconocido como .rmb podía quedar
           bloqueado en el selector de archivos. El contenido se valida al leerlo. -->
      <input type="file" id="rp-file" style="display:none;">
      <button class="btn btn-outline btn-block" id="rp-import">⬆️ Importar respaldo (cifrado o JSON antiguo)</button>
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Historial</div>
      <div class="subtle" style="margin-bottom:14px;">Archiva registros antiguos para aligerar la vista de los historiales, sin borrar nada ni afectar el balance.</div>
      <button class="btn btn-outline btn-block" id="rp-archivar" style="margin-bottom:10px;">🧹 Archivar historial</button>
      <button class="btn btn-outline btn-block" id="rp-ver-archivados">👁️ Ver historial archivado</button>
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Base de datos</div>
      <div class="subtle">Tamaño actual: <strong>${fmtBytes(tamanioBaseDatosBytes())}</strong> · Almacenamiento: ${dbBackend==='indexeddb'?'IndexedDB':'localStorage (respaldo)'}</div>
    </div>
    <div class="subtle" style="text-align:center;margin-top:10px;">Los datos se guardan localmente en este dispositivo.</div>
  `;

  document.getElementById('rp-negocio').addEventListener('change', e=>{
    DB.meta.nombre_negocio = e.target.value.trim();
    save();
  });
  document.getElementById('rp-excel').onclick = generarReporteEjecutivo;

  document.getElementById('rp-export').onclick = async ()=>{
    if(!cifradoDisponible()){
      alertDialog('No se pudo exportar', 'Este navegador no permite cifrar el respaldo. Abra la app desde la APK o desde su dirección https.');
      return;
    }
    const btn = document.getElementById('rp-export');
    btn.disabled = true;
    try{
      const data = JSON.parse(JSON.stringify(DB));
      data.exportado_en = {timestamp: Date.now(), iso: new Date().toISOString()};
      const cifrado = await cifrarRespaldo(JSON.stringify(data));
      const now = new Date();
      const pad = n=>String(n).padStart(2,'0');
      const name = `respaldo_${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}.rmb`;
      descargarArchivo(cifrado, name, 'application/octet-stream');
      DB.meta.ultimo_respaldo = Date.now();
      save();
      if(currentRouteView==='respaldos') renderRespaldos(content);
      toast('Respaldo cifrado exportado: ' + name);
    }catch(err){
      console.error(err);
      alertDialog('No se pudo exportar', 'Ocurrió un error al cifrar el respaldo.');
      btn.disabled = false;
    }
  };

  document.getElementById('rp-import').onclick = ()=>{
    confirmDialog(
      'Esta operación NO borrará sus datos actuales. Los clientes, trabajadores y envíos del archivo se fusionarán con los que ya existen. Los clientes con el mismo nombre y país se unificarán (se añadirán sus envíos). ¿Desea continuar?',
      ()=> document.getElementById('rp-file').click(),
      {okLabel:'Continuar', cancelLabel:'Cancelar', danger:false}
    );
  };
  document.getElementById('rp-file').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    let incoming;
    try{
      incoming = await leerArchivoRespaldo(file);
      if(!incoming || typeof incoming!=='object' || Array.isArray(incoming)) throw new Error('Contenido inválido');
    }catch(err){
      console.error(err);
      e.target.value = '';
      alertDialog('Error', 'No se pudo leer el respaldo. Verifique que el archivo sea un respaldo válido de la app.');
      return;
    }
    e.target.value = '';
    // Si la fusión falla a mitad de camino (archivo dañado), se vuelve al
    // estado anterior para no dejar datos importados a medias.
    const copiaPrevia = JSON.parse(JSON.stringify(DB));
    let resumen;
    try{
      resumen = mergeImport(incoming);
    }catch(err){
      console.error(err);
      DB = copiaPrevia;
      alertDialog('Error', 'No se pudo leer el respaldo. Verifique que el archivo sea un respaldo válido de la app.');
      return;
    }
    save();
    alertDialog('Importación completada',
      `Insertados: ${resumen.insertados} · Actualizados: ${resumen.actualizados} · Omitidos (duplicados): ${resumen.omitidos}`);
  });

  document.getElementById('rp-archivar').onclick = ()=>openArchivarHistorialModal(()=>renderRespaldos(content));
  document.getElementById('rp-ver-archivados').onclick = openVerArchivadosModal;
}

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

/* ---------------------------------------------------------------------- *
 * 21. ARCHIVAR HISTORIAL (no borra datos; solo los oculta de las listas)
 * ---------------------------------------------------------------------- */
const ARCHIVABLES = [
  {key:'envios',  label:'Envíos',  origen:'envio'},
  {key:'compras', label:'Compras', origen:'compra'},
  {key:'ventas',  label:'Ventas',  origen:'venta'},
  {key:'gastos',  label:'Gastos',  origen:null},
  {key:'in_out',  label:'In/Out',  origen:null},
];

function tieneDeudaPendiente(origen, id){
  if(!origen) return false;
  return DB.deudas.some(d => d.origen===origen && d.origen_id===id && d.estado==='pendiente');
}

function openArchivarHistorialModal(onDone){
  openModal(`
    <div class="modal-title">🧹 Archivar historial</div>
    <div class="modal-msg">No se elimina ningún dato: los registros archivados dejan de mostrarse en los historiales, pero el balance y las deudas siguen funcionando igual.</div>
    <label class="field-label">¿Qué archivar?</label>
    ${ARCHIVABLES.map(a=>`
      <label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-main);font-size:14.5px;font-weight:600;">
        <input type="checkbox" class="ah-check" data-key="${a.key}" checked style="width:18px;height:18px;">
        ${a.label}
      </label>
    `).join('')}
    <label class="field-label">Archivar registros anteriores a</label>
    <input type="date" id="ah-fecha" value="${fechaLocalISO()}">
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ah-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ah-ok">Archivar</button>
    </div>
  `);
  document.getElementById('ah-cancel').onclick = closeModal;
  document.getElementById('ah-ok').onclick = ()=>{
    const seleccionadas = Array.from(document.querySelectorAll('.ah-check')).filter(c=>c.checked).map(c=>c.dataset.key);
    const fechaVal = document.getElementById('ah-fecha').value;
    if(!seleccionadas.length || !fechaVal){ toast('Seleccione al menos un tipo y una fecha.'); return; }
    const limite = fechaInputAFinDeDiaLocal(fechaVal); // fin del día seleccionado (hora local)
    closeModal();
    confirmDialog(
      `Se archivarán los registros seleccionados anteriores a ${fmtDateShort(limite)}. No se eliminará ningún dato y el balance no se verá afectado. ¿Continuar?`,
      ()=>{
        let archivados = 0, omitidos = 0;
        ARCHIVABLES.forEach(a=>{
          if(!seleccionadas.includes(a.key)) return;
          DB[a.key].forEach(r=>{
            if(r.archivado) return;
            if(r.fecha_hora >= limite) return;
            if(tieneDeudaPendiente(a.origen, r.id)){ omitidos++; return; }
            r.archivado = true;
            r.archivado_en = Date.now();
            archivados++;
          });
        });
        save();
        let msg = `${archivados} registro(s) archivado(s).`;
        if(omitidos) msg += ` ${omitidos} registro(s) no fueron archivados porque tienen deudas pendientes asociadas.`;
        alertDialog('Archivado completado', msg);
        onDone && onDone();
      },
      {okLabel:'Archivar', cancelLabel:'Cancelar', danger:false}
    );
  };
}

function movimientosArchivados(){
  const mov = [];
  DB.envios.filter(e=>e.archivado).forEach(e=>{
    mov.push({fecha:e.fecha_hora, tipo:'Envío', key:'envios', id:e.id, concepto:`${entityNameForEnvio(e)} — ${fmtMoney(e.cantidad_enviada)} ${e.moneda}`});
  });
  DB.compras.filter(c=>c.archivado).forEach(c=>{
    mov.push({fecha:c.fecha_hora, tipo:'Compra', key:'compras', id:c.id, concepto:`${fmtMoney(c.cantidad_pagada)} ${c.divisa_pagada} → ${fmtMoney(c.cantidad_comprada)} ${c.divisa_comprada}`});
  });
  DB.ventas.filter(v=>v.archivado).forEach(v=>{
    mov.push({fecha:v.fecha_hora, tipo:'Venta', key:'ventas', id:v.id, concepto:`${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida} → ${fmtMoney(v.cantidad_recibida)} ${v.divisa_recibida}`});
  });
  DB.gastos.filter(g=>g.archivado).forEach(g=>{
    mov.push({fecha:g.fecha_hora, tipo:'Gasto', key:'gastos', id:g.id, concepto:`${escapeHtml(g.concepto)} — ${fmtMoney(g.cantidad)} ${g.divisa}`});
  });
  DB.in_out.filter(io=>io.archivado).forEach(io=>{
    mov.push({fecha:io.fecha_hora, tipo:'In/Out', key:'in_out', id:io.id, concepto:`${io.tipo==='entrada'?'Entrada':'Salida'} — ${fmtMoney(io.cantidad)} ${io.divisa}`});
  });
  return mov.sort((a,b)=>b.fecha-a.fecha);
}

function desarchivarRegistro(key, id){
  const r = (DB[key]||[]).find(x=>x.id===id);
  if(!r) return;
  r.archivado = false;
  save();
}

function openVerArchivadosModal(){
  function render(){
    const items = movimientosArchivados();
    openModal(`
      <div class="modal-title">👁️ Historial archivado</div>
      <div class="modal-msg">Solo lectura — ${items.length} registro(s) archivado(s). Puede desarchivar uno si fue un error.</div>
      <div style="max-height:55vh;overflow-y:auto;">
        ${items.length ? items.map(m=>`
          <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:10px 12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:14px;">${escapeHtml(m.tipo)}</div>
                <div class="subtle">${escapeHtml(m.concepto)}</div>
                <div class="subtle">${fmtDate(m.fecha)}</div>
              </div>
              <button class="btn btn-outline btn-sm va-restaurar" data-key="${m.key}" data-id="${m.id}" style="flex:none;">↩️ Desarchivar</button>
            </div>
          </div>
        `).join('') : emptyState('📭','No hay registros archivados todavía.')}
      </div>
      <div class="modal-actions"><button class="btn btn-outline btn-block" id="va-cerrar">Cerrar</button></div>
    `);
    document.getElementById('va-cerrar').onclick = closeModal;
    document.querySelectorAll('.va-restaurar').forEach(btn=>{
      btn.onclick = ()=>{
        desarchivarRegistro(btn.dataset.key, Number(btn.dataset.id));
        toast('Registro desarchivado');
        render();
      };
    });
  }
  render();
}

function mergeImport(incoming){
  let insertados=0, actualizados=0, omitidos=0;

  (incoming.divisas||[]).forEach(d=>{
    if(!d || !d.nombre) return;
    const local = DB.divisas.find(x=>x.nombre.toLowerCase()===d.nombre.toLowerCase());
    if(!local){
      DB.divisas.push({id:nextId('divisas'), nombre:d.nombre, simbolo:d.simbolo||'', orden:numFinito(d.orden, DB.divisas.length+1), saldo:numFinito(d.saldo, 0)});
      insertados++;
    } else {
      if(local.saldo===0 && d.saldo){ local.saldo = numFinito(d.saldo, 0); actualizados++; }
      if((local.orden===undefined || local.orden===null) && d.orden!=null) local.orden = numFinito(d.orden, DB.divisas.length+1);
    }
  });
  if(incoming.meta && incoming.meta.nombre_negocio && !DB.meta.nombre_negocio){
    DB.meta.nombre_negocio = String(incoming.meta.nombre_negocio).slice(0,100);
  }
  (incoming.paises||[]).forEach(p=>{
    if(!DB.paises.find(x=>x.nombre.toLowerCase()===p.nombre.toLowerCase())){
      DB.paises.push({id:nextId('paises'), nombre:p.nombre, es_predefinido:0});
      insertados++;
    }
  });
  (incoming.monedas||[]).forEach(m=>{
    if(!DB.monedas.find(x=>x.nombre.toUpperCase()===m.nombre.toUpperCase())){
      DB.monedas.push({id:nextId('monedas'), nombre:m.nombre});
      insertados++;
    }
  });

  const clienteIdMap = {};
  (incoming.clientes||[]).forEach(c=>{
    if(!c || !c.nombre) return;
    let local = DB.clientes.find(x=>x.nombre.toLowerCase()===c.nombre.toLowerCase() && x.pais.toLowerCase()===(c.pais||'').toLowerCase());
    if(local){
      if(!local.telefono && c.telefono) local.telefono = c.telefono;
      if(!local.notas && c.notas) local.notas = c.notas;
      actualizados++;
    } else {
      local = {id:nextId('clientes'), nombre:c.nombre, pais:c.pais, telefono:c.telefono||'', notas:c.notas||'', fecha_registro:c.fecha_registro||Date.now(), activo: c.activo!==undefined?c.activo:1};
      DB.clientes.push(local);
      insertados++;
    }
    clienteIdMap[c.id] = local.id;
  });

  const trabajadorIdMap = {};
  (incoming.trabajadores||[]).forEach(t=>{
    if(!t || !t.nombre) return;
    let local = DB.trabajadores.find(x=>{
      if(x.telefono && t.telefono) return x.nombre.toLowerCase()===t.nombre.toLowerCase() && x.telefono===t.telefono;
      return x.nombre.toLowerCase()===t.nombre.toLowerCase();
    });
    if(local){
      if(!local.telefono && t.telefono) local.telefono = t.telefono;
      actualizados++;
    } else {
      local = {id:nextId('trabajadores'), nombre:t.nombre, telefono:t.telefono||'', fecha_registro:t.fecha_registro||Date.now(), activo:t.activo!==undefined?t.activo:1};
      DB.trabajadores.push(local);
      insertados++;
    }
    trabajadorIdMap[t.id] = local.id;
  });

  const envioIdMap = {};
  (incoming.envios||[]).forEach(e=>{
    if(!e || !e.tipo) return;
    const localClienteId = e.cliente_id!=null ? clienteIdMap[e.cliente_id] : null;
    const localTrabajadorId = e.trabajador_id!=null ? trabajadorIdMap[e.trabajador_id] : null;
    const mismoSegundo = ts => Math.floor(ts/1000);
    const dup = DB.envios.find(x =>
      x.tipo===e.tipo &&
      (x.cliente_id||null)===(localClienteId||null) &&
      (x.trabajador_id||null)===(localTrabajadorId||null) &&
      mismoSegundo(x.fecha_hora)===mismoSegundo(e.fecha_hora) &&
      x.cantidad_enviada===e.cantidad_enviada &&
      x.precio===e.precio &&
      x.forma_ganancia===e.forma_ganancia
    );
    if(dup){ omitidos++; envioIdMap[e.id] = dup.id; return; }
    const nuevo = {...e, id:nextId('envios'), cliente_id:localClienteId, trabajador_id:localTrabajadorId,
      cantidad_enviada:numFinito(e.cantidad_enviada), precio:numFinito(e.precio),
      cantidad_pagada:numFinito(e.cantidad_pagada), ganancia:numFinito(e.ganancia),
      cotizado_a: (e.cotizado_a===null || e.cotizado_a===undefined) ? e.cotizado_a : numFinito(e.cotizado_a, 0)};
    DB.envios.push(nuevo);
    envioIdMap[e.id] = nuevo.id;
    insertados++;
  });

  const ventaIdMap = {};
  (incoming.ventas||[]).forEach(v=>{
    if(!v || !v.divisa_vendida || !v.divisa_recibida) return;
    const dup = DB.ventas.find(x =>
      x.cantidad_vendida===v.cantidad_vendida && x.divisa_vendida===v.divisa_vendida &&
      x.cantidad_recibida===v.cantidad_recibida && x.divisa_recibida===v.divisa_recibida &&
      x.fecha_hora===v.fecha_hora && (x.nota||'')===(v.nota||'')
    );
    if(dup){ omitidos++; ventaIdMap[v.id] = dup.id; return; }
    const nuevaVenta = {...v, id:nextId('ventas'), cantidad_vendida:numFinito(v.cantidad_vendida), cantidad_recibida:numFinito(v.cantidad_recibida)};
    DB.ventas.push(nuevaVenta);
    ventaIdMap[v.id] = nuevaVenta.id;
    insertados++;
  });

  const compraIdMap = {};
  (incoming.compras||[]).forEach(c=>{
    if(!c || !c.divisa_comprada || !c.divisa_pagada) return;
    const dup = DB.compras.find(x =>
      x.cantidad_comprada===c.cantidad_comprada && x.divisa_comprada===c.divisa_comprada &&
      x.cantidad_pagada===c.cantidad_pagada && x.divisa_pagada===c.divisa_pagada &&
      x.fecha_hora===c.fecha_hora && (x.nota||'')===(c.nota||'')
    );
    if(dup){ omitidos++; compraIdMap[c.id] = dup.id; return; }
    const nuevaCompra = {...c, id:nextId('compras'), cantidad_comprada:numFinito(c.cantidad_comprada), cantidad_pagada:numFinito(c.cantidad_pagada)};
    DB.compras.push(nuevaCompra);
    compraIdMap[c.id] = nuevaCompra.id;
    insertados++;
  });

  (incoming.gastos||[]).forEach(g=>{
    if(!g || !g.divisa) return;
    const dup = DB.gastos.find(x =>
      x.concepto===g.concepto && x.cantidad===g.cantidad && x.divisa===g.divisa &&
      x.fecha_hora===g.fecha_hora && (x.nota||'')===(g.nota||'')
    );
    if(dup){ omitidos++; return; }
    DB.gastos.push({...g, id:nextId('gastos'), cantidad:numFinito(g.cantidad)});
    insertados++;
  });

  (incoming.in_out||[]).forEach(io=>{
    if(!io || !io.divisa || !io.tipo) return;
    const dup = DB.in_out.find(x =>
      x.tipo===io.tipo && x.cantidad===io.cantidad && x.divisa===io.divisa &&
      x.fecha_hora===io.fecha_hora && (x.nota||'')===(io.nota||'')
    );
    if(dup){ omitidos++; return; }
    DB.in_out.push({...io, id:nextId('in_out'), cantidad:numFinito(io.cantidad)});
    insertados++;
  });

  (incoming.deudas||[]).forEach(d=>{
    if(!d || !d.persona || !d.divisa) return;
    const dup = DB.deudas.find(x =>
      x.tipo===d.tipo && x.persona===d.persona && x.monto===d.monto && x.divisa===d.divisa &&
      x.fecha===d.fecha && (x.nota||'')===(d.nota||'')
    );
    if(dup){ omitidos++; return; }
    let origen_id = d.origen_id;
    if(d.origen==='venta' && ventaIdMap[d.origen_id]!==undefined) origen_id = ventaIdMap[d.origen_id];
    if(d.origen==='compra' && compraIdMap[d.origen_id]!==undefined) origen_id = compraIdMap[d.origen_id];
    if(d.origen==='envio' && envioIdMap[d.origen_id]!==undefined) origen_id = envioIdMap[d.origen_id];
    DB.deudas.push({...d, id:nextId('deudas'), creado_en: d.creado_en || d.fecha, origen_id, monto:numFinito(d.monto)});
    insertados++;
  });

  return {insertados, actualizados, omitidos};
}

/* ---------------------------------------------------------------------- *
 * 18. MENÚ 9 — DEUDAS
 * ---------------------------------------------------------------------- */
function crearDeudaAutomatica({tipo, persona, monto, divisa, fecha, nota, origen, origen_id, tipo_me_deben}){
  const deuda = {
    id: nextId('deudas'), tipo, persona, monto, divisa, fecha,
    creado_en: Date.now(),
    afecta_balance: 0,
    estado: 'pendiente', fecha_cierre: null, nota,
    origen, origen_id
  };
  if(tipo==='me_deben' && tipo_me_deben!==undefined && tipo_me_deben!==null){
    deuda.tipo_me_deben = tipo_me_deben;
  }
  DB.deudas.push(deuda);
  return deuda;
}

const MEDEBEN_INFORMATIVO = 0, MEDEBEN_PRESTAMO = 1, MEDEBEN_SUMAR_AL_COBRAR = 2;
function meDebenTipo(d){
  if(d.tipo_me_deben!==undefined && d.tipo_me_deben!==null) return d.tipo_me_deben;
  if(d.afecta_balance) return MEDEBEN_PRESTAMO;
  if(d.origen==='venta') return MEDEBEN_SUMAR_AL_COBRAR;
  return MEDEBEN_INFORMATIVO;
}
function meDebenRestaAlCrear(d){ return meDebenTipo(d)===MEDEBEN_PRESTAMO; }
function meDebenSumaAlCobrar(d){ const t = meDebenTipo(d); return t===MEDEBEN_PRESTAMO || t===MEDEBEN_SUMAR_AL_COBRAR; }
function meDebenLabel(d){
  const t = meDebenTipo(d);
  if(t===MEDEBEN_PRESTAMO) return 'Préstamo';
  if(t===MEDEBEN_SUMAR_AL_COBRAR) return 'Sumar al cobrar';
  return 'Informativo';
}
function meDebenBadgeHtml(d){
  const t = meDebenTipo(d);
  const cls = t===MEDEBEN_PRESTAMO ? 'badge-prestamo' : (t===MEDEBEN_SUMAR_AL_COBRAR ? 'badge-sumar' : 'badge-informativo');
  return `<span class="badge ${cls}">${meDebenLabel(d)}</span>`;
}

function eliminarDeudaAutomaticaSiPendiente(origen, origen_id){
  DB.deudas = DB.deudas.filter(d => !(d.origen===origen && d.origen_id===origen_id && d.estado==='pendiente'));
}

let deudasTab = 'pagar_a';
let deudasOrden = 'fecha'; // 'fecha' | 'az' — persiste al cambiar de pestaña dentro de Deudas

function renderDeudas(content){
  content.innerHTML = `
    <h1 class="section-title">Deudas</h1>
    <div class="tabs" id="deudas-tabs">
      <div class="tab ${deudasTab==='pagar_a'?'active':''}" data-v="pagar_a">Pagar a: <span class="tab-count" id="deudas-count-pagar">0</span></div>
      <div class="tab ${deudasTab==='me_deben'?'active':''}" data-v="me_deben">Me deben: <span class="tab-count" id="deudas-count-cobrar">0</span></div>
      <div class="tab ${deudasTab==='historial'?'active':''}" data-v="historial">Historial</div>
    </div>
    <div class="chip-row" id="deudas-orden">
      <div class="chip ${deudasOrden==='fecha'?'active':''}" data-v="fecha">📅 Por fecha</div>
      <div class="chip ${deudasOrden==='az'?'active':''}" data-v="az">🔤 A-Z</div>
    </div>
    <div id="deudas-totales"></div>
    <div id="deudas-list"></div>
    <div id="deudas-pag"></div>
    ${deudasTab!=='historial' ? `<button class="fab" id="fab-add-deuda" aria-label="Agregar">+</button>` : ''}
  `;

  // A igual nombre (o fecha), por id descendente: orden determinista para la paginación.
  function ordenarPorPersona(lista){
    return lista.slice().sort((a,b)=> String(a.persona||'').localeCompare(String(b.persona||''), 'es', {sensitivity:'base'}) || (b.id||0)-(a.id||0));
  }

  function refresh(){
    const el = document.getElementById('deudas-list');
    const pagarCount = DB.deudas.filter(d=>d.tipo==='pagar_a' && d.estado==='pendiente').length;
    const cobrarCount = DB.deudas.filter(d=>d.tipo==='me_deben' && d.estado==='pendiente').length;
    document.getElementById('deudas-count-pagar').textContent = pagarCount;
    document.getElementById('deudas-count-cobrar').textContent = cobrarCount;
    let items;
    const totalesEl = document.getElementById('deudas-totales');
    const pagEl = document.getElementById('deudas-pag');
    if(deudasTab==='historial'){
      // Solo el Historial se pagina; los contadores de las pestañas siguen
      // mostrando el total real de pendientes.
      totalesEl.innerHTML = '';
      items = DB.deudas.filter(d=>d.estado==='pagado'||d.estado==='cobrado');
      items = deudasOrden==='az' ? ordenarPorPersona(items) : items.sort((a,b)=>(b.fecha_cierre||0)-(a.fecha_cierre||0) || (b.id||0)-(a.id||0));
      const estado = paginacion.deudas_historial;
      const pag = paginarArray(items, estado);
      el.innerHTML = items.length ? pag.items.map(deudaHistorialRowHtml).join('') :
        emptyState('🗂️','Aún no hay registros pagados o cobrados');
      aplicarZebra(el, items.length);
      renderControlPaginacion(pagEl, estado, pag, refresh, el);
    } else {
      pagEl.innerHTML = '';
      items = DB.deudas.filter(d=>d.tipo===deudasTab && d.estado==='pendiente');
      const porDivisa = {};
      items.forEach(d=>{ porDivisa[d.divisa] = (porDivisa[d.divisa]||0) + Number(d.monto||0); });
      const divisasConTotal = Object.keys(porDivisa);
      totalesEl.innerHTML = divisasConTotal.length ? `
        <div class="card" style="padding:12px 14px;margin-bottom:10px;">
          <div class="subtle" style="margin-bottom:4px;">${deudasTab==='pagar_a'?'Total por pagar':'Total por cobrar'}</div>
          <div style="font-weight:800;font-size:15px;color:var(--accent-text);">
            ${divisasConTotal.map(dv=>`${fmtMoney(porDivisa[dv])} ${escapeHtml(dv)}`).join(' · ')}
          </div>
        </div>` : '';
      items = deudasOrden==='az' ? ordenarPorPersona(items) : items.sort((a,b)=>(b.creado_en||b.fecha)-(a.creado_en||a.fecha) || (b.id||0)-(a.id||0));
      el.innerHTML = items.length ? items.map(deudaRowHtml).join('') :
        emptyState(deudasTab==='pagar_a'?'💸':'🤝', deudasTab==='pagar_a' ? 'No hay deudas pendientes por pagar' : 'No hay registros pendientes por cobrar');
      aplicarZebra(el, items.length);
    }
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = ()=> openDeudaDetalle(Number(li.dataset.id), refresh);
    });
  }
  document.querySelectorAll('#deudas-tabs .tab').forEach(t=>{
    t.onclick = ()=>{
      deudasTab = t.dataset.v;
      renderDeudas(content);
    };
  });
  document.querySelectorAll('#deudas-orden .chip').forEach(c=>{
    c.onclick = ()=>{
      if(deudasOrden !== c.dataset.v) paginacion.deudas_historial.actual = 1; // cambiar el orden vuelve a la página 1
      deudasOrden = c.dataset.v;
      document.querySelectorAll('#deudas-orden .chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      refresh();
    };
  });
  const fab = document.getElementById('fab-add-deuda');
  if(fab) fab.onclick = ()=> openDeudaForm(deudasTab, refresh);
  refresh();
  actualizarFabEnvio(); // la pestaña Historial no tiene botón "+"
}

function estadoBadgeHtml(estado){
  if(estado==='pendiente') return `<span class="badge badge-gold">Pendiente</span>`;
  if(estado==='pagado') return `<span class="badge badge-teal">Pagado</span>`;
  if(estado==='cobrado') return `<span class="badge badge-teal">Cobrado</span>`;
  return '';
}

function deudaDescuentaAlPagar(d){
  if(d.origen==='envio'){
    const envio = DB.envios.find(e => e.id === d.origen_id);
    // Si la divisa entregada es igual a la de la ganancia, la ganancia
    // ya representa el efecto completo: pagar esta deuda NO descuenta
    // nada más del balance.
    if(envio) return !mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);
    return true;
  }
  if(d.origen==='compra') return true;
  return !!d.afecta_balance;
}
function afectaBalanceBadgeHtml(d){
  if(d.tipo!=='pagar_a') return '';
  return deudaDescuentaAlPagar(d)
    ? `<span class="badge badge-descuenta">Descontar al pagar</span>`
    : `<span class="badge badge-no-descuenta">No descontar al pagar</span>`;
}
function deudaRowHtml(d){
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${d.tipo==='pagar_a'?'💸':'🤝'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(d.persona)}</div>
        <div class="li-sub">${fmtDateShort(d.fecha)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
        <div style="margin-top:4px;">${d.tipo==='pagar_a' ? afectaBalanceBadgeHtml(d) : meDebenBadgeHtml(d)}</div>
      </div>
    </div>`;
}
function deudaHistorialRowHtml(d){
  const esMeDeben = d.tipo==='me_deben';
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${esMeDeben?'🤝':'💸'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(d.persona)}</div>
        <div class="li-sub">${esMeDeben?'Cobrado':'Pagado'} el ${fmtDateShort(d.fecha_cierre)} · Registrado ${fmtDateShort(d.fecha)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
        <div style="margin-top:4px;">${d.tipo==='pagar_a' ? afectaBalanceBadgeHtml(d) : meDebenBadgeHtml(d)}</div>
      </div>
    </div>`;
}

function openDeudaForm(tipo, onSaved){
  const esMeDeben = tipo==='me_deben';
  openModal(`
    <div class="modal-title">${esMeDeben ? 'Nuevo registro — Me deben' : 'Nueva deuda — Pagar a'}</div>
    <label class="field-label">Persona / Entidad *</label>
    <input type="text" id="df-persona" maxlength="100" placeholder="Nombre de la persona o entidad">
    <label class="field-label">Monto *</label>
    <input type="number" inputmode="decimal" step="0.01" id="df-monto" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="df-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha *</label>
    <input type="date" id="df-fecha" value="${fechaLocalISO()}">
    ${esMeDeben ? `
      <label class="field-label">Tipo de registro</label>
      <div class="pill-row" id="df-afecta">
        <div class="pill active" data-v="0">Informativo</div>
        <div class="pill" data-v="1">Préstamo</div>
        <div class="pill" data-v="2">Sumar al cobrar</div>
      </div>
      <div class="hint" id="df-afecta-hint">Informativo: no afecta el balance. Préstamo: resta el monto ahora y lo vuelve a sumar al cobrar. Sumar al cobrar: no afecta ahora, pero suma el monto al balance general cuando lo marque como cobrado.</div>
    ` : `
      <label class="field-label">Descontar del balance general al pagar</label>
      <div class="pill-row" id="df-afecta">
        <div class="pill active" data-v="0">No</div>
        <div class="pill" data-v="1">Sí</div>
      </div>
      <div class="hint">Si activa esta opción, el monto no se resta ahora — se resta cuando marque este registro como "Pagado".</div>
    `}
    <label class="field-label">Nota</label>
    <textarea id="df-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="df-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="df-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('df-divisa'), addDivisa, divisaOptionsHtml);
  let afectaBalance = 0;
  document.querySelectorAll('#df-afecta .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#df-afecta .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      afectaBalance = Number(p.dataset.v);
    };
  });
  document.getElementById('df-cancel').onclick = closeModal;
  document.getElementById('df-save').onclick = ()=>{
    const persona = document.getElementById('df-persona').value.trim();
    const monto = parseFloat(document.getElementById('df-monto').value);
    const divisa = document.getElementById('df-divisa').value;
    const fechaVal = document.getElementById('df-fecha').value;
    const nota = document.getElementById('df-nota').value.trim();
    if(!persona || !monto || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const ahora = Date.now();
    const deuda = {
      id: nextId('deudas'), tipo, persona, monto, divisa,
      fecha: fechaInputAInicioDeDiaLocal(fechaVal),
      creado_en: ahora,
      afecta_balance: esMeDeben ? (afectaBalance===MEDEBEN_PRESTAMO ? 1 : 0) : afectaBalance,
      estado: 'pendiente', fecha_cierre: null, nota,
      origen: null, origen_id: null
    };
    if(esMeDeben) deuda.tipo_me_deben = afectaBalance;
    DB.deudas.push(deuda);
    if(esMeDeben && meDebenRestaAlCrear(deuda)){
      adjustBalance(divisa, -monto);
    }
    save(); closeModal();
    toast(esMeDeben ? 'Registro guardado' : 'Deuda guardada');
    onSaved && onSaved();
  };
}

function openDeudaDetalle(id, onChange){
  const d = DB.deudas.find(x=>x.id===id);
  if(!d) return;
  const esMeDeben = d.tipo==='me_deben';
  openModal(`
    <div class="modal-title">${esMeDeben?'Me deben':'Pagar a'} — ${escapeHtml(d.persona)}</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:8px;">
      <div class="sumrow"><span class="k">Persona / Entidad</span><span class="v">${escapeHtml(d.persona)}</span></div>
      <div class="sumrow"><span class="k">Monto</span><span class="v">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha del registro</span><span class="v">${fmtDateShort(d.fecha)}</span></div>
      <div class="sumrow"><span class="k">Etiqueta</span><span class="v">${esMeDeben ? meDebenBadgeHtml(d) : afectaBalanceBadgeHtml(d)}</span></div>
      <div class="sumrow"><span class="k">Estado</span><span class="v">${estadoBadgeHtml(d.estado)}</span></div>
      ${d.fecha_cierre ? `<div class="sumrow"><span class="k">${esMeDeben?'Fecha de cobro':'Fecha de pago'}</span><span class="v">${fmtDate(d.fecha_cierre)}</span></div>` : ''}
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(d.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions" id="dd-actions-top"></div>
    <div class="modal-actions" id="dd-actions-bottom"></div>
  `);
  const actionsTop = document.getElementById('dd-actions-top');
  const actionsBottom = document.getElementById('dd-actions-bottom');
  actionsTop.innerHTML = `
    <button class="btn btn-outline btn-block" id="dd-aceptar">✅ Aceptar</button>
    <button class="btn btn-danger btn-block" id="dd-del">Eliminar</button>
  `;
  if(d.estado==='pendiente'){
    actionsBottom.innerHTML = `<button class="btn btn-gold btn-block" id="dd-cerrar">${esMeDeben?'Marcar como cobrado':'Marcar como pagado'}</button>`;
  }
  document.getElementById('dd-aceptar').onclick = volverDesdeDetalleMovimiento;

  const cerrarBtn = document.getElementById('dd-cerrar');
  if(cerrarBtn){
    cerrarBtn.onclick = ()=>{
      if(!esMeDeben){
        const envioOrigen = d.origen==='envio' ? DB.envios.find(x=>x.id===d.origen_id) : null;
        if(envioOrigen){
          // La ganancia de este envío ya se sumó al balance cuando se
          // registró (ver applyEnvioBalance, CASO 2). Marcar la deuda
          // como pagada es solo un registro de que la entrega ya se
          // hizo:
          //  - Si la divisa entregada y la divisa de la ganancia son
          //    LA MISMA, no se toca el balance (la ganancia ya
          //    representa el efecto neto completo de la operación).
          //  - Si son divisas DISTINTAS, sí hay que restar la entrega
          //    de su propia divisa, porque esa salida de dinero nunca
          //    se había registrado (la ganancia se sumó en otra divisa).
          const mismaDivisaEnvio = mismasDivisas(envioOrigen.divisa_entrega, envioOrigen.divisa_ganancia);
          const msg = mismaDivisaEnvio
            ? `Confirmar que se realizó la entrega de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}? La ganancia de este envío ya fue reconocida al registrarlo, así que esta acción NO modifica el balance general.`
            : `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}? Esta acción RESTARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} del balance general (la ganancia ya fue reconocida en otra divisa al registrar el envío).`;
          confirmDialog(msg, ()=>{
            d.estado = 'pagado'; d.fecha_cierre = Date.now();
            if(!mismaDivisaEnvio){
              adjustBalance(d.divisa, -d.monto);
            }
            save(); closeModal(); toast('Envío marcado como pagado — pasó al Historial'); onChange && onChange();
          }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
          return;
        }
        const restaAlPagar = d.afecta_balance || d.origen==='compra';
        const msg = restaAlPagar
          ? `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}? Esta acción RESTARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} del balance general.`
          : `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}?`;
        confirmDialog(msg, ()=>{
          d.estado = 'pagado'; d.fecha_cierre = Date.now();
          if(restaAlPagar) adjustBalance(d.divisa, -d.monto);
          save(); closeModal(); toast('Deuda marcada como pagada — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else if(meDebenSumaAlCobrar(d)){
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} de ${escapeHtml(d.persona)}? Esta acción SUMARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} al balance general.`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          adjustBalance(d.divisa, d.monto);
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else {
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} de ${escapeHtml(d.persona)}?`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      }
    };
  }
  document.getElementById('dd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar este registro de ${escapeHtml(d.persona)}?`, ()=> eliminarConDeshacer('Deuda eliminada', ()=>{
      if(d.tipo==='me_deben'){
        if(meDebenRestaAlCrear(d)){
          if(d.estado==='pendiente') adjustBalance(d.divisa, d.monto);
        } else if(meDebenSumaAlCobrar(d) && d.estado==='cobrado'){
          adjustBalance(d.divisa, -d.monto);
        }
      } else if(d.tipo==='pagar_a' && d.estado==='pagado'){
        if(d.origen==='envio'){
          const envioOrigen = DB.envios.find(x=>x.id===d.origen_id);
          const mismaDivisaEnvio = envioOrigen && mismasDivisas(envioOrigen.divisa_entrega, envioOrigen.divisa_ganancia);
          if(!mismaDivisaEnvio){
            adjustBalance(d.divisa, d.monto);
          }
        } else {
          const restaAlPagar = d.afecta_balance || d.origen==='compra';
          if(restaAlPagar) adjustBalance(d.divisa, d.monto);
        }
      }
      DB.deudas = DB.deudas.filter(x=>x.id!==d.id);
      save(); onChange && onChange();
    }));
  };
}

/* ---------------------------------------------------------------------- *
 * 19. GENERADOR DE .XLSX PURO (sin librerías, funciona 100% offline)
 * ---------------------------------------------------------------------- */
const XLSX_CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function xlsxCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = XLSX_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function xlsxStrToBytes(str){ return new TextEncoder().encode(str); }
function xlsxU16(n){ return [n & 0xFF, (n >> 8) & 0xFF]; }
function xlsxU32(n){ return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF]; }
function xlsxConcat(arrays){
  let total = 0; arrays.forEach(a=>total+=a.length);
  const out = new Uint8Array(total); let off=0;
  arrays.forEach(a=>{ out.set(a, off); off += a.length; });
  return out;
}
function xlsxBuildZip(files){
  const localParts = [], centralParts = [];
  let offset = 0;
  const dosTime = 0, dosDate = 0x21;
  files.forEach(f=>{
    const nameBytes = xlsxStrToBytes(f.name);
    const data = f.data;
    const crc = xlsxCrc32(data);
    const localHeader = new Uint8Array([
      0x50,0x4b,0x03,0x04, ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(dosTime), ...xlsxU16(dosDate), ...xlsxU32(crc),
      ...xlsxU32(data.length), ...xlsxU32(data.length),
      ...xlsxU16(nameBytes.length), ...xlsxU16(0)
    ]);
    localParts.push(localHeader, nameBytes, data);
    const centralHeader = new Uint8Array([
      0x50,0x4b,0x01,0x02, ...xlsxU16(20), ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(dosTime), ...xlsxU16(dosDate), ...xlsxU32(crc),
      ...xlsxU32(data.length), ...xlsxU32(data.length),
      ...xlsxU16(nameBytes.length), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(0), ...xlsxU16(0), ...xlsxU32(0), ...xlsxU32(offset)
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });
  const centralStart = offset;
  let centralSize = 0; centralParts.forEach(p=>centralSize+=p.length);
  const eocd = new Uint8Array([
    0x50,0x4b,0x05,0x06, ...xlsxU16(0), ...xlsxU16(0),
    ...xlsxU16(files.length), ...xlsxU16(files.length),
    ...xlsxU32(centralSize), ...xlsxU32(centralStart), ...xlsxU16(0)
  ]);
  return xlsxConcat([...localParts, ...centralParts, eocd]);
}
function xlsxColLetter(idx){
  let s = ''; idx += 1;
  while (idx > 0) { const rem = (idx-1)%26; s = String.fromCharCode(65+rem)+s; idx = Math.floor((idx-1)/26); }
  return s;
}
function xlsxEscapeXml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
}
function xlsxBuildSheetXml(rows){
  let rowsXml = '';
  rows.forEach((row, rIdx) => {
    const rNum = rIdx + 1;
    let cellsXml = '';
    row.forEach((cell, cIdx) => {
      if (cell === null || cell === undefined || cell === '') return;
      const ref = xlsxColLetter(cIdx) + rNum;
      const style = cell.style || 0;
      if (cell.type === 'n') cellsXml += `<c r="${ref}" s="${style}"><v>${cell.v}</v></c>`;
      else cellsXml += `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscapeXml(cell.v)}</t></is></c>`;
    });
    rowsXml += `<row r="${rNum}">${cellsXml}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="5" width="18" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`;
}
// estilos: 0=normal, 1=negrita/título, 2=numero 2 decimales
const XLSX_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
function xlsxBuildFile(rows){
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Reporte" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const sheetXml = xlsxBuildSheetXml(rows);
  const files = [
    {name:'[Content_Types].xml', data: xlsxStrToBytes(contentTypes)},
    {name:'_rels/.rels', data: xlsxStrToBytes(rootRels)},
    {name:'xl/workbook.xml', data: xlsxStrToBytes(workbookXml)},
    {name:'xl/_rels/workbook.xml.rels', data: xlsxStrToBytes(workbookRels)},
    {name:'xl/styles.xml', data: xlsxStrToBytes(XLSX_STYLES_XML)},
    {name:'xl/worksheets/sheet1.xml', data: xlsxStrToBytes(sheetXml)},
  ];
  return xlsxBuildZip(files);
}

function s(v){ return {v, type:'s', style:0}; }
function sb(v){ return {v, type:'s', style:1}; }
function n(v){ return {v: round2(v), type:'n', style:2}; }

function generarReporteEjecutivo(){
  const now = Date.now();
  const rows = [];
  rows.push([sb(DB.meta.nombre_negocio || 'Mi negocio de remesas')]);
  rows.push([s('Fecha de exportación: ' + fmtDate(now))]);
  rows.push([]);

  rows.push([sb('Balance general por divisa')]);
  rows.push([sb('Divisa'), sb('Saldo')]);
  DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0)).forEach(d=>{
    rows.push([s(d.nombre), n(d.saldo)]);
  });
  rows.push([]);

  rows.push([sb('Últimos 10 movimientos')]);
  rows.push([sb('Fecha'), sb('Tipo'), sb('Concepto'), sb('Divisa'), sb('Monto')]);
  const movimientos = [];
  DB.envios.filter(e=>!e.archivado).forEach(e=>{
    const entrega = Number(e.cantidad_pagada||0);
    const ganancia = Number(e.ganancia||0);
    if(envioDescuentaAhora(e)){
      movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Entrega — ${entityNameForEnvio(e)}`, divisa:e.divisa_entrega, monto:-entrega});
      if(mismasDivisas(e.divisa_entrega, e.divisa_ganancia)){
        movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Operación — ${entityNameForEnvio(e)}`, divisa:e.divisa_ganancia, monto:entrega+ganancia});
      } else {
        movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Ganancia — ${entityNameForEnvio(e)}`, divisa:e.divisa_ganancia, monto:ganancia});
      }
    } else {
      movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Ganancia — ${entityNameForEnvio(e)}`, divisa:e.divisa_ganancia, monto:ganancia});
    }
  });
  DB.deudas.forEach(d=>{
    if(d.tipo==='pagar_a' && d.origen==='envio' && d.estado==='pagado' && d.fecha_cierre){
      movimientos.push({fecha:d.fecha_cierre, tipo:'Envío pagado', concepto:`Pago a ${d.persona}`, divisa:d.divisa, monto:-(d.monto||0)});
    }
  });
  DB.compras.filter(c=>!c.archivado).forEach(c=>{
    movimientos.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`${fmtMoney(c.cantidad_pagada)} ${c.divisa_pagada} → ${c.divisa_comprada}`, divisa:c.divisa_comprada, monto:c.cantidad_comprada});
  });
  DB.ventas.filter(v=>!v.archivado).forEach(v=>{
    movimientos.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida} → ${v.divisa_recibida}`, divisa:v.divisa_recibida, monto:v.registra_deuda?0:v.cantidad_recibida});
  });
  DB.gastos.filter(g=>!g.archivado).forEach(g=>{
    movimientos.push({fecha:g.fecha_hora, tipo:'Gasto', concepto:g.concepto, divisa:g.divisa, monto:-g.cantidad});
  });
  DB.in_out.filter(io=>!io.archivado).forEach(io=>{
    movimientos.push({fecha:io.fecha_hora, tipo:'In/Out', concepto: io.nota || (io.tipo==='entrada'?'Entrada manual':'Salida manual'), divisa:io.divisa, monto: io.tipo==='entrada'?io.cantidad:-io.cantidad});
  });
  movimientos.sort((a,b)=>b.fecha-a.fecha).slice(0,10).forEach(m=>{
    rows.push([s(fmtDate(m.fecha)), s(m.tipo), s(m.concepto), s(m.divisa), n(m.monto)]);
  });
  rows.push([]);

  rows.push([sb('Totales acumulados (histórico)')]);
  rows.push([sb('Envíos — ganancia total por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totEnvios = {};
  DB.envios.forEach(e=>{ totEnvios[e.divisa_ganancia] = (totEnvios[e.divisa_ganancia]||0) + envioGananciaMostrada(e); });
  Object.keys(totEnvios).forEach(k=> rows.push([s(k), n(totEnvios[k])]));
  rows.push([]);

  rows.push([sb('Compras — total comprado por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totCompras = {};
  DB.compras.forEach(c=>{ totCompras[c.divisa_comprada] = (totCompras[c.divisa_comprada]||0) + (c.cantidad_comprada||0); });
  Object.keys(totCompras).forEach(k=> rows.push([s(k), n(totCompras[k])]));
  rows.push([]);

  rows.push([sb('Ventas — total recibido por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totVentas = {};
  DB.ventas.forEach(v=>{ if(!v.registra_deuda) totVentas[v.divisa_recibida] = (totVentas[v.divisa_recibida]||0) + (v.cantidad_recibida||0); });
  Object.keys(totVentas).forEach(k=> rows.push([s(k), n(totVentas[k])]));
  rows.push([]);

  rows.push([sb('Gastos — total por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totGastos = {};
  DB.gastos.forEach(g=>{ totGastos[g.divisa] = (totGastos[g.divisa]||0) + (g.cantidad||0); });
  Object.keys(totGastos).forEach(k=> rows.push([s(k), n(totGastos[k])]));
  rows.push([]);

  rows.push([sb('In/Out — total neto por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totInOut = {};
  DB.in_out.forEach(io=>{ totInOut[io.divisa] = (totInOut[io.divisa]||0) + (io.tipo==='entrada'?io.cantidad:-io.cantidad); });
  Object.keys(totInOut).forEach(k=> rows.push([s(k), n(totInOut[k])]));

  const zipBytes = xlsxBuildFile(rows);
  const blob = new Blob([zipBytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const pad = x=>String(x).padStart(2,'0');
  const name = `reporte_ejecutivo_${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}.xlsx`;
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('Reporte Excel exportado');
}
