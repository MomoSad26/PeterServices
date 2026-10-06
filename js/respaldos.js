/* ---------------------------------------------------------------------- *
 * 16b. CIFRADO DEL RESPALDO (.rmb) — AES-256-GCM con Web Crypto
 *      Formato: "RMBS" (4 bytes) + versión (1) + sal (16) + IV (12) + datos.
 *      · Versión 1: clave derivada (PBKDF2) de una frase fija del código.
 *        Cualquier instalación lo abre sin pedir nada. Protege contra un
 *        curioso, NO contra alguien que lea el código (es público).
 *      · Versión 2: clave derivada de una CONTRASEÑA PROPIA del usuario
 *        (Respaldos → Contraseña). Nadie puede abrirlo sin ella, ni leyendo
 *        el código. Si se olvida, el respaldo NO se puede recuperar.
 *      NO CAMBIAR la frase fija: los respaldos v1 dejarían de abrirse.
 * ---------------------------------------------------------------------- */
const CLAVE_RESPALDO = 'PeterServices-Remessas-2025-!Secure!';
const RMB_FIRMA = [0x52,0x4D,0x42,0x53]; // "RMBS"
const RMB_V_CLAVE_FIJA = 1, RMB_V_CONTRASENA = 2;
const RMB_ITERACIONES = {1:150000, 2:300000};

/* La contraseña propia se guarda SOLO en este dispositivo (como las
   preferencias), para que el respaldo automático semanal pueda usarla sin
   preguntar. Quien tiene el teléfono ya tiene los datos; la contraseña
   protege los archivos que salen de él. */
const PWD_RESPALDO_KEY = 'remesas_respaldo_pwd_v1';
function contrasenaRespaldo(){
  try{ return localStorage.getItem(PWD_RESPALDO_KEY) || ''; }catch(e){ return ''; }
}
function guardarContrasenaRespaldo(pwd){
  try{ if(pwd) localStorage.setItem(PWD_RESPALDO_KEY, pwd); else localStorage.removeItem(PWD_RESPALDO_KEY); }catch(e){}
}

async function derivarClaveRespaldo(secreto, sal, version){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:sal, iterations:RMB_ITERACIONES[version], hash:'SHA-256'},
    base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
function cifradoDisponible(){ return !!(window.crypto && crypto.subtle); }

// Cifra con la contraseña propia si hay una configurada; si no, con la clave fija.
async function cifrarRespaldo(texto, contrasena = contrasenaRespaldo()){
  const version = contrasena ? RMB_V_CONTRASENA : RMB_V_CLAVE_FIJA;
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivarClaveRespaldo(contrasena || CLAVE_RESPALDO, sal, version);
  const datos = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, clave, new TextEncoder().encode(texto)));
  const out = new Uint8Array(4 + 1 + 16 + 12 + datos.length);
  out.set(RMB_FIRMA, 0); out[4] = version; out.set(sal, 5); out.set(iv, 21); out.set(datos, 33);
  return out;
}

function esRespaldoCifrado(bytes){
  return bytes.length > 33 && RMB_FIRMA.every((b,i)=>bytes[i]===b);
}

// Lanza un error si la clave/contraseña no corresponde (AES-GCM lo detecta).
async function descifrarRespaldo(bytes, contrasena){
  const version = bytes[4];
  if(version!==RMB_V_CLAVE_FIJA && version!==RMB_V_CONTRASENA) throw new Error('Versión de respaldo no soportada');
  const sal = bytes.slice(5, 21), iv = bytes.slice(21, 33), datos = bytes.slice(33);
  const clave = await derivarClaveRespaldo(version===RMB_V_CONTRASENA ? contrasena : CLAVE_RESPALDO, sal, version);
  const plano = await crypto.subtle.decrypt({name:'AES-GCM', iv}, clave, datos);
  return new TextDecoder().decode(plano);
}

// Pide una contraseña; devuelve una promesa con el texto o null si se cancela.
function pedirContrasena(titulo, mensaje){
  return new Promise(resolve=>{
    openModal(`
      <div class="modal-title">${escapeHtml(titulo)}</div>
      ${mensaje ? `<div class="modal-msg">${mensaje}</div>` : ''}
      <input type="password" id="pw-input" placeholder="Contraseña" autocomplete="off">
      <div class="modal-actions">
        <button class="btn btn-outline btn-block" id="pw-cancel">Cancelar</button>
        <button class="btn btn-primary btn-block" id="pw-ok">Aceptar</button>
      </div>
    `, {center:true});
    const input = document.getElementById('pw-input');
    setTimeout(()=>input.focus(), 150);
    document.getElementById('pw-cancel').onclick = ()=>{ closeModal(); resolve(null); };
    document.getElementById('pw-ok').onclick = ()=>{ const v = input.value; closeModal(); resolve(v); };
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('pw-ok').click(); });
  });
}

// Lee un archivo de respaldo: cifrado (.rmb, con clave fija o contraseña) o
// JSON antiguo sin cifrar. Devuelve null si el usuario cancela la contraseña.
async function leerArchivoRespaldo(file){
  const bytes = new Uint8Array(await file.arrayBuffer());
  if(esRespaldoCifrado(bytes)){
    if(!cifradoDisponible()) throw new Error('Este dispositivo no permite descifrar respaldos.');
    if(bytes[4]!==RMB_V_CONTRASENA) return JSON.parse(await descifrarRespaldo(bytes));
    // Primero se prueba la contraseña guardada en este dispositivo; si no
    // sirve (o no hay), se le pide al usuario hasta que acierte o cancele.
    const guardada = contrasenaRespaldo();
    if(guardada){
      try{ return JSON.parse(await descifrarRespaldo(bytes, guardada)); }catch(e){ /* se pide abajo */ }
    }
    let mensaje = 'Este respaldo está protegido con una contraseña propia.';
    for(;;){
      const pwd = await pedirContrasena('Contraseña del respaldo', mensaje);
      if(pwd===null) return null;
      try{ return JSON.parse(await descifrarRespaldo(bytes, pwd)); }
      catch(e){ mensaje = '❌ Contraseña incorrecta. Intente de nuevo.'; }
    }
  }
  // Respaldo antiguo: JSON plano (se ignora un posible BOM y espacios iniciales).
  const texto = new TextDecoder().decode(bytes).replace(/^﻿/, '');
  if(!texto.trimStart().startsWith('{')) throw new Error('Formato desconocido');
  return JSON.parse(texto);
}

// Nombre de archivo con fecha y hora local: respaldo_2026_10_06_14_30_05.rmb
function nombreRespaldo(prefijo){
  const now = new Date();
  const pad = n=>String(n).padStart(2,'0');
  return `${prefijo}_${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}.rmb`;
}
async function generarRespaldoCifrado(){
  const data = JSON.parse(JSON.stringify(DB));
  data.exportado_en = {timestamp: Date.now(), iso: new Date().toISOString()};
  return cifrarRespaldo(JSON.stringify(data));
}
function bytesABase64(bytes){
  let bin = '';
  for(let i=0;i<bytes.length;i+=0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000));
  return btoa(bin);
}

/* ---- Respaldo automático semanal ----
   En la APK, la app nativa guarda el archivo en Descargas/Remesas sin
   preguntar nada (se conservan los 8 más recientes). En el navegador eso es
   imposible (una página no puede escribir archivos sola), así que se muestra
   un aviso semanal para exportarlo con un toque. Solo hace falta revisarlo
   al abrir la app: si la app no se abre, los datos tampoco cambian. */
const AUTO_RESPALDO_DIAS = 7;
function respaldoAutomaticoNativo(){ return !!(window.AndroidBridge && window.AndroidBridge.saveAutoBackup); }
function hayDatosQueRespaldar(){
  return ['clientes','trabajadores','envios','ventas','compras','gastos','in_out','deudas'].some(k=>(DB[k]||[]).length>0);
}
let respaldoAutoEnCurso = false;
async function hacerRespaldoAutomatico({forzar=false}={}){
  if(respaldoAutoEnCurso || !respaldoAutomaticoNativo() || !cifradoDisponible()) return false;
  if(!forzar && (!hayDatosQueRespaldar() || diasDesde(DB.meta.ultimo_respaldo_auto) < AUTO_RESPALDO_DIAS)) return false;
  respaldoAutoEnCurso = true;
  try{
    const bytes = await generarRespaldoCifrado();
    const nombre = nombreRespaldo('respaldo_auto');
    const r = String(window.AndroidBridge.saveAutoBackup(nombre, bytesABase64(bytes)) || '');
    if(!r.startsWith('ok')){
      console.warn('Respaldo automático no guardado:', r);
      if(forzar) toast(r.includes('permiso') ? 'Conceda el permiso de almacenamiento y vuelva a intentarlo.' : 'No se pudo guardar el respaldo automático.');
      return false;
    }
    DB.meta.ultimo_respaldo_auto = Date.now();
    save();
    toast('💾 Respaldo automático guardado en Descargas/Remesas');
    if(currentRouteView==='respaldos') route();
    return true;
  }catch(e){
    console.error('Error en respaldo automático', e);
    return false;
  }finally{
    respaldoAutoEnCurso = false;
  }
}
function revisarRespaldoSemanal(){
  if(respaldoAutomaticoNativo()){ hacerRespaldoAutomatico(); return; }
  // Navegador: recordatorio semanal (una vez por sesión) si hay datos y
  // pasó una semana desde el último respaldo exportado.
  if(revisarRespaldoSemanal._avisado || !hayDatosQueRespaldar()) return;
  if(diasDesde(DB.meta.ultimo_respaldo) < AUTO_RESPALDO_DIAS) return;
  revisarRespaldoSemanal._avisado = true;
  if(document.getElementById('backup-banner')) return;
  const div = document.createElement('div');
  div.id = 'backup-banner';
  div.className = 'floating-banner';
  div.innerHTML = `<span style="flex:1;">💾 ${DB.meta.ultimo_respaldo ? `Hace ${diasDesde(DB.meta.ultimo_respaldo)} días que no exporta un respaldo.` : 'Aún no ha exportado ningún respaldo.'}</span>
    <button class="btn btn-gold btn-sm" id="backup-banner-ok">Exportar</button>
    <button class="btn btn-sm" id="backup-banner-x" style="background:transparent;color:#fff;" aria-label="Cerrar">✕</button>`;
  document.body.appendChild(div);
  document.getElementById('backup-banner-x').onclick = ()=> div.remove();
  document.getElementById('backup-banner-ok').onclick = ()=>{ div.remove(); exportarRespaldoManual(); };
}

async function exportarRespaldoManual(){
  if(!cifradoDisponible()){
    alertDialog('No se pudo exportar', 'Este navegador no permite cifrar el respaldo. Abra la app desde la APK o desde su dirección https.');
    return false;
  }
  try{
    const cifrado = await generarRespaldoCifrado();
    const name = nombreRespaldo('respaldo');
    descargarArchivo(cifrado, name, 'application/octet-stream');
    DB.meta.ultimo_respaldo = Date.now();
    save();
    document.getElementById('backup-banner')?.remove(); // ya no hace falta el recordatorio
    if(currentRouteView==='respaldos') route();
    toast((contrasenaRespaldo() ? '🔒 Respaldo con contraseña exportado: ' : 'Respaldo cifrado exportado: ') + name);
    return true;
  }catch(err){
    console.error(err);
    alertDialog('No se pudo exportar', 'Ocurrió un error al cifrar el respaldo.');
    return false;
  }
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
      <div style="font-weight:700;margin-bottom:6px;">🗓️ Respaldo automático semanal</div>
      ${respaldoAutomaticoNativo() ? `
        <div class="subtle" style="margin-bottom:12px;">Cada 7 días, al abrir la app, se guarda solo un respaldo cifrado en <strong>Descargas/Remesas</strong> (se conservan los 8 más recientes). Esa carpeta no se borra si se desinstala la app.</div>
        <div class="sumrow"><span class="k">Último automático</span><span class="v">${DB.meta.ultimo_respaldo_auto ? fmtDate(DB.meta.ultimo_respaldo_auto) : 'Todavía ninguno'}</span></div>
        <button class="btn btn-outline btn-block" id="rp-auto-ahora" style="margin-top:12px;">💾 Hacer uno ahora</button>
      ` : `
        <div class="subtle">En el navegador una página no puede guardar archivos sola: si pasa una semana sin exportar, la app le avisará para hacerlo con un toque. En la APK de Android el respaldo semanal es 100% automático.</div>
      `}
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">🔒 Contraseña de respaldos (opcional)</div>
      ${contrasenaRespaldo() ? `
        <div class="subtle" style="margin-bottom:12px;"><strong>Activada.</strong> Los respaldos nuevos (manuales y automáticos) solo se pueden abrir con su contraseña. Los anteriores siguen abriéndose como antes.</div>
        <div class="two-col">
          <button class="btn btn-outline btn-block" id="rp-pwd-cambiar">Cambiar</button>
          <button class="btn btn-outline btn-block" id="rp-pwd-quitar">Quitar</button>
        </div>
      ` : `
        <div class="subtle" style="margin-bottom:12px;">Sin contraseña, el respaldo no se lee abriéndolo con otro programa, pero alguien que conozca el código de la app podría abrirlo. Con contraseña, nadie puede abrirlo sin ella.</div>
        <button class="btn btn-outline btn-block" id="rp-pwd-poner">Poner contraseña</button>
      `}
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
    const btn = document.getElementById('rp-export');
    btn.disabled = true;
    const ok = await exportarRespaldoManual();
    if(!ok && document.body.contains(btn)) btn.disabled = false;
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
      if(incoming===null){ e.target.value = ''; return; } // canceló la contraseña
      if(typeof incoming!=='object' || Array.isArray(incoming)) throw new Error('Contenido inválido');
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

  const autoBtn = document.getElementById('rp-auto-ahora');
  if(autoBtn) autoBtn.onclick = async ()=>{ autoBtn.disabled = true; await hacerRespaldoAutomatico({forzar:true}); if(document.body.contains(autoBtn)) autoBtn.disabled = false; };
  const ponerPwd = ()=> configurarContrasenaRespaldo(()=>renderRespaldos(content));
  ['rp-pwd-poner','rp-pwd-cambiar'].forEach(id=>{ const b = document.getElementById(id); if(b) b.onclick = ponerPwd; });
  const quitarBtn = document.getElementById('rp-pwd-quitar');
  if(quitarBtn) quitarBtn.onclick = ()=> confirmDialog('¿Quitar la contraseña? Los respaldos NUEVOS volverán a usar la protección básica. Los que ya hizo con contraseña seguirán necesitándola para abrirse.', ()=>{
    guardarContrasenaRespaldo('');
    toast('Contraseña de respaldos quitada');
    renderRespaldos(content);
  }, {okLabel:'Quitar', cancelLabel:'Cancelar', danger:true});

  document.getElementById('rp-archivar').onclick = ()=>openArchivarHistorialModal(()=>renderRespaldos(content));
  document.getElementById('rp-ver-archivados').onclick = openVerArchivadosModal;
}

function configurarContrasenaRespaldo(onDone){
  openModal(`
    <div class="modal-title">🔒 Contraseña de respaldos</div>
    <div class="modal-msg"><strong>Importante:</strong> si la olvida, los respaldos hechos con ella NO se podrán abrir nunca. Nadie puede recuperarla. Anótela en un lugar seguro.</div>
    <label class="field-label">Contraseña (mínimo 6 caracteres)</label>
    <input type="password" id="pc-1" autocomplete="new-password">
    <label class="field-label">Repita la contraseña</label>
    <input type="password" id="pc-2" autocomplete="new-password">
    <div id="pc-error" style="color:var(--red-text);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="pc-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="pc-ok">Guardar</button>
    </div>
  `, {center:true});
  setTimeout(()=>document.getElementById('pc-1')?.focus(), 150);
  document.getElementById('pc-cancel').onclick = closeModal;
  document.getElementById('pc-ok').onclick = ()=>{
    const a = document.getElementById('pc-1').value, b = document.getElementById('pc-2').value;
    const err = document.getElementById('pc-error');
    const fallo = a.length < 6 ? 'La contraseña debe tener al menos 6 caracteres.' : (a !== b ? 'Las contraseñas no coinciden.' : '');
    if(fallo){ err.textContent = fallo; err.style.display = 'block'; return; }
    guardarContrasenaRespaldo(a);
    closeModal();
    toast('🔒 Contraseña de respaldos guardada');
    onDone && onDone();
  };
}
