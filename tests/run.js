/* Pruebas automáticas de Remesas. Ver tests/README.md.
   Sirve la web desde la raíz del repo en un puerto local, la abre en
   Chromium con una base de datos vacía y usa solo datos ficticios. */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const TIPOS = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png'};
let ok = 0, fallos = 0;
function check(cond, msg){ if(cond){ ok++; console.log('  ✔', msg); } else { fallos++; console.log('  ✘ FALLO:', msg); } }
function seccion(t){ console.log('\n' + t); }

function servidor(){
  return new Promise(resolve=>{
    const srv = http.createServer((req, res)=>{
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if(rel === '/') rel = '/index.html';
      const archivo = path.join(RAIZ, rel);
      if(!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()){ res.writeHead(404); res.end(); return; }
      res.writeHead(200, {'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control':'no-store'});
      fs.createReadStream(archivo).pipe(res);
    });
    srv.listen(0, '127.0.0.1', ()=>resolve(srv));
  });
}

// ---- Comprobaciones estáticas (sin navegador) ----
function pruebasEstaticas(){
  seccion('0. Archivos: index.html, sw.js y workflows');
  const index = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const scripts = [...index.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
  const faltanEnDisco = scripts.filter(s=>!fs.existsSync(path.join(RAIZ, s)));
  const faltanEnSw = scripts.filter(s=>!sw.includes(`'./${s}'`));
  const enSw = [...sw.matchAll(/'\.\/(js\/[^']+)'/g)].map(m=>m[1]);
  const sobranEnSw = enSw.filter(s=>!scripts.includes(s));
  check(faltanEnDisco.length===0, 'todos los scripts de index.html existen ' + faltanEnDisco.join(','));
  check(faltanEnSw.length===0, 'todos los scripts están en la caché offline (sw.js) ' + faltanEnSw.join(','));
  check(sobranEnSw.length===0, 'sw.js no lista scripts que index.html no carga ' + sobranEnSw.join(','));
  const dir = path.join(RAIZ, '.github', 'workflows');
  for(const f of fs.readdirSync(dir)){
    const y = fs.readFileSync(path.join(dir, f), 'utf8');
    const bloqueOn = (y.split(/^on:\s*$/m)[1] || '').split(/^\S/m)[0];
    const eventos = [...bloqueOn.matchAll(/^  (\w+):/gm)].map(m=>m[1]);
    check(eventos.length===1 && eventos[0]==='workflow_dispatch', `${f}: solo se ejecuta manualmente (${eventos.join(',')})`);
  }
}

(async ()=>{
  pruebasEstaticas();
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  const errores = [];

  async function nuevaApp({puente=false} = {}){
    const ctx = await browser.newContext({viewport:{width:390, height:844}, serviceWorkers:'block', acceptDownloads:true});
    await ctx.addInitScript((puente)=>{
      window.__abiertos = [];
      window.open = (u)=>{ window.__abiertos.push(u); };
      if(puente){
        window.__version = 104;
        window.AndroidBridge = {
          getVersionCode: ()=>window.__version,
          openExternal: (u)=>{ window.__abiertos.push(u); },
          setThemeColor: ()=>{},
        };
      }
    }, puente);
    const p = await ctx.newPage();
    p.on('pageerror', e=>errores.push('pageerror: ' + e.message));
    p.on('console', m=>{ if(m.type()==='error' && !m.text().includes('Failed to load resource')) errores.push('console: ' + m.text()); });
    await p.goto(BASE + '#/panel');
    await p.waitForFunction(()=>typeof DB!=='undefined' && DB && DB.divisas);
    // Sin recordatorio de respaldo tapando la pantalla.
    await p.evaluate(()=>{ DB.meta.ultimo_respaldo = Date.now(); save(); });
    return {ctx, p};
  }

  // Ayudantes que actúan sobre el ÚLTIMO elemento visible que coincide (los
  // carteles se apilan y los de debajo quedan ocultos con los mismos ids).
  function ayudantes(p){
    const espera = (ms=250)=>p.waitForTimeout(ms);
    const ir = async (h)=>{ await p.evaluate(h=>{ location.hash = h; }, h); await espera(); };
    const clic = async (sel, ms)=>{
      const hecho = await p.evaluate(sel=>{ const v=[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length>0); const el=v[v.length-1]; if(!el) return false; el.click(); return true; }, sel);
      if(!hecho) throw new Error('No hay elemento visible para: ' + sel);
      await espera(ms);
    };
    const escribir = async (sel, valor)=>{
      const hecho = await p.evaluate(([sel, valor])=>{ const v=[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length>0); const el=v[v.length-1]; if(!el) return false; el.value = valor; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; }, [sel, valor]);
      if(!hecho) throw new Error('No hay campo visible para: ' + sel);
    };
    const visible = (sel)=>p.evaluate(sel=>[...document.querySelectorAll(sel)].some(e=>e.getClientRects().length>0), sel);
    const texto = (sel)=>p.evaluate(sel=>{ const v=[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length>0); const el=v[v.length-1]; return el ? el.textContent : ''; }, sel);
    const clicFila = async (lista, contiene)=>{
      const hecho = await p.evaluate(([lista, contiene])=>{ const el=[...document.querySelectorAll(lista+' .list-item')].find(e=>e.textContent.includes(contiene)); if(!el) return false; el.click(); return true; }, [lista, contiene]);
      if(!hecho) throw new Error(`No hay fila con "${contiene}" en ${lista}`);
      await espera(350);
    };
    const saldo = (nombre)=>p.evaluate(n=>findDivisa(n).saldo, nombre);
    const ultimoEnlace = ()=>p.evaluate(()=>window.__abiertos[window.__abiertos.length-1] || '');
    const mensajeDe = (u)=>decodeURIComponent((u||'').split('?text=')[1] || '');
    return {espera, ir, clic, escribir, visible, texto, clicFila, saldo, ultimoEnlace, mensajeDe};
  }

  try{
    const {ctx, p} = await nuevaApp();
    const {espera, ir, clic, escribir, visible, texto, clicFila, saldo, ultimoEnlace, mensajeDe} = ayudantes(p);
    const [D1, D2] = await p.evaluate(()=>DB.divisas.slice(0,2).map(d=>d.nombre)); // divisas de entrega y de ganancia

    seccion('1. Menú y rutas');
    const rutas = await p.evaluate(()=>[...document.querySelectorAll('.menu-list a')].map(a=>a.getAttribute('href')));
    check(rutas[rutas.length-1]==='#/ajustes', 'Ajustes es el último menú');
    for(const h of [...rutas, '#/deudas/pagar_a', '#/deudas/me_deben', '#/entregas/destinatarios', '#/entregas/mensajeros', '#/entregas/compradores', '#/compras', '#/ventas', '#/busqueda', '#/precio-especial']) await ir(h);
    check(errores.length===0, `las ${rutas.length} rutas del menú y sus variantes abren sin errores ` + errores.join(' | '));

    seccion('2. Cliente y aviso de código de país');
    await ir('#/clientes');
    await clic('#fab-add-cliente');
    await escribir('#cf-nombre', 'Carlos Prueba');
    await p.evaluate(()=>{ const s=document.getElementById('cf-pais'); s.value = s.options[0].value; });
    await escribir('#cf-tel', '59200851');
    check(await visible('.telefono-aviso-pais'), 'número sin código de país: aparece el aviso');
    await escribir('#cf-tel', '+53 5920-0851');
    check(!(await visible('.telefono-aviso-pais')), 'con +53 el aviso desaparece');
    await clic('#cf-save', 350);
    const cid = await p.evaluate(()=>(DB.clientes.find(c=>c.nombre==='Carlos Prueba')||{}).id);
    check(!!cid, 'cliente guardado');

    seccion('3. Entregas: destinatario y mensajero');
    await ir('#/entregas/destinatarios');
    await clic('#fab-add-entrega');
    await escribir('#dsf-nombre', 'Dami'); await escribir('#dsf-completo', 'Damicela Prueba'); await escribir('#dsf-tel', '+53 5 2135359'); await escribir('#dsf-dir', 'Calle 12 #53');
    await clic('#dsf-save', 350);
    await ir('#/entregas/mensajeros');
    await clic('#fab-add-entrega');
    await escribir('#msf-nombre', 'Yoel Moto'); await escribir('#msf-tel', '+53 5 1112222');
    await clic('#msf-save', 350);
    check(await p.evaluate(()=>DB.destinatarios.length===1 && DB.mensajeros.length===1), 'destinatario y mensajero guardados');

    async function nuevoEnvio({descuenta, destinatario}){
      await ir('#/envio/cliente/' + cid);
      if(destinatario){ await clic('#ef-dest-btn'); await clic('#sel-ent-list [data-pick]', 350); }
      await escribir('#ef-cantidad', '100'); await escribir('#ef-precio', '82'); await escribir('#ef-ganancia', '5');
      await p.evaluate(([a,b])=>{ document.getElementById('ef-divisa-entrega').value=a; document.getElementById('ef-divisa-ganancia').value=b; }, [D1, D2]);
      await clic(`#ef-descuenta .pill[data-v="${descuenta}"]`);
      await clic('#ef-revisar', 300);
      await clic('#es-confirmar', 450);
    }

    seccion('4. Envío con «Descontar ahora: Sí»');
    let a1 = await saldo(D1), a2 = await saldo(D2);
    await nuevoEnvio({descuenta:1});
    check(await saldo(D1)===a1-8200 && await saldo(D2)===a2+5, `balance: ${D1} −8,200 y ${D2} +5`);
    check(await visible('#wa-si') && (await texto('.modal-msg')).includes('Carlos Prueba'), 'se ofrece avisar al cliente por WhatsApp');
    await clic('#wa-si', 300);
    const hoy = new Date(); const fecha = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;
    check((await ultimoEnlace()).startsWith('https://wa.me/5359200851?text='), 'enlace de WhatsApp con el número limpio');
    check(mensajeDe(await ultimoEnlace())===`Hola Carlos Prueba,\nSu envío de 100 USD fue entregado.\nCantidad: 8,200 ${D1}\nFecha ${fecha}\nMuchas gracias por confiar en nosotros.`, 'mensaje al cliente exacto');

    seccion('5. Envío con «No»: deuda en Pagar a, mensajero y pago');
    a1 = await saldo(D1); a2 = await saldo(D2);
    await nuevoEnvio({descuenta:0, destinatario:true});
    check(await saldo(D1)===a1 && await saldo(D2)===a2+5, 'solo entra la ganancia; la entrega queda pendiente');
    check(!(await visible('#wa-si')), 'no se ofrece WhatsApp al guardar (aún no se entregó)');
    const idDeuda = await p.evaluate(()=>(DB.deudas.find(d=>d.origen==='envio' && d.estado==='pendiente')||{}).id);
    check(!!idDeuda, 'se creó la deuda en Pagar a');
    await ir('#/deudas/pagar_a');
    await clic(`#deudas-list .list-item[data-id="${idDeuda}"]`, 350);
    await clic('#dd-mensajero-btn', 300);
    await clic('#sel-ent-list [data-pick]', 400);
    check((await ultimoEnlace()).startsWith('https://wa.me/5351112222?text='), 'abre WhatsApp del mensajero');
    check(mensajeDe(await ultimoEnlace())===`👤 Damicela Prueba\n📱 +53 5 2135359\n🧭 Calle 12 #53\n💰 8,200 ${D1}`, 'mensaje al mensajero con monto y divisa:\n' + mensajeDe(await ultimoEnlace()));
    check(await p.evaluate(()=>DB.envios.some(e=>e.mensajero_notificado_nombre==='Yoel Moto' && e.mensajero_notificado_fecha>0)), 'se guarda el mensajero notificado');
    await clic('#dd-cerrar', 300); await clic('#cd-ok', 450);
    check(await saldo(D1)===a1-8200, `al marcar pagado se resta la entrega de ${D1}`);
    check(await visible('#wa-no'), 'tras pagar se ofrece avisar al cliente');
    await clic('#wa-no', 300);

    seccion('6. Me deben: deudas manuales (tres tipos)');
    await ir('#/deudas/me_deben');
    const s0 = await saldo(D1);
    for(const [v, persona] of [['0','Ana Uno'], ['1','Beto Dos'], ['2','Ceci Tres']]){
      await clic('#fab-add-deuda');
      await escribir('#df-persona', persona); await escribir('#df-monto', '50');
      await p.evaluate(d=>{ document.getElementById('df-divisa').value = d; }, D1);
      await clic(`#df-afecta .pill[data-v="${v}"]`);
      await clic('#df-save', 350);
    }
    check(await saldo(D1)===s0-50, 'el Préstamo resta al crearse; los otros dos no');
    for(const persona of ['Ana Uno','Beto Dos','Ceci Tres']){
      await clicFila('#deudas-list', persona);
      check((await texto('.modal-title')).includes(persona) && await visible('#dd-cerrar') && await visible('#dd-del'), `${persona}: abre su detalle con Cobrar y Eliminar`);
      await p.evaluate(()=>closeModal()); await espera(350);
    }
    for(const persona of ['Beto Dos','Ceci Tres']){ await clicFila('#deudas-list', persona); await clic('#dd-cerrar', 300); await clic('#cd-ok', 450); }
    check(await saldo(D1)===s0+50, 'cobrar: Préstamo devuelve 50 y Sumar al cobrar suma 50');
    await clicFila('#deudas-list', 'Ana Uno'); await clic('#dd-del', 300); await clic('#cd-ok', 450);
    check(!(await p.evaluate(()=>DB.deudas.some(d=>d.persona==='Ana Uno'))), 'eliminar quita la deuda');
    await clic('.toast-undo-btn', 450);
    check(await p.evaluate(()=>DB.deudas.some(d=>d.persona==='Ana Uno')), 'Deshacer la restaura');
    await clic('#deudas-tabs .tab[data-v="historial"]', 350);
    await clicFila('#deudas-list', 'Beto Dos');
    check((await texto('.modal-title')).includes('Beto Dos'), 'las cobradas abren su detalle desde Historial');
    await p.evaluate(()=>closeModal()); await espera(350);

    seccion('7. Gastos: balance, eliminar y Deshacer');
    await ir('#/gastos');
    const g0 = await saldo(D1);
    await clic('#g-nuevo');
    await escribir('#gf-concepto', 'Alquiler prueba'); await escribir('#gf-cantidad', '30');
    await p.evaluate(d=>{ document.getElementById('gf-divisa').value = d; }, D1);
    await clic('#gf-save', 400);
    check(await saldo(D1)===g0-30, 'el gasto resta del balance');
    await clicFila('#g-list', 'Alquiler prueba'); await clic('#gd-del', 300); await clic('#cd-ok', 450);
    check(await saldo(D1)===g0, 'eliminar el gasto devuelve el saldo');
    await clic('.toast-undo-btn', 450);
    check(await saldo(D1)===g0-30 && await p.evaluate(()=>DB.gastos.length===1), 'Deshacer restaura gasto y saldo');

    seccion('8. Ventas');
    await ir('#/ventas');
    const v1 = await saldo(D1), v2 = await saldo(D2);
    await clic('#v-nuevo');
    await escribir('#vf-cvendida', '10'); await escribir('#vf-crecibida', '4000');
    await p.evaluate(([a,b])=>{ document.getElementById('vf-dvendida').value=a; document.getElementById('vf-drecibida').value=b; }, [D1, D2]);
    await clic('#vf-save', 450);
    check(await saldo(D1)===v1-10 && await saldo(D2)===v2+4000, 'la venta resta lo vendido y suma lo recibido');

    seccion('9. Panel: recordatorio de deudas viejas');
    await ir('#/panel');
    check(!(await texto('.panel-rows')).includes('Pendientes de más de'), 'sin deudas viejas no hay recordatorio');
    await p.evaluate(()=>{ const d = DB.deudas.find(d=>d.persona==='Ana Uno'); d.creado_en = d.fecha = Date.now() - 9*86400000; save(); route(); });
    await espera();
    check(/Pendientes de más de 7 días\s*1 me deben/.test(await texto('.panel-rows')), 'con una deuda de 9 días aparece "1 me deben"');

    seccion('10. Respaldo cifrado: exportar e importar en otra instalación');
    await ir('#/respaldos');
    const [descarga] = await Promise.all([p.waitForEvent('download'), clic('#rp-export')]);
    const rmb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remesas-')), 'prueba.rmb');
    await descarga.saveAs(rmb);
    const bytes = fs.readFileSync(rmb);
    check(bytes.slice(0,4).toString()==='RMBS' && !bytes.toString('latin1').includes('Carlos Prueba'), 'el archivo está cifrado (no se lee el contenido)');
    const otra = await nuevaApp();
    await ayudantes(otra.p).ir('#/respaldos');
    await otra.p.setInputFiles('#rp-file', rmb);
    await otra.p.waitForTimeout(2000);
    const cuenta = (pg)=>pg.evaluate(()=>['clientes','envios','deudas','gastos','ventas','destinatarios','mensajeros'].map(k=>DB[k].length).join(','));
    check(await cuenta(otra.p)===await cuenta(p), 'la otra instalación recibe los mismos registros: ' + await cuenta(otra.p));
    const saldos = (pg)=>pg.evaluate(()=>DB.divisas.map(d=>d.saldo).join(','));
    check(await saldos(otra.p)===await saldos(p), 'y los mismos saldos en todas las divisas');
    await otra.p.evaluate(()=>closeModal()); await otra.p.waitForTimeout(300);
    await otra.p.setInputFiles('#rp-file', rmb);
    await otra.p.waitForTimeout(2000);
    check(await cuenta(otra.p)===await cuenta(p) && await saldos(otra.p)===await saldos(p), 'importar el mismo respaldo otra vez no duplica nada');
    await otra.ctx.close();
    fs.rmSync(path.dirname(rmb), {recursive:true, force:true});
    await ctx.close();

    seccion('11. Ajustes: Buscar actualizaciones (APK simulada)');
    const apk = await nuevaApp({puente:true});
    const A = ayudantes(apk.p);
    let etiqueta = 'v1.0.104', falla = false;
    await apk.ctx.route('https://api.github.com/**', r=> falla ? r.abort() : r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify({tag_name:etiqueta})}));
    await A.ir('#/ajustes');
    check((await A.texto('#aj-version'))==='1.0.104', 'muestra la versión instalada');
    await A.clic('#aj-actualizar', 600);
    check((await A.texto('#toast')).includes('última versión'), 'al día: "Ya tienes la última versión"');
    etiqueta = 'v1.0.150';
    await A.clic('#aj-actualizar', 600);
    check(await A.visible('#apk-banner') && (await A.texto('#apk-banner')).includes('1.0.150'), 'hay versión nueva: ofrece descargarla sin esperar las 6 horas');
    await apk.p.evaluate(()=>{ document.getElementById('apk-banner').remove(); localStorage.removeItem('remesas_revision_apk_v1'); });
    falla = true;
    await A.clic('#aj-actualizar', 600);
    check((await A.texto('#toast')).includes('No se pudo comprobar'), 'sin conexión: lo dice claramente');
    await apk.ctx.close();

    check(errores.length===0, 'sin errores de JavaScript en toda la prueba ' + errores.join(' | '));
  }catch(e){
    fallos++;
    console.log('  ✘ FALLO: la prueba se interrumpió:', e.message);
  }

  await browser.close();
  srv.close();
  console.log(`\nResultado: ${ok} OK, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})();
