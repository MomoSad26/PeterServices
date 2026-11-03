/* ----------------------------------------------------------------------
 * Transferencias Internas — movimientos propios entre dos divisas.
 * No genera ganancia ni calcula tasas. El usuario introduce ambos montos.
 * ---------------------------------------------------------------------- */
function refrescarTrasTransferencia(onChange){
  if(retornoHistorialDivisa){const nombre=retornoHistorialDivisa;retornoHistorialDivisa=null;openHistorialDivisa(nombre);}
  else onChange&&onChange();
}
function aplicarTransferenciaBalance(t, sign=1){
  adjustBalance(t.divisa_origen, -Number(t.cantidad_origen||0) * sign);
  adjustBalance(t.divisa_destino, Number(t.cantidad_destino||0) * sign);
}
function renderTransferencias(content){
  const estado=paginacion.transferencias;
  content.innerHTML=`
    <h1 class="section-title">${busquedaFiltrandoLista('transferencias')?'Resultados de búsqueda — Transferencias':'Transferencias Internas'}</h1>
    ${busquedaFiltrandoLista('transferencias')?`<div class="subtle" style="margin:-4px 0 12px;">Resultados para: <strong>${escapeHtml(busquedaFiltroLista.consulta)}</strong></div>`:''}
    <button class="btn btn-gold btn-block" id="ti-nueva">➕ Nueva transferencia</button>
    <div style="height:14px;"></div>
    <div id="ti-list"></div>
    <div id="ti-pag"></div>
  `;
  const listEl=document.getElementById('ti-list');
  function refresh(){
    if(!document.body.contains(listEl)) return;
    const items=(DB.transferencias||[]).filter(r=>busquedaFiltrarRegistroLista('transferencias',r)).slice().sort((a,b)=>(Number(b.fecha_hora||0)-Number(a.fecha_hora||0))||(b.id||0)-(a.id||0));
    const pag=paginarArray(items,estado);
    listEl.innerHTML=items.length?pag.items.map(t=>`
      <div class="list-item" data-id="${t.id}">
        <div class="avatar">🔀</div>
        <div class="li-main">
          <div class="li-title">${fmtMoney(t.cantidad_origen)} ${escapeDivisa(t.divisa_origen)} → ${fmtMoney(t.cantidad_destino)} ${escapeDivisa(t.divisa_destino)}</div>
          <div class="li-sub">${fmtDate(t.fecha_hora)}${t.nota?' · '+escapeHtml(t.nota):''}</div>
        </div>
      </div>`).join(''):emptyState('🔀','Aún no hay transferencias internas');
    aplicarZebra(listEl,items.length);
    renderControlPaginacion(document.getElementById('ti-pag'),estado,pag,refresh,listEl);
    listEl.querySelectorAll('.list-item').forEach(el=>el.onclick=()=>openTransferenciaDetalle(Number(el.dataset.id),refresh));
  }
  document.getElementById('ti-nueva').onclick=()=>openTransferenciaForm(()=>{estado.actual=1;refresh();});
  refresh();
}
function openTransferenciaForm(onSaved, transferencia=null){
  const editing=!!transferencia;
  const t=transferencia;
  openModal(`
    <div class="modal-title">${editing?'Editar transferencia':'Nueva transferencia'}</div>
    <label class="field-label">Divisa origen *</label>
    <select class="picker" id="ti-origen">${divisaOptionsHtml(t?.divisa_origen||'')}</select>
    <label class="field-label">Cantidad origen *</label>
    <input type="number" inputmode="decimal" min="0" step="0.01" id="ti-cantidad-origen" value="${t?.cantidad_origen??''}" placeholder="0.00">
    <label class="field-label">Divisa destino *</label>
    <select class="picker" id="ti-destino">${divisaOptionsHtml(t?.divisa_destino||'')}</select>
    <label class="field-label">Cantidad destino *</label>
    <input type="number" inputmode="decimal" min="0" step="0.01" id="ti-cantidad-destino" value="${t?.cantidad_destino??''}" placeholder="0.00">
    <label class="field-label">Fecha y hora *</label>
    <input type="datetime-local" id="ti-fecha" value="${toLocalDatetimeValue(t?.fecha_hora||Date.now())}">
    <label class="field-label">Nota</label>
    <textarea id="ti-nota" maxlength="500" placeholder="Opcional">${escapeHtml(t?.nota||'')}</textarea>
    <div id="ti-error" style="color:var(--red-text);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ti-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="ti-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('ti-origen'),addDivisa,divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('ti-destino'),addDivisa,divisaOptionsHtml);
  document.getElementById('ti-cancel').onclick=closeModal;
  document.getElementById('ti-save').onclick=()=>{
    const divisa_origen=document.getElementById('ti-origen').value;
    const cantidad_origen=Number(document.getElementById('ti-cantidad-origen').value);
    const divisa_destino=document.getElementById('ti-destino').value;
    const cantidad_destino=Number(document.getElementById('ti-cantidad-destino').value);
    const fechaVal=document.getElementById('ti-fecha').value;
    const nota=document.getElementById('ti-nota').value.trim();
    const err=document.getElementById('ti-error');
    let fallo='';
    if(!divisa_origen||divisa_origen==='__add__'||!divisa_destino||divisa_destino==='__add__') fallo='Seleccione las dos divisas.';
    else if(mismasDivisas(divisa_origen,divisa_destino)) fallo='La divisa de destino debe ser distinta a la divisa de origen.';
    else if(!Number.isFinite(cantidad_origen)||cantidad_origen<=0||!Number.isFinite(cantidad_destino)||cantidad_destino<=0) fallo='Las dos cantidades deben ser mayores que cero.';
    else if(!fechaVal||!Number.isFinite(new Date(fechaVal).getTime())) fallo='La fecha y hora son obligatorias.';
    if(fallo){err.textContent=fallo;err.style.display='block';return;}
    const nuevo={divisa_origen,cantidad_origen,divisa_destino,cantidad_destino,fecha_hora:new Date(fechaVal).getTime(),nota};
    if(editing){
      guardarEdicionTransferencia(t,nuevo);
      closeModal();toast('Transferencia actualizada');
    }else{
      const nuevoRegistro={id:nextId('transferencias'),...nuevo};
      DB.transferencias.push(nuevoRegistro);
      aplicarTransferenciaBalance(nuevoRegistro,1);
      save();closeModal();toast('Transferencia guardada');
    }
    onSaved&&onSaved();
  };
}
function guardarEdicionTransferencia(t,nuevo){
  aplicarTransferenciaBalance(t,-1);
  Object.assign(t,nuevo);
  aplicarTransferenciaBalance(t,1);
  save();
}
function openTransferenciaDetalle(id,onChange){
  const t=(DB.transferencias||[]).find(x=>x.id===id);
  if(!t)return;
  openModal(`
    <div class="modal-title">🔀 Detalle de transferencia</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line-main);padding:12px;margin-top:8px;">
      <div class="sumrow"><span class="k">Divisa origen</span><span class="v">${escapeDivisa(t.divisa_origen)}</span></div>
      <div class="sumrow"><span class="k">Cantidad origen</span><span class="v">${fmtMoney(t.cantidad_origen)}</span></div>
      <div class="sumrow"><span class="k">Divisa destino</span><span class="v">${escapeDivisa(t.divisa_destino)}</span></div>
      <div class="sumrow"><span class="k">Cantidad destino</span><span class="v">${fmtMoney(t.cantidad_destino)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(t.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(t.nota||'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="ti-detail-close">Cerrar</button>
      <button class="btn btn-primary btn-block" id="ti-detail-edit">✏️ Editar</button>
    </div>
    <div class="modal-actions"><button class="btn btn-danger btn-block" id="ti-detail-delete">🗑️ Eliminar</button></div>
  `);
  document.getElementById('ti-detail-close').onclick=()=>retornoHistorialDivisa?volverDesdeDetalleMovimiento():closeModal();
  document.getElementById('ti-detail-edit').onclick=()=>{
    closeModal();
    openTransferenciaForm(()=>refrescarTrasTransferencia(onChange),t);
  };
  document.getElementById('ti-detail-delete').onclick=()=>{
    closeModal();
    confirmDialog('¿Eliminar esta transferencia?',()=>{
      eliminarConDeshacer('Transferencia eliminada',()=>{
        aplicarTransferenciaBalance(t,-1);
        DB.transferencias=DB.transferencias.filter(x=>x.id!==id);
        save();
      },2000);
      refrescarTrasTransferencia(onChange);
    },{okLabel:'Eliminar',cancelLabel:'Cancelar',danger:true});
  };
}
