import { Router } from 'express';
import ExcelJS from 'exceljs';
import { pool } from '../db/schema.js';
import { requireAuth, requireProjectAccess } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CATEGORIES = ['Viagens','Contratos','POs'];

// ── Column helpers ──────────────────────────────────────────────────────────
// Template layout: C=2026 Jan, D=Feb, ..., N=Dec, O=2027 Jan, ..., repeating
// Each year = 12 cols. 2026 starts at col C (=3).
const BASE_COL  = 3;  // col C = column index 3 (1-based)
const YEAR_BASE = 2026;

function yearMonthToCol(year, month) {
  // month: 1-12
  const yearOffset = (year - YEAR_BASE) * 12;
  return BASE_COL + yearOffset + (month - 1);
}

// Monthly detail rows layout:
// Contratos/POs: year header at row 8, then pairs every 2 rows starting row 9
//   row 9  = "Previsto para Janeiro/YEAR",  row 10 = value (col F)
//   row 11 = "Previsto para Fevereiro/YEAR", row 12 = value (col F)
//   ... row 31/32 = Dezembro
//   row 33 (blank), row 34 = next year
// Viagens: same but starts at row 8 (no year header line)
//   row 8  = "Previsto para Janeiro/YEAR",  row 9 = value
//   ...

function getDetailRow(sheetName, year, month) {
  // Returns the row number where the VALUE for that month goes
  const yearIdx = year - YEAR_BASE; // 0-based
  if (sheetName === 'Viagens') {
    // Viagens: starts at row 8 for Jan 2026, pairs every 2 rows, year gap = 26 rows (12*2 + 2)
    const yearStartRow = 8 + yearIdx * 26;
    return yearStartRow + (month - 1) * 2 + 1; // value row (odd offset = label, +1 = value)
  } else {
    // Contratos / POs: year header at row 8 + yearIdx*26, label pairs from row 9
    const yearStartRow = 9 + yearIdx * 26;
    return yearStartRow + (month - 1) * 2 + 1;
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────
const NAVY    = '001F5B';
const BLUE    = '0070B8';
const LIGHT   = 'DCE6F1';
const BUDGET_BG  = 'BDD7EE';
const FORECAST_BG= 'E2EFDA';
const ACTUAL_BG  = 'FFF2CC';

function cell(ws, row, col) { return ws.getCell(row, col); }

function styleHeader(c, bg = NAVY, fg = 'FFFFFF', bold = true, size = 10) {
  c.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  c.font   = { bold, color: { argb: fg }, size, name: 'Calibri' };
  c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c.border = border('thin');
}

function styleValue(c, bg = null, numFmt = '#,##0.00') {
  if (bg) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  c.font      = { size: 9, name: 'Calibri' };
  c.alignment = { horizontal: 'right', vertical: 'middle' };
  c.numFmt    = numFmt;
  c.border    = border('hair');
}

function border(style) {
  const s = { style, color: { argb: 'CCCCCC' } };
  return { top: s, bottom: s, left: s, right: s };
}

// ── Data helpers ────────────────────────────────────────────────────────────
function buildLookup(entries) {
  // lookup[category][type][year][month] = {value, comment}
  const d = {};
  for (const e of entries) {
    const { category: cat, type, year, month, value, comment } = e;
    if (!d[cat]) d[cat] = {};
    if (!d[cat][type]) d[cat][type] = {};
    if (!d[cat][type][year]) d[cat][type][year] = {};
    d[cat][type][year][month] = { value: parseFloat(value) || 0, comment: comment || '' };
  }
  return d;
}

function getVal(d, cat, type, year, month) {
  return d[cat]?.[type]?.[year]?.[month]?.value ?? 0;
}
function getCmt(d, cat, type, year, month) {
  return d[cat]?.[type]?.[year]?.[month]?.comment ?? '';
}

function getYears(entries) {
  const ys = [...new Set(entries.map(e => parseInt(e.year)))].sort();
  return ys.length ? ys : [new Date().getFullYear()];
}

// ── Resumo sheet ────────────────────────────────────────────────────────────
function buildResumo(wb, project, entries, years, d) {
  const ws = wb.addWorksheet('Resumo');
  ws.properties.defaultColWidth = 13;

  // Row 1: project code + name Budget header
  ws.getCell(1, 1).value = `${project.code} - ${project.name}Budget `;
  ws.getCell(1, 1).font  = { bold: true, size: 11, color: { argb: NAVY }, name: 'Calibri' };

  // Row 2: Realizado header
  ws.getCell(2, 1).value = `${project.code} - ${project.name}Realizado `;
  ws.getCell(2, 1).font  = { size: 10, color: { argb: NAVY }, name: 'Calibri' };

  // Row 3: Year headers
  years.forEach(year => {
    const c = ws.getCell(3, yearMonthToCol(year, 1));
    c.value = year;
    styleHeader(c, NAVY, 'FFFFFF', true, 11);
    ws.mergeCells(3, yearMonthToCol(year, 1), 3, yearMonthToCol(year, 12));
  });

  // Row 4: Month headers
  years.forEach(year => {
    MONTHS_PT.forEach((m, mi) => {
      const c = ws.getCell(4, yearMonthToCol(year, mi + 1));
      c.value = m;
      styleHeader(c, LIGHT, NAVY, false, 9);
    });
  });

  ws.getCell(4, 1).value = '';
  ws.getCell(4, 2).value = '';

  // Rows 6-8: Budget / Forecast / Actual totals
  const typeBg  = { Budget: BUDGET_BG, Forecast: FORECAST_BG, Actual: ACTUAL_BG };
  const typeLabel= { Budget: 'Budget', Forecast: 'Forecast', Actual: 'Actual' };
  [[6,'Budget'],[7,'Forecast'],[8,'Actual']].forEach(([rowN, type]) => {
    ws.getCell(rowN, 1).value = 'R$';
    ws.getCell(rowN, 2).value = typeLabel[type];
    styleHeader(ws.getCell(rowN, 1), typeBg[type], NAVY, false, 9);
    styleHeader(ws.getCell(rowN, 2), typeBg[type], NAVY, true, 9);
    ws.getCell(rowN, 2).alignment.horizontal = 'left';

    years.forEach(year => {
      MONTHS_PT.forEach((_, mi) => {
        const month = mi + 1;
        let total = 0;
        CATEGORIES.forEach(cat => { total += getVal(d, cat, type, year, month); });
        const c = ws.getCell(rowN, yearMonthToCol(year, month));
        c.value = total;
        styleValue(c, typeBg[type]);
      });
    });
  });

  // Row 10: annotation + annual summary block
  ws.getCell(10, 2).value = `Referente ao Forecast Janeiro à Dezembro/${years[0]}`;
  ws.getCell(10, 2).font  = { size: 9, italic: true, color: { argb: '666666' }, name: 'Calibri' };

  // Annual columns starting at col L (12)
  const annualStartCol = 12;
  ws.getCell(10, annualStartCol).value = years[0];
  years.slice(1).forEach((y, i) => { ws.getCell(10, annualStartCol + 1 + i).value = y; });
  ws.getCell(10, annualStartCol + years.length).value = 'SI';
  ws.getCell(10, annualStartCol + years.length + 1).value = 'Realizado Total';
  ws.getCell(10, annualStartCol + years.length + 2).value = 'POOL';

  [[11,'Budget'],[12,'Forecast'],[13,'Actual']].forEach(([rowN, type]) => {
    ws.getCell(rowN, 11).value = 'R$';
    ws.getCell(rowN, annualStartCol - 1).value = type;
    years.forEach((year, yi) => {
      let total = 0;
      CATEGORIES.forEach(cat => {
        for (let m = 1; m <= 12; m++) total += getVal(d, cat, type, year, m);
      });
      ws.getCell(rowN, annualStartCol + yi).value = total;
      styleValue(ws.getCell(rowN, annualStartCol + yi), typeBg[type]);
    });
    if (type === 'Forecast') {
      ws.getCell(rowN, annualStartCol + years.length).value = parseFloat(project.si_value) || 0;
      styleValue(ws.getCell(rowN, annualStartCol + years.length));
      ws.getCell(rowN, annualStartCol + years.length + 2).value = parseFloat(project.pool_value) || 0;
      styleValue(ws.getCell(rowN, annualStartCol + years.length + 2));
    }
  });

  // Column widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 45;
  for (let c = 3; c <= 2 + years.length * 12; c++) ws.getColumn(c).width = 12;
  ws.getRow(1).height = 20;
  ws.getRow(4).height = 28;
}

// ── Category sheet (Viagens / Contratos / POs) ────────────────────────────
function buildCategorySheet(wb, sheetName, catLabel, project, entries, years, d) {
  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultColWidth = 13;

  const typeBg  = { Budget: BUDGET_BG, Forecast: FORECAST_BG, Actual: ACTUAL_BG };
  const isViagens = sheetName === 'Viagens';

  // Row 1: Year headers
  years.forEach(year => {
    const c = ws.getCell(1, yearMonthToCol(year, 1));
    c.value = year;
    styleHeader(c, NAVY, 'FFFFFF', true, 11);
    ws.mergeCells(1, yearMonthToCol(year, 1), 1, yearMonthToCol(year, 12));
  });

  // Row 2: Month headers
  years.forEach(year => {
    MONTHS_PT.forEach((m, mi) => {
      const c = ws.getCell(2, yearMonthToCol(year, mi + 1));
      c.value = m;
      styleHeader(c, LIGHT, NAVY, false, 9);
    });
  });

  // Row 4: Budget / Forecast / Actual header rows
  [[4,'Budget'],[5,'Forecast'],[6,'Actual']].forEach(([rowN, type]) => {
    ws.getCell(rowN, 1).value = rowN === 4 ? catLabel : null;
    ws.getCell(rowN, 2).value = type;
    styleHeader(ws.getCell(rowN, 1), typeBg[type], NAVY, rowN === 4, 9);
    styleHeader(ws.getCell(rowN, 2), typeBg[type], NAVY, true, 9);
    ws.getCell(rowN, 2).alignment.horizontal = 'left';

    years.forEach(year => {
      MONTHS_PT.forEach((_, mi) => {
        const month = mi + 1;
        const cat = catLabel.trim();
        const v = getVal(d, cat, type, year, month);
        const c = ws.getCell(rowN, yearMonthToCol(year, month));
        c.value = v;
        styleValue(c, typeBg[type]);
      });
    });
  });

  // Monthly detail rows — per year, per month
  years.forEach((year, yearIdx) => {
    // Year separator header (not in Viagens row pattern, but add for Contratos/POs)
    if (!isViagens) {
      const yearHeaderRow = 8 + yearIdx * 26;
      ws.getCell(yearHeaderRow, 1).value = year;
      ws.getCell(yearHeaderRow, 1).font = { bold: true, size: 10, name: 'Calibri' };
    }

    MONTHS_PT.forEach((monthName, mi) => {
      const month = mi + 1;
      const cat   = catLabel.trim();

      // Label row and value row
      let labelRow, valueRow;
      if (isViagens) {
        labelRow = 8  + yearIdx * 26 + mi * 2;
        valueRow = labelRow + 1;
      } else {
        labelRow = 9  + yearIdx * 26 + mi * 2;
        valueRow = labelRow + 1;
      }

      const forecastVal = getVal(d, cat, 'Forecast', year, month);
      const comment     = getCmt(d, cat, 'Forecast', year, month);

      // Label row
      ws.getCell(labelRow, 1).value = `Previsto para o mês de ${monthName}/${year}`;
      ws.getCell(labelRow, 1).font  = { size: 9, name: 'Calibri' };
      ws.getCell(labelRow, 8).value = `Comentários após o fechamento do mês de ${monthName}/${year}`;
      ws.getCell(labelRow, 8).font  = { size: 9, name: 'Calibri' };

      // Value row — col F (6) = forecast value, col H (8) = comment
      ws.getCell(valueRow, 6).value  = forecastVal || 0;
      ws.getCell(valueRow, 6).numFmt = '#,##0.00';
      ws.getCell(valueRow, 6).font   = { size: 9, name: 'Calibri' };
      if (comment) {
        ws.getCell(valueRow, 8).value = comment;
        ws.getCell(valueRow, 8).font  = { size: 9, italic: true, name: 'Calibri' };
      }
    });
  });

  // Column widths
  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 12;
  ws.getColumn(6).width = 14;
  ws.getColumn(8).width = 50;
  for (let c = 3; c <= 2 + years.length * 12; c++) ws.getColumn(c).width = 12;
}

// ── Avisos sheet ────────────────────────────────────────────────────────────
function buildAvisos(wb, notes) {
  const ws = wb.addWorksheet('Avisos');
  ws.getCell(2, 3).value = 'AVISOS';
  ws.getCell(2, 3).font  = { bold: true, size: 12, color: { argb: NAVY }, name: 'Calibri' };

  const avisos = `1 - A postergação ou antecipação de valores pode ser realizada, desde que o total previsto para o ano não seja excedido.\n\n2 - Investimentos que possuem valores no POOL indicam que esse montante poderá ser executado no ano previsto.\n\n3 - Para investimentos que possuem proforma, deve-se informar na previsão o valor do desembolso da proforma.\n\n4 - O somatório dos valores previstos com os valores já realizados deve respeitar o limite total aprovado na SI.\n\n5 - Gastos classificados como "P" não precisam ser considerados na previsão.\n\n6 - Os gastos com viagens devem ser considerados pelo valor total previsto para o ano.\n\n7 - Nos gastos contratuais, considerar o DIFAL nas aquisições de materiais interestaduais.`;
  ws.getCell(3, 3).value = avisos;
  ws.getCell(3, 3).alignment = { wrapText: true, vertical: 'top' };
  ws.getCell(3, 3).font = { size: 9, name: 'Calibri' };
  ws.getRow(3).height = 200;
  ws.getColumn(3).width = 100;

  // Project notes
  if (notes.length > 0) {
    ws.getCell(6, 3).value = 'HISTÓRICO DE ALTERAÇÕES';
    ws.getCell(6, 3).font  = { bold: true, size: 10, color: { argb: NAVY }, name: 'Calibri' };
    notes.forEach((n, i) => {
      const row = 7 + i;
      const date = n.note_date ? new Date(n.note_date).toLocaleDateString('pt-BR') : '';
      ws.getCell(row, 3).value = `${date}${date ? ' — ' : ''}${n.user_name ? '[' + n.user_name + '] ' : ''}${n.content}`;
      ws.getCell(row, 3).font  = { size: 9, name: 'Calibri' };
    });
  }
}

// ── Main export route ────────────────────────────────────────────────────────
router.get('/project/:projectId', requireProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;

    const [projRes, entriesRes, notesRes] = await Promise.all([
      pool.query('SELECT * FROM projects WHERE id=$1', [projectId]),
      pool.query('SELECT * FROM forecast_entries WHERE project_id=$1 ORDER BY year, month', [projectId]),
      pool.query(`SELECT pn.*, u.name AS user_name
        FROM project_notes pn LEFT JOIN users u ON u.id=pn.user_id
        WHERE pn.project_id=$1 ORDER BY pn.note_date DESC`, [projectId]),
    ]);

    if (!projRes.rows.length) return res.status(404).json({ error: 'Projeto não encontrado' });

    const project = projRes.rows[0];
    const entries = entriesRes.rows;
    const notes   = notesRes.rows;
    const years   = [...new Set(entries.map(e => parseInt(e.year)))].sort();
    if (!years.length) years.push(new Date().getFullYear());

    const d = buildLookup(entries);

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'CTG Brasil — Forecast';
    wb.created  = new Date();
    wb.modified = new Date();

    buildResumo(wb, project, entries, years, d);
    CATEGORIES.forEach(cat => buildCategorySheet(wb, cat, cat, project, entries, years, d));
    buildAvisos(wb, notes);

    const safeName = `${project.code} - ${project.name}`.replace(/[/\\?%*:|"<>]/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Planejador export: all projects × months forecast ──────────────────────
router.get('/planejador', async (req, res) => {
  const { role } = req.user;
  if (!['admin', 'gestor', 'planejador'].includes(role))
    return res.status(403).json({ error: 'Sem permissão' });

  try {
    // 1. All projects with their engineers and last forecast update
    const projRes = await pool.query(`
      SELECT
        p.id, p.code, p.name, p.description, p.si_value, p.plants,
        STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) AS responsaveis,
        MAX(fe.updated_at) AS ultima_atualizacao
      FROM projects p
      LEFT JOIN project_assignments pa ON pa.project_id = p.id
      LEFT JOIN users u ON u.id = pa.user_id AND u.role = 'engenheiro'
      LEFT JOIN forecast_entries fe
        ON fe.project_id = p.id AND fe.type = 'Forecast' AND fe.value > 0
      GROUP BY p.id
      ORDER BY p.code
    `);
    const projects = projRes.rows;

    // 2. All Forecast entries
    const entriesRes = await pool.query(`
      SELECT project_id, year, month, SUM(value) AS total
      FROM forecast_entries
      WHERE type = 'Forecast'
      GROUP BY project_id, year, month
      ORDER BY project_id, year, month
    `);

    // Build lookup: projectId → { "YEAR-MONTH": total }
    const lookup = {};
    for (const e of entriesRes.rows) {
      if (!lookup[e.project_id]) lookup[e.project_id] = {};
      lookup[e.project_id][`${e.year}-${e.month}`] = parseFloat(e.total) || 0;
    }

    // 3. Build column headers: Jan/2026 … Dez/2031
    const START_YEAR = 2026, END_YEAR = 2031;
    const MONTHS_ABBR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const monthCols = [];
    for (let y = START_YEAR; y <= END_YEAR; y++) {
      for (let m = 1; m <= 12; m++) {
        monthCols.push({ year: y, month: m, label: `${MONTHS_ABBR[m-1]}/${y}` });
      }
    }

    // 4. Build workbook
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'CTG Brasil — Forecast';
    wb.created  = new Date();

    const ws = wb.addWorksheet('Forecast por Projeto');

    // ── Style helpers ──
    const HEADER_BG = '001F5B';  // navy
    const SUB_BG    = '0070B8';  // blue
    const MONTH_BG  = 'E0F2FE';  // light blue
    const YEAR_COLORS = { 2026:'EFF6FF', 2027:'F0FDF4', 2028:'FFFBEB', 2029:'FDF4FF', 2030:'F0F9FF', 2031:'FFF0F0' };

    function hdr(cell, value, bg = HEADER_BG, fg = 'FFFFFF', size = 9, bold = true, hAlign = 'center') {
      cell.value = value;
      cell.font  = { bold, size, color: { argb: fg }, name: 'Calibri' };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { horizontal: hAlign, vertical: 'middle', wrapText: true };
      cell.border = {
        top:    { style:'thin', color:{ argb:'CCCCCC' } },
        bottom: { style:'thin', color:{ argb:'CCCCCC' } },
        left:   { style:'thin', color:{ argb:'CCCCCC' } },
        right:  { style:'thin', color:{ argb:'CCCCCC' } },
      };
    }

    // ── Row 1: static headers + year spans ──
    const FIXED_COLS = 6; // code, name, description, responsaveis, si, ultima_atualizacao
    hdr(ws.getCell(1, 1), 'Código',           HEADER_BG, 'FFFFFF', 9, true, 'left');
    hdr(ws.getCell(1, 2), 'Projeto',           HEADER_BG, 'FFFFFF', 9, true, 'left');
    hdr(ws.getCell(1, 3), 'Descrição',         HEADER_BG, 'FFFFFF', 9, true, 'left');
    hdr(ws.getCell(1, 4), 'Responsável(is)',   HEADER_BG, 'FFFFFF', 9, true, 'left');
    hdr(ws.getCell(1, 5), 'SI (R$)',           HEADER_BG, 'FFFFFF', 9, true, 'right');
    hdr(ws.getCell(1, 6), 'Última Atualização',HEADER_BG, 'FFFFFF', 9, true, 'center');

    // Year headers spanning 12 months each
    for (let y = START_YEAR; y <= END_YEAR; y++) {
      const startCol = FIXED_COLS + 1 + (y - START_YEAR) * 12;
      const endCol   = startCol + 11;
      const yBg = YEAR_COLORS[y] || 'F8FAFC';
      ws.mergeCells(1, startCol, 1, endCol);
      hdr(ws.getCell(1, startCol), `Forecast ${y}`, SUB_BG, 'FFFFFF', 10, true, 'center');
    }

    // ── Row 2: month column headers ──
    // Merge fixed col labels across rows 1+2 — fixed already done in row 1
    // Month labels
    monthCols.forEach((mc, i) => {
      const col  = FIXED_COLS + 1 + i;
      const yBg  = YEAR_COLORS[mc.year] || 'F8FAFC';
      hdr(ws.getCell(2, col), mc.label, yBg, '374151', 8, false, 'center');
    });

    // ── Freeze row 2, pin first 2 cols ──
    ws.views = [{ state: 'frozen', xSplit: FIXED_COLS, ySplit: 2 }];

    // ── Data rows ──
    projects.forEach((p, idx) => {
      const row = idx + 3;
      const isEven = idx % 2 === 0;
      const rowBg  = isEven ? 'FFFFFF' : 'F8FAFC';

      function dataCell(col, value, numFmt, align = 'left') {
        const c = ws.getCell(row, col);
        c.value = value;
        c.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: rowBg } };
        c.font  = { size: 9, name: 'Calibri' };
        c.alignment = { horizontal: align, vertical: 'middle' };
        c.border = {
          bottom: { style:'hair', color:{ argb:'E2E8F0' } },
          right:  { style:'hair', color:{ argb:'E2E8F0' } },
        };
        if (numFmt) c.numFmt = numFmt;
      }

      dataCell(1, p.code,          null, 'left');
      dataCell(2, p.name,          null, 'left');
      dataCell(3, p.description || '', null, 'left');
      dataCell(4, p.responsaveis || '—', null, 'left');
      dataCell(5, parseFloat(p.si_value)||0, '#,##0.00', 'right');
      dataCell(6,
        p.ultima_atualizacao ? new Date(p.ultima_atualizacao).toLocaleDateString('pt-BR') : '—',
        null, 'center'
      );

      // Forecast months
      monthCols.forEach((mc, i) => {
        const col   = FIXED_COLS + 1 + i;
        const val   = lookup[p.id]?.[`${mc.year}-${mc.month}`] || 0;
        const yBg   = YEAR_COLORS[mc.year] || 'F8FAFC';
        const cellBg = val > 0 ? yBg : (isEven ? 'FFFFFF' : 'F8FAFC');
        const c      = ws.getCell(row, col);
        c.value      = val || null;
        c.fill       = { type:'pattern', pattern:'solid', fgColor:{ argb: cellBg } };
        c.font       = { size: 9, name: 'Calibri', color: { argb: val > 0 ? '0369A1' : 'CBD5E1' } };
        c.alignment  = { horizontal: 'right', vertical: 'middle' };
        c.numFmt     = '#,##0.00';
        c.border     = { bottom:{ style:'hair', color:{ argb:'E2E8F0' } }, right:{ style:'hair', color:{ argb:'E2E8F0' } } };
      });
    });

    // ── Totals row ──
    const totRow = projects.length + 3;
    function totCell(col, value, numFmt, align = 'right') {
      const c = ws.getCell(totRow, col);
      c.value = value;
      c.font  = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FFFFFF' } };
      c.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: '001F5B' } };
      c.alignment = { horizontal: align, vertical: 'middle' };
      if (numFmt) c.numFmt = numFmt;
    }
    totCell(1, 'TOTAL', null, 'left');
    totCell(2, `${projects.length} projetos`, null, 'left');
    totCell(3, ''); totCell(4, ''); totCell(5, ''); totCell(6, '');
    monthCols.forEach((mc, i) => {
      const col = FIXED_COLS + 1 + i;
      const tot = projects.reduce((s,p) => s + (lookup[p.id]?.[`${mc.year}-${mc.month}`]||0), 0);
      totCell(col, tot||null, '#,##0.00');
    });

    // ── Column widths ──
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 32;
    ws.getColumn(3).width = 32;
    ws.getColumn(4).width = 28;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 18;
    monthCols.forEach((_, i) => { ws.getColumn(FIXED_COLS + 1 + i).width = 11; });

    // Row heights
    ws.getRow(1).height = 22;
    ws.getRow(2).height = 20;
    ws.getRow(totRow).height = 18;

    const filename = `CTG_Forecast_Planejador_${new Date().getFullYear()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Planejador export error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
