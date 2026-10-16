/* ---------------------------------------------------------------------- *
 * PANEL — resumen operativo del día. Solo consulta datos existentes:
 * no modifica cálculos, saldos ni registros.
 * ---------------------------------------------------------------------- */
function panelRangoHoy(){
  const desde = todayRangeStart();
  const siguiente = new Date(desde);
  siguiente.setDate(siguiente.getDate()+1);
  return {desde, hasta:siguiente.getTime()};
}
function panelEsDeHoy(ts, rango){
  const n = Number(ts);
  return Number.isFinite(n) && n>=rango.desde && n<rango.hasta;
}
function panelAgruparMontos(registros, campoDivisa, obtenerMonto){
  const grupos = new Map();
  registros.forEach(reg=>{
    const divisa = String(reg[campoDivisa] || '').trim();
    if(!divisa) return;
    const valor = Number(obtenerMonto(reg)) || 0;
    if(!grupos.has(divisa)) grupos.set(divisa, 0);
    grupos.set(divisa, round2(grupos.get(divisa)+valor));
  });
  return Array.from(grupos.entries()).map(([divisa,monto])=>({divisa,monto}));
}
function panelTextoMonto(monto){
  const n = round2(monto);
  return n>0 ? '+'+fmtMoney(n) : fmtMoney(n);
}
function panelValorPorDivisa(grupos){
  if(!grupos.length) return 'Sin movimientos';
  const primeros = grupos.slice(0,2).map(g=>`${panelTextoMonto(g.monto)} ${escapeHtml(g.divisa)}`);
  if(grupos.length>2) primeros.push(`+${grupos.length-2} más ›`);
  return primeros.join(' · ');
}
function panelFila(icono, titulo, valor, accion, esMonto=false){
  const tag = accion ? 'button' : 'div';
  return `<${tag} class="panel-row ${accion?'panel-row-clickable':''}" ${accion?`type="button" data-panel-action="${accion}"`:''}>
    <span class="panel-row-icon" aria-hidden="true">${icono}</span>
    <span class="panel-row-label">${titulo}</span>
    <span class="panel-row-value ${esMonto?'subtle':''}">${valor}</span>
    ${accion?'<span class="panel-row-arrow" aria-hidden="true">›</span>':''}
  </${tag}>`;
}
function panelEstadoRespaldo(){
  const meta = DB.meta || {};
  const marcas = [Number(meta.ultimo_respaldo)||0, Number(meta.ultimo_respaldo_auto)||0].filter(Boolean);
  if(!marcas.length) return 'Nunca';
  const ultimo = Math.max(...marcas);
  if(fechaLocalISO(ultimo)===fechaLocalISO(Date.now())) return 'Hoy';
  const fechaUltimo = new Date(ultimo);
  fechaUltimo.setHours(0,0,0,0);
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const dias = Math.max(1, Math.round((hoy.getTime()-fechaUltimo.getTime())/86400000));
  return `Hace ${dias} ${dias===1?'día':'días'}`;
}
function renderPanel(content){
  const rango = panelRangoHoy();
  const enviosHoyTodos = (DB.envios||[]).filter(e=>panelEsDeHoy(e.fecha_hora,rango));
  const enviosHoy = enviosHoyTodos.filter(e=>!e.archivado);
  const gastosHoy = (DB.gastos||[]).filter(g=>panelEsDeHoy(g.fecha_hora,rango));
  const comprasHoy = (DB.compras||[]).filter(c=>panelEsDeHoy(c.fecha_hora,rango));
  const ventasHoy = (DB.ventas||[]).filter(v=>panelEsDeHoy(v.fecha_hora,rango));
  const cobrarPendiente = (DB.deudas||[]).filter(d=>d.tipo==='me_deben' && d.estado==='pendiente').length;
  const pagarPendiente = (DB.deudas||[]).filter(d=>d.tipo==='pagar_a' && d.estado==='pendiente').length;
  // La ganancia se agrupa usando el valor guardado del envío. No se vuelve
  // a calcular ni se modifica ninguna fórmula financiera existente.
  const gananciasPorDivisa = panelAgruparMontos(
    enviosHoyTodos.slice().sort((a,b)=>Number(b.fecha_hora||0)-Number(a.fecha_hora||0)),
    'divisa_ganancia', e=>e.ganancia
  );
  // El gasto es una salida de dinero: se muestra con signo negativo, igual
  // que los movimientos de gasto del Balance.
  const gastosPorDivisa = panelAgruparMontos(
    gastosHoy.slice().sort((a,b)=>Number(b.fecha_hora||0)-Number(a.fecha_hora||0)),
    'divisa', g=>-Math.abs(Number(g.cantidad)||0)
  );
  content.innerHTML = `
    <h1 class="section-title">📊 Panel</h1>
    <div class="panel-date">Resumen del día · ${escapeHtml(fmtDateShort(Date.now()))}</div>
    <div class="panel-rows">
      ${panelFila('📤','Envíos registrados hoy',String(enviosHoy.length),'envios')}
      ${panelFila('⏳','Deudas pendientes por cobrar',String(cobrarPendiente),'cobrar')}
      ${panelFila('⏳','Deudas pendientes por pagar',String(pagarPendiente),'pagar')}
      ${panelFila('💰','Ganancia de hoy',panelValorPorDivisa(gananciasPorDivisa),'balance',true)}
      ${panelFila('🧾','Gastos de hoy',panelValorPorDivisa(gastosPorDivisa),'balance',true)}
      ${panelFila('🛒','Compras de hoy',String(comprasHoy.length),'compras')}
      ${panelFila('💱','Ventas de hoy',String(ventasHoy.length),'ventas')}
      ${panelFila('⚠️','Respaldo',escapeHtml(panelEstadoRespaldo()),'respaldos')}
    </div>
  `;
  content.querySelectorAll('[data-panel-action]').forEach(row=>{
    row.addEventListener('click',()=>{
      const accion = row.dataset.panelAction;
      if(accion==='envios'){
        historialFilters = {q:'',tipo:'Todos',fecha:'Hoy',fechaDesde:null,fechaHasta:null,forma:'Todas',divisa:'Todas'};
        panelIrA('#/historial');
      }else if(accion==='cobrar'){
        panelIrA('#/deudas/me_deben');
      }else if(accion==='pagar'){
        panelIrA('#/deudas/pagar_a');
      }else if(accion==='balance'){
        balancePeriod = 'Hoy';
        balanceCustomDesde = null;
        balanceCustomHasta = null;
        panelIrA('#/balance');
      }else if(accion==='gastos'){
        panelIrA('#/gastos');
      }else if(accion==='compras'){
        panelIrA('#/compras');
      }else if(accion==='ventas'){
        panelIrA('#/ventas');
      }else if(accion==='respaldos'){
        panelIrA('#/respaldos');
      }
    });
  });
}
function panelIrA(hash){
  if(location.hash===hash) route();
  else location.hash=hash;
}
