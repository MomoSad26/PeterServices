/* ---------------------------------------------------------------------- *
 * PANEL — resumen operativo del día. Solo consulta datos existentes:
 * no modifica cálculos, saldos ni registros.
 * ---------------------------------------------------------------------- */
let panelDiaSeleccionado = 'Hoy';
function panelRangoDia(dia = panelDiaSeleccionado){
  const desde = new Date(todayRangeStart());
  if(dia === 'Ayer') desde.setDate(desde.getDate()-1);
  const siguiente = new Date(desde);
  siguiente.setDate(siguiente.getDate()+1);
  return {desde:desde.getTime(), hasta:siguiente.getTime()};
}
function panelRangoHoy(){ return panelRangoDia('Hoy'); }
function panelEsDelDia(ts, rango){
  const n = Number(ts);
  return Number.isFinite(n) && n>=rango.desde && n<rango.hasta;
}
function panelEsDeHoy(ts, rango){ return panelEsDelDia(ts, rango); }
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
function renderPanel(content, conservarDia=false){
  if(!conservarDia) panelDiaSeleccionado = 'Hoy';
  const rango = panelRangoDia(panelDiaSeleccionado);
  const palabraDia = panelDiaSeleccionado === 'Ayer' ? 'ayer' : 'hoy';
  const enviosDiaTodos = (DB.envios||[]).filter(e=>panelEsDelDia(e.fecha_hora,rango));
  const enviosDia = enviosDiaTodos.filter(e=>!e.archivado);
  const gastosDia = (DB.gastos||[]).filter(g=>panelEsDelDia(g.fecha_hora,rango));
  const comprasDia = (DB.compras||[]).filter(c=>panelEsDelDia(c.fecha_hora,rango));
  const ventasDia = (DB.ventas||[]).filter(v=>panelEsDelDia(v.fecha_hora,rango));
  const cobrarPendiente = (DB.deudas||[]).filter(d=>d.tipo==='me_deben' && d.estado==='pendiente').length;
  const pagarPendiente = (DB.deudas||[]).filter(d=>d.tipo==='pagar_a' && d.estado==='pendiente').length;
  const gananciasPorDivisa = panelAgruparMontos(
    enviosDiaTodos.slice().sort((a,b)=>Number(b.fecha_hora||0)-Number(a.fecha_hora||0)),
    'divisa_ganancia', e=>e.ganancia
  );
  const gastosPorDivisa = panelAgruparMontos(
    gastosDia.slice().sort((a,b)=>Number(b.fecha_hora||0)-Number(a.fecha_hora||0)),
    'divisa', g=>-Math.abs(Number(g.cantidad)||0)
  );

  content.innerHTML = `
    <h1 class="section-title">📊 Panel</h1>
    <div class="panel-day-selector" role="group" aria-label="Día del Panel">
      <button type="button" class="btn ${panelDiaSeleccionado==='Hoy'?'btn-primary':'btn-outline'}" data-panel-dia="Hoy" aria-pressed="${panelDiaSeleccionado==='Hoy'}">Hoy</button>
      <button type="button" class="btn ${panelDiaSeleccionado==='Ayer'?'btn-primary':'btn-outline'}" data-panel-dia="Ayer" aria-pressed="${panelDiaSeleccionado==='Ayer'}">Ayer</button>
    </div>
    <div class="panel-date">Resumen del día · ${escapeHtml(fmtDateShort(rango.desde))}</div>
    <div class="panel-rows">
      ${panelFila('📤',`Envíos registrados ${palabraDia}`,String(enviosDia.length),'envios')}
      ${panelFila('⏳','Me deben:',String(cobrarPendiente),'cobrar')}
      ${panelFila('⏳','Pagar a:',String(pagarPendiente),'pagar')}
      ${panelFila('💰',`Ganancia de ${palabraDia}`,panelValorPorDivisa(gananciasPorDivisa),'balance',true)}
      ${panelFila('🧾',`Gastos de ${palabraDia}`,panelValorPorDivisa(gastosPorDivisa),'balance',true)}
      ${panelFila('🛒',`Compras de ${palabraDia}`,String(comprasDia.length),'compras')}
      ${panelFila('💱',`Ventas de ${palabraDia}`,String(ventasDia.length),'ventas')}
      ${panelFila('⚠️','Respaldo',escapeHtml(panelEstadoRespaldo()),'respaldos')}
    </div>
  `;
  content.querySelectorAll('[data-panel-dia]').forEach(button=>{
    button.addEventListener('click',()=>{
      panelDiaSeleccionado = button.dataset.panelDia === 'Ayer' ? 'Ayer' : 'Hoy';
      renderPanel(content, true);
    });
  });
  content.querySelectorAll('[data-panel-action]').forEach(row=>{
    row.addEventListener('click',()=>{
      const accion = row.dataset.panelAction;
      const rangoActual = panelRangoDia(panelDiaSeleccionado);
      const esAyer = panelDiaSeleccionado === 'Ayer';
      if(accion==='envios'){
        historialFilters = esAyer
          ? {q:'',tipo:'Todos',fecha:'Personalizado',fechaDesde:rangoActual.desde,fechaHasta:rangoActual.hasta-1,forma:'Todas',divisa:'Todas'}
          : {q:'',tipo:'Todos',fecha:'Hoy',fechaDesde:null,fechaHasta:null,forma:'Todas',divisa:'Todas'};
        panelIrA('#/historial');
      }else if(accion==='cobrar'){
        panelIrA('#/deudas/me_deben');
      }else if(accion==='pagar'){
        panelIrA('#/deudas/pagar_a');
      }else if(accion==='balance'){
        if(esAyer){
          balancePeriod = 'Personalizado';
          balanceCustomDesde = rangoActual.desde;
          balanceCustomHasta = rangoActual.hasta-1;
        }else{
          balancePeriod = 'Hoy';
          balanceCustomDesde = null;
          balanceCustomHasta = null;
        }
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
