/* ---------------------------------------------------------------------- *
 * 21. ARCHIVAR HISTORIAL (no borra datos; solo los oculta de las listas)
 * ---------------------------------------------------------------------- */
const ARCHIVABLES = [
  {key:'envios',  label:'Envíos',  origen:'envio'},
  {key:'compras', label:'Compras', origen:'compra'},
  {key:'ventas',  label:'Ventas',  origen:'venta'},
  {key:'gastos',  label:'Gastos',  origen:null},
  {key:'in_out',  label:'In/Out',  origen:null},
];

function tieneDeudaPendiente(origen, id){
  if(!origen) return false;
  return DB.deudas.some(d => d.origen===origen && d.origen_id===id && d.estado==='pendiente');
}

function openArchivarHistorialModal(onDone){
  openModal(`
    <div class="modal-title">🧹 Archivar historial</div>
    <div class="modal-msg">No se elimina ningún dato: los registros archivados dejan de mostrarse en los historiales, pero el balance y las deudas siguen funcionando igual.</div>
    <label class="field-label">¿Qué archivar?</label>
    ${ARCHIVABLES.map(a=>`
      <label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-main);font-size:14.5px;font-weight:600;">
        <input type="checkbox" class="ah-check" data-key="${a.key}" checked style="width:18px;height:18px;">
        ${a.label}
      </label>
    `).join('')}
    <label class="field-label">Archivar registros anteriores a</label>
    <input type="date" id="ah-fecha" value="${fechaLocalISO()}">
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ah-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ah-ok">Archivar</button>
    </div>
  `);
  document.getElementById('ah-cancel').onclick = closeModal;
  document.getElementById('ah-ok').onclick = ()=>{
    const seleccionadas = Array.from(document.querySelectorAll('.ah-check')).filter(c=>c.checked).map(c=>c.dataset.key);
    const fechaVal = document.getElementById('ah-fecha').value;
    if(!seleccionadas.length || !fechaVal){ toast('Seleccione al menos un tipo y una fecha.'); return; }
    const limite = fechaInputAFinDeDiaLocal(fechaVal); // fin del día seleccionado (hora local)
    closeModal();
    confirmDialog(
      `Se archivarán los registros seleccionados anteriores a ${fmtDateShort(limite)}. No se eliminará ningún dato y el balance no se verá afectado. ¿Continuar?`,
      ()=>{
        let archivados = 0, omitidos = 0;
        ARCHIVABLES.forEach(a=>{
          if(!seleccionadas.includes(a.key)) return;
          DB[a.key].forEach(r=>{
            if(r.archivado) return;
            if(r.fecha_hora >= limite) return;
            if(tieneDeudaPendiente(a.origen, r.id)){ omitidos++; return; }
            r.archivado = true;
            r.archivado_en = Date.now();
            archivados++;
          });
        });
        save();
        let msg = `${archivados} registro(s) archivado(s).`;
        if(omitidos) msg += ` ${omitidos} registro(s) no fueron archivados porque tienen deudas pendientes asociadas.`;
        alertDialog('Archivado completado', msg);
        onDone && onDone();
      },
      {okLabel:'Archivar', cancelLabel:'Cancelar', danger:false}
    );
  };
}

function movimientosArchivados(){
  const mov = [];
  DB.envios.filter(e=>e.archivado).forEach(e=>{
    mov.push({fecha:e.fecha_hora, tipo:'Envío', key:'envios', id:e.id, concepto:`${entityNameForEnvio(e)} — ${fmtMoney(e.cantidad_enviada)} ${e.moneda}`});
  });
  DB.compras.filter(c=>c.archivado).forEach(c=>{
    mov.push({fecha:c.fecha_hora, tipo:'Compra', key:'compras', id:c.id, concepto:`${fmtMoney(c.cantidad_pagada)} ${c.divisa_pagada} → ${fmtMoney(c.cantidad_comprada)} ${c.divisa_comprada}`});
  });
  DB.ventas.filter(v=>v.archivado).forEach(v=>{
    mov.push({fecha:v.fecha_hora, tipo:'Venta', key:'ventas', id:v.id, concepto:`${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida} → ${fmtMoney(v.cantidad_recibida)} ${v.divisa_recibida}`});
  });
  DB.gastos.filter(g=>g.archivado).forEach(g=>{
    mov.push({fecha:g.fecha_hora, tipo:'Gasto', key:'gastos', id:g.id, concepto:`${escapeHtml(g.concepto)} — ${fmtMoney(g.cantidad)} ${g.divisa}`});
  });
  DB.in_out.filter(io=>io.archivado).forEach(io=>{
    mov.push({fecha:io.fecha_hora, tipo:'In/Out', key:'in_out', id:io.id, concepto:`${io.tipo==='entrada'?'Entrada':'Salida'} — ${fmtMoney(io.cantidad)} ${io.divisa}`});
  });
  return mov.sort((a,b)=>b.fecha-a.fecha);
}

function desarchivarRegistro(key, id){
  const r = (DB[key]||[]).find(x=>x.id===id);
  if(!r) return;
  r.archivado = false;
  save();
}

function openVerArchivadosModal(){
  function render(){
    const items = movimientosArchivados();
    openModal(`
      <div class="modal-title">👁️ Historial archivado</div>
      <div class="modal-msg">Solo lectura — ${items.length} registro(s) archivado(s). Puede desarchivar uno si fue un error.</div>
      <div style="max-height:55vh;overflow-y:auto;">
        ${items.length ? items.map(m=>`
          <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:10px 12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:14px;">${escapeHtml(m.tipo)}</div>
                <div class="subtle">${escapeHtml(m.concepto)}</div>
                <div class="subtle">${fmtDate(m.fecha)}</div>
              </div>
              <button class="btn btn-outline btn-sm va-restaurar" data-key="${m.key}" data-id="${m.id}" style="flex:none;">↩️ Desarchivar</button>
            </div>
          </div>
        `).join('') : emptyState('📭','No hay registros archivados todavía.')}
      </div>
      <div class="modal-actions"><button class="btn btn-outline btn-block" id="va-cerrar">Cerrar</button></div>
    `);
    document.getElementById('va-cerrar').onclick = closeModal;
    document.querySelectorAll('.va-restaurar').forEach(btn=>{
      btn.onclick = ()=>{
        desarchivarRegistro(btn.dataset.key, Number(btn.dataset.id));
        toast('Registro desarchivado');
        render();
      };
    });
  }
  render();
}

function mergeImport(incoming){
  let insertados=0, actualizados=0, omitidos=0;

  (incoming.divisas||[]).forEach(d=>{
    if(!d || !d.nombre) return;
    const local = DB.divisas.find(x=>x.nombre.toLowerCase()===d.nombre.toLowerCase());
    if(!local){
      DB.divisas.push({id:nextId('divisas'), nombre:d.nombre, simbolo:d.simbolo||'', orden:numFinito(d.orden, DB.divisas.length+1), saldo:numFinito(d.saldo, 0)});
      insertados++;
    } else {
      if(local.saldo===0 && d.saldo){ local.saldo = numFinito(d.saldo, 0); actualizados++; }
      if((local.orden===undefined || local.orden===null) && d.orden!=null) local.orden = numFinito(d.orden, DB.divisas.length+1);
    }
  });
  if(incoming.meta && incoming.meta.nombre_negocio && !DB.meta.nombre_negocio){
    DB.meta.nombre_negocio = String(incoming.meta.nombre_negocio).slice(0,100);
  }
  (incoming.paises||[]).forEach(p=>{
    if(!DB.paises.find(x=>x.nombre.toLowerCase()===p.nombre.toLowerCase())){
      DB.paises.push({id:nextId('paises'), nombre:p.nombre, es_predefinido:0});
      insertados++;
    }
  });
  (incoming.monedas||[]).forEach(m=>{
    if(!DB.monedas.find(x=>x.nombre.toUpperCase()===m.nombre.toUpperCase())){
      DB.monedas.push({id:nextId('monedas'), nombre:m.nombre});
      insertados++;
    }
  });

  const clienteIdMap = {};
  (incoming.clientes||[]).forEach(c=>{
    if(!c || !c.nombre) return;
    let local = DB.clientes.find(x=>x.nombre.toLowerCase()===c.nombre.toLowerCase() && x.pais.toLowerCase()===(c.pais||'').toLowerCase());
    if(local){
      if(!local.telefono && c.telefono) local.telefono = c.telefono;
      if(!local.notas && c.notas) local.notas = c.notas;
      actualizados++;
    } else {
      local = {id:nextId('clientes'), nombre:c.nombre, pais:c.pais, telefono:c.telefono||'', notas:c.notas||'', fecha_registro:c.fecha_registro||Date.now(), activo: c.activo!==undefined?c.activo:1};
      DB.clientes.push(local);
      insertados++;
    }
    clienteIdMap[c.id] = local.id;
  });

  const trabajadorIdMap = {};
  (incoming.trabajadores||[]).forEach(t=>{
    if(!t || !t.nombre) return;
    let local = DB.trabajadores.find(x=>{
      if(x.telefono && t.telefono) return x.nombre.toLowerCase()===t.nombre.toLowerCase() && x.telefono===t.telefono;
      return x.nombre.toLowerCase()===t.nombre.toLowerCase();
    });
    if(local){
      if(!local.telefono && t.telefono) local.telefono = t.telefono;
      actualizados++;
    } else {
      local = {id:nextId('trabajadores'), nombre:t.nombre, telefono:t.telefono||'', fecha_registro:t.fecha_registro||Date.now(), activo:t.activo!==undefined?t.activo:1};
      DB.trabajadores.push(local);
      insertados++;
    }
    trabajadorIdMap[t.id] = local.id;
  });

  const envioIdMap = {};
  (incoming.envios||[]).forEach(e=>{
    if(!e || !e.tipo) return;
    const localClienteId = e.cliente_id!=null ? clienteIdMap[e.cliente_id] : null;
    const localTrabajadorId = e.trabajador_id!=null ? trabajadorIdMap[e.trabajador_id] : null;
    const mismoSegundo = ts => Math.floor(ts/1000);
    const dup = DB.envios.find(x =>
      x.tipo===e.tipo &&
      (x.cliente_id||null)===(localClienteId||null) &&
      (x.trabajador_id||null)===(localTrabajadorId||null) &&
      mismoSegundo(x.fecha_hora)===mismoSegundo(e.fecha_hora) &&
      x.cantidad_enviada===e.cantidad_enviada &&
      x.precio===e.precio &&
      x.forma_ganancia===e.forma_ganancia
    );
    if(dup){ omitidos++; envioIdMap[e.id] = dup.id; return; }
    const nuevo = {...e, id:nextId('envios'), cliente_id:localClienteId, trabajador_id:localTrabajadorId,
      cantidad_enviada:numFinito(e.cantidad_enviada), precio:numFinito(e.precio),
      cantidad_pagada:numFinito(e.cantidad_pagada), ganancia:numFinito(e.ganancia),
      cotizado_a: (e.cotizado_a===null || e.cotizado_a===undefined) ? e.cotizado_a : numFinito(e.cotizado_a, 0)};
    DB.envios.push(nuevo);
    envioIdMap[e.id] = nuevo.id;
    insertados++;
  });

  const ventaIdMap = {};
  (incoming.ventas||[]).forEach(v=>{
    if(!v || !v.divisa_vendida || !v.divisa_recibida) return;
    const dup = DB.ventas.find(x =>
      x.cantidad_vendida===v.cantidad_vendida && x.divisa_vendida===v.divisa_vendida &&
      x.cantidad_recibida===v.cantidad_recibida && x.divisa_recibida===v.divisa_recibida &&
      x.fecha_hora===v.fecha_hora && (x.nota||'')===(v.nota||'')
    );
    if(dup){ omitidos++; ventaIdMap[v.id] = dup.id; return; }
    const nuevaVenta = {...v, id:nextId('ventas'), cantidad_vendida:numFinito(v.cantidad_vendida), cantidad_recibida:numFinito(v.cantidad_recibida)};
    DB.ventas.push(nuevaVenta);
    ventaIdMap[v.id] = nuevaVenta.id;
    insertados++;
  });

  const compraIdMap = {};
  (incoming.compras||[]).forEach(c=>{
    if(!c || !c.divisa_comprada || !c.divisa_pagada) return;
    const dup = DB.compras.find(x =>
      x.cantidad_comprada===c.cantidad_comprada && x.divisa_comprada===c.divisa_comprada &&
      x.cantidad_pagada===c.cantidad_pagada && x.divisa_pagada===c.divisa_pagada &&
      x.fecha_hora===c.fecha_hora && (x.nota||'')===(c.nota||'')
    );
    if(dup){ omitidos++; compraIdMap[c.id] = dup.id; return; }
    const nuevaCompra = {...c, id:nextId('compras'), cantidad_comprada:numFinito(c.cantidad_comprada), cantidad_pagada:numFinito(c.cantidad_pagada)};
    DB.compras.push(nuevaCompra);
    compraIdMap[c.id] = nuevaCompra.id;
    insertados++;
  });

  (incoming.gastos||[]).forEach(g=>{
    if(!g || !g.divisa) return;
    const dup = DB.gastos.find(x =>
      x.concepto===g.concepto && x.cantidad===g.cantidad && x.divisa===g.divisa &&
      x.fecha_hora===g.fecha_hora && (x.nota||'')===(g.nota||'')
    );
    if(dup){ omitidos++; return; }
    DB.gastos.push({...g, id:nextId('gastos'), cantidad:numFinito(g.cantidad)});
    insertados++;
  });

  (incoming.in_out||[]).forEach(io=>{
    if(!io || !io.divisa || !io.tipo) return;
    const dup = DB.in_out.find(x =>
      x.tipo===io.tipo && x.cantidad===io.cantidad && x.divisa===io.divisa &&
      x.fecha_hora===io.fecha_hora && (x.nota||'')===(io.nota||'')
    );
    if(dup){ omitidos++; return; }
    DB.in_out.push({...io, id:nextId('in_out'), cantidad:numFinito(io.cantidad)});
    insertados++;
  });

  (incoming.deudas||[]).forEach(d=>{
    if(!d || !d.persona || !d.divisa) return;
    const dup = DB.deudas.find(x =>
      x.tipo===d.tipo && x.persona===d.persona && x.monto===d.monto && x.divisa===d.divisa &&
      x.fecha===d.fecha && (x.nota||'')===(d.nota||'')
    );
    if(dup){ omitidos++; return; }
    let origen_id = d.origen_id;
    if(d.origen==='venta' && ventaIdMap[d.origen_id]!==undefined) origen_id = ventaIdMap[d.origen_id];
    if(d.origen==='compra' && compraIdMap[d.origen_id]!==undefined) origen_id = compraIdMap[d.origen_id];
    if(d.origen==='envio' && envioIdMap[d.origen_id]!==undefined) origen_id = envioIdMap[d.origen_id];
    DB.deudas.push({...d, id:nextId('deudas'), creado_en: d.creado_en || d.fecha, origen_id, monto:numFinito(d.monto)});
    insertados++;
  });

  return {insertados, actualizados, omitidos};
}
