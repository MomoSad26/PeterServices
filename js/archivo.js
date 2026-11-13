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
                <div class="subtle">${escapeHtml(textoDivisasVisibles(m.concepto))}</div>
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

// La fusión de respaldos (mergeImport) vive en js/importacion.js.
