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
