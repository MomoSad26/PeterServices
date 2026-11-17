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
      await escribir('#ef-cantidad', '100'); await escribir('#ef-precio', '82'); await escribir('#ef-ganancia', '5');
      await escribir('#ef-divisa-entrega', D1);
      await clic('#ef-add-entrega', 250);
      if(destinatario){ await clic('#ef-entregas-list [data-pick-split="0"]'); await clic('#sel-ent-list [data-pick]', 350); }
      await escribir('#ef-entregas-list [data-cant-split="0"]', '8200');
      await escribir('#ef-entregas-list [data-div-split="0"]', D1);
      await escribir('#ef-divisa-ganancia', D2);
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
    check(!(await visible('#dd-edit')), 'una deuda automática de envío no ofrece Editar');
    await clic('#dd-mensajero-btn', 300);
    await clic('#sel-ent-list [data-pick]', 400);
    check((await ultimoEnlace()).startsWith('https://wa.me/5351112222?text='), 'abre WhatsApp del mensajero');
    check(mensajeDe(await ultimoEnlace())===`👤 Damicela Prueba\n📱 +53 5 2135359\n🧭 Calle 12 #53\n💰 8,200 ${D1}`, 'mensaje al mensajero con monto y divisa:\n' + mensajeDe(await ultimoEnlace()));
    check(await p.evaluate(()=>DB.envios.some(e=>(e.entregas||[]).some(x=>x.mensajero_notificado_nombre==='Yoel Moto'&&x.mensajero_notificado_fecha>0))), 'se guarda el mensajero notificado en la entrega correspondiente');
    await clic('#dd-cerrar', 300); await clic('#cd-ok', 450);
    check(await saldo(D1)===a1-8200, `al marcar pagado se resta la entrega de ${D1}`);
    check(await visible('#wa-no'), 'tras pagar se ofrece avisar al cliente');
    await clic('#wa-no', 300);

    seccion('5b. Envío con dos destinatarios y ganancia adicional');
    const extra = await p.evaluate(()=>{
      const d={id:nextId('destinatarios'),nombre:'Lia Destino',nombre_completo:'Lia Destino Prueba',
        telefono:'+53 50000000',direccion:'Calle B',activo:1};
      DB.destinatarios.push(d);
      const div=addDivisa('EUR prueba');
      save();
      return {destId:d.id,divisa:div.nombre};
    });
    const splitBase1=await saldo(D1), splitBase2=await saldo(D2), splitBase3=await saldo(extra.divisa);
    await ir('#/envio/cliente/' + cid);
    const ordenNuevo = await p.evaluate(selectores=>{
      const els=selectores.map(sel=>document.querySelector(sel));
      return els.every((el,i)=>!!el&&(!i||(els[i-1].compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)));
    },['#ef-fecha','#ef-entity-picker','#ef-cantidad','#ef-moneda','#ef-precio','#ef-cantidad-entregar','#ef-divisa-entrega','#ef-entregas-list','#ef-cotizado','#ef-ganancia','#ef-divisa-ganancia','#ef-forma','#ef-ganancias-extra','#ef-descuenta','#ef-nota','#ef-revisar']);
    check(ordenNuevo,'el formulario nuevo respeta el orden solicitado de fecha a botón guardar');
    await escribir('#ef-cantidad','10'); await escribir('#ef-precio','1'); await escribir('#ef-cotizado','1.5');
    check(await p.locator('#ef-cantidad-entregar').inputValue()==='10','la cantidad de referencia se calcula como cantidad enviada por precio');
    await escribir('#ef-cantidad-entregar','15');
    await escribir('#ef-cantidad','20'); await escribir('#ef-cantidad','10');
    check(await p.locator('#ef-cantidad-entregar').inputValue()==='15','la cantidad global conserva el ajuste manual aunque cambie la cantidad enviada');
    await escribir('#ef-divisa-entrega',D1);
    await clic('#ef-add-entrega',250);
    check(await p.locator('#ef-entregas-list [data-cant-split="0"]').inputValue()==='15' &&
      await p.locator('#ef-entregas-list [data-div-split="0"]').inputValue()===D1,
      'el primer split copia la cantidad y divisa globales actuales');
    await escribir('#ef-entregas-list [data-cant-split="0"]','100');
    await escribir('#ef-entregas-list [data-div-split="0"]',D1);
    // `clic` pulsa el ÚLTIMO elemento visible: se elige a Dami por su id para
    // no tomar por error el último destinatario de la lista (Lia).
    const idDami=await p.evaluate(()=>DB.destinatarios.find(d=>d.nombre==='Dami').id);
    await clic('#ef-entregas-list [data-pick-split="0"]'); await clic(`#sel-ent-list [data-pick="${idDami}"]`,350);
    await clic('#ef-add-entrega',250);
    check(await p.locator('#ef-entregas-list [data-cant-split="1"]').inputValue()==='15' &&
      await p.locator('#ef-entregas-list [data-div-split="1"]').inputValue()===D1,
      'el segundo split copia los valores globales, no los del primer split editado');
    await escribir('#ef-entregas-list [data-cant-split="1"]','200');
    await escribir('#ef-entregas-list [data-div-split="1"]',D2);
    await clic('#ef-entregas-list [data-pick-split="1"]');
    await clic(`#sel-ent-list [data-pick="${extra.destId}"]`,350);
    await escribir('#ef-divisa-ganancia',D1);
    await clic('#ef-add-ganancia',250);
    await escribir('#ef-ganancias-extra [data-cant-extra="0"]','3');
    await escribir('#ef-ganancias-extra [data-div-extra="0"]',extra.divisa);
    await clic('#ef-ganancias-extra [data-forma-extra="0"] .pill[data-v="Transferencia"]',200);
    await clic('#ef-descuenta .pill[data-v="0"]');
    await clic('#ef-revisar',300);
    const clavesResumen=await p.locator('.modal-backdrop .card .sumrow .k').allTextContents();
    const resumenVisual=await p.locator('.modal-backdrop .card').innerText();
    check(clavesResumen[0]==='Fecha y hora' && clavesResumen[1]==='Cliente' && clavesResumen[2]==='Cantidad enviada' &&
      clavesResumen[3]==='Moneda' && clavesResumen[4]==='Precio' && clavesResumen[5]==='Cantidad a entregar (plantilla)',
      'el resumen distingue la cantidad global como plantilla cuando hay splits');
    check(resumenVisual.includes('Cantidad a entregar (plantilla)')&&resumenVisual.includes('15'),
      'el resumen muestra la cantidad global y su divisa como plantilla');
    await clic('#es-confirmar',450);
    const envioSplitId=await p.evaluate(()=>DB.envios[DB.envios.length-1].id);
    const deudasSplit=await p.evaluate(id=>DB.deudas.filter(d=>d.origen==='envio'&&d.origen_id===id&&d.estado==='pendiente').map(d=>({id:d.id,detalle:d.origen_detalle_id,divisa:d.divisa,monto:d.monto})),envioSplitId);
    check(deudasSplit.length===2 && new Set(deudasSplit.map(x=>x.detalle)).size===2,'se crean dos deudas independientes, cada una vinculada a su entrega');
    check(await saldo(D1)===splitBase1+5 && await saldo(D2)===splitBase2 && await saldo(extra.divisa)===splitBase3+3,
      'ganancia principal y ganancia adicional entran en sus respectivas divisas');
    await ir('#/deudas/pagar_a');
    const deudaD1=deudasSplit.find(x=>x.divisa===D1), deudaD2=deudasSplit.find(x=>x.divisa===D2);
    // Simula una deuda histórica que se creó antes de persistir origen_detalle_id.
    await p.evaluate(({envioId,deudaId})=>{
      const d=DB.deudas.find(x=>x.id===deudaId&&x.origen_id===envioId);
      if(d)delete d.origen_detalle_id;
      save();
    },{envioId:envioSplitId,deudaId:deudaD2.id});
    await clic(`#deudas-list .list-item[data-id="${deudaD1.id}"]`,300);
    check(!(await visible('#dd-edit')), 'las deudas de los splits siguen siendo automáticas y no editables');
    await clic('#dd-mensajero-btn',250); await clic('#sel-ent-list [data-pick]',350);
    check(mensajeDe(await ultimoEnlace())===`👤 Damicela Prueba\n📱 +53 5 2135359\n🧭 Calle 12 #53\n💰 100 ${D1}`,
      'el primer split genera un mensaje para su propio destinatario: '+JSON.stringify(mensajeDe(await ultimoEnlace())));
    await clic('#dd-cerrar',250); await clic('#cd-ok',350); await clic('#wa-no',250);
    check(await saldo(D1)===splitBase1+5,'pagar split en la misma divisa que la ganancia principal no duplica el descuento');
    await clic(`#deudas-list .list-item[data-id="${deudaD2.id}"]`,300);
    await clic('#dd-mensajero-btn',250); await clic('#sel-ent-list [data-pick]',350);
    check(mensajeDe(await ultimoEnlace())===`👤 Lia Destino Prueba\n📱 +53 50000000\n🧭 Calle B\n💰 200 ${D2}`,
      'el segundo split genera un mensaje independiente con los datos del segundo destinatario');
    await clic('#dd-cerrar',250); await clic('#cd-ok',350); await clic('#wa-no',250);
    check(await saldo(D2)===splitBase2-200,'pagar el otro split descuenta solo su propia cantidad y divisa');
    await ir('#/envio-detalle/' + envioSplitId);
    check((await texto('.card')).includes('Ganancia adicional') && (await texto('.card')).includes('Lia Destino'),
      'el detalle muestra destinatarios, entregas y ganancias adicionales');
    await clic('#ed-edit',350);
    const ordenEdicion = await p.evaluate(selectores=>{
      const els=selectores.map(sel=>document.querySelector(sel));
      return els.every((el,i)=>!!el&&(!i||(els[i-1].compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)));
    },['#ee-fecha','#ee-entity-picker','#ee-cantidad','#ee-moneda','#ee-precio','#ee-cantidad-entregar','#ee-divisa-entrega','#ee-entregas-list','#ee-cotizado','#ee-ganancia','#ee-divisa-ganancia','#ee-forma','#ee-ganancias-extra','#ee-descuenta','#ee-nota','#ee-save']);
    check(ordenEdicion,'el formulario de edición respeta el nuevo orden con divisa global');
    check(await p.locator('#ee-cantidad-entregar').inputValue()==='15','la edición conserva la cantidad global usada como plantilla');
    await escribir('#ee-entregas-list [data-cant-split="1"]','210');
    await clic('#ee-save',250); await clic('#cd-ok',450);
    const deudaEditada=await p.evaluate(id=>{const d=DB.deudas.find(x=>x.id===id);return d?{monto:d.monto,estado:d.estado}:null;},deudaD2.id);
    check(deudaEditada && deudaEditada.monto===210 && deudaEditada.estado==='pagado',
      'editar un split actualiza su deuda sin perder el estado de pago');
    check(await saldo(D2)===splitBase2-210,
      'editar una entrega ya pagada revierte el importe anterior y aplica el nuevo exactamente una vez');
    await ir('#/panel');

    seccion('5c. Envío sin destinatarios: entrega global');
    const globalBase1=await saldo(D1), globalBase2=await saldo(D2);
    await ir('#/envio/cliente/' + cid);
    await escribir('#ef-cantidad','12'); await escribir('#ef-precio','2');
    await escribir('#ef-ganancia','3'); await escribir('#ef-divisa-entrega',D1);
    await escribir('#ef-divisa-ganancia',D2);
    await clic('#ef-descuenta .pill[data-v="0"]');
    check(await p.locator('#ef-entregas-list .card').count()===0,'el formulario permite mantener cero destinatarios');
    await clic('#ef-revisar',300);
    check((await p.locator('.modal-backdrop .card').innerText()).includes('Entrega') &&
      (await p.locator('.modal-backdrop .card').innerText()).includes(`24 ${D1}`),
      'el resumen muestra la entrega global cuando no hay splits');
    await clic('#es-confirmar',450);
    const globalEnvio=await p.evaluate(()=>DB.envios[DB.envios.length-1]);
    const deudaGlobal=await p.evaluate(id=>DB.deudas.find(d=>d.origen==='envio'&&d.origen_id===id),globalEnvio.id);
    check(globalEnvio.entregas.length===0 && globalEnvio.cantidad_entrega_global===24 && globalEnvio.divisa_entrega_global===D1,
      'el envío guarda cantidad y divisa globales sin crear splits');
    check(deudaGlobal && deudaGlobal.monto===24 && deudaGlobal.divisa===D1 && deudaGlobal.origen_detalle_id==null,
      'sin splits se crea una única deuda con la entrega global');
    check(await saldo(D1)===globalBase1 && await saldo(D2)===globalBase2+3,
      'sin splits el balance no descuenta entrega pendiente y registra la ganancia habitual');
    await ir('#/deudas/pagar_a');
    await clic(`#deudas-list .list-item[data-id="${deudaGlobal.id}"]`,300);
    check(!(await visible('#dd-edit')),'la deuda automática global tampoco ofrece Editar');
    await clic('#dd-cerrar',250); await clic('#cd-ok',350);
    check(await saldo(D1)===globalBase1-24,'al pagar la deuda global se descuenta su importe de la divisa de entrega');
    if(await visible('#wa-no'))await clic('#wa-no',250);
    await ir('#/envio-detalle/' + globalEnvio.id); await clic('#ed-edit',300);
    check(await p.locator('#ee-entregas-list .card').count()===0,'la edición mantiene el modo global sin destinatarios');
    check(await p.locator('#ee-cantidad-entregar').inputValue()==='24' &&
      await p.locator('#ee-divisa-entrega').inputValue()===D1,
      'la edición precarga cantidad y divisa globales');
    await escribir('#ee-cantidad-entregar','30');
    await clic('#ee-save',250); await clic('#cd-ok',450);
    const globalDeudaEditada=await p.evaluate(id=>DB.deudas.find(d=>d.origen==='envio'&&d.origen_id===id),globalEnvio.id);
    check(globalDeudaEditada?.monto===30 && globalDeudaEditada?.estado==='pagado',
      'editar la entrega global actualiza la deuda sin perder su estado pagado');
    check(await saldo(D1)===globalBase1-30 && await saldo(D2)===globalBase2+3,
      'editar una entrega global ya pagada revierte el importe anterior y aplica el nuevo una sola vez');

    seccion('5d. Envío global con descuento inmediato');
    const inmediatoBase1=await saldo(D1), inmediatoBase2=await saldo(D2);
    await ir('#/envio/cliente/' + cid);
    await escribir('#ef-cantidad','5'); await escribir('#ef-precio','3');
    await escribir('#ef-ganancia','2'); await escribir('#ef-divisa-entrega',D1);
    await escribir('#ef-divisa-ganancia',D2);
    await clic('#ef-descuenta .pill[data-v="1"]');
    await clic('#ef-revisar',300); await clic('#es-confirmar',450);
    const envioGlobalInmediato=await p.evaluate(()=>DB.envios[DB.envios.length-1]);
    check(envioGlobalInmediato.entregas.length===0 &&
      !(await p.evaluate(id=>DB.deudas.some(d=>d.origen==='envio'&&d.origen_id===id),envioGlobalInmediato.id)),
      'el envío global con descuento inmediato no crea splits ni deudas');
    check(await saldo(D1)===inmediatoBase1-15 && await saldo(D2)===inmediatoBase2+2,
      'el descuento inmediato usa la cantidad y divisa globales sin cambiar la fórmula de ganancia');
    if(await visible('#wa-no'))await clic('#wa-no',250);

    seccion('5e. «Pagar a»: nombres, botón de destinatario y tarifa del mensajero');
    // Botón: sin destinatarios «+ Agregar destinatario»; con uno o más «+ Agregar otro destinatario».
    await ir('#/envio/cliente/' + cid);
    check((await texto('#ef-add-entrega')).trim()==='+ Agregar destinatario','sin destinatarios el botón dice «+ Agregar destinatario»');
    await clic('#ef-add-entrega',250);
    check((await texto('#ef-add-entrega')).trim()==='+ Agregar otro destinatario','con un destinatario el botón cambia a «+ Agregar otro destinatario»');
    await clic('#ef-entregas-list [data-del-split="0"]',250).catch(()=>{});
    await ir('#/panel');
    // Nombres: 0 o 1 destinatario → cliente; 2 o más → cada destinatario.
    const nombresPagarA=()=>p.evaluate(()=>DB.deudas.filter(d=>d.origen==='envio').map(d=>d.persona));
    const antesNorm=await nombresPagarA();
    check(antesNorm.includes(`Carlos Prueba – 8,200 ${D1}`),'con un destinatario la deuda lleva el nombre del cliente: '+JSON.stringify(antesNorm));
    check(antesNorm.includes(`Dami – 100 ${D1}`) && antesNorm.includes(`Lia Destino – 210 ${D2}`),'con dos destinatarios cada deuda lleva el nombre de su destinatario');
    check(antesNorm.includes(`Carlos Prueba – 30 ${D1}`),'sin destinatarios la deuda lleva el nombre del cliente');
    await p.evaluate(()=>{normalizarNombresDeudasAutomaticas();save();});
    check(JSON.stringify(await nombresPagarA())===JSON.stringify(antesNorm),'el normalizador del arranque no cambia los nombres (consistentes tras recargar)');
    // Mensajero con tarifa y divisa de descuento desde el formulario.
    await ir('#/entregas/mensajeros');
    await clic('#fab-add-entrega');
    await escribir('#msf-nombre','Tito Tarifa'); await escribir('#msf-tel','+53 5 3334444');
    await escribir('#msf-tarifa','50'); await p.selectOption('#msf-divisa',D1);
    await clic('#msf-save',350);
    const tito=await p.evaluate(()=>{const m=DB.mensajeros.find(x=>x.nombre==='Tito Tarifa');return m?{id:m.id,tarifa:m.tarifa,divisa:m.divisa_descuento}:null;});
    check(tito && tito.tarifa===50 && tito.divisa===D1,'el mensajero guarda tarifa y divisa de descuento: '+JSON.stringify(tito));
    async function pagarConTito(){
      await nuevoEnvio({descuenta:0, destinatario:true});
      const id=await p.evaluate(()=>{const e=DB.envios[DB.envios.length-1];return DB.deudas.find(d=>d.origen==='envio'&&d.origen_id===e.id).id;});
      await ir('#/deudas/pagar_a');
      await clic(`#deudas-list .list-item[data-id="${id}"]`,350);
      await clic('#dd-mensajero-btn',300); await clic(`#sel-ent-list [data-pick="${tito.id}"]`,400);
      check(await p.evaluate(id=>DB.deudas.find(d=>d.id===id).mensajero_notificado_id,id)===tito.id,'la deuda guarda el mensajero notificado');
      await clic('#dd-cerrar',300); await clic('#cd-ok',450);
      return id;
    }
    let t1=await saldo(D1);
    const deudaTarifa=await pagarConTito();
    check(await saldo(D1)===t1-8200-50,'al pagar se descuentan la entrega y la tarifa del mensajero');
    check(await p.evaluate(({n,id})=>movimientosDeDivisa(n).some(m=>m.tipo==='Tarifa mensajero'&&m.concepto==='Tarifa de Tito Tarifa'&&m.monto===-50&&m.origenId===id),{n:D1,id:deudaTarifa}),
      'el historial por divisa registra «Tarifa mensajero – Tarifa de Tito Tarifa»');
    if(await visible('#wa-no'))await clic('#wa-no',250);
    await clic('#deudas-tabs .tab[data-v="historial"]',350);
    await clic(`#deudas-list .list-item[data-id="${deudaTarifa}"]`,350);
    await clic('#dd-del',300); await clic('#cd-ok',450);
    check(await saldo(D1)===t1,'eliminar la deuda pagada revierte la entrega y la tarifa');
    // Tarifa sin divisa: aviso y sin descuento.
    await p.evaluate(id=>{DB.mensajeros.find(m=>m.id===id).divisa_descuento=null;save();},tito.id);
    t1=await saldo(D1);
    await pagarConTito();
    check(await visible('#tm-ok') && (await texto('.modal-msg')).includes('Este mensajero tiene tarifa pero no tiene divisa de descuento configurada. Edítalo para poder descontar la tarifa.'),
      'tarifa sin divisa: aparece el aviso exacto');
    await clic('#tm-ok',300);
    check(await saldo(D1)===t1-8200,'tarifa sin divisa: solo se descuenta la entrega');
    if(await visible('#wa-no'))await clic('#wa-no',250);
    // Tarifa en 0: no se descuenta nada extra. Y eliminar el envío revierte la tarifa aplicada.
    await p.evaluate(({id,d})=>{const m=DB.mensajeros.find(x=>x.id===id);m.divisa_descuento=d;m.tarifa=0;save();},{id:tito.id,d:D1});
    t1=await saldo(D1);
    await pagarConTito();
    check(await saldo(D1)===t1-8200,'tarifa 0: no se descuenta tarifa');
    if(await visible('#wa-no'))await clic('#wa-no',250);
    await p.evaluate(id=>{DB.mensajeros.find(x=>x.id===id).tarifa=50;save();},tito.id);
    t1=await saldo(D1);
    await pagarConTito();
    const envioTarifa=await p.evaluate(()=>DB.envios[DB.envios.length-1].id);
    check(await saldo(D1)===t1-8250,'con tarifa restaurada se descuenta de nuevo');
    if(await visible('#wa-no'))await clic('#wa-no',250);
    await ir('#/envio-detalle/' + envioTarifa);
    await clic('#ed-del',300); await clic('#cd-ok',450);
    check(await saldo(D1)===t1,'eliminar el envío pagado revierte también la tarifa del mensajero');
    await ir('#/panel');

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
      check((await texto('.modal-title')).includes(persona) && await visible('#dd-cerrar') && await visible('#dd-del') && await visible('#dd-edit'), `${persona}: abre el detalle con Cobrar, Eliminar y Editar`);
      await p.evaluate(()=>closeModal()); await espera(350);
    }
    await clicFila('#deudas-list','Beto Dos'); await clic('#dd-edit',250);
    await escribir('#de-monto','60'); await clic('#de-save',350);
    check(await p.evaluate(()=>DB.deudas.some(d=>d.persona==='Beto Dos'&&d.monto===60)) && await saldo(D1)===s0-60,
      'editar un Préstamo pendiente revierte el monto anterior y aplica el nuevo una sola vez');
    await p.evaluate(()=>closeModal()); await espera(350);
    for(const persona of ['Beto Dos','Ceci Tres']){ await clicFila('#deudas-list', persona); await clic('#dd-cerrar', 300); await clic('#cd-ok', 450); }
    check(await saldo(D1)===s0+50, 'cobrar: Préstamo devuelve 50 y Sumar al cobrar suma 50');
    await clicFila('#deudas-list', 'Ana Uno'); await clic('#dd-del', 300); await clic('#cd-ok', 450);
    check(!(await p.evaluate(()=>DB.deudas.some(d=>d.persona==='Ana Uno'))), 'eliminar quita la deuda');
    await clic('.toast-undo-btn', 450);
    check(await p.evaluate(()=>DB.deudas.some(d=>d.persona==='Ana Uno')), 'Deshacer la restaura');
    await clic('#deudas-tabs .tab[data-v="historial"]', 350);
    await clicFila('#deudas-list', 'Beto Dos');
    check((await texto('.modal-title')).includes('Beto Dos') && !(await visible('#dd-edit')), 'las cobradas abren su detalle desde Historial sin ofrecer Editar');
    await p.evaluate(()=>closeModal()); await espera(350);

    seccion('6b. Deuda manual agrupada con comprador');
    const grupoDeudaId=await p.evaluate(divisa=>{
      const c={id:nextId('compradores'),nombre:'Grupo Manual Prueba',nombre_completo:'',telefono:'',direccion:'',activo:1};
      DB.compradores.push(c);
      const d={id:nextId('deudas'),tipo:'me_deben',persona:c.nombre,monto:25,divisa,fecha:Date.now(),creado_en:Date.now(),
        afecta_balance:0,estado:'pendiente',fecha_cierre:null,nota:'',origen:null,origen_id:null,tipo_me_deben:0,
        comprador_id:c.id,comprador_nombre:c.nombre,comprador_nombre_completo:'',comprador_telefono:'',comprador_direccion:''};
      DB.deudas.push(d);save();return d.id;
    },D1);
    // Se viene de la pestaña Historial con el mismo hash: se vuelve a «Me deben» con su pestaña.
    await ir('#/deudas/me_deben'); await clic('#deudas-tabs .tab[data-v="me_deben"]',350); await clicFila('#deudas-list','Grupo Manual Prueba');
    check(await visible('[data-edit-deuda]'),'el detalle de un grupo ofrece editar los registros manuales pendientes');
    await clic(`[data-edit-deuda="${grupoDeudaId}"]`,250);
    await escribir('#de-monto','30'); await clic('#de-save',350);
    check(await p.evaluate(id=>DB.deudas.find(d=>d.id===id)?.monto,grupoDeudaId)===30,
      'la edición desde un grupo actualiza únicamente su registro manual');
    await p.evaluate(()=>closeModal()); await espera(350);

    seccion('6c. Deuda manual pendiente en «Pagar a»');
    await ir('#/deudas/pagar_a'); await clic('#fab-add-deuda');
    await escribir('#df-persona','Deuda Manual Pagar'); await escribir('#df-monto','35');
    await p.evaluate(d=>{document.getElementById('df-divisa').value=d;},D1);
    await clic('#df-save',350);
    await clicFila('#deudas-list','Deuda Manual Pagar');
    check(await visible('#dd-edit'),'«Pagar a» muestra Editar en deuda manual pendiente');
    await clic('#dd-edit',250); await escribir('#de-monto','40');
    await clic('#de-afecta .pill[data-v="1"]'); await clic('#de-save',350);
    const deudaPagarEditada=await p.evaluate(()=>DB.deudas.find(d=>d.persona==='Deuda Manual Pagar'));
    check(deudaPagarEditada?.monto===40 && deudaPagarEditada?.afecta_balance===1,
      'editar «Pagar a» permite modificar monto y descuento al pagar');
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
