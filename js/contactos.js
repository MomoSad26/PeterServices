/* Selector de contactos nativo de Android para todos los campos type="tel".
 * El boton solo se muestra cuando existe AndroidBridge.pickContact().
 */
(function(){
  'use strict';

  let campoTelefonoActivo = null;

  function tieneSelectorNativo(){
    try{
      return !!window.AndroidBridge && typeof window.AndroidBridge.pickContact === 'function';
    }catch(_){
      return false;
    }
  }

  function normalizarNumeroContacto(numeroOriginal){
    if(numeroOriginal===null || numeroOriginal===undefined) return '';
    let soloDigitos = String(numeroOriginal).replace(/\D/g, '');
    if(!soloDigitos) return '';
    if(soloDigitos.length===8) soloDigitos = '53' + soloDigitos;
    return '+' + soloDigitos;
  }

  window.normalizarNumeroContacto = normalizarNumeroContacto;

  window.onContactoSeleccionado = function(numero){
    const campo = campoTelefonoActivo;
    const normalizado = normalizarNumeroContacto(numero);
    // Un resultado vacío, la cancelación o un campo ya retirado no cambia datos.
    if(!normalizado || !campo || !campo.isConnected) return;
    campo.value = normalizado;
    campo.dispatchEvent(new Event('input', {bubbles:true}));
    campo.dispatchEvent(new Event('change', {bubbles:true}));
  };

  window.onContactoError = function(codigo){
    const mensajes = {
      no_disponible: 'No se pudo abrir la libreta de contactos del teléfono.',
      sin_numero: 'No se pudo obtener el número del contacto seleccionado.',
      sin_contactos_telefono: 'No se encontraron contactos con números de teléfono.',
      permiso_denegado: 'No se concedió el permiso para consultar los contactos. Puedes escribir el número manualmente o habilitarlo en los ajustes.',
      error_lectura: 'No se pudo leer la agenda de contactos. Inténtalo de nuevo.'
    };
    const mensaje = mensajes[codigo] || 'No se pudo seleccionar el contacto.';
    if(typeof window.toast === 'function') window.toast(mensaje);
    else console.warn(mensaje);
  };

  function instalarBoton(input){
    // Esta función se utiliza en la APK; sin puente no se altera el formulario web.
    if(!tieneSelectorNativo() || input.dataset.contactoPicker==='1' || !input.parentNode) return;
    input.dataset.contactoPicker = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'telefono-contacto-wrap';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'telefono-contacto-btn';
    boton.textContent = '👤';
    boton.setAttribute('aria-label', 'Seleccionar número de la libreta de contactos');
    boton.title = 'Seleccionar contacto';
    boton.hidden = !tieneSelectorNativo();
    boton.addEventListener('click', function(event){
      event.preventDefault();
      event.stopPropagation();
      campoTelefonoActivo = input;
      if(!tieneSelectorNativo()){
        boton.hidden = true;
        return;
      }
      try{
        window.AndroidBridge.pickContact();
      }catch(_){
        window.onContactoError('no_disponible');
      }
    });
    wrapper.appendChild(boton);

    input.addEventListener('focus', function(){ campoTelefonoActivo = input; });
    input.addEventListener('pointerdown', function(){ campoTelefonoActivo = input; });
  }

  /* Aviso (web y APK): un número escrito a mano sin código de país hace que
     WhatsApp abra un chat equivocado. Solo advierte: no cambia lo escrito ni
     impide guardar. */
  function faltaCodigoPais(valor){
    const v = String(valor||'').trim();
    if(!/\d/.test(v)) return false;               // vacío o sin dígitos: nada que avisar
    return !(v.startsWith('+') || v.replace(/\D/g,'').startsWith('00'));
  }
  window.faltaCodigoPais = faltaCodigoPais;
  function instalarAvisoCodigoPais(input){
    if(input.dataset.avisoPais==='1' || !input.parentNode) return;
    input.dataset.avisoPais = '1';
    const aviso = document.createElement('div');
    aviso.className = 'hint telefono-aviso-pais';
    aviso.style.color = 'var(--red-text)';
    aviso.textContent = '⚠️ Falta el código de país (ej. +53 5…). Sin él, WhatsApp puede abrir un chat equivocado.';
    aviso.hidden = true;
    (input.closest('.telefono-contacto-wrap') || input).insertAdjacentElement('afterend', aviso);
    const actualizar = ()=>{ aviso.hidden = !faltaCodigoPais(input.value); };
    input.addEventListener('input', actualizar);
    input.addEventListener('change', actualizar);
    actualizar();
  }
  function prepararCampo(input){ instalarBoton(input); instalarAvisoCodigoPais(input); }

  function revisarNodo(nodo){
    if(!nodo || nodo.nodeType!==1) return;
    if(nodo.matches && nodo.matches('input[type="tel"]')) prepararCampo(nodo);
    if(nodo.querySelectorAll) nodo.querySelectorAll('input[type="tel"]').forEach(prepararCampo);
  }

  function iniciar(){
    document.querySelectorAll('input[type="tel"]').forEach(prepararCampo);
    document.addEventListener('focusin', function(event){
      if(event.target && event.target.matches && event.target.matches('input[type="tel"]')){
        campoTelefonoActivo = event.target;
      }
    });
    const observador = new MutationObserver(function(registros){
      registros.forEach(registro=>{
        if(registro.type==='attributes') revisarNodo(registro.target);
        else registro.addedNodes.forEach(revisarNodo);
      });
    });
    observador.observe(document.body, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['type']
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciar, {once:true});
  else iniciar();
})();
