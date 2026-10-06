/* =========================================================================
   REMESAS — App de control de envíos, ventas, gastos y balance

   El código está dividido en varios archivos dentro de js/. Se cargan EN
   ORDEN desde index.html como scripts normales que comparten el mismo
   ámbito global (no hay módulos ni compilación). Reglas para no romperlo:
   · Un archivo puede llamar a funciones de cualquier otro DENTRO de una
     función: cuando se ejecuta, todos ya están cargados.
   · El código que corre AL CARGAR (fuera de funciones) solo puede usar lo
     definido en ese archivo o en los anteriores.
   · Si se agrega un archivo, incluirlo también en index.html y en sw.js.
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
