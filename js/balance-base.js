/* ---------------------------------------------------------------------- *
 * 3. AJUSTE DE BALANCES
 * ---------------------------------------------------------------------- */
function findDivisa(nombre){
  return DB.divisas.find(d => d.nombre === nombre);
}
function adjustBalance(divisaNombre, delta){
  if(!divisaNombre || !delta) return;
  const d = findDivisa(divisaNombre);
  if(!d){
    console.warn(`adjustBalance: la divisa "${divisaNombre}" no existe — el balance no se pudo actualizar.`);
    return;
  }
  d.saldo = round2(d.saldo + delta);
}

// Cuenta SOLO los registros ACTIVOS (no archivados) que mencionan la divisa.
// Estos son los que bloquean el borrado.
function contarRegistrosActivosDeDivisa(nombre){
  let n = 0;
  n += DB.envios.filter(e=>!e.archivado && (e.divisa_entrega===nombre || e.divisa_ganancia===nombre)).length;
  n += DB.ventas.filter(v=>!v.archivado && (v.divisa_vendida===nombre || v.divisa_recibida===nombre)).length;
  n += DB.compras.filter(c=>!c.archivado && (c.divisa_comprada===nombre || c.divisa_pagada===nombre)).length;
  n += DB.gastos.filter(g=>!g.archivado && g.divisa===nombre).length;
  n += DB.in_out.filter(io=>!io.archivado && io.divisa===nombre).length;
  // Las deudas no tienen campo "archivado": su equivalente de "activo" es
  // estado 'pendiente' (una deuda ya pagada/cobrada es, en espíritu, historial).
  n += DB.deudas.filter(d=>d.estado==='pendiente' && d.divisa===nombre).length;
  return n;
}
// Cuenta los registros ARCHIVADOS que mencionan la divisa. Estos NO
// bloquean el borrado: se eliminan junto con la divisa si el usuario confirma.
function contarRegistrosArchivadosDeDivisa(nombre){
  let n = 0;
  n += DB.envios.filter(e=>e.archivado && (e.divisa_entrega===nombre || e.divisa_ganancia===nombre)).length;
  n += DB.ventas.filter(v=>v.archivado && (v.divisa_vendida===nombre || v.divisa_recibida===nombre)).length;
  n += DB.compras.filter(c=>c.archivado && (c.divisa_comprada===nombre || c.divisa_pagada===nombre)).length;
  n += DB.gastos.filter(g=>g.archivado && g.divisa===nombre).length;
  n += DB.in_out.filter(io=>io.archivado && io.divisa===nombre).length;
  // Para deudas, el equivalente de "archivado" es estado 'pagado' o 'cobrado'.
  n += DB.deudas.filter(d=>(d.estado==='pagado'||d.estado==='cobrado') && d.divisa===nombre).length;
  return n;
}
// Elimina la divisa y, en la misma operación, todos los registros ARCHIVADOS
// (o su equivalente: deudas ya pagadas/cobradas) que la mencionan. NUNCA
// llama a adjustBalance: el saldo de ninguna otra divisa se toca. Un solo
// save() al final.
function eliminarDivisaYArchivadosAsociados(nombre){
  DB.envios = DB.envios.filter(e=>!(e.archivado && (e.divisa_entrega===nombre || e.divisa_ganancia===nombre)));
  DB.ventas = DB.ventas.filter(v=>!(v.archivado && (v.divisa_vendida===nombre || v.divisa_recibida===nombre)));
  DB.compras = DB.compras.filter(c=>!(c.archivado && (c.divisa_comprada===nombre || c.divisa_pagada===nombre)));
  DB.gastos = DB.gastos.filter(g=>!(g.archivado && g.divisa===nombre));
  DB.in_out = DB.in_out.filter(io=>!(io.archivado && io.divisa===nombre));
  DB.deudas = DB.deudas.filter(d=>!((d.estado==='pagado'||d.estado==='cobrado') && d.divisa===nombre));
  DB.divisas = DB.divisas.filter(x=>x.nombre!==nombre);
  save();
}

function envioDescuentaAhora(e){
  return e.descuenta_ahora === undefined ? true : !!e.descuenta_ahora;
}

function normalizarNombreDivisaParaComparar(nombre){
  return String(nombre||'').trim().toLowerCase().replace(/\s+/g,' ');
}
function mismasDivisas(a,b){
  return Boolean(a) && Boolean(b) && normalizarNombreDivisaParaComparar(a)===normalizarNombreDivisaParaComparar(b);
}
function envioGananciaInmediata(e){
  return Number(e?.ganancia||0) !== 0;
}

function applyEnvioBalance(envio, sign, deuda=null){
  const entrega = Number(envio.cantidad_pagada||0);
  const ganancia = Number(envio.ganancia||0);
  const mismaDivisa = mismasDivisas(envio.divisa_entrega, envio.divisa_ganancia);

  // =====================================================
  // CASO 1: SWITCH ON (descuento inmediato)
  // =====================================================
  if(envioDescuentaAhora(envio)){
    // Restar la entrega
    adjustBalance(envio.divisa_entrega, -1 * sign * entrega);
    // Sumar la ganancia (o el total si misma divisa)
    if(mismaDivisa){
      adjustBalance(envio.divisa_ganancia, 1 * sign * (entrega + ganancia));
    } else {
      adjustBalance(envio.divisa_ganancia, 1 * sign * ganancia);
    }
    return;
  }

  // =====================================================
  // CASO 2: SWITCH OFF (va a "Pagar a:")
  // =====================================================
  // La ganancia se reconoce por completo AHORA, al registrar el envío.
  // La entrega queda pendiente en Deudas -> Pagar a, y su pago NO debe
  // volver a tocar el balance (eso se maneja aparte, en el momento de
  // marcar la deuda como pagada — ver el bloque "dd-cerrar").
  adjustBalance(envio.divisa_ganancia, 1 * sign * ganancia);
}

function envioGananciaMostrada(e){
  return round2(Number(e?.ganancia || 0));
}
function applyVentaBalance(venta, sign){
  adjustBalance(venta.divisa_vendida, -1 * sign * (venta.cantidad_vendida||0));
  adjustBalance(venta.divisa_recibida, 1 * sign * (venta.cantidad_recibida||0));
}
function applyGastoBalance(gasto, sign){
  adjustBalance(gasto.divisa, -1 * sign * (gasto.cantidad||0));
}

/* ---------------------------------------------------------------------- *
 * 4. AGREGAR ENTIDADES AUXILIARES (divisas, monedas, países)
 * ---------------------------------------------------------------------- */
function addDivisa(nombre){
  nombre = (nombre||'').trim();
  if(!nombre) return null;
  let d = DB.divisas.find(x=>x.nombre.toLowerCase()===nombre.toLowerCase());
  if(d) return d;
  d = {id:nextId('divisas'), nombre, simbolo:'', orden:DB.divisas.length+1, saldo:0};
  DB.divisas.push(d); save();
  return d;
}
function addMoneda(nombre){
  nombre = (nombre||'').trim().toUpperCase();
  if(!nombre) return null;
  let m = DB.monedas.find(x=>x.nombre.toUpperCase()===nombre);
  if(m) return m;
  m = {id:nextId('monedas'), nombre};
  DB.monedas.push(m); save();
  return m;
}
function addPais(nombre){
  nombre = (nombre||'').trim();
  if(!nombre) return null;
  let p = DB.paises.find(x=>x.nombre.toLowerCase()===nombre.toLowerCase());
  if(p) return p;
  p = {id:nextId('paises'), nombre, es_predefinido:0};
  DB.paises.push(p); save();
  return p;
}
