import { Router } from 'express';
import ExcelJS from 'exceljs';
import { pool } from '../db/schema.js';
import { requireAuth, requireProjectAccess } from '../middleware/auth.js';

const router = Router();

// Safe error helper
function safeError(res, err) {
  console.error(`[ERROR] ${err.message}`);
  if (res.headersSent) return; // Stream already started, cannot send JSON error
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}
router.use(requireAuth);

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CATEGORIES = ['Viagens','Contratos','POs'];

// ── Column helpers ──────────────────────────────────────────────────────────
// Template layout: C=firstYear Jan, D=Feb, ..., N=Dec, O=nextYear Jan, ...
// Each year = 12 cols. First data year starts at col C (=3).
const BASE_COL  = 3;  // col C = column index 3 (1-based)

function yearMonthToCol(year, month, minYear) {
  // month: 1-12, minYear = first year in data set
  const yearOffset = (year - minYear) * 12;
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

function getDetailRow(sheetName, year, month, minYear) {
  // Returns the row number where the VALUE for that month goes
  const yearIdx = year - minYear; // 0-based
  if (sheetName === 'Viagens') {
    const yearStartRow = 8 + yearIdx * 26;
    return yearStartRow + (month - 1) * 2 + 1;
  } else {
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
function buildResumo(wb, project, entries, allYears, monthlyYears, d, activeTypes, activeCats) {
  const ws = wb.addWorksheet('Resumo');
  ws.properties.defaultColWidth = 13;

  // Use filtered types/categories or fall back to defaults
  const typesToShow = activeTypes || ['Budget','Forecast','Actual'];
  const catsToSum   = activeCats  || CATEGORIES;
  // Only monthly years get month columns; minYear is based on those
  const minYear     = monthlyYears.length ? monthlyYears[0] : allYears[0];

  // Row 1: project code + name — Budget header
  ws.getCell(1, 1).value = `${project.code} - ${project.name} — Budget`;
  ws.getCell(1, 1).font  = { bold: true, size: 11, color: { argb: NAVY }, name: 'Calibri' };

  // Row 2: Realizado header
  ws.getCell(2, 1).value = `${project.code} - ${project.name} — Realizado`;
  ws.getCell(2, 1).font  = { size: 10, color: { argb: NAVY }, name: 'Calibri' };

  // Row 3: Year headers (only monthly years)
  monthlyYears.forEach(year => {
    const c = ws.getCell(3, yearMonthToCol(year, 1, minYear));
    c.value = year;
    styleHeader(c, NAVY, 'FFFFFF', true, 11);
    ws.mergeCells(3, yearMonthToCol(year, 1, minYear), 3, yearMonthToCol(year, 12, minYear));
  });

  // Row 4: Month headers (only monthly years)
  monthlyYears.forEach(year => {
    MONTHS_PT.forEach((m, mi) => {
      const c = ws.getCell(4, yearMonthToCol(year, mi + 1, minYear));
      c.value = m;
      styleHeader(c, LIGHT, NAVY, false, 9);
    });
  });

  ws.getCell(4, 1).value = '';
  ws.getCell(4, 2).value = '';

  // Rows 6+: one row per active type — monthly columns only for monthlyYears
  const typeBg  = { Budget: BUDGET_BG, Forecast: FORECAST_BG, Actual: ACTUAL_BG,
                    Meta: 'F5F3FF', Pool: 'F0F9FF' };
  const typeLabel= { Budget: 'Budget', Forecast: 'Forecast', Actual: 'Realizado',
                     Meta: 'Meta', Pool: 'Pool' };
  typesToShow.forEach((type, ti) => {
    const rowN = 6 + ti;
    const bg   = typeBg[type] || FORECAST_BG;
    ws.getCell(rowN, 1).value = 'R$';
    ws.getCell(rowN, 2).value = typeLabel[type] || type;
    styleHeader(ws.getCell(rowN, 1), bg, NAVY, false, 9);
    styleHeader(ws.getCell(rowN, 2), bg, NAVY, true, 9);
    ws.getCell(rowN, 2).alignment.horizontal = 'left';

    monthlyYears.forEach(year => {
      MONTHS_PT.forEach((_, mi) => {
        const month = mi + 1;
        let total = 0;
        catsToSum.forEach(cat => { total += getVal(d, cat, type, year, month); });
        const c = ws.getCell(rowN, yearMonthToCol(year, month, minYear));
        c.value = total;
        styleValue(c, bg);
      });
    });
  });

  // ── Annual summary block ──────────────────────────────────────────────────
  // Shows ALL years from minYear up to 2031 as annual totals (empty if sem dados)
  const SUMMARY_END_YEAR = 2031;
  const summaryYears = [];
  const baseYear = allYears.length ? allYears[0] : new Date().getFullYear();
  for (let y = baseYear; y <= Math.max(SUMMARY_END_YEAR, ...allYears); y++) summaryYears.push(y);

  const summaryStartRow = 6 + typesToShow.length + 2;
  ws.getCell(summaryStartRow, 2).value = `Referente ao Forecast Janeiro à Dezembro/${monthlyYears[0] || allYears[0]}`;
  ws.getCell(summaryStartRow, 2).font  = { size: 9, italic: true, color: { argb: '666666' }, name: 'Calibri' };

  // Annual columns starting at col L (12)
  const annualStartCol = 12;
  summaryYears.forEach((y, i) => {
    const hc = ws.getCell(summaryStartRow, annualStartCol + i);
    hc.value = y;
    styleHeader(hc, LIGHT, NAVY, true, 9);
  });
  const afterYears = annualStartCol + summaryYears.length;
  ws.getCell(summaryStartRow, afterYears).value = 'SI';
  styleHeader(ws.getCell(summaryStartRow, afterYears), LIGHT, NAVY, true, 9);
  ws.getCell(summaryStartRow, afterYears + 1).value = 'Realizado Total';
  styleHeader(ws.getCell(summaryStartRow, afterYears + 1), LIGHT, NAVY, true, 9);
  ws.getCell(summaryStartRow, afterYears + 2).value = 'POOL';
  styleHeader(ws.getCell(summaryStartRow, afterYears + 2), LIGHT, NAVY, true, 9);

  typesToShow.forEach((type, ti) => {
    const rowN = summaryStartRow + 1 + ti;
    const bg   = typeBg[type] || FORECAST_BG;
    ws.getCell(rowN, annualStartCol - 1).value = typeLabel[type] || type;
    styleHeader(ws.getCell(rowN, annualStartCol - 1), bg, NAVY, true, 9);
    ws.getCell(rowN, annualStartCol - 1).alignment.horizontal = 'left';

    summaryYears.forEach((year, yi) => {
      let total = 0;
      catsToSum.forEach(cat => {
        for (let m = 1; m <= 12; m++) total += getVal(d, cat, type, year, m);
      });
      // Mostra zero como null para não poluir colunas vazias
      ws.getCell(rowN, annualStartCol + yi).value = total > 0 ? total : null;
      styleValue(ws.getCell(rowN, annualStartCol + yi), bg);
    });
    if (type === 'Forecast') {
      ws.getCell(rowN, afterYears).value = parseFloat(project.si_value) || 0;
      styleValue(ws.getCell(rowN, afterYears));
      ws.getCell(rowN, afterYears + 2).value = parseFloat(project.pool_value) || 0;
      styleValue(ws.getCell(rowN, afterYears + 2));
    }
  });

  // Column widths
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 45;
  const totalMonthCols = monthlyYears.length * 12;
  for (let c = 3; c <= 2 + totalMonthCols; c++) ws.getColumn(c).width = 12;
  ws.getRow(1).height = 20;
  ws.getRow(4).height = 28;
}

// ── Category sheet (Viagens / Contratos / POs) ────────────────────────────
function buildCategorySheet(wb, sheetName, catLabel, project, entries, allYears, monthlyYears, d, activeTypes) {
  const typesToShow = activeTypes || ['Budget','Forecast','Actual'];
  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultColWidth = 13;
  const minYear = monthlyYears.length ? monthlyYears[0] : allYears[0];

  const typeBg   = { Budget: BUDGET_BG, Forecast: FORECAST_BG, Actual: ACTUAL_BG,
                     Meta: 'F5F3FF', Pool: 'F0F9FF' };
  const typeLabel= { Budget:'Budget', Forecast:'Forecast', Actual:'Realizado', Meta:'Meta', Pool:'Pool' };
  const isViagens = sheetName === 'Viagens';

  // Row 1: Year headers (only monthly years)
  monthlyYears.forEach(year => {
    const c = ws.getCell(1, yearMonthToCol(year, 1, minYear));
    c.value = year;
    styleHeader(c, NAVY, 'FFFFFF', true, 11);
    ws.mergeCells(1, yearMonthToCol(year, 1, minYear), 1, yearMonthToCol(year, 12, minYear));
  });

  // Row 2: Month headers (only monthly years)
  monthlyYears.forEach(year => {
    MONTHS_PT.forEach((m, mi) => {
      const c = ws.getCell(2, yearMonthToCol(year, mi + 1, minYear));
      c.value = m;
      styleHeader(c, LIGHT, NAVY, false, 9);
    });
  });

  // Rows 4+: one row per active type (only monthly years get month columns)
  typesToShow.forEach((type, ti) => {
    const rowN = 4 + ti;
    const bg   = typeBg[type]   || FORECAST_BG;
    const lbl  = typeLabel[type] || type;
    ws.getCell(rowN, 1).value = ti === 0 ? catLabel : null;
    ws.getCell(rowN, 2).value = lbl;
    styleHeader(ws.getCell(rowN, 1), bg, NAVY, ti === 0, 9);
    styleHeader(ws.getCell(rowN, 2), bg, NAVY, true, 9);
    ws.getCell(rowN, 2).alignment.horizontal = 'left';

    monthlyYears.forEach(year => {
      MONTHS_PT.forEach((_, mi) => {
        const month = mi + 1;
        const cat   = catLabel.trim();
        const v     = getVal(d, cat, type, year, month);
        const c     = ws.getCell(rowN, yearMonthToCol(year, month, minYear));
        c.value     = v;
        styleValue(c, bg);
      });
    });
  });

  // Monthly detail rows — only for monthly years (skip consolidated)
  const detailStartRow = 4 + typesToShow.length + 1;
  monthlyYears.forEach((year, yearIdx) => {
    if (!isViagens) {
      const yearHeaderRow = detailStartRow + yearIdx * 26;
      ws.getCell(yearHeaderRow, 1).value = year;
      ws.getCell(yearHeaderRow, 1).font = { bold: true, size: 10, name: 'Calibri' };
    }

    MONTHS_PT.forEach((monthName, mi) => {
      const month = mi + 1;
      const cat   = catLabel.trim();

      let labelRow, valueRow;
      if (isViagens) {
        labelRow = detailStartRow + yearIdx * 26 + mi * 2;
        valueRow = labelRow + 1;
      } else {
        labelRow = detailStartRow + 1 + yearIdx * 26 + mi * 2;
        valueRow = labelRow + 1;
      }

      const forecastVal = getVal(d, cat, 'Forecast', year, month);
      const comment     = getCmt(d, cat, 'Forecast', year, month);

      ws.getCell(labelRow, 1).value = `Previsto para o mês de ${monthName}/${year}`;
      ws.getCell(labelRow, 1).font  = { size: 9, name: 'Calibri' };
      ws.getCell(labelRow, 8).value = `Comentários após o fechamento do mês de ${monthName}/${year}`;
      ws.getCell(labelRow, 8).font  = { size: 9, name: 'Calibri' };

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
  const totalMonthCols = monthlyYears.length * 12;
  for (let c = 3; c <= 2 + totalMonthCols; c++) ws.getColumn(c).width = 12;
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
    // Optional filters from frontend modal
    const selCategories = req.query.categories
      ? (Array.isArray(req.query.categories) ? req.query.categories : [req.query.categories])
      : null;
    const selTypes = req.query.types
      ? (Array.isArray(req.query.types) ? req.query.types : [req.query.types])
      : null;
    const { role } = req.user;

    // Role-based type whitelist
    const ALLOWED_TYPES = {
      engenheiro:  ['Budget','Forecast','Actual'],
      coordenador: ['Budget','Forecast','Actual','Meta','Pool'],
      gestor:      ['Budget','Forecast','Actual','Meta','Pool'],
      planejador:  ['Budget','Forecast','Actual','Meta','Pool'],
      admin:       ['Budget','Forecast','Actual','Meta','Pool'],
    };
    const allowedTypes = ALLOWED_TYPES[role] || ALLOWED_TYPES.gestor;
    const activeTypes  = selTypes ? selTypes.filter(t => allowedTypes.includes(t)) : allowedTypes;
    const activeCats   = selCategories || ['Viagens','Contratos','POs'];

    const [projRes, entriesRes, notesRes, consRes] = await Promise.all([
      pool.query('SELECT * FROM projects WHERE id=$1', [projectId]),
      pool.query('SELECT * FROM forecast_entries WHERE project_id=$1 ORDER BY year, month', [projectId]),
      pool.query(`SELECT pn.*, u.name AS user_name
        FROM project_notes pn LEFT JOIN users u ON u.id=pn.user_id
        WHERE pn.project_id=$1 ORDER BY pn.note_date DESC`, [projectId]),
      pool.query('SELECT * FROM year_consolidated WHERE project_id=$1 ORDER BY year', [projectId]),
    ]);

    if (!projRes.rows.length) return res.status(404).json({ error: 'Projeto não encontrado' });

    const project = projRes.rows[0];
    let entries = entriesRes.rows;
    const notes   = notesRes.rows;
    const consData = consRes.rows;

    // Merge consolidated data: for years that have consolidated values, inject them as synthetic entries
    // Consolidated takes precedence over monthly entries for the same project+year+type
    // Track which years are fully consolidated (no monthly breakdown in Excel)
    const consolidatedYears = new Set();
    if (consData.length) {
      const consYearTypes = new Set(consData.filter(c => parseFloat(c.value) > 0).map(c => `${c.year}|${c.type}`));
      // Identify years where ALL active types are consolidated
      const consYearsAll = [...new Set(consData.map(c => parseInt(c.year)))];
      for (const y of consYearsAll) {
        const allTypesConsolidated = activeTypes.every(t => consYearTypes.has(`${y}|${t}`));
        if (allTypesConsolidated) consolidatedYears.add(y);
      }
      // Remove monthly entries for years+types that have consolidated data
      entries = entries.filter(e => !consYearTypes.has(`${e.year}|${e.type}`));
      // Add consolidated as month=1 entries (total for the year)
      for (const c of consData) {
        if (parseFloat(c.value) <= 0) continue;
        if (c.category === 'Total') {
          entries.push({ project_id: c.project_id, category: 'Contratos', type: c.type, year: c.year, month: 1, value: c.value, comment: 'Consolidado' });
        } else {
          entries.push({ project_id: c.project_id, category: c.category, type: c.type, year: c.year, month: 1, value: c.value, comment: 'Consolidado' });
        }
      }
    }

    const years   = [...new Set(entries.map(e => parseInt(e.year)))].sort();
    if (!years.length) years.push(new Date().getFullYear());
    // Separate: monthly years get columns, consolidated years only appear in annual summary
    const monthlyYears = years.filter(y => !consolidatedYears.has(y));

    const d = buildLookup(entries);

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'CTG Brasil — Forecast';
    wb.created  = new Date();
    wb.modified = new Date();

    buildResumo(wb, project, entries, years, monthlyYears, d, activeTypes, activeCats);
    activeCats.forEach(cat => buildCategorySheet(wb, cat, cat, project, entries, years, monthlyYears, d, activeTypes));
    buildAvisos(wb, notes);

    const safeName = `${project.code} - ${project.name}`.replace(/[/\\?%*:|"<>]/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    safeError(res, err);
  }
});

// ── Planejador export: all projects × months, with type selection ─────────────
router.get('/planejador', async (req, res) => {
  const { role, id: userId } = req.user;
  if (!['admin','gestor','coordenador','planejador','engenheiro'].includes(role))
    return res.status(403).json({ error: 'Sem permissão' });

  // Role-based type whitelist
  const ALLOWED = {
    engenheiro:  ['Budget','Forecast','Actual'],
    coordenador: ['Budget','Forecast','Actual','Meta','Pool'],
    gestor:      ['Budget','Forecast','Actual','Meta','Pool'],
    planejador:  ['Budget','Forecast','Actual','Meta','Pool'],
    admin:       ['Budget','Forecast','Actual','Meta','Pool'],
  };
  const allowed = ALLOWED[role] || [];
  const reqTypes = req.query.types
    ? (Array.isArray(req.query.types) ? req.query.types : [req.query.types])
    : null;
  const activeTypes = reqTypes ? reqTypes.filter(t => allowed.includes(t)) : allowed;

  const TYPE_LABELS = { Budget:'Budget', Forecast:'Forecast', Actual:'Realizado', Meta:'Meta', Pool:'Pool' };
  const TYPE_ARGH   = { Budget:'15803D', Forecast:'0369A1', Actual:'1E40AF', Meta:'6D28D9', Pool:'0891B2' };
  const TYPE_LIGHT  = { Budget:'F0FDF4', Forecast:'E0F2FE', Actual:'EFF6FF', Meta:'F5F3FF', Pool:'F0F9FF' };

  const MONTHS_ABBR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const NAVY = '001F5B', SUB_BG = '0070B8', LIGHT = 'E8EEF8', WHITE = 'FFFFFF';

  try {
    // Load year range from settings
    const settingsRes = await pool.query(
      "SELECT key, value FROM system_settings WHERE key IN ('active_year_start','active_year_end')"
    );
    const settingsMap = {};
    settingsRes.rows.forEach(r => { settingsMap[r.key] = r.value; });
    const START_YEAR = parseInt(settingsMap.active_year_start || '2025');
    const END_YEAR   = parseInt(settingsMap.active_year_end   || '2027');

    // 1. Projects (engineers see only assigned)
    const isEng = role === 'engenheiro';
    const engJoin = isEng
      ? `INNER JOIN project_assignments ejoin ON ejoin.project_id=p.id AND ejoin.user_id=$1`
      : '';
    const projRes = await pool.query(`
      SELECT p.id, p.code, p.name, p.si_value, p.plants,
        eng_agg.responsaveis,
        fe_agg.ultima_atualizacao
      FROM projects p
      ${engJoin}
      LEFT JOIN (
        SELECT pa.project_id, STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) AS responsaveis
        FROM project_assignments pa
        JOIN users u ON u.id = pa.user_id AND u.role = 'engenheiro'
        GROUP BY pa.project_id
      ) eng_agg ON eng_agg.project_id = p.id
      LEFT JOIN (
        SELECT project_id, MAX(updated_at) AS ultima_atualizacao
        FROM forecast_entries WHERE type='Forecast' AND value>0
        GROUP BY project_id
      ) fe_agg ON fe_agg.project_id = p.id
      ORDER BY p.code
    `, isEng ? [userId] : []);
    const projects = projRes.rows;

    // 2. Entries for selected types (monthly)
    const ph = activeTypes.map((_,i) => `$${i+1}`).join(',');
    const entries = activeTypes.length > 0
      ? (await pool.query(
          `SELECT project_id, type, category, year, month, SUM(value) AS total
           FROM forecast_entries WHERE type IN (${ph})
           GROUP BY project_id, type, category, year, month
           ORDER BY project_id, type, category, year, month`,
          activeTypes)).rows
      : [];

    // 2b. Consolidated data
    const consRes = activeTypes.length > 0
      ? (await pool.query(
          `SELECT project_id, type, category, year, value
           FROM year_consolidated WHERE type IN (${ph}) AND value > 0`,
          activeTypes)).rows
      : [];

    // lookup[pid][type][cat][`Y-M`] = value
    const lookup = {};
    // First, populate with consolidated data (put in month 1)
    for (const c of consRes) {
      const pid = c.project_id;
      if (!lookup[pid]) lookup[pid] = {};
      if (!lookup[pid][c.type]) lookup[pid][c.type] = {};
      if (c.category === 'Total') {
        // Simplified consolidated: put in Contratos for display
        if (!lookup[pid][c.type]['Contratos']) lookup[pid][c.type]['Contratos'] = {};
        lookup[pid][c.type]['Contratos'][`${c.year}-1`] = parseFloat(c.value) || 0;
        // Mark this year+type as having consolidated data
        if (!lookup[pid]._consYears) lookup[pid]._consYears = new Set();
        lookup[pid]._consYears.add(`${c.year}|${c.type}`);
      } else {
        if (!lookup[pid][c.type][c.category]) lookup[pid][c.type][c.category] = {};
        lookup[pid][c.type][c.category][`${c.year}-1`] = parseFloat(c.value) || 0;
        if (!lookup[pid]._consYears) lookup[pid]._consYears = new Set();
        lookup[pid]._consYears.add(`${c.year}|${c.type}`);
      }
    }
    // Then, populate with monthly entries (skip years that have consolidated data)
    for (const e of entries) {
      if (!lookup[e.project_id]) lookup[e.project_id] = {};
      const consYears = lookup[e.project_id]._consYears;
      if (consYears && consYears.has(`${e.year}|${e.type}`)) continue; // consolidated takes precedence
      if (!lookup[e.project_id][e.type]) lookup[e.project_id][e.type] = {};
      if (!lookup[e.project_id][e.type][e.category]) lookup[e.project_id][e.type][e.category] = {};
      lookup[e.project_id][e.type][e.category][`${e.year}-${e.month}`] = parseFloat(e.total) || 0;
    }

    const CATEGORIES = ['Viagens','Contratos','POs'];

    function catTotal(pid, type, cat, y, m) {
      return lookup[pid]?.[type]?.[cat]?.[`${y}-${m}`] || 0;
    }
    function typeTotal(pid, type, y, m) {
      return CATEGORIES.reduce((s, c) => s + catTotal(pid, type, c, y, m), 0);
    }

    // 3. Build workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CTG Brasil — Forecast';
    wb.created = new Date();
    const ws = wb.addWorksheet('Forecast por Projeto');
    ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };

    // ── Helpers ──
    function cell(r, c) { return ws.getCell(r, c); }
    function setCell(r, c, value, opts = {}) {
      const cl = cell(r, c);
      cl.value     = value;
      cl.font      = { name:'Calibri', size: opts.size || 9, bold: !!opts.bold,
                       color: { argb: opts.fg || '000000' }, italic: !!opts.italic };
      cl.fill      = { type:'pattern', pattern:'solid',
                       fgColor: { argb: opts.bg || WHITE } };
      cl.alignment = { horizontal: opts.align || 'left', vertical:'middle', wrapText: !!opts.wrap };
      if (opts.numFmt) cl.numFmt = opts.numFmt;
      if (opts.border !== false) {
        cl.border = {
          top:    { style:'thin', color:{ argb:'D1D5DB' } },
          bottom: { style:'thin', color:{ argb:'D1D5DB' } },
          left:   { style:'thin', color:{ argb:'D1D5DB' } },
          right:  { style:'thin', color:{ argb:'D1D5DB' } },
        };
      }
    }

    // ── Fixed columns ──
    // 1=Código, 2=Usina, 3=Projeto/Categoria, 4=Responsável(is), 5=SI, 6=Última Atualização
    const FIXED = 6;
    // Data columns: for each year → 12 months → each type (total row) + category sub-rows per type
    // Layout: [year header] → [month sub-headers] → data rows
    // Simplified: one column per month, one ROW per type per category under each project

    // ── Build month column array ──
    const monthCols = [];
    for (let y = START_YEAR; y <= END_YEAR; y++) {
      for (let m = 1; m <= 12; m++) monthCols.push({ y, m, label: `${MONTHS_ABBR[m-1]}/${y}` });
    }
    const TOTAL_MONTHS = monthCols.length; // 72

    // ── ROW 1: Title ──
    ws.mergeCells(1, 1, 1, FIXED + TOTAL_MONTHS);
    setCell(1, 1, 'CTG Brasil — Forecast Consolidado', {
      bg: NAVY, fg: WHITE, size: 12, bold: true, align: 'center', border: false
    });
    ws.getRow(1).height = 24;

    // ── ROW 2: Fixed headers + year spans ──
    const fixedHdrs = ['Código','Usina','Projeto / Categoria','Responsável(is)','SI (R$)','Últ. Atualização'];
    fixedHdrs.forEach((h, i) => {
      setCell(2, i+1, h, { bg: NAVY, fg: WHITE, size: 9, bold: true,
        align: i >= 4 ? 'right' : 'left' });
    });

    for (let y = START_YEAR; y <= END_YEAR; y++) {
      const sc = FIXED + 1 + (y - START_YEAR) * 12;
      const ec = sc + 11;
      ws.mergeCells(2, sc, 2, ec);
      setCell(2, sc, `${y}`, { bg: SUB_BG, fg: WHITE, size: 10, bold: true, align: 'center' });
    }
    ws.getRow(2).height = 20;

    // ── ROW 3: Month labels ──
    fixedHdrs.forEach((_, i) => {
      setCell(3, i+1, '', { bg: LIGHT, fg: NAVY });
    });
    monthCols.forEach((mc, i) => {
      setCell(3, FIXED+1+i, mc.label, { bg: LIGHT, fg: NAVY, size: 8, align: 'center' });
    });
    ws.getRow(3).height = 18;

    // Freeze
    ws.views = [{ state:'frozen', xSplit: FIXED, ySplit: 3 }];

    // ── DATA ROWS ──
    let currentRow = 4;

    projects.forEach(p => {
      const plantName = (p.plants || []).join(', ') || '—';

      // Determine how many sub-rows: per selected type, per category
      // Structure:
      //   Project row (bold, navy-ish bg)
      //     Type row (colored by type, category='Total') — one per activeType
      //       Category rows (Viagens, Contratos, POs) — one per category per type

      const projRow = currentRow++;

      // Project header row
      setCell(projRow, 1, p.code,         { bg:'EBF3FC', fg: NAVY, bold:true, size:9 });
      setCell(projRow, 2, plantName,       { bg:'EBF3FC', fg: NAVY, bold:true, size:9 });
      setCell(projRow, 3, p.name,          { bg:'EBF3FC', fg: NAVY, bold:true, size:9 });
      setCell(projRow, 4, p.responsaveis || '—', { bg:'EBF3FC', fg:'374151', size:9 });
      setCell(projRow, 5, parseFloat(p.si_value)||0, { bg:'EBF3FC', fg: NAVY, bold:true, numFmt:'#,##0.00', align:'right', size:9 });
      setCell(projRow, 6, p.ultima_atualizacao
        ? new Date(p.ultima_atualizacao).toLocaleDateString('pt-BR') : '—',
        { bg:'EBF3FC', fg:'374151', align:'center', size:9 });

      // Project totals across all types per month
      monthCols.forEach((mc, i) => {
        const tot = activeTypes.reduce((s, t) => s + typeTotal(p.id, t, mc.y, mc.m), 0);
        setCell(projRow, FIXED+1+i, tot||null,
          { bg:'EBF3FC', fg: NAVY, bold:true, numFmt:'#,##0.00', align:'right', size:9 });
      });
      ws.getRow(projRow).height = 16;

      // Per type
      activeTypes.forEach(type => {
        const typeArg   = TYPE_ARGH[type] || SUB_BG;
        const typeLight = TYPE_LIGHT[type] || 'F8FAFC';
        const typeLabel = TYPE_LABELS[type] || type;

        // Type summary row
        const typeRow = currentRow++;
        setCell(typeRow, 1, '', { bg: typeLight });
        setCell(typeRow, 2, '', { bg: typeLight });
        setCell(typeRow, 3, typeLabel, { bg: typeLight, fg: typeArg, bold:true, size:8, italic:false });
        setCell(typeRow, 4, '', { bg: typeLight });
        setCell(typeRow, 5, '', { bg: typeLight });
        setCell(typeRow, 6, '', { bg: typeLight });
        monthCols.forEach((mc, i) => {
          const tot = typeTotal(p.id, type, mc.y, mc.m);
          setCell(typeRow, FIXED+1+i, tot||null,
            { bg: typeLight, fg: typeArg, bold:true, numFmt:'#,##0.00', align:'right', size:8 });
        });
        ws.getRow(typeRow).height = 14;
        ws.getRow(typeRow).outlineLevel = 1;

        // Category sub-rows
        CATEGORIES.forEach(cat => {
          const catRow = currentRow++;
          const catBg  = 'F9FAFB';
          setCell(catRow, 1, '', { bg: catBg });
          setCell(catRow, 2, '', { bg: catBg });
          setCell(catRow, 3, `    ${cat}`, { bg: catBg, fg:'6B7280', size:8, italic:true });
          setCell(catRow, 4, '', { bg: catBg });
          setCell(catRow, 5, '', { bg: catBg });
          setCell(catRow, 6, '', { bg: catBg });
          monthCols.forEach((mc, i) => {
            const v = catTotal(p.id, type, cat, mc.y, mc.m);
            setCell(catRow, FIXED+1+i, v||null,
              { bg: catBg, fg: v > 0 ? typeArg : 'CBD5E1', numFmt:'#,##0.00', align:'right', size:8 });
          });
          ws.getRow(catRow).height = 13;
          ws.getRow(catRow).outlineLevel = 2;
        });
      });
    });

    // ── TOTAL ROW ──
    const totRow = currentRow;
    setCell(totRow, 1, 'TOTAL', { bg: NAVY, fg: WHITE, bold:true, size:9 });
    setCell(totRow, 2, `${projects.length} projetos`, { bg: NAVY, fg: WHITE, size:9 });
    setCell(totRow, 3, '', { bg: NAVY });
    setCell(totRow, 4, '', { bg: NAVY });
    setCell(totRow, 5, '', { bg: NAVY });
    setCell(totRow, 6, '', { bg: NAVY });
    monthCols.forEach((mc, i) => {
      const tot = projects.reduce((s, p) =>
        s + activeTypes.reduce((ts, t) => ts + typeTotal(p.id, t, mc.y, mc.m), 0), 0);
      setCell(totRow, FIXED+1+i, tot||null,
        { bg: NAVY, fg: WHITE, bold:true, numFmt:'#,##0.00', align:'right', size:9 });
    });
    ws.getRow(totRow).height = 18;

    // ── Column widths ──
    ws.getColumn(1).width = 9;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 32;
    ws.getColumn(4).width = 22;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 16;
    for (let i = 1; i <= TOTAL_MONTHS; i++) ws.getColumn(FIXED+i).width = 11;

    const filename = `CTG_Forecast_Planejador_${new Date().getFullYear()}.xlsx`;
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(filename)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Planejador export error:', err);
    safeError(res, err);
  }
});

export default router;