/* ---------------------------------------------------------------------- *
 * 18. MENÚ 9 — DEUDAS
 * ---------------------------------------------------------------------- */
function crearDeudaAutomatica({tipo, persona, monto, divisa, fecha, nota, origen, origen_id, tipo_me_deben, comprador_id, comprador_nombre, comprador_nombre_completo, comprador_telefono, comprador_direccion}){
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
  if(comprador_id!==undefined && comprador_id!==null){
    Object.assign(deuda,{comprador_id,comprador_nombre:comprador_nombre||'',comprador_nombre_completo:comprador_nombre_completo||'',comprador_telefono:comprador_telefono||'',comprador_direccion:comprador_direccion||''});
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

function deudaCompradorNombre(d){
  if(!d)return '';
  const actual=compradorPorId(d.comprador_id) || (DB.compradores||[]).find(c=>normalizarTexto(c.nombre)===normalizarTexto(d.comprador_nombre||d.persona||''));
  return d.comprador_nombre || actual?.nombre || '';
}
function deudaCompradorDatos(d){
  const actual=compradorPorId(d?.comprador_id) || (DB.compradores||[]).find(c=>normalizarTexto(c.nombre)===normalizarTexto(d?.comprador_nombre||d?.persona||''));
  return {
    id:d?.comprador_id??null,
    nombre:d?.comprador_nombre || actual?.nombre || '',
    nombre_completo:d?.comprador_nombre_completo || actual?.nombre_completo || '',
    telefono:d?.comprador_telefono || actual?.telefono || '',
    direccion:d?.comprador_direccion || actual?.direccion || ''
  };
}
function obtenerGruposMeDebenEstado(estado){
  const grupos=new Map();
  (DB.deudas||[]).filter(d=>d.tipo==='me_deben' && d.estado===estado).forEach(d=>{
    const nombre=deudaCompradorNombre(d);
    if(!nombre){grupos.set('deuda:'+d.id,{key:'deuda:'+d.id,esGrupoVirtual:false,items:[d],monto:Number(d.monto||0),divisa:d.divisa,tipo_me_deben:meDebenTipo(d),persona:d.persona});return;}
    const clave=normalizarTexto(nombre)+'|'+String(d.divisa||'')+'|'+String(meDebenTipo(d));
    if(!grupos.has(clave)){
      const datos=deudaCompradorDatos(d);
      grupos.set(clave,{key:clave,esGrupoVirtual:true,comprador:datos,comprador_nombre:nombre,divisa:d.divisa,tipo_me_deben:meDebenTipo(d),items:[],monto:0,fecha_primera:d.fecha||d.creado_en||0,fecha_ultima:d.fecha||d.creado_en||0});
    }
    const g=grupos.get(clave);g.items.push(d);g.monto=round2(g.monto+Number(d.monto||0));
    const fecha=Number(d.fecha||d.creado_en||0);g.fecha_primera=Math.min(g.fecha_primera||fecha,fecha);g.fecha_ultima=Math.max(g.fecha_ultima||fecha,fecha);
    const datos=deudaCompradorDatos(d);
    if(datos.nombre_completo||datos.telefono||datos.direccion) g.comprador={...g.comprador,...Object.fromEntries(Object.entries(datos).filter(([k,v])=>v))};
  });
  return [...grupos.values()].map(g=>{
    if(g.esGrupoVirtual) g.items.sort((a,b)=>(a.fecha||a.creado_en||0)-(b.fecha||b.creado_en||0)||(a.id||0)-(b.id||0));
    return g;
  });
}
function obtenerGruposMeDebenPendientes(){return obtenerGruposMeDebenEstado('pendiente');}
function grupoMeDebenPorClave(clave,estado='pendiente'){return obtenerGruposMeDebenEstado(estado).find(g=>g.key===clave)||null;}
function nombreGrupoMeDeben(g){return g?.esGrupoVirtual?(g.comprador_nombre||'Sin comprador'):(g?.persona||'Sin nombre');}
function conteoGrupoMeDeben(g){
  const ventas=g.items.filter(d=>d.origen==='venta').length;
  return ventas===g.items.length?`${ventas} ${ventas===1?'venta':'ventas'}`:`${g.items.length} ${g.items.length===1?'registro':'registros'}`;
}
function etiquetaTipoGrupoMeDeben(g){return meDebenBadgeHtml({tipo_me_deben:g.tipo_me_deben,afecta_balance:g.tipo_me_deben===MEDEBEN_PRESTAMO?1:0});}
function mensajeroNotificadoGrupoTexto(g){
  const d=g.items.filter(x=>x.mensajero_notificado_fecha).sort((a,b)=>b.mensajero_notificado_fecha-a.mensajero_notificado_fecha)[0];
  if(!d)return '';
  const m=mensajeroPorId(d.mensajero_notificado_id);
  return `${m?.nombre||d.mensajero_notificado_nombre||'(eliminado)'} (${fmtDate(d.mensajero_notificado_fecha)})`;
}

let deudasTab = 'pagar_a';
let deudasOrden = 'fecha'; // 'fecha' | 'az' — persiste al cambiar de pestaña dentro de Deudas

function renderDeudas(content, presetParam){
  if(presetParam==='pagar_a' || presetParam==='me_deben') deudasTab=presetParam;
  const modoBusqueda=busquedaFiltrandoLista('deudas');
  content.innerHTML = `
    <h1 class="section-title">${modoBusqueda?'Resultados de búsqueda — Deudas':'Deudas'}</h1>
    ${modoBusqueda ? `<div class="subtle" style="margin-bottom:12px;">Resultados para: <strong>${escapeHtml(busquedaFiltroLista.consulta)}</strong></div>` : `
    <div class="tabs" id="deudas-tabs">
      <div class="tab ${deudasTab==='pagar_a'?'active':''}" data-v="pagar_a">Pagar a: <span class="tab-count" id="deudas-count-pagar">0</span></div>
      <div class="tab ${deudasTab==='me_deben'?'active':''}" data-v="me_deben">Me deben: <span class="tab-count" id="deudas-count-cobrar">0</span></div>
      <div class="tab ${deudasTab==='historial'?'active':''}" data-v="historial">Historial</div>
    </div>
    <div class="chip-row" id="deudas-orden">
      <div class="chip ${deudasOrden==='fecha'?'active':''}" data-v="fecha">📅 Por fecha</div>
      <div class="chip ${deudasOrden==='az'?'active':''}" data-v="az">🔤 A-Z</div>
    </div>`}
    <div id="deudas-totales"></div>
    <div id="deudas-list"></div>
    <div id="deudas-pag"></div>
    ${!modoBusqueda && deudasTab!=='historial' ? `<button class="fab" id="fab-add-deuda" aria-label="Agregar">+</button>` : ''}
  `;

  // A igual nombre (o fecha), por id descendente: orden determinista para la paginación.
  function ordenarPorPersona(lista){
    return lista.slice().sort((a,b)=> String(a.persona||'').localeCompare(String(b.persona||''), 'es', {sensitivity:'base'}) || (b.id||0)-(a.id||0));
  }

  function refresh(){
    const el = document.getElementById('deudas-list');
    if(modoBusqueda){
      document.getElementById('deudas-totales').innerHTML='';
      document.getElementById('deudas-pag').innerHTML='';
      const items=DB.deudas.filter(d=>busquedaRegistroCoincide('deudas',d,busquedaFiltroLista.consulta))
        .sort((a,b)=>(Number(b.creado_en||b.fecha||0)-Number(a.creado_en||a.fecha||0)));
      el.innerHTML=items.length ? items.map(deudaRowHtml).join('') : emptyState('🤝','No se encontraron deudas con esos criterios.');
      aplicarZebra(el,items.length);
    }else{
    const pagarCount = DB.deudas.filter(d=>d.tipo==='pagar_a' && d.estado==='pendiente').length;
    const gruposPendientesMeDeben=obtenerGruposMeDebenPendientes();
    const cobrarCount = gruposPendientesMeDeben.length;
    document.getElementById('deudas-count-pagar').textContent = pagarCount;
    document.getElementById('deudas-count-cobrar').textContent = cobrarCount;
    let items;
    const totalesEl = document.getElementById('deudas-totales');
    const pagEl = document.getElementById('deudas-pag');
    if(deudasTab==='historial'){
      // Solo el Historial se pagina; los contadores de las pestañas siguen
      // mostrando el total real de pendientes.
      totalesEl.innerHTML = '';
      const historicas=DB.deudas.filter(d=>d.estado==='pagado'||d.estado==='cobrado');
      const gruposCobrados=obtenerGruposMeDebenEstado('cobrado');
      const idsAgrupados=new Set(gruposCobrados.flatMap(g=>g.items.map(d=>d.id)));
      items=[...historicas.filter(d=>!idsAgrupados.has(d.id)),...gruposCobrados];
      items = deudasOrden==='az' ? items.slice().sort((a,b)=>String(a.esGrupoVirtual?nombreGrupoMeDeben(a):a.persona||'').localeCompare(String(b.esGrupoVirtual?nombreGrupoMeDeben(b):b.persona||''),'es',{sensitivity:'base'}) || Number(b.fecha_cierre||b.fecha_ultima||0)-Number(a.fecha_cierre||a.fecha_ultima||0)) : items.sort((a,b)=>Number(b.fecha_cierre||b.fecha_ultima||b.fecha||0)-Number(a.fecha_cierre||a.fecha_ultima||a.fecha||0) || Number(b.id||0)-Number(a.id||0));
      const estado = paginacion.deudas_historial;
      const pag = paginarArray(items, estado);
      el.innerHTML = items.length ? pag.items.map(deudaHistorialRowHtml).join('') :
        emptyState('🗂️','Aún no hay registros pagados o cobrados');
      aplicarZebra(el, items.length);
      renderControlPaginacion(pagEl, estado, pag, refresh, el);
    } else {
      pagEl.innerHTML = '';
      items = deudasTab==='me_deben' ? gruposPendientesMeDeben : DB.deudas.filter(d=>d.tipo===deudasTab && d.estado==='pendiente');
      const porDivisa = {};
      items.forEach(d=>{ porDivisa[d.divisa] = (porDivisa[d.divisa]||0) + Number(d.monto||0); });
      const divisasConTotal = Object.keys(porDivisa);
      totalesEl.innerHTML = divisasConTotal.length ? `
        <div class="card" style="padding:12px 14px;margin-bottom:10px;">
          <div class="subtle" style="margin-bottom:4px;">${deudasTab==='pagar_a'?'Total por pagar':'Total por cobrar'}</div>
          <div style="font-weight:800;font-size:15px;color:var(--accent-text);">
            ${divisasConTotal.map(dv=>`${fmtMoney(porDivisa[dv])} ${escapeDivisa(dv)}`).join(' · ')}
          </div>
        </div>` : '';
      items = deudasOrden==='az' ? ordenarPorPersona(items) : items.sort((a,b)=>(b.creado_en||b.fecha)-(a.creado_en||a.fecha) || (b.id||0)-(a.id||0));
      el.innerHTML = items.length ? items.map(deudaRowHtml).join('') :
        emptyState(deudasTab==='pagar_a'?'💸':'🤝', deudasTab==='pagar_a' ? 'No hay deudas pendientes por pagar' : 'No hay registros pendientes por cobrar');
      aplicarZebra(el, items.length);
    }
    }
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = ()=> li.dataset.grupo
        ? openDeudaGrupoDetalle(decodeURIComponent(li.dataset.grupo),refresh,li.dataset.estadoGrupo||'pendiente')
        : openDeudaDetalle(Number(li.dataset.id),refresh);
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
  if(d && d.esGrupoVirtual){
    return `
      <div class="list-item" data-grupo="${encodeURIComponent(d.key)}">
        <div class="avatar">🤝</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(nombreGrupoMeDeben(d))}</div>
          <div class="li-sub">${conteoGrupoMeDeben(d)} · ${escapeDivisa(d.divisa)}</div>
        </div>
        <div class="li-trail">
          <div class="li-amount">${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)}</div>
          <div style="margin-top:4px;">${estadoBadgeHtml('pendiente')}</div>
          <div style="margin-top:4px;">${etiquetaTipoGrupoMeDeben(d)}</div>
          ${d.tipo_me_deben===MEDEBEN_PRESTAMO?'<div style="margin-top:4px;"><span class="badge badge-descuenta">Descontar al pagar</span></div>':''}
        </div>
      </div>`;
  }
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${d.tipo==='pagar_a'?'💸':'🤝'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(textoDivisasVisibles(d.persona))}</div>
        <div class="li-sub">${fmtDateShort(d.fecha)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
        <div style="margin-top:4px;">${d.tipo==='pagar_a' ? afectaBalanceBadgeHtml(d) : meDebenBadgeHtml(d)}</div>
      </div>
    </div>`;
}
function deudaHistorialRowHtml(d){
  if(d && d.esGrupoVirtual){
    const cierre=Math.max(...d.items.map(x=>Number(x.fecha_cierre||0)));
    return `<div class="list-item" data-grupo="${encodeURIComponent(d.key)}" data-estado-grupo="cobrado"><div class="avatar">🤝</div><div class="li-main"><div class="li-title">${escapeHtml(nombreGrupoMeDeben(d))}</div><div class="li-sub">${conteoGrupoMeDeben(d)} · ${escapeDivisa(d.divisa)} · Cobrado el ${fmtDateShort(cierre)}</div></div><div class="li-trail"><div class="li-amount">${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)}</div><div style="margin-top:4px;">${estadoBadgeHtml('cobrado')}</div><div style="margin-top:4px;">${etiquetaTipoGrupoMeDeben(d)}</div>${d.tipo_me_deben===MEDEBEN_PRESTAMO?'<div style="margin-top:4px;"><span class="badge badge-descuenta">Descontar al pagar</span></div>':''}</div></div>`;
  }
  const esMeDeben = d.tipo==='me_deben';
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${esMeDeben?'🤝':'💸'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(textoDivisasVisibles(d.persona))}</div>
        <div class="li-sub">${esMeDeben?'Cobrado':'Pagado'} el ${fmtDateShort(d.fecha_cierre)} · Registrado ${fmtDateShort(d.fecha)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
        <div style="margin-top:4px;">${d.tipo==='pagar_a' ? afectaBalanceBadgeHtml(d) : meDebenBadgeHtml(d)}</div>
      </div>
    </div>`;
}

function openDeudaForm(tipo, onSaved){
  const esMeDeben = tipo==='me_deben';
  let compradorManual=null;
  openModal(`
    <div class="modal-title">${esMeDeben ? 'Nuevo registro — Me deben' : 'Nueva deuda — Pagar a'}</div>
    <label class="field-label">Persona / Entidad *</label>
    <input type="text" id="df-persona" maxlength="100" placeholder="Nombre de la persona o entidad">
    ${esMeDeben?`<label class="field-label">Comprador (opcional)</label><div id="df-comprador-wrap"><button type="button" class="picker" id="df-comprador-picker">Seleccionar comprador</button></div>`:''}
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
  if(esMeDeben){
    const picker=document.getElementById('df-comprador-picker');
    picker.onclick=()=>openSelectorComprador(c=>{
      compradorManual=c;
      document.getElementById('df-persona').value=c.nombre;
      const wrap=document.getElementById('df-comprador-wrap');
      wrap.innerHTML=`<div style="display:flex;gap:8px;"><button type="button" class="picker" style="flex:1" id="df-comprador-picker">${escapeHtml(c.nombre)}</button><button type="button" class="btn btn-outline" id="df-comprador-clear">Quitar</button></div>`;
      document.getElementById('df-comprador-picker').onclick=()=>openSelectorComprador(n=>{compradorManual=n;document.getElementById('df-persona').value=n.nombre;document.getElementById('df-comprador-picker').textContent=n.nombre;});
      document.getElementById('df-comprador-clear').onclick=()=>{compradorManual=null;wrap.innerHTML='<button type="button" class="picker" id="df-comprador-picker">Seleccionar comprador</button>';document.getElementById('df-comprador-picker').onclick=()=>openSelectorComprador(n=>{compradorManual=n;document.getElementById('df-persona').value=n.nombre;document.getElementById('df-comprador-picker').textContent=n.nombre;});};
    });
  }
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
    if(esMeDeben){
      deuda.tipo_me_deben = afectaBalance;
      const compradorAsignado=compradorManual || (DB.compradores||[]).find(c=>normalizarTexto(c.nombre)===normalizarTexto(persona)) || null;
      if(compradorAsignado){deuda.persona=compradorAsignado.nombre;Object.assign(deuda,compradorSnapshot(compradorAsignado));}
    }
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
  // Datos de entrega (Menú Entregas): solo en deudas que vienen de un envío.
  const envioDeuda = (!esMeDeben && d.origen==='envio') ? DB.envios.find(x=>x.id===d.origen_id) : null;
  const puedeEnviarAMensajero = !!envioDeuda && d.estado==='pendiente' && !!destinatarioActivoDeEnvio(envioDeuda);
  openModal(`
    <div class="modal-title">${esMeDeben?'Me deben':'Pagar a'} — ${escapeHtml(textoDivisasVisibles(d.persona))}</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:8px;">
      <div class="sumrow"><span class="k">Persona / Entidad</span><span class="v">${escapeHtml(textoDivisasVisibles(d.persona))}</span></div>
      <div class="sumrow"><span class="k">Monto</span><span class="v">${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha del registro</span><span class="v">${fmtDateShort(d.fecha)}</span></div>
      <div class="sumrow"><span class="k">Etiqueta</span><span class="v">${esMeDeben ? meDebenBadgeHtml(d) : afectaBalanceBadgeHtml(d)}</span></div>
      <div class="sumrow"><span class="k">Estado</span><span class="v">${estadoBadgeHtml(d.estado)}</span></div>
      ${d.fecha_cierre ? `<div class="sumrow"><span class="k">${esMeDeben?'Fecha de cobro':'Fecha de pago'}</span><span class="v">${fmtDate(d.fecha_cierre)}</span></div>` : ''}
      ${envioDeuda && envioDeuda.destinatario_id!=null ? `<div class="sumrow"><span class="k">Destinatario</span><span class="v">${escapeHtml(destinatarioNombreDeEnvio(envioDeuda))}</span></div>` : ''}
      ${envioDeuda ? `<div class="sumrow" id="dd-mensajero-row" style="${envioDeuda.mensajero_notificado_fecha?'':'display:none;'}"><span class="k">Mensajero notificado</span><span class="v" id="dd-mensajero">${escapeHtml(mensajeroNotificadoTexto(envioDeuda))}</span></div>` : ''}
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(d.nota || 'Sin nota')}</span></div>
    </div>
    ${puedeEnviarAMensajero ? `<div class="modal-actions"><button class="btn btn-primary btn-block" id="dd-mensajero-btn">📤 Enviar al mensajero</button></div>` : ''}
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
  const mensajeroBtn = document.getElementById('dd-mensajero-btn');
  if(mensajeroBtn) mensajeroBtn.onclick = ()=> enviarEntregaAMensajero(envioDeuda, ()=>{
    // Al volver del selector, este detalle sigue abierto: se actualiza el dato.
    const fila = document.getElementById('dd-mensajero-row');
    const txt = document.getElementById('dd-mensajero');
    if(fila && txt){ txt.textContent = mensajeroNotificadoTexto(envioDeuda); fila.style.display = ''; }
  });

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
            ? `Confirmar que se realizó la entrega de ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} a ${escapeHtml(textoDivisasVisibles(d.persona))}? La ganancia de este envío ya fue reconocida al registrarlo, así que esta acción NO modifica el balance general.`
            : `Confirmar pago de ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} a ${escapeHtml(textoDivisasVisibles(d.persona))}? Esta acción RESTARÁ ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} del balance general (la ganancia ya fue reconocida en otra divisa al registrar el envío).`;
          confirmDialog(msg, ()=>{
            d.estado = 'pagado'; d.fecha_cierre = Date.now();
            if(!mismaDivisaEnvio){
              adjustBalance(d.divisa, -d.monto);
            }
            save(); closeModal(); toast('Envío marcado como pagado — pasó al Historial'); onChange && onChange();
            // El pago ya quedó guardado; ahora solo se OFRECE avisar (cliente o trabajador).
            ofrecerNotificarWhatsApp(envioOrigen, d.fecha_cierre);
          }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
          return;
        }
        const restaAlPagar = d.afecta_balance || d.origen==='compra';
        const msg = restaAlPagar
          ? `Confirmar pago de ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} a ${escapeHtml(textoDivisasVisibles(d.persona))}? Esta acción RESTARÁ ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} del balance general.`
          : `Confirmar pago de ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} a ${escapeHtml(textoDivisasVisibles(d.persona))}?`;
        confirmDialog(msg, ()=>{
          d.estado = 'pagado'; d.fecha_cierre = Date.now();
          if(restaAlPagar) adjustBalance(d.divisa, -d.monto);
          save(); closeModal(); toast('Deuda marcada como pagada — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else if(meDebenSumaAlCobrar(d)){
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} de ${escapeHtml(textoDivisasVisibles(d.persona))}? Esta acción SUMARÁ ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} al balance general.`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          adjustBalance(d.divisa, d.monto);
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else {
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)} de ${escapeHtml(textoDivisasVisibles(d.persona))}?`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      }
    };
  }
  document.getElementById('dd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar este registro de ${escapeHtml(textoDivisasVisibles(d.persona))}?`, ()=> eliminarConDeshacer('Deuda eliminada', ()=>{
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
 * 18b. NOTIFICAR POR WHATSAPP CUANDO SE ENTREGA UN ENVÍO
 *      Se ofrece en los dos momentos en que un envío queda entregado:
 *      · Al marcar como pagada su deuda en Deudas → Pagar a (switch "No").
 *      · Al guardarlo con "Descontar ahora: Sí" (se entrega en el acto),
 *        incluidos los de precio especial.
 *      Se avisa a quien corresponda: al TRABAJADOR si el envío lo gestionó
 *      él, o al CLIENTE si es un envío directo. Solo si tiene número.
 *      Se abre WhatsApp con el mensaje escrito; el usuario lo revisa y
 *      pulsa "Enviar" él mismo (no se envía nada automáticamente).
 * ---------------------------------------------------------------------- */
// Deja solo dígitos; "00" al inicio es el prefijo internacional (= "+").
function limpiarNumeroWhatsApp(telefono){
  let n = String(telefono||'').replace(/\D/g, '');
  if(n.startsWith('00')) n = n.slice(2);
  return n;
}
function fechaDDMMAAAA(ts){
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
// A quién avisar de este envío: {persona, rol:'cliente'|'trabajador'} o null.
// Un cliente o trabajador eliminado (inactivo) también se puede notificar:
// su número sigue guardado.
function destinatarioWhatsAppEnvio(envio){
  if(!envio) return null;
  let persona = null, rol = null;
  if(envio.trabajador_id){
    persona = DB.trabajadores.find(t=>t.id===envio.trabajador_id); rol = 'trabajador';
  } else if(envio.cliente_id!=null){
    persona = DB.clientes.find(c=>c.id===envio.cliente_id); rol = 'cliente';
  }
  if(!persona || !limpiarNumeroWhatsApp(persona.telefono)) return null;
  return {persona, rol};
}
function mensajeWhatsAppEnvioEntregado(dest, envio, fechaEntrega){
  const datos =
    `Cantidad: ${fmtMoney(envio.cantidad_pagada)} ${nombreDivisaVisible(envio.divisa_entrega)}\n` +
    `Fecha ${fechaDDMMAAAA(fechaEntrega)}\n`;
  if(dest.rol==='trabajador'){
    return `Hola ${dest.persona.nombre},\n` +
      `La remesa de ${fmtMoney(envio.cantidad_enviada)} ${envio.moneda} que usted gestionó fue entregada.\n` +
      datos +
      `Muchas gracias por su trabajo.`;
  }
  return `Hola ${dest.persona.nombre},\n` +
    `Su envío de ${fmtMoney(envio.cantidad_enviada)} ${envio.moneda} fue entregado.\n` +
    datos +
    `Muchas gracias por confiar en nosotros.`;
}
function abrirWhatsAppEnvio(dest, envio, fechaEntrega){
  const numero = limpiarNumeroWhatsApp(dest && dest.persona.telefono);
  if(!numero) return;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensajeWhatsAppEnvioEntregado(dest, envio, fechaEntrega))}`;
  // En la APK, Android abre WhatsApp directamente; en el navegador, una pestaña nueva.
  if(window.AndroidBridge && window.AndroidBridge.openExternal){ window.AndroidBridge.openExternal(url); return; }
  window.open(url, '_blank');
}
// titulo: el resultado de la acción que acaba de completarse (ya guardada).
function ofrecerNotificarWhatsApp(envio, fechaEntrega, titulo='✅ Envío marcado como pagado'){
  const dest = destinatarioWhatsAppEnvio(envio);
  if(!dest) return;
  const quien = dest.rol==='trabajador' ? `al trabajador <strong>${escapeHtml(dest.persona.nombre)}</strong>` : `a <strong>${escapeHtml(dest.persona.nombre)}</strong>`;
  openModal(`
    <div class="modal-title">${titulo}</div>
    <div class="modal-msg">¿Deseas notificar ${quien} por WhatsApp?</div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="wa-no">No</button>
      <button class="btn btn-gold btn-block" id="wa-si">Sí</button>
    </div>
  `, {center:true});
  document.getElementById('wa-no').onclick = closeModal;
  document.getElementById('wa-si').onclick = ()=>{ closeModal(); abrirWhatsAppEnvio(dest, envio, fechaEntrega); };
}


function mensajeCobroParaMensajero(comprador,pendientes){
  const lineas=['COBRAR A:',`👤 ${[comprador.nombre,comprador.nombre_completo].filter(Boolean).join(' ')}`];
  if(comprador.telefono)lineas.push(`📱 ${comprador.telefono}`);
  if(comprador.direccion)lineas.push(`🧭 ${comprador.direccion}`);
  const porDivisa=new Map();
  pendientes.forEach(d=>porDivisa.set(d.divisa,round2((porDivisa.get(d.divisa)||0)+Number(d.monto||0))));
  [...porDivisa.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es')).forEach(([divisa,monto])=>lineas.push(`💰 ${fmtMoney(monto)} ${nombreDivisaVisible(divisa)}`));
  return lineas.join('\n');
}
function enviarGrupoMeDebenAlMensajero(g,onNotificado){
  const nombre=normalizarTexto(g.comprador_nombre||'');
  const pendientes=DB.deudas.filter(d=>d.tipo==='me_deben'&&d.estado==='pendiente'&&normalizarTexto(deudaCompradorNombre(d))===nombre);
  openSelectorEntrega('mensajeros',m=>{
    if(!m)return;
    const numero=limpiarNumeroWhatsApp(m.telefono);
    if(!numero){alertDialog('Mensajero sin teléfono','Este mensajero no tiene teléfono configurado. Edítalo para poder notificarlo por WhatsApp.');return;}
    const fecha=Date.now();
    pendientes.forEach(d=>{d.mensajero_notificado_id=m.id;d.mensajero_notificado_nombre=m.nombre;d.mensajero_notificado_fecha=fecha;});
    save();
    const url=`https://wa.me/${numero}?text=${encodeURIComponent(mensajeCobroParaMensajero(g.comprador,pendientes))}`;
    if(window.AndroidBridge&&window.AndroidBridge.openExternal)window.AndroidBridge.openExternal(url);else window.open(url,'_blank');
    toast(`📤 Cobro enviado a ${m.nombre}`);
    onNotificado&&onNotificado();
  });
}
function eliminarGrupoMeDeben(g,onChange){
  eliminarConDeshacer('Deuda consolidada eliminada',()=>{
    g.items.forEach(d=>{
      if(d.origen==='venta'){
        const v=DB.ventas.find(x=>x.id===d.origen_id);
        if(v){
          adjustBalance(v.divisa_vendida,Number(v.cantidad_vendida||0));
          if(meDebenRestaAlCrear(d)&&d.estado==='pendiente')adjustBalance(d.divisa,Number(d.monto||0));
          else if(!meDebenRestaAlCrear(d)&&meDebenSumaAlCobrar(d)&&d.estado==='cobrado')adjustBalance(d.divisa,-Number(d.monto||0));
          DB.ventas=DB.ventas.filter(x=>x.id!==v.id);
        }
      }else if(meDebenRestaAlCrear(d)&&d.estado==='pendiente'){adjustBalance(d.divisa,Number(d.monto||0));}
      else if(!meDebenRestaAlCrear(d)&&meDebenSumaAlCobrar(d)&&d.estado==='cobrado'){adjustBalance(d.divisa,-Number(d.monto||0));}
    });
    const ids=new Set(g.items.map(d=>d.id));DB.deudas=DB.deudas.filter(d=>!ids.has(d.id));save();
  });
  onChange&&onChange();
}
function openDeudaGrupoDetalle(clave,onChange,estado='pendiente'){
  const g=grupoMeDebenPorClave(clave,estado);if(!g)return;
  const c=g.comprador||{};
  const notas=[...new Set(g.items.map(d=>String(d.nota||'').trim()).filter(Boolean))];
  const detalle=g.items.map(d=>{const v=d.origen==='venta'?DB.ventas.find(x=>x.id===d.origen_id):null;const concepto=v?`Venta de ${fmtMoney(v.cantidad_vendida)} ${nombreDivisaVisible(v.divisa_vendida)}`:'Registro manual';return `<div class="sumrow"><span class="k">${fmtDateShort(v?.fecha_hora||d.fecha)} · ${escapeHtml(concepto)}</span><span class="v">${fmtMoney(d.monto)} ${escapeDivisa(d.divisa)}</span></div>`;}).join('');
  const pendiente=estado==='pendiente';
  openModal(`
    <div class="modal-title">🤝 ${escapeHtml(nombreGrupoMeDeben(g))}</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:8px;">
      <div class="sumrow"><span class="k">Comprador</span><span class="v">${escapeHtml(c.nombre||g.comprador_nombre||'—')} ${escapeHtml(c.nombre_completo||'')}</span></div>
      <div class="sumrow"><span class="k">Teléfono</span><span class="v">${escapeHtml(c.telefono||'—')}</span></div>
      <div class="sumrow"><span class="k">Dirección</span><span class="v">${escapeHtml(c.direccion||'—')}</span></div>
      <div class="sumrow"><span class="k">Monto total a cobrar</span><span class="v">${fmtMoney(g.monto)} ${escapeDivisa(g.divisa)}</span></div>
      <div class="sumrow"><span class="k">Tipo de deuda</span><span class="v">${etiquetaTipoGrupoMeDeben(g)}</span></div>
      <div class="sumrow"><span class="k">Estado</span><span class="v">${estadoBadgeHtml(estado)}</span></div>
      <div class="sumrow"><span class="k">Primera venta/registro</span><span class="v">${fmtDateShort(g.fecha_primera)}</span></div>
      <div class="sumrow"><span class="k">Última venta/registro</span><span class="v">${fmtDateShort(g.fecha_ultima)}</span></div>
      <div class="sumrow"><span class="k">Nota consolidada</span><span class="v">${escapeHtml(notas.join(' · ')||'Sin nota')}</span></div>
      ${mensajeroNotificadoGrupoTexto(g)?`<div class="sumrow"><span class="k">Mensajero notificado</span><span class="v">${escapeHtml(mensajeroNotificadoGrupoTexto(g))}</span></div>`:''}
    </div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:10px;"><div style="font-weight:800;margin-bottom:8px;">Ventas y registros que componen la deuda</div>${detalle}</div>
    ${pendiente&&g.comprador_nombre?`<div class="modal-actions"><button class="btn btn-primary btn-block" id="ddg-mensajero">📤 Enviar al mensajero</button></div>`:''}
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="ddg-aceptar">✅ Aceptar</button></div>
    ${pendiente?`<div class="modal-actions"><button class="btn btn-gold btn-block" id="ddg-cobrar">💰 Marcar como cobrado</button></div>`:''}
    <div class="modal-actions"><button class="btn btn-danger btn-block" id="ddg-eliminar">🗑️ Eliminar grupo${g.items.some(d=>d.origen==='venta')?' y ventas vinculadas':''}</button></div>
  `);
  document.getElementById('ddg-aceptar').onclick=()=>retornoHistorialDivisa?volverDesdeDetalleMovimiento():closeModal();
  const enviar=document.getElementById('ddg-mensajero');if(enviar)enviar.onclick=()=>enviarGrupoMeDebenAlMensajero(g,()=>openDeudaGrupoDetalle(clave,onChange,estado));
  const cobrar=document.getElementById('ddg-cobrar');
  if(cobrar)cobrar.onclick=()=>confirmDialog(`¿Marcar como cobrada la deuda completa de ${escapeHtml(nombreGrupoMeDeben(g))} por ${fmtMoney(g.monto)} ${escapeDivisa(g.divisa)}?${g.tipo_me_deben===MEDEBEN_INFORMATIVO?' No se modificará el balance.':' Se sumará el monto al balance de esa divisa.'}`,()=>{
    const fecha=Date.now();g.items.forEach(d=>{d.estado='cobrado';d.fecha_cierre=fecha;if(meDebenSumaAlCobrar(d))adjustBalance(d.divisa,Number(d.monto||0));});
    save();closeModal();toast('Deuda consolidada cobrada — pasó al Historial');onChange&&onChange();
  },{okLabel:'Marcar como cobrado',cancelLabel:'Cancelar',danger:false});
  document.getElementById('ddg-eliminar').onclick=()=>confirmDialog(`¿Eliminar este grupo?${g.items.some(d=>d.origen==='venta')?' También se eliminarán las ventas vinculadas y se revertirá su impacto para evitar ventas con deudas huérfanas.':''}`,()=>{closeModal();eliminarGrupoMeDeben(g,onChange);},{okLabel:'Eliminar',cancelLabel:'Cancelar',danger:true});
}
