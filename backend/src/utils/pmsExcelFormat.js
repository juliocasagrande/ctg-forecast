/**
 * Layout de planilha PMS (POL/IM/GM/MM) — mesmo modelo de referência usado
 * pela engenharia ("CTG Brazil - Maintenance Instructions and Guides
 * List.xlsx"): um workbook com 4 abas, uma por tipo, cabeçalho na linha 4 e
 * dados a partir da linha 5. Usado tanto para exportar quanto para
 * reimportar (a aplicação escreve e lê exatamente o mesmo layout).
 */
import ExcelJS from 'exceljs';

export const HEADER_ROW = 4;
export const DATA_START_ROW = 5;
const MAX_EMPTY_STREAK = 30;

export function val(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text || '').join('').trim() || null;
  if (typeof v === 'object' && v.text) return String(v.text).trim() || null;
  const s = String(v).trim();
  return s || null;
}
export function asDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}
export function flagTruthy(v) {
  if (!v) return false;
  return /^x$/i.test(String(v).trim());
}

function readRows(ws, rowBuilder) {
  const rows = [];
  let emptyStreak = 0;
  let r = DATA_START_ROW;
  while (emptyStreak < MAX_EMPTY_STREAK) {
    const row = ws.getRow(r);
    const get = (col) => col ? val(row.getCell(col)) : null;
    const built = rowBuilder(get);
    r++;
    if (!built) { emptyStreak++; continue; }
    emptyStreak = 0;
    rows.push(built);
  }
  return rows;
}

/* ─── POL ────────────────────────────────────────────────────────────────────── */
const POL_HEADERS = ['Número', 'Descrição (PT)', 'Descrição (EN)', 'Área', 'Por.', 'Ing.', 'Data Aprovação', 'Data Vencimento', 'Status', 'Status Validade', 'Dias p/ Vencer', 'Responsável', 'Link do Documento', 'Observações'];
function parsePOL(ws, placeholderResponsible) {
  return readRows(ws, (get) => {
    const code = get(1);
    const title_pt = get(2);
    if (!code || !title_pt) return null;
    return {
      type: 'POL', code, base_code: code.replace(/-R\d+$/, ''),
      revision: (code.match(/-R(\d+)$/) || [])[1] ? parseInt(code.match(/-R(\d+)$/)[1]) : null,
      category: null, plant: null, equipment_number: null, sub_item: null,
      area: get(4) || 'Engenharia',
      title_pt, title_en: get(3),
      has_pt: true, has_en: flagTruthy(get(6)),
      responsible: get(12) || placeholderResponsible,
      date: asDate(get(7)) || new Date().toISOString().slice(0, 10),
      status: get(9) || 'Em elaboração',
      document_link: get(13), notes: get(14),
    };
  });
}
function writePOL(wb, docs) {
  const ws = wb.addWorksheet('POL');
  writeHeader(ws, POL_HEADERS);
  docs.forEach((d, i) => {
    const r = ws.getRow(DATA_START_ROW + i);
    r.getCell(1).value = d.code;
    r.getCell(2).value = d.title_pt;
    r.getCell(3).value = d.title_en || '';
    r.getCell(4).value = d.area;
    r.getCell(5).value = d.has_pt ? 'X' : '';
    r.getCell(6).value = d.has_en ? 'X' : '';
    r.getCell(7).value = d.date ? new Date(d.date) : '';
    r.getCell(8).value = d.expiry_date ? new Date(d.expiry_date) : '';
    r.getCell(9).value = d.status;
    r.getCell(10).value = d.validade_status || '';
    r.getCell(11).value = d.days_to_expire ?? '';
    r.getCell(12).value = d.responsible || '';
    r.getCell(13).value = d.document_link || '';
    r.getCell(14).value = d.notes || '';
  });
  styleSheet(ws, POL_HEADERS.length, docs.length);
}

/* ─── IM ─────────────────────────────────────────────────────────────────────── */
const IM_HEADERS = [null, 'Categoria (Tipo/Type)', 'Número', 'Descrição (PT)', 'Descrição (EN)', 'Área', 'Por.', 'Ing.', 'Data Aprovação', 'Data Vencimento', 'Status', 'Status Validade', 'Revisão', null, null, null, null, 'Dias p/ Vencer', 'Responsável', 'Link do Documento', 'Observações'];
function parseIM(ws, placeholderResponsible) {
  return readRows(ws, (get) => {
    const code = get(3);
    const title_pt = get(4);
    if (!code || !title_pt) return null;
    return {
      type: 'IM', code, base_code: code.replace(/-R\d+$/, ''),
      revision: (code.match(/-R(\d+)$/) || [])[1] ? parseInt(code.match(/-R(\d+)$/)[1]) : null,
      category: get(2), plant: null, equipment_number: null, sub_item: null,
      area: get(6) || 'Engenharia',
      title_pt, title_en: get(5),
      has_pt: true, has_en: flagTruthy(get(8)),
      responsible: get(19) || placeholderResponsible,
      date: asDate(get(9)) || new Date().toISOString().slice(0, 10),
      status: get(11) || 'Em elaboração',
      document_link: get(20), notes: get(21),
    };
  });
}
function writeIM(wb, docs) {
  const ws = wb.addWorksheet('IM');
  writeHeader(ws, IM_HEADERS);
  docs.forEach((d, i) => {
    const r = ws.getRow(DATA_START_ROW + i);
    r.getCell(2).value = d.category || '';
    r.getCell(3).value = d.code;
    r.getCell(4).value = d.title_pt;
    r.getCell(5).value = d.title_en || '';
    r.getCell(6).value = d.area;
    r.getCell(7).value = d.has_pt ? 'X' : '';
    r.getCell(8).value = d.has_en ? 'X' : '';
    r.getCell(9).value = d.date ? new Date(d.date) : '';
    r.getCell(10).value = d.expiry_date ? new Date(d.expiry_date) : '';
    r.getCell(11).value = d.status;
    r.getCell(12).value = d.validade_status || '';
    r.getCell(13).value = d.revision ?? '';
    r.getCell(18).value = d.days_to_expire ?? '';
    r.getCell(19).value = d.responsible || '';
    r.getCell(20).value = d.document_link || '';
    r.getCell(21).value = d.notes || '';
  });
  styleSheet(ws, IM_HEADERS.length, docs.length);
}

/* ─── GM ─────────────────────────────────────────────────────────────────────── */
const GM_HEADERS = [null, 'UHE/HPP (nº)', 'UHE/HPP', 'Número Subitem', 'Descrição (PT)', 'Descrição (EN)', 'Área', 'Por.', 'Ing.', 'Data', 'Data Vencimento', 'Status', 'Status Validade', 'Revisão', null, null, 'Código Curto', 'Responsável', 'Link do Documento', 'Observações'];
function parseGM(ws, placeholderResponsible) {
  return readRows(ws, (get) => {
    const plant = get(3);
    const subItemRaw = get(4);
    const title_pt = get(5);
    if (!plant || subItemRaw === null || subItemRaw === undefined || !title_pt) return null;
    const subItem = String(subItemRaw).padStart(2, '0');
    const code = `GM-${plant}-${subItem}`;
    return {
      type: 'GM', code, base_code: code, revision: null,
      category: null, plant, equipment_number: null, sub_item: String(subItemRaw),
      area: get(7) || 'Engenharia',
      title_pt, title_en: get(6),
      has_pt: true, has_en: flagTruthy(get(9)),
      responsible: get(18) || placeholderResponsible,
      date: asDate(get(10)) || new Date().toISOString().slice(0, 10),
      status: get(12) || 'Em elaboração',
      document_link: get(19), notes: get(20),
    };
  });
}
function writeGM(wb, docs) {
  const ws = wb.addWorksheet('GM');
  writeHeader(ws, GM_HEADERS);
  docs.forEach((d, i) => {
    const r = ws.getRow(DATA_START_ROW + i);
    r.getCell(3).value = d.plant || '';
    r.getCell(4).value = d.sub_item || '';
    r.getCell(5).value = d.title_pt;
    r.getCell(6).value = d.title_en || '';
    r.getCell(7).value = d.area;
    r.getCell(8).value = d.has_pt ? 'X' : '';
    r.getCell(9).value = d.has_en ? 'X' : '';
    r.getCell(10).value = d.date ? new Date(d.date) : '';
    r.getCell(11).value = d.expiry_date ? new Date(d.expiry_date) : '';
    r.getCell(12).value = d.status;
    r.getCell(13).value = d.validade_status || '';
    r.getCell(14).value = d.revision ?? '';
    r.getCell(17).value = d.code;
    r.getCell(18).value = d.responsible || '';
    r.getCell(19).value = d.document_link || '';
    r.getCell(20).value = d.notes || '';
  });
  styleSheet(ws, GM_HEADERS.length, docs.length);
}

/* ─── MM ─────────────────────────────────────────────────────────────────────── */
const MM_HEADERS = [null, 'UHE (nº)', 'UHE', 'Nº Equip', 'Subitem', 'Código', 'Descrição (PT)', 'Descrição Completa', 'Observação', 'Área', 'Data Publicação', 'Data Vencimento', 'Status', 'Por.', 'Status Validade', null, 'Dias p/ Vencer', 'Responsável', 'Link do Documento'];
function parseMM(ws, placeholderResponsible) {
  return readRows(ws, (get) => {
    const code = get(6);
    const title_pt = get(7);
    if (!code || !title_pt) return null;
    return {
      type: 'MM', code, base_code: code, revision: null,
      category: null, plant: get(3), equipment_number: get(4) !== null ? String(get(4)) : null,
      sub_item: get(5) !== null ? String(get(5)) : null,
      area: get(10) || 'Engenharia',
      title_pt, title_en: null,
      has_pt: true, has_en: false,
      responsible: get(18) || placeholderResponsible,
      date: asDate(get(11)) || new Date().toISOString().slice(0, 10),
      status: get(13) || 'Em elaboração',
      document_link: get(19), notes: get(9),
    };
  });
}
function writeMM(wb, docs) {
  const ws = wb.addWorksheet('MM');
  writeHeader(ws, MM_HEADERS);
  docs.forEach((d, i) => {
    const r = ws.getRow(DATA_START_ROW + i);
    r.getCell(3).value = d.plant || '';
    r.getCell(4).value = d.equipment_number || '';
    r.getCell(5).value = d.sub_item || '';
    r.getCell(6).value = d.code;
    r.getCell(7).value = d.title_pt;
    r.getCell(8).value = d.title_pt;
    r.getCell(9).value = d.notes || '';
    r.getCell(10).value = d.area;
    r.getCell(11).value = d.date ? new Date(d.date) : '';
    r.getCell(12).value = d.expiry_date ? new Date(d.expiry_date) : '';
    r.getCell(13).value = d.status;
    r.getCell(14).value = d.has_pt ? 'x' : '';
    r.getCell(15).value = d.validade_status || '';
    r.getCell(17).value = d.days_to_expire ?? '';
    r.getCell(18).value = d.responsible || '';
    r.getCell(19).value = d.document_link || '';
  });
  styleSheet(ws, MM_HEADERS.length, docs.length);
}

/* ─── Estilo compartilhado ───────────────────────────────────────────────────── */
function writeHeader(ws, headers) {
  headers.forEach((h, i) => {
    if (!h) return;
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '001F5B' } };
    cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}
function styleSheet(ws, colCount, rowCount) {
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < HEADER_ROW) return;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } },
      };
    });
  });
  for (let c = 1; c <= colCount; c++) ws.getColumn(c).width = 20;
}

const PARSERS = { POL: parsePOL, IM: parseIM, GM: parseGM, MM: parseMM };
const WRITERS = { POL: writePOL, IM: writeIM, GM: writeGM, MM: writeMM };

/** Lê um workbook com abas POL/IM/GM/MM (mesmo layout do arquivo de referência da engenharia). */
export function parseLegacyWorkbook(workbook, placeholderResponsible = 'A definir') {
  const allRows = [];
  const perSheet = {};
  for (const [type, parser] of Object.entries(PARSERS)) {
    const ws = workbook.getWorksheet(type);
    if (!ws) { perSheet[type] = 0; continue; }
    const rows = parser(ws, placeholderResponsible);
    perSheet[type] = rows.length;
    allRows.push(...rows);
  }
  return { rows: allRows, perSheet };
}

/** Gera um workbook com 4 abas (POL/IM/GM/MM) no mesmo layout, a partir de documentos já calculados. */
export function buildLegacyWorkbook(docsByType) {
  const wb = new ExcelJS.Workbook();
  for (const [type, writer] of Object.entries(WRITERS)) {
    writer(wb, docsByType[type] || []);
  }
  return wb;
}

export async function loadWorkbookFromBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
