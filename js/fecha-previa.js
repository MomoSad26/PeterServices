/* Controles universales para mover un día atrás o adelante en campos de fecha. */
(function instalarControlesDeFecha(){
  const selectorFecha = 'input[type="date"], input[type="datetime-local"]';
  const dos = n => String(n).padStart(2,'0');
  const fechaLocalTexto = d => d.getFullYear() + '-' + dos(d.getMonth()+1) + '-' + dos(d.getDate());
  const horaLocalTexto = d => dos(d.getHours()) + ':' + dos(d.getMinutes());

  function emitirCambio(input){
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function moverDia(input, dias){
    const valorOriginal = input.value;
    if(input.type === 'date'){
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(valorOriginal);
      const fecha = m
        ? new Date(Number(m[1]), Number(m[2])-1, Number(m[3]))
        : new Date();
      // setDate usa calendario local: maneja fin de mes, año bisiesto y DST.
      fecha.setDate(fecha.getDate() + dias);
      input.value = fechaLocalTexto(fecha);
    }else{
      const separador = valorOriginal.indexOf('T');
      const fecha = valorOriginal ? new Date(valorOriginal) : new Date();
      if(Number.isNaN(fecha.getTime())) return;
      // Conserva exactamente la hora escrita en datetime-local, incluidos
      // segundos/fracciones si el campo los utiliza.
      const hora = separador >= 0
        ? valorOriginal.slice(separador+1)
        : horaLocalTexto(fecha);
      fecha.setDate(fecha.getDate() + dias);
      input.value = fechaLocalTexto(fecha) + 'T' + hora;
    }
    emitirCambio(input);
  }

  function crearBoton(input, simbolo, accion, dias){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = accion === 'restar'
      ? 'date-prev-button'
      : 'date-next-button';
    button.textContent = simbolo;
    const etiqueta = accion === 'restar' ? 'Retroceder un día' : 'Adelantar un día';
    button.title = etiqueta;
    button.setAttribute('aria-label', etiqueta);
    button.addEventListener('click',()=>{
      moverDia(input, dias);
      input.focus({preventScroll:true});
    });
    return button;
  }

  function mejorarCampo(input){
    if(input.dataset.noDatePrev === 'true' || input.readOnly || input.disabled) return;
    if(input.closest('.date-prev-wrap') || !input.parentNode) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'date-prev-wrap';
    const anterior = crearBoton(input, '◀', 'restar', -1);
    const siguiente = crearBoton(input, '▶', 'sumar', 1);

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(anterior);
    wrapper.appendChild(input);
    wrapper.appendChild(siguiente);
  }

  function explorar(raiz){
    if(raiz.nodeType===Node.ELEMENT_NODE && raiz.matches && raiz.matches(selectorFecha)) mejorarCampo(raiz);
    if(raiz.querySelectorAll) raiz.querySelectorAll(selectorFecha).forEach(mejorarCampo);
  }

  explorar(document.body);
  const observador = new MutationObserver(cambios=>{
    cambios.forEach(cambio=>{
      cambio.addedNodes.forEach(nodo=>{
        if(nodo.nodeType===Node.ELEMENT_NODE) explorar(nodo);
      });
    });
  });
  observador.observe(document.body, {childList:true,subtree:true});
})();
