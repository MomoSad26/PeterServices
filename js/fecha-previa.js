/* Botón universal para retroceder un día en campos de fecha editables. */
(function instalarRetrocesoDeFecha(){
  const selectorFecha = 'input[type="date"], input[type="datetime-local"]';
  const dos = n => String(n).padStart(2,'0');
  const fechaLocalTexto = d => `${d.getFullYear()}-${dos(d.getMonth()+1)}-${dos(d.getDate())}`;
  const horaLocalTexto = d => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  function emitirCambio(input){
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function retrocederUnDia(input){
    const valorOriginal = input.value;
    if(input.type === 'date'){
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valorOriginal);
      const fecha = m ? new Date(Number(m[1]), Number(m[2])-1, Number(m[3])) : new Date();
      fecha.setDate(fecha.getDate()-1);
      input.value = fechaLocalTexto(fecha);
    }else{
      const separador = valorOriginal.indexOf('T');
      const hora = separador>=0 ? valorOriginal.slice(separador+1) : horaLocalTexto(new Date());
      const fecha = valorOriginal ? new Date(valorOriginal) : new Date();
      if(Number.isNaN(fecha.getTime())) return;
      fecha.setDate(fecha.getDate()-1);
      input.value = `${fechaLocalTexto(fecha)}T${hora}`;
    }
    emitirCambio(input);
  }
  function mejorarCampo(input){
    if(input.dataset.noDatePrev === 'true' || input.readOnly || input.disabled) return;
    if(input.closest('.date-prev-wrap') || !input.parentNode) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'date-prev-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'date-prev-button';
    button.textContent = '◀';
    button.title = 'Retroceder un día';
    button.setAttribute('aria-label','Retroceder un día');
    button.addEventListener('click',()=>{
      retrocederUnDia(input);
      input.focus({preventScroll:true});
    });
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(button);
    wrapper.appendChild(input);
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
