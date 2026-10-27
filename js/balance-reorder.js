/* ---------------------------------------------------------------------- *
 * Reordenamiento táctil de divisas — exclusivo del Menú Balance.
 * Entrada: long press de 400 ms o botón "Reordenar divisas".
 * Usa Pointer Events y persiste el orden mientras se arrastra para que una
 * salida inesperada o un cambio de menú no pierda el último orden visible.
 * ---------------------------------------------------------------------- */
let balanceReorderCleanup = null;
const renderBalanceOriginalConReordenamiento = renderBalance;
renderBalance = function(content){
  if(balanceReorderCleanup) balanceReorderCleanup();
  renderBalanceOriginalConReordenamiento(content);
  activarControlReordenamientoBalance(content);
};

function activarControlReordenamientoBalance(content){
  const lista = content.querySelector('#b-general');
  const botonAgregar = content.querySelector('#b-add-divisa');
  const botonEliminar = content.querySelector('#b-del-divisa');
  if(!lista || !botonAgregar || !botonEliminar) return;

  const barra = botonAgregar.parentElement;
  barra.classList.add('bal-actions');
  const botonReordenar = document.createElement('button');
  botonReordenar.type = 'button';
  botonReordenar.id = 'b-reorder-divisa';
  botonReordenar.className = 'btn btn-outline btn-block';
  botonReordenar.textContent = '↕️ Reordenar divisas';
  barra.appendChild(botonReordenar);

  let modoReordenar = false;
  // Solo el botón mantiene el modo abierto después de soltar un arrastre.
  let modoReordenarPorBoton = false;
  let pulsacionPendiente = null;
  let arrastre = null;
  let clickSuprimidoEn = null;
  let clickSuprimidoHasta = 0;
  let cerrado = false;

  function cancelarPulsacion(suprimirClick){
    if(!pulsacionPendiente) return;
    clearTimeout(pulsacionPendiente.temporizador);
    pulsacionPendiente.tarjeta.classList.remove('longpress-pending');
    if(suprimirClick){
      clickSuprimidoEn = pulsacionPendiente.tarjeta;
      clickSuprimidoHasta = Date.now() + 650;
    }
    pulsacionPendiente = null;
  }

  function tarjetasVisuales(estado){
    return Array.from(lista.children)
      .map(nodo=>nodo===estado.placeholder ? estado.tarjeta : nodo)
      .filter(nodo=>nodo && nodo.classList && nodo.classList.contains('bal-card') && nodo.dataset.divisa);
  }

  function nombresOrdenVisual(estado){
    return tarjetasVisuales(estado).map(t=>t.dataset.divisa);
  }

  function ordenarBalanceFiltrado(){
    const filtrado = content.querySelector('#b-filtered');
    if(!filtrado) return;
    const orden = new Map(divisasOrdenadasParaBalance().map((d,i)=>[d.nombre,i]));
    const tarjetas = Array.from(filtrado.querySelectorAll('.bal-card[data-divisa]'));
    tarjetas.sort((a,b)=>(orden.get(a.dataset.divisa) ?? 999999)-(orden.get(b.dataset.divisa) ?? 999999));
    tarjetas.forEach(t=>filtrado.appendChild(t));
  }

  function guardarOrdenPreview(estado){
    const divisas = tarjetasVisuales(estado)
      .map(t=>DB.divisas.find(d=>d.nombre===t.dataset.divisa))
      .filter(Boolean);
    if(aplicarOrdenBalanceLista(divisas)){
      save();
      ordenarBalanceFiltrado();
    }
  }

  function animarMovimientoLista(mutacion){
    const nodos = Array.from(lista.children);
    const posiciones = new Map(nodos.map(n=>[n,n.getBoundingClientRect().top]));
    mutacion();
    nodos.forEach(n=>{
      if(!n.isConnected && !lista.contains(n)) return;
      const antes = posiciones.get(n);
      if(antes===undefined) return;
      const despues = n.getBoundingClientRect().top;
      const delta = antes-despues;
      if(Math.abs(delta)<1) return;
      n.style.transition = 'none';
      n.style.transform = 'translateY(' + delta + 'px)';
    });
    requestAnimationFrame(()=>{
      nodos.forEach(n=>{
        if(!n.isConnected && !lista.contains(n)) return;
        if(!n.style.transform) return;
        n.style.transition = 'transform 180ms ease';
        n.style.transform = 'translateY(0)';
        setTimeout(()=>{
          n.style.transition = '';
          n.style.transform = '';
        }, 200);
      });
    });
  }

  function actualizarPosicionPlaceholder(yCentroVirtual){
    const estado = arrastre;
    if(!estado || !lista.contains(estado.placeholder)) return;
    const candidatas = Array.from(lista.children).filter(n=>n!==estado.placeholder && n.classList.contains('bal-card'));
    const anterior = candidatas.find(n=>{
      const r=n.getBoundingClientRect();
      return yCentroVirtual < r.top + r.height/2;
    }) || null;
    const yaEstaEnLugar = anterior
      ? estado.placeholder.nextElementSibling === anterior
      : lista.lastElementChild === estado.placeholder;
    if(yaEstaEnLugar) return;

    animarMovimientoLista(()=>{
      if(anterior) lista.insertBefore(estado.placeholder, anterior);
      else lista.appendChild(estado.placeholder);
    });
    guardarOrdenPreview(estado);
  }

  function detenerAutoScroll(){
    if(arrastre && arrastre.frameAutoScroll){
      cancelAnimationFrame(arrastre.frameAutoScroll);
      arrastre.frameAutoScroll = 0;
    }
    if(arrastre){
      arrastre.direccionAutoScroll = 0;
      arrastre.intensidadAutoScroll = 0;
    }
  }

  function centroVirtualDelArrastre(estado){
    const desplazamientoLista = lista.scrollTop - estado.scrollTopInicial;
    return estado.ultimoY - estado.offsetY + estado.alto/2 +
      estado.desfaseDiseno - desplazamientoLista;
  }

  function cicloAutoScroll(){
    const estado = arrastre;
    if(!estado) return;
    estado.frameAutoScroll = 0;
    if(!estado.direccionAutoScroll || estado.pausarAutoScrollHastaMoverse) return;

    const maximo = Math.max(0, lista.scrollHeight-lista.clientHeight);
    if(maximo <= 0){
      estado.direccionAutoScroll = 0;
      return;
    }
    const anterior = lista.scrollTop;
    const velocidad = 2 + 10*Math.max(0,Math.min(1,estado.intensidadAutoScroll));
    lista.scrollTop = Math.max(0,Math.min(maximo, anterior + estado.direccionAutoScroll*velocidad));
    if(Math.abs(lista.scrollTop-anterior)<0.5){
      estado.direccionAutoScroll = 0;
      return;
    }
    actualizarPosicionPlaceholder(centroVirtualDelArrastre(estado));
    estado.frameAutoScroll = requestAnimationFrame(cicloAutoScroll);
  }

  function actualizarAutoScroll(y){
    const estado = arrastre;
    if(!estado) return;
    if(estado.pausarAutoScrollHastaMoverse){
      detenerAutoScroll();
      return;
    }
    if(lista.scrollHeight <= lista.clientHeight + 1){
      detenerAutoScroll();
      return;
    }

    const altoPantalla = window.innerHeight || document.documentElement.clientHeight;
    const umbral = 90;
    let direccion = 0;
    let intensidad = 0;
    if(y < umbral){
      direccion = -1;
      intensidad = Math.max(0,Math.min(1,(umbral-y)/umbral));
    } else if(y > altoPantalla-umbral){
      direccion = 1;
      intensidad = Math.max(0,Math.min(1,(y-(altoPantalla-umbral))/umbral));
    }
    estado.direccionAutoScroll = direccion;
    estado.intensidadAutoScroll = intensidad;
    if(!direccion){
      detenerAutoScroll();
    } else if(!estado.frameAutoScroll){
      estado.frameAutoScroll = requestAnimationFrame(cicloAutoScroll);
    }
  }

  function impedirScrollTactilDuranteArrastre(e){
    if(arrastre && arrastre.tipoPuntero==='touch' && e.cancelable) e.preventDefault();
  }

  function alMoverPunteroArrastre(e){
    const estado = arrastre;
    if(!estado || e.pointerId!==estado.idPuntero) return;
    if(e.cancelable) e.preventDefault();
    estado.ultimoY = e.clientY;
    estado.pausarAutoScrollHastaMoverse = false;
    estado.tarjeta.style.top = (e.clientY-estado.offsetY) + 'px';
    actualizarPosicionPlaceholder(centroVirtualDelArrastre(estado));
    actualizarAutoScroll(e.clientY);
  }

  function alRedimensionarDuranteArrastre(){
    if(!arrastre) return;
    arrastre.pausarAutoScrollHastaMoverse = true;
    detenerAutoScroll();
  }

  function finalizarArrastre(){
    const estado = arrastre;
    if(!estado) return;
    detenerAutoScroll();
    document.removeEventListener('pointermove', alMoverPunteroArrastre);
    document.removeEventListener('pointerup', alTerminarPunteroArrastre, true);
    document.removeEventListener('pointercancel', alTerminarPunteroArrastre, true);
    document.removeEventListener('touchmove', impedirScrollTactilDuranteArrastre);
    window.removeEventListener('resize', alRedimensionarDuranteArrastre);

    const nombresFinales = nombresOrdenVisual(estado);
    const mismoOrden = nombresFinales.length===estado.ordenInicial.length &&
      nombresFinales.every((n,i)=>n===estado.ordenInicial[i]);

    if(mismoOrden){
      let camposRestaurados = false;
      DB.divisas.forEach(d=>{
        const anterior = estado.camposIniciales.get(d.nombre);
        if(!anterior) return;
        if(anterior.presente){
          if(d.orden_balance!==anterior.valor){ d.orden_balance=anterior.valor; camposRestaurados=true; }
        } else if(Object.prototype.hasOwnProperty.call(d,'orden_balance')){
          delete d.orden_balance;
          camposRestaurados=true;
        }
      });
      if(camposRestaurados) save();
    } else {
      const ordenadas = tarjetasVisuales(estado)
        .map(t=>DB.divisas.find(d=>d.nombre===t.dataset.divisa))
        .filter(Boolean);
      aplicarOrdenBalanceLista(ordenadas);
      save();
    }

    if(estado.placeholder.parentNode) estado.placeholder.replaceWith(estado.tarjeta);
    estado.tarjeta.classList.remove('bal-card-dragging','longpress-pending');
    estado.tarjeta.style.position = '';
    estado.tarjeta.style.top = '';
    estado.tarjeta.style.left = '';
    estado.tarjeta.style.width = '';
    estado.tarjeta.style.height = '';
    estado.tarjeta.style.zIndex = '';
    estado.tarjeta.style.opacity = '';
    estado.tarjeta.style.transform = '';
    estado.tarjeta.style.pointerEvents = '';
    arrastre = null;
    ordenarBalanceFiltrado();
    // El long press directo es un gesto completo: al soltar, se acepta el
    // orden y se vuelve inmediatamente al modo normal. El flujo del botón
    // permanece activo para permitir varios arrastres y scroll entre ellos.
    if(!modoReordenarPorBoton) establecerModoReordenar(false);
  }

  function alTerminarPunteroArrastre(e){
    if(arrastre && e.pointerId===arrastre.idPuntero) finalizarArrastre();
  }

  function iniciarArrastre(tarjeta, evento, rectanguloOriginal){
    if(arrastre || !lista.contains(tarjeta)) return;
    const rect = rectanguloOriginal || tarjeta.getBoundingClientRect();
    const ordenInicial = Array.from(lista.querySelectorAll('.bal-card[data-divisa]')).map(t=>t.dataset.divisa);
    const camposIniciales = new Map(DB.divisas.map(d=>[d.nombre,{
      presente:Object.prototype.hasOwnProperty.call(d,'orden_balance'),
      valor:d.orden_balance
    }]));
    const placeholder = document.createElement('div');
    placeholder.className = 'bal-card-placeholder';
    placeholder.setAttribute('aria-hidden','true');
    placeholder.style.height = rect.height + 'px';
    placeholder.style.minHeight = rect.height + 'px';

    lista.replaceChild(placeholder, tarjeta);
    const rectPlaceholder = placeholder.getBoundingClientRect();
    const scrollTopInicial = lista.scrollTop;
    document.body.appendChild(tarjeta);

    arrastre = {
      tarjeta:tarjeta, placeholder:placeholder, idPuntero:evento.pointerId,
      tipoPuntero:evento.pointerType || 'touch',
      offsetY:evento.clientY-rect.top, alto:rect.height, ancho:rect.width, izquierda:rect.left,
      ultimoY:evento.clientY, scrollTopInicial:scrollTopInicial,
      desfaseDiseno:rectPlaceholder.top-rect.top,
      ordenInicial:ordenInicial, camposIniciales:camposIniciales,
      direccionAutoScroll:0, intensidadAutoScroll:0, frameAutoScroll:0,
      pausarAutoScrollHastaMoverse:false
    };
    tarjeta.classList.add('bal-card-dragging');
    tarjeta.style.position = 'fixed';
    tarjeta.style.top = (evento.clientY-arrastre.offsetY) + 'px';
    tarjeta.style.left = arrastre.izquierda + 'px';
    tarjeta.style.width = arrastre.ancho + 'px';
    tarjeta.style.height = arrastre.alto + 'px';
    tarjeta.style.zIndex = '10000';
    tarjeta.style.opacity = '0.9';
    tarjeta.style.transform = 'scale(1.02)';
    tarjeta.style.pointerEvents = 'none';

    document.addEventListener('pointermove', alMoverPunteroArrastre, {passive:false});
    document.addEventListener('pointerup', alTerminarPunteroArrastre, true);
    document.addEventListener('pointercancel', alTerminarPunteroArrastre, true);
    document.addEventListener('touchmove', impedirScrollTactilDuranteArrastre, {passive:false});
    window.addEventListener('resize', alRedimensionarDuranteArrastre);
    if(evento.cancelable) evento.preventDefault();
  }

  function establecerModoReordenar(activo, activadoPorBoton=false){
    if(activo===modoReordenar){
      // Una segunda petición de activación no reinicia ni duplica el modo.
      return;
    }
    if(!activo && arrastre) finalizarArrastre();
    modoReordenar = activo;
    modoReordenarPorBoton = activo && activadoPorBoton;
    if(activo){
      document.body.classList.add('balance-reordering');
      lista.classList.add('balance-reordering');
      botonReordenar.textContent = modoReordenarPorBoton ? '✅ Listo' : '↕️ Reordenar divisas';
      content.addEventListener('pointerdown', alPulsarFuera, true);
    } else {
      modoReordenarPorBoton = false;
      document.body.classList.remove('balance-reordering');
      lista.classList.remove('balance-reordering');
      botonReordenar.textContent = '↕️ Reordenar divisas';
      content.removeEventListener('pointerdown', alPulsarFuera, true);
    }
  }

  function alPulsarFuera(e){
    if(!modoReordenar) return;
    const objetivo = e.target instanceof Element ? e.target : null;
    if(!objetivo) return;
    if(objetivo.closest('#b-general .bal-card')) return;
    if(objetivo.closest('button,input,select,a,.chip,.bal-card,.card,.subtle,h1,h2,h3,label')) return;
    establecerModoReordenar(false);
  }

  function alPulsarTarjeta(e){
    const tarjeta = e.target instanceof Element ? e.target.closest('.bal-card[data-divisa]') : null;
    if(!tarjeta || !lista.contains(tarjeta) || e.button!==0 || arrastre) return;

    // En ambos flujos el arrastre requiere long press. Un toque y deslizar
    // antes de 400 ms queda libre para el scroll natural de la lista/página.
    cancelarPulsacion(false);
    const pendiente = {
      tarjeta:tarjeta,idPuntero:e.pointerId,x:e.clientX,y:e.clientY,
      ultimoX:e.clientX,ultimoY:e.clientY,tipoPuntero:e.pointerType,
      estabaEnModoBoton:modoReordenarPorBoton,
      temporizador:0
    };
    pulsacionPendiente = pendiente;
    tarjeta.classList.add('longpress-pending');
    pendiente.temporizador = setTimeout(()=>{
      if(pulsacionPendiente!==pendiente || !lista.contains(tarjeta)) return;
      pulsacionPendiente = null;
      tarjeta.classList.remove('longpress-pending');
      clickSuprimidoEn = tarjeta;
      clickSuprimidoHasta = Date.now() + 700;

      // Si todavía no había modo activo, este es el flujo directo de long
      // press: se activa solo durante el arrastre y se cierra al soltar.
      if(!modoReordenar) establecerModoReordenar(true, false);
      try{ if(navigator.vibrate) navigator.vibrate(10); }catch(err){}
      const rect = tarjeta.getBoundingClientRect();
      iniciarArrastre(tarjeta,{
        pointerId:pendiente.idPuntero,pointerType:pendiente.tipoPuntero,
        clientX:pendiente.ultimoX,clientY:pendiente.ultimoY,cancelable:false,
        preventDefault:function(){}
      },rect);
    },400);
  }

  function alMoverPunteroPendiente(e){
    const pendiente = pulsacionPendiente;
    if(!pendiente || e.pointerId!==pendiente.idPuntero) return;
    pendiente.ultimoX = e.clientX;
    pendiente.ultimoY = e.clientY;
    if(Math.hypot(e.clientX-pendiente.x,e.clientY-pendiente.y)>10) cancelarPulsacion(true);
  }

  function alTerminarPunteroPendiente(e){
    if(pulsacionPendiente && e.pointerId===pulsacionPendiente.idPuntero) cancelarPulsacion(false);
  }

  function bloquearClickDeTarjeta(e){
    const objetivo = e.target instanceof Element ? e.target.closest('.bal-card[data-divisa]') : null;
    if(modoReordenar && objetivo){
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if(objetivo && objetivo===clickSuprimidoEn && Date.now()<clickSuprimidoHasta){
      clickSuprimidoEn = null;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  function alCambiarRuta(){
    limpiarControl();
  }

  function limpiarControl(){
    if(cerrado) return;
    cerrado = true;
    cancelarPulsacion(false);
    if(arrastre) finalizarArrastre();
    establecerModoReordenar(false);
    lista.removeEventListener('pointerdown', alPulsarTarjeta);
    document.removeEventListener('pointermove', alMoverPunteroPendiente);
    document.removeEventListener('pointerup', alTerminarPunteroPendiente);
    document.removeEventListener('pointercancel', alTerminarPunteroPendiente);
    document.removeEventListener('click', bloquearClickDeTarjeta, true);
    window.removeEventListener('hashchange', alCambiarRuta);
    if(balanceReorderCleanup===limpiarControl) balanceReorderCleanup = null;
  }

  lista.addEventListener('pointerdown', alPulsarTarjeta);
  document.addEventListener('pointermove', alMoverPunteroPendiente);
  document.addEventListener('pointerup', alTerminarPunteroPendiente);
  document.addEventListener('pointercancel', alTerminarPunteroPendiente);
  document.addEventListener('click', bloquearClickDeTarjeta, true);
  botonReordenar.addEventListener('click',()=>{
    if(pulsacionPendiente) cancelarPulsacion(false);
    if(modoReordenar){
      // En modo botón, el texto visible es "Listo" y el toque confirma la salida.
      establecerModoReordenar(false);
      return;
    }
    establecerModoReordenar(true, true);
  });
  window.addEventListener('hashchange', alCambiarRuta);
  balanceReorderCleanup = limpiarControl;
}
