/* ---------------------------------------------------------------------- *
 * 19. GENERADOR DE .XLSX PURO (sin librerías, funciona 100% offline)
 * ---------------------------------------------------------------------- */
const XLSX_CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function xlsxCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = XLSX_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function xlsxStrToBytes(str){ return new TextEncoder().encode(str); }
function xlsxU16(n){ return [n & 0xFF, (n >> 8) & 0xFF]; }
function xlsxU32(n){ return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF]; }
function xlsxConcat(arrays){
  let total = 0; arrays.forEach(a=>total+=a.length);
  const out = new Uint8Array(total); let off=0;
  arrays.forEach(a=>{ out.set(a, off); off += a.length; });
  return out;
}
function xlsxBuildZip(files){
  const localParts = [], centralParts = [];
  let offset = 0;
  const dosTime = 0, dosDate = 0x21;
  files.forEach(f=>{
    const nameBytes = xlsxStrToBytes(f.name);
    const data = f.data;
    const crc = xlsxCrc32(data);
    const localHeader = new Uint8Array([
      0x50,0x4b,0x03,0x04, ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(dosTime), ...xlsxU16(dosDate), ...xlsxU32(crc),
      ...xlsxU32(data.length), ...xlsxU32(data.length),
      ...xlsxU16(nameBytes.length), ...xlsxU16(0)
    ]);
    localParts.push(localHeader, nameBytes, data);
    const centralHeader = new Uint8Array([
      0x50,0x4b,0x01,0x02, ...xlsxU16(20), ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(dosTime), ...xlsxU16(dosDate), ...xlsxU32(crc),
      ...xlsxU32(data.length), ...xlsxU32(data.length),
      ...xlsxU16(nameBytes.length), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(0), ...xlsxU16(0), ...xlsxU32(0), ...xlsxU32(offset)
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });
  const centralStart = offset;
  let centralSize = 0; centralParts.forEach(p=>centralSize+=p.length);
  const eocd = new Uint8Array([
    0x50,0x4b,0x05,0x06, ...xlsxU16(0), ...xlsxU16(0),
    ...xlsxU16(files.length), ...xlsxU16(files.length),
    ...xlsxU32(centralSize), ...xlsxU32(centralStart), ...xlsxU16(0)
  ]);
  return xlsxConcat([...localParts, ...centralParts, eocd]);
}
function xlsxColLetter(idx){
  let s = ''; idx += 1;
  while (idx > 0) { const rem = (idx-1)%26; s = String.fromCharCode(65+rem)+s; idx = Math.floor((idx-1)/26); }
  return s;
}
function xlsxEscapeXml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
}
function xlsxBuildSheetXml(rows){
  let rowsXml = '';
  rows.forEach((row, rIdx) => {
    const rNum = rIdx + 1;
    let cellsXml = '';
    row.forEach((cell, cIdx) => {
      if (cell === null || cell === undefined || cell === '') return;
      const ref = xlsxColLetter(cIdx) + rNum;
      const style = cell.style || 0;
      if (cell.type === 'n') cellsXml += `<c r="${ref}" s="${style}"><v>${cell.v}</v></c>`;
      else cellsXml += `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscapeXml(cell.v)}</t></is></c>`;
    });
    rowsXml += `<row r="${rNum}">${cellsXml}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="5" width="18" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`;
}
// estilos: 0=normal, 1=negrita/título, 2=numero 2 decimales
const XLSX_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
function xlsxBuildFile(rows){
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Reporte" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const sheetXml = xlsxBuildSheetXml(rows);
  const files = [
    {name:'[Content_Types].xml', data: xlsxStrToBytes(contentTypes)},
    {name:'_rels/.rels', data: xlsxStrToBytes(rootRels)},
    {name:'xl/workbook.xml', data: xlsxStrToBytes(workbookXml)},
    {name:'xl/_rels/workbook.xml.rels', data: xlsxStrToBytes(workbookRels)},
    {name:'xl/styles.xml', data: xlsxStrToBytes(XLSX_STYLES_XML)},
    {name:'xl/worksheets/sheet1.xml', data: xlsxStrToBytes(sheetXml)},
  ];
  return xlsxBuildZip(files);
}

function s(v){ return {v, type:'s', style:0}; }
function sb(v){ return {v, type:'s', style:1}; }
function n(v){ return {v: round2(v), type:'n', style:2}; }

function generarReporteEjecutivo(){
  const now = Date.now();
  const rows = [];
  rows.push([sb(DB.meta.nombre_negocio || 'Mi negocio de remesas')]);
  rows.push([s('Fecha de exportación: ' + fmtDate(now))]);
  rows.push([]);

  rows.push([sb('Balance general por divisa')]);
  rows.push([sb('Divisa'), sb('Saldo')]);
  DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0)).forEach(d=>{
    rows.push([s(d.nombre), n(d.saldo)]);
  });
  rows.push([]);

  rows.push([sb('Últimos 10 movimientos')]);
  rows.push([sb('Fecha'), sb('Tipo'), sb('Concepto'), sb('Divisa'), sb('Monto')]);
  const movimientos = [];
  DB.envios.filter(e=>!e.archivado).forEach(e=>{
    const entrega = Number(e.cantidad_pagada||0);
    const ganancia = Number(e.ganancia||0);
    if(envioDescuentaAhora(e)){
      movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Entrega — ${entityNameForEnvio(e)}`, divisa:e.divisa_entrega, monto:-entrega});
      if(mismasDivisas(e.divisa_entrega, e.divisa_ganancia)){
        movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Operación — ${entityNameForEnvio(e)}`, divisa:e.divisa_ganancia, monto:entrega+ganancia});
      } else {
        movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Ganancia — ${entityNameForEnvio(e)}`, divisa:e.divisa_ganancia, monto:ganancia});
      }
    } else {
      movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto:`Ganancia — ${entityNameForEnvio(e)}`, divisa:e.divisa_ganancia, monto:ganancia});
    }
  });
  DB.deudas.forEach(d=>{
    if(d.tipo==='pagar_a' && d.origen==='envio' && d.estado==='pagado' && d.fecha_cierre){
      movimientos.push({fecha:d.fecha_cierre, tipo:'Envío pagado', concepto:`Pago a ${d.persona}`, divisa:d.divisa, monto:-(d.monto||0)});
    }
  });
  DB.compras.filter(c=>!c.archivado).forEach(c=>{
    movimientos.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`${fmtMoney(c.cantidad_pagada)} ${c.divisa_pagada} → ${c.divisa_comprada}`, divisa:c.divisa_comprada, monto:c.cantidad_comprada});
  });
  DB.ventas.filter(v=>!v.archivado).forEach(v=>{
    movimientos.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida} → ${v.divisa_recibida}`, divisa:v.divisa_recibida, monto:v.registra_deuda?0:v.cantidad_recibida});
  });
  DB.gastos.filter(g=>!g.archivado).forEach(g=>{
    movimientos.push({fecha:g.fecha_hora, tipo:'Gasto', concepto:g.concepto, divisa:g.divisa, monto:-g.cantidad});
  });
  DB.in_out.filter(io=>!io.archivado).forEach(io=>{
    movimientos.push({fecha:io.fecha_hora, tipo:'In/Out', concepto: io.nota || (io.tipo==='entrada'?'Entrada manual':'Salida manual'), divisa:io.divisa, monto: io.tipo==='entrada'?io.cantidad:-io.cantidad});
  });
  movimientos.sort((a,b)=>b.fecha-a.fecha).slice(0,10).forEach(m=>{
    rows.push([s(fmtDate(m.fecha)), s(m.tipo), s(m.concepto), s(m.divisa), n(m.monto)]);
  });
  rows.push([]);

  rows.push([sb('Totales acumulados (histórico)')]);
  rows.push([sb('Envíos — ganancia total por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totEnvios = {};
  DB.envios.forEach(e=>{ totEnvios[e.divisa_ganancia] = (totEnvios[e.divisa_ganancia]||0) + envioGananciaMostrada(e); });
  Object.keys(totEnvios).forEach(k=> rows.push([s(k), n(totEnvios[k])]));
  rows.push([]);

  rows.push([sb('Compras — total comprado por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totCompras = {};
  DB.compras.forEach(c=>{ totCompras[c.divisa_comprada] = (totCompras[c.divisa_comprada]||0) + (c.cantidad_comprada||0); });
  Object.keys(totCompras).forEach(k=> rows.push([s(k), n(totCompras[k])]));
  rows.push([]);

  rows.push([sb('Ventas — total recibido por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totVentas = {};
  DB.ventas.forEach(v=>{ if(!v.registra_deuda) totVentas[v.divisa_recibida] = (totVentas[v.divisa_recibida]||0) + (v.cantidad_recibida||0); });
  Object.keys(totVentas).forEach(k=> rows.push([s(k), n(totVentas[k])]));
  rows.push([]);

  rows.push([sb('Gastos — total por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totGastos = {};
  DB.gastos.forEach(g=>{ totGastos[g.divisa] = (totGastos[g.divisa]||0) + (g.cantidad||0); });
  Object.keys(totGastos).forEach(k=> rows.push([s(k), n(totGastos[k])]));
  rows.push([]);

  rows.push([sb('In/Out — total neto por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totInOut = {};
  DB.in_out.forEach(io=>{ totInOut[io.divisa] = (totInOut[io.divisa]||0) + (io.tipo==='entrada'?io.cantidad:-io.cantidad); });
  Object.keys(totInOut).forEach(k=> rows.push([s(k), n(totInOut[k])]));

  const zipBytes = xlsxBuildFile(rows);
  const blob = new Blob([zipBytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const pad = x=>String(x).padStart(2,'0');
  const name = `reporte_ejecutivo_${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}.xlsx`;
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('Reporte Excel exportado');
}
