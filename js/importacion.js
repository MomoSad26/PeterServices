/* ----------------------------------------------------------------------
 * Fusión de respaldos JSON/RMB.
 * Las tablas nuevas son opcionales para conservar compatibilidad con
 * respaldos antiguos. Nunca se sustituye la base local completa.
 * ---------------------------------------------------------------------- */
function hayDatosQueRespaldar(){
  return ['clientes','trabajadores','envios','ventas','compras','gastos','in_out','deudas','compradores','transferencias'].some(k=>(DB[k]||[]).length>0);
}
function mergeImport(incoming){
  const resumen={insertados:0,actualizados:0,omitidos:0};
  const tablas=['divisas','paises','monedas','clientes','trabajadores','destinatarios','mensajeros','compradores','envios','ventas','compras','gastos','in_out','transferencias','deudas'];
  const mapas={};tablas.forEach(k=>mapas[k]=new Map());
  const divisasNuevas=new Set();
  const norm=v=>normalizarTexto(String(v||''));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const ts=r=>num(r.fecha_hora||r.fecha||r.fecha_registro||0);
  function clave(t,r){
    if(t==='divisas'||t==='paises'||t==='monedas')return norm(r.nombre);
    if(t==='clientes')return `${norm(r.nombre)}|${norm(r.pais)}`;
    if(t==='trabajadores')return `${norm(r.nombre)}|${norm(r.telefono)}`;
    if(t==='destinatarios')return r.carnet?`carnet:${norm(r.carnet)}`:`${norm(r.nombre)}|${norm(r.nombre_completo)}|${norm(r.telefono)}`;
    if(t==='mensajeros')return `${norm(r.nombre)}|${norm(r.telefono)}`;
    if(t==='compradores')return r.carnet?`carnet:${norm(r.carnet)}`:`${norm(r.nombre)}|${norm(r.nombre_completo)}|${norm(r.telefono)}`;
    if(t==='transferencias')return `${ts(r)}|${norm(r.divisa_origen)}|${num(r.cantidad_origen)}|${norm(r.divisa_destino)}|${num(r.cantidad_destino)}`;
    if(t==='ventas')return `${ts(r)}|${norm(r.divisa_vendida)}|${num(r.cantidad_vendida)}|${norm(r.divisa_recibida)}|${num(r.cantidad_recibida)}|${norm(r.comprador_nombre)}`;
    if(t==='compras')return `${ts(r)}|${norm(r.divisa_comprada)}|${num(r.cantidad_comprada)}|${norm(r.divisa_pagada)}|${num(r.cantidad_pagada)}`;
    if(t==='gastos')return `${ts(r)}|${norm(r.concepto)}|${norm(r.divisa)}|${num(r.cantidad)}`;
    if(t==='in_out')return `${ts(r)}|${norm(r.tipo)}|${norm(r.divisa)}|${num(r.cantidad)}|${norm(r.nota)}`;
    if(t==='envios')return `${ts(r)}|${norm(r.tipo)}|${r.cliente_id||''}|${r.trabajador_id||''}|${num(r.cantidad_enviada)}|${norm(r.moneda)}|${num(r.cantidad_pagada)}|${norm(r.divisa_entrega)}|${norm(r.divisa_ganancia)}|${num(r.ganancia)}`;
    if(t==='deudas'){
      if(r.origen&&r.origen_id!=null){const ot=r.origen==='venta'?'ventas':(r.origen==='compra'?'compras':(r.origen==='envio'?'envios':null));const oi=ot&&mapas[ot].has(r.origen_id)?mapas[ot].get(r.origen_id):r.origen_id;return `origen:${r.origen}:${oi}:${r.tipo}`;}
      return `${norm(r.tipo)}|${norm(r.persona)}|${num(r.monto)}|${norm(r.divisa)}|${ts(r)}|${r.tipo==='me_deben'?meDebenTipo(r):num(r.afecta_balance)}`;
    }
    const copy={...r};delete copy.id;return JSON.stringify(Object.keys(copy).sort().map(k=>[k,copy[k]]));
  }
  function mergeTable(t){
    if(!Array.isArray(incoming[t]))return;
    if(!Array.isArray(DB[t]))DB[t]=[];
    incoming[t].forEach(original=>{
      if(!original||typeof original!=='object')return;
      const r=JSON.parse(JSON.stringify(original));
      if(t==='divisas'){
        r.nombre_visible=(typeof r.nombre_visible==='string' && r.nombre_visible.trim())?r.nombre_visible.trim():r.nombre;
      }
      if(t==='envios'){
        if(mapas.clientes.has(r.cliente_id))r.cliente_id=mapas.clientes.get(r.cliente_id);
        if(mapas.trabajadores.has(r.trabajador_id))r.trabajador_id=mapas.trabajadores.get(r.trabajador_id);
        if(mapas.destinatarios.has(r.destinatario_id))r.destinatario_id=mapas.destinatarios.get(r.destinatario_id);
      }
      if((t==='ventas'||t==='deudas')&&r.comprador_id!=null&&mapas.compradores.has(r.comprador_id))r.comprador_id=mapas.compradores.get(r.comprador_id);
      if(t==='deudas'&&r.origen&&r.origen_id!=null){const ot=r.origen==='venta'?'ventas':(r.origen==='compra'?'compras':(r.origen==='envio'?'envios':null));if(ot&&mapas[ot].has(r.origen_id))r.origen_id=mapas[ot].get(r.origen_id);}
      const k=clave(t,r);
      const existing=DB[t].find(x=>clave(t,x)===k);
      if(existing){
        if(r.id!=null)mapas[t].set(r.id,existing.id);
        if(t==='divisas'){
          const visibleImportado=r.nombre_visible||r.nombre;
          const visibleLocal=existing.nombre_visible||existing.nombre;
          const choca=(DB.divisas||[]).some(x=>x.id!==existing.id && norm(x.nombre_visible||x.nombre)===norm(visibleImportado));
          // Una etiqueta importada solo reemplaza el valor heredado por defecto;
          // una etiqueta personalizada local siempre prevalece.
          if(visibleLocal===existing.nombre && visibleImportado && !choca && visibleImportado!==visibleLocal){
            existing.nombre_visible=visibleImportado;
            resumen.actualizados++;
          }else resumen.omitidos++;
        }else if(['clientes','trabajadores','destinatarios','mensajeros','compradores'].includes(t)){
          let changed=false;
          Object.keys(r).forEach(field=>{if(field!=='id'&&(existing[field]===undefined||existing[field]===null||existing[field]==='')&&r[field]!==undefined&&r[field]!==null&&r[field]!==''){existing[field]=r[field];changed=true;}});
          if(changed)resumen.actualizados++;else resumen.omitidos++;
        }else resumen.omitidos++;
        return;
      }
      if(t==='divisas'){
        let visible=r.nombre_visible||r.nombre;
        const ocupado=()=>DB.divisas.some(x=>norm(x.nombre_visible||x.nombre)===norm(visible));
        if(ocupado()){
          visible=r.nombre;
          let sufijo=2;
          while(ocupado()) visible=`${r.nombre} (${sufijo++})`;
        }
        r.nombre_visible=visible;
      }
      const oldId=r.id;r.id=nextId(t);DB[t].push(r);if(oldId!=null)mapas[t].set(oldId,r.id);resumen.insertados++;
      if(t==='divisas')divisasNuevas.add(r.nombre);
      const add=(divisa,delta)=>{if(divisa&&!divisasNuevas.has(divisa))adjustBalance(divisa,delta);};
      if(t==='envios'){
        const entrega=num(r.cantidad_pagada),ganancia=num(r.ganancia),misma=mismasDivisas(r.divisa_entrega,r.divisa_ganancia);
        if(envioDescuentaAhora(r)){add(r.divisa_entrega,-entrega);add(r.divisa_ganancia,misma?entrega+ganancia:ganancia);}else add(r.divisa_ganancia,ganancia);
      }else if(t==='ventas'){add(r.divisa_vendida,-num(r.cantidad_vendida));if(!r.registra_deuda)add(r.divisa_recibida,num(r.cantidad_recibida));}
      else if(t==='compras'){add(r.divisa_comprada,num(r.cantidad_comprada));if(!r.registra_deuda)add(r.divisa_pagada,-num(r.cantidad_pagada));}
      else if(t==='gastos')add(r.divisa,-num(r.cantidad));
      else if(t==='in_out')add(r.divisa,r.tipo==='entrada'?num(r.cantidad):-num(r.cantidad));
      else if(t==='transferencias'){add(r.divisa_origen,-num(r.cantidad_origen));add(r.divisa_destino,num(r.cantidad_destino));}
      else if(t==='deudas'){
        if(r.tipo==='me_deben'){if(meDebenRestaAlCrear(r)){add(r.divisa,-num(r.monto));if(r.estado==='cobrado')add(r.divisa,num(r.monto));}else if(meDebenSumaAlCobrar(r)&&r.estado==='cobrado')add(r.divisa,num(r.monto));}
        else if(r.tipo==='pagar_a'&&r.estado==='pagado'&&deudaDescuentaAlPagar(r))add(r.divisa,-num(r.monto));
      }
    });
  }
  tablas.forEach(mergeTable);
  return resumen;
}
