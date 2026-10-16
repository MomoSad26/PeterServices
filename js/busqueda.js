/* ---------------------------------------------------------------------- *
 * BUSCADOR GENERAL — búsqueda en memoria, sin guardar consultas.
 * ---------------------------------------------------------------------- */
let busquedaTextoActual = '';
let busquedaFiltroLista = null;

const BUSQUEDA_RUTAS = {
  clientes:'clientes',
  trabajadores:'trabajadores',
  envios:'historial',
  ventas:'ventas',
  compras:'compras',
  gastos:'gastos',
  deudas:'deudas'
};
const BUSQUEDA_VISTAS_DETALLE = ['cliente-detalle','trabajador-detalle','envio-detalle'];

function busquedaDecodificar(texto){
  try{return decodeURIComponent(texto||'');}catch(e){return String(texto||'');}
}
function sincronizarFiltroBusquedaRuta(view,param){
  if(view==='busqueda'){
    busquedaFiltroLista=null;
    return;
  }
  const seccion=BUSQUEDA_RUTAS[view];
  if(seccion){
    const m=/^busqueda\/(.+)$/.exec(String(param||''));
    if(m){
      const consulta=busquedaDecodificar(m[1]);
      busquedaFiltroLista={seccion,consulta};
      busquedaTextoActual=consulta;
      const paginaPorSeccion={envios:'historial',ventas:'ventas',compras:'compras',gastos:'gastos'};
      const pagina=paginacion[paginaPorSeccion[seccion]];
      if(pagina) pagina.actual=1;
    }else{
      busquedaFiltroLista=null;
    }
    return;
  }
  if(!BUSQUEDA_VISTAS_DETALLE.includes(view)) busquedaFiltroLista=null;
}
function busquedaFiltrandoLista(seccion){
  return !!(busquedaFiltroLista && busquedaFiltroLista.seccion===seccion && busquedaFiltroLista.consulta.trim());
}
function busquedaFiltrarRegistroLista(seccion,registro){
  return !busquedaFiltrandoLista(seccion) || busquedaRegistroCoincide(seccion,registro,busquedaFiltroLista.consulta);
}
function busquedaFechaInfo(ts){
  const n=Number(ts);
  if(!Number.isFinite(n)||n<=0) return null;
  const d=new Date(n);
  if(Number.isNaN(d.getTime())) return null;
  return {dia:d.getDate(),mes:d.getMonth()+1,anio:d.getFullYear()};
}
function busquedaAnalizarFecha(token){
  let m=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(token);
  if(m){
    const dia=Number(m[1]),mes=Number(m[2]),anio=m[3]?Number(m[3]):null;
    if(dia<1||dia>31||mes<1||mes>12) return null;
    return {dia,mes,anio};
  }
  m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(token);
  if(m){
    const anio=Number(m[1]),mes=Number(m[2]),dia=Number(m[3]);
    if(dia<1||dia>31||mes<1||mes>12) return null;
    return {dia,mes,anio};
  }
  return null;
}
function busquedaFechaCoincide(ts,fecha){
  const d=busquedaFechaInfo(ts);
  return !!(d && d.dia===fecha.dia && d.mes===fecha.mes && (fecha.anio===null||d.anio===fecha.anio));
}
function busquedaNumeroToken(token){
  let s=String(token||'').replace(/^\$/,'');
  if(/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
  else if(/^[-+]?\d+,\d{1,2}$/.test(s) && !s.includes('.')) s=s.replace(',','.');
  else s=s.replace(/,/g,'');
  if(!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const n=Number(s);
  return Number.isFinite(n)?n:null;
}
function busquedaMontoCoincide(monto,consulta){
  const v=Number(monto);
  if(!Number.isFinite(v)) return false;
  const buscado=Math.abs(consulta),valor=Math.abs(v);
  const tolerancia=Math.max(0.01,buscado*0.01);
  return Math.abs(valor-buscado)<=tolerancia;
}
function busquedaInfoRegistro(seccion,r){
  const info={textos:[],fechas:[],montos:[]};
  const textos=(...valores)=>info.textos.push(...valores.filter(v=>v!==undefined&&v!==null).map(v=>String(v)));
  const fechas=(...valores)=>info.fechas.push(...valores.filter(v=>v!==undefined&&v!==null));
  const montos=(...valores)=>info.montos.push(...valores.filter(v=>v!==undefined&&v!==null).map(Number).filter(Number.isFinite));
  if(seccion==='clientes'){
    textos(r.nombre,r.pais,r.telefono,r.activo?'Activo':'Inactivo');
    fechas(r.fecha_registro);
  }else if(seccion==='trabajadores'){
    textos(r.nombre,r.telefono,r.activo?'Activo':'Inactivo');
    fechas(r.fecha_registro);
  }else if(seccion==='envios'){
    textos(entityNameForEnvio(r),r.tipo,r.moneda,r.divisa_entrega,r.divisa_ganancia,r.forma_ganancia,r.nota,r.archivado?'Archivado':'');
    fechas(r.fecha_hora);
    montos(r.cantidad_enviada,r.precio,r.cantidad_pagada,r.cotizado_a,r.ganancia);
  }else if(seccion==='ventas'){
    textos(r.divisa_vendida,r.divisa_recibida,r.nota,ventaEstado(r));
    fechas(r.fecha_hora);
    montos(r.cantidad_vendida,r.cantidad_recibida);
  }else if(seccion==='compras'){
    textos(r.divisa_comprada,r.divisa_pagada,r.nota,r.archivado?'Archivado':'');
    fechas(r.fecha_hora);
    montos(r.cantidad_comprada,r.cantidad_pagada);
  }else if(seccion==='gastos'){
    textos(r.concepto,r.divisa,r.nota,r.archivado?'Archivado':'');
    fechas(r.fecha_hora);
    montos(r.cantidad);
  }else if(seccion==='deudas'){
    textos(r.persona,r.divisa,r.estado,r.tipo,r.nota,r.origen);
    fechas(r.fecha,r.creado_en,r.fecha_cierre);
    montos(r.monto);
  }
  return info;
}
function busquedaRegistroCoincide(seccion,registro,consulta){
  const tokens=normalizarTexto(consulta).split(' ').filter(Boolean);
  if(!tokens.length) return true;
  const info=busquedaInfoRegistro(seccion,registro);
  return tokens.every(token=>{
    const fecha=busquedaAnalizarFecha(token);
    if(fecha) return info.fechas.some(ts=>busquedaFechaCoincide(ts,fecha));
    const numero=busquedaNumeroToken(token);
    if(numero!==null) return info.montos.some(m=>busquedaMontoCoincide(m,numero));
    return info.textos.some(t=>normalizarTexto(t).includes(token));
  });
}
function busquedaDetalleRegistro(seccion,r){
  const archivado=r.archivado?' · Archivado':'';
  if(seccion==='clientes'){
    return [r.pais,r.telefono,r.activo?'':'Inactivo'].filter(Boolean).join(' · ');
  }
  if(seccion==='trabajadores'){
    return [r.telefono,r.activo?'':'Inactivo'].filter(Boolean).join(' · ');
  }
  if(seccion==='envios'){
    return `${fmtDateShort(r.fecha_hora)} · ${fmtMoney(r.cantidad_enviada)} ${escapeHtml(r.moneda)} · Ganancia: ${fmtMoney(envioGananciaMostrada(r))} ${escapeHtml(r.divisa_ganancia||'')}${archivado}`;
  }
  if(seccion==='ventas'){
    return `${fmtDateShort(r.fecha_hora)} · ${fmtMoney(r.cantidad_vendida)} ${escapeHtml(r.divisa_vendida)} → ${fmtMoney(r.cantidad_recibida)} ${escapeHtml(r.divisa_recibida)} · ${escapeHtml(ventaEstado(r))}${archivado}`;
  }
  if(seccion==='compras'){
    return `${fmtDateShort(r.fecha_hora)} · ${fmtMoney(r.cantidad_pagada)} ${escapeHtml(r.divisa_pagada)} → ${fmtMoney(r.cantidad_comprada)} ${escapeHtml(r.divisa_comprada)}${archivado}`;
  }
  if(seccion==='gastos'){
    return `${fmtDateShort(r.fecha_hora)} · ${fmtMoney(r.cantidad)} ${escapeHtml(r.divisa)}${archivado}`;
  }
  if(seccion==='deudas'){
    const estado=r.estado==='pendiente'?'Pendiente':(r.estado==='pagado'?'Pagado':'Cobrado');
    return `${fmtDateShort(r.fecha)} · ${fmtMoney(r.monto)} ${escapeHtml(r.divisa)} · ${estado}`;
  }
  return '';
}
function busquedaTituloRegistro(seccion,r){
  if(seccion==='clientes'||seccion==='trabajadores') return r.nombre||'(sin nombre)';
  if(seccion==='envios') return entityNameForEnvio(r);
  if(seccion==='ventas') return `${fmtMoney(r.cantidad_vendida)} ${r.divisa_vendida} → ${fmtMoney(r.cantidad_recibida)} ${r.divisa_recibida}`;
  if(seccion==='compras') return `${fmtMoney(r.cantidad_pagada)} ${r.divisa_pagada} → ${fmtMoney(r.cantidad_comprada)} ${r.divisa_comprada}`;
  if(seccion==='gastos') return r.concepto||'Gasto';
  if(seccion==='deudas') return r.persona||'Deuda';
  return 'Registro';
}
function busquedaDefiniciones(){
  return [
    {key:'clientes',icono:'👤',titulo:'Clientes',registros:(DB.clientes||[])},
    {key:'trabajadores',icono:'👷',titulo:'Trabajadores',registros:(DB.trabajadores||[])},
    {key:'envios',icono:'📤',titulo:'Envíos',registros:(DB.envios||[])},
    {key:'ventas',icono:'💱',titulo:'Ventas',registros:(DB.ventas||[])},
    {key:'compras',icono:'🛒',titulo:'Compras',registros:(DB.compras||[])},
    {key:'gastos',icono:'🧾',titulo:'Gastos',registros:(DB.gastos||[])},
    {key:'deudas',icono:'🤝',titulo:'Deudas',registros:(DB.deudas||[])}
  ];
}
function busquedaRegistroFechaOrden(seccion,r){
  const ts=seccion==='deudas'?(r.creado_en||r.fecha||0):(r.fecha_hora||r.fecha_registro||0);
  return Number(ts)||0;
}
function buscarEnSecciones(consulta){
  return busquedaDefiniciones().map(def=>{
    const resultados=def.registros
      .filter(r=>busquedaRegistroCoincide(def.key,r,consulta))
      .sort((a,b)=>{
        if(def.key==='clientes'||def.key==='trabajadores') return String(a.nombre||'').localeCompare(String(b.nombre||''),'es');
        return busquedaRegistroFechaOrden(def.key,b)-busquedaRegistroFechaOrden(def.key,a);
      });
    return {...def,resultados};
  }).filter(def=>def.resultados.length);
}
function busquedaAbrirResultado(seccion,id){
  const app=document.getElementById('app-content');
  const refrescar=()=>renderBusqueda(document.getElementById('app-content'));
  if(seccion==='clientes'){ location.hash=`#/cliente-detalle/${id}`; return; }
  if(seccion==='trabajadores'){ location.hash=`#/trabajador-detalle/${id}`; return; }
  if(seccion==='envios'){ location.hash=`#/envio-detalle/${id}`; return; }
  if(seccion==='ventas'){ openVentaDetalle(id,refrescar); return; }
  if(seccion==='compras'){ openCompraDetalle(id,refrescar); return; }
  if(seccion==='gastos'){ openGastoDetalle(id,refrescar); return; }
  if(seccion==='deudas'){ openDeudaDetalle(id,refrescar); return; }
}
function busquedaVerTodos(seccion){
  const consulta=busquedaTextoActual.trim();
  if(!consulta) return;
  const ruta=BUSQUEDA_RUTAS[seccion];
  if(!ruta) return;
  busquedaFiltroLista={seccion,consulta};
  if(seccion==='envios'){
    historialFilters={q:'',tipo:'Todos',fecha:'Todo',fechaDesde:null,fechaHasta:null,forma:'Todas',divisa:'Todas'};
  }
  const destino=`#/${ruta}/busqueda/${encodeURIComponent(consulta)}`;
  if(location.hash===destino) route();
  else location.hash=destino;
}
function renderBusqueda(content){
  content.innerHTML=`
    <h1 class="section-title">🔍 Buscador general</h1>
    <div class="busqueda-search-wrap">
      <span class="busqueda-search-icon" aria-hidden="true">🔍</span>
      <input id="busqueda-input" class="busqueda-search-input" type="search" placeholder="Buscar..." autocomplete="off" aria-label="Buscar registros por nombre, fecha o monto" value="${escapeHtml(busquedaTextoActual)}">
    </div>
    <div class="busqueda-help">Busca nombres, conceptos, fechas (15/10, 15/10/2025 o 2025-10-15) y montos. Puedes combinar términos, por ejemplo: Carlos 500.</div>
    <div id="busqueda-results"></div>
  `;
  const input=document.getElementById('busqueda-input');
  const results=document.getElementById('busqueda-results');
  function pintar(){
    const consulta=input.value.trim();
    busquedaTextoActual=input.value;
    if(!consulta){
      results.innerHTML='<div class="empty-state busqueda-sin-resultados"><div class="ei">🔍</div>Escribe para buscar...</div>';
      return;
    }
    const secciones=buscarEnSecciones(consulta);
    if(!secciones.length){
      results.innerHTML='<div class="empty-state busqueda-sin-resultados"><div class="ei">🔎</div>Sin resultados</div>';
      return;
    }
    results.innerHTML=secciones.map(def=>{
      const primeros=def.resultados.slice(0,10);
      return `
        <section class="busqueda-group">
          <h2 class="busqueda-group-title"><span>${def.icono}</span><span>${def.titulo}</span><span class="busqueda-group-count">(${def.resultados.length})</span></h2>
          <div class="busqueda-results">
            ${primeros.map(r=>{
              const archivado=r.archivado;
              return `<button type="button" class="busqueda-result" data-seccion="${def.key}" data-id="${r.id}">
                <span class="busqueda-result-icon" aria-hidden="true">${def.icono}</span>
                <span class="busqueda-result-main">
                  <span class="busqueda-result-title">${escapeHtml(busquedaTituloRegistro(def.key,r))}${archivado?'<span class="busqueda-badge-archivado">Archivado</span>':''}</span>
                  <span class="busqueda-result-detail">${busquedaDetalleRegistro(def.key,r)}</span>
                </span>
              </button>`;
            }).join('')}
          </div>
          ${def.resultados.length>10?`<button type="button" class="busqueda-ver-todos" data-ver-todos="${def.key}">Ver todos los ${def.resultados.length} resultados ›</button>`:''}
        </section>`;
    }).join('');
    results.querySelectorAll('.busqueda-result').forEach(btn=>{
      btn.addEventListener('click',()=>busquedaAbrirResultado(btn.dataset.seccion,Number(btn.dataset.id)));
    });
    results.querySelectorAll('[data-ver-todos]').forEach(btn=>{
      btn.addEventListener('click',()=>busquedaVerTodos(btn.dataset.verTodos));
    });
  }
  input.addEventListener('input',pintar);
  pintar();
}
