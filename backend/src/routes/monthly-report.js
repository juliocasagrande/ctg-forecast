import express from 'express';
import multer  from 'multer';
import { Readable } from 'stream';
import ExcelJS from 'exceljs';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// ── Controle de acesso ────────────────────────────────────────────────────────
function requireMonthlyReportAccess(req, res, next) {
  const { role, email } = req.user;
  const allowed =
    role === 'admin' ||
    role === 'gestor' ||
    role === 'planejador' ||
    role === 'coordenador' ||
    role === 'gerente' ||
    email === 'julio.casagrande@ctgbr.com.br';
  if (!allowed)
    return res.status(403).json({ error: 'Acesso não autorizado ao relatório de acompanhamento.' });
  next();
}

// ── Upload em memória ─────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok =
      file.mimetype.includes('spreadsheet') ||
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.originalname.toLowerCase().endsWith('.xls');
    ok ? cb(null, true) : cb(new Error('Apenas arquivos Excel são aceitos.'));
  },
});

// Garante que erros do multer (fileSize, fileFilter) retornem JSON com CORS headers,
// em vez de cair no globalErrorHandler que pode devolver text/plain sem CORS.
function handleUpload(req, res, next) {
  upload.single('excel')(req, res, (err) => {
    if (err) {
      console.error('[monthly-report] Erro no upload multer:', err.message, err.code || '');
      return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    }
    next();
  });
}

// ── POST /api/monthly-report/generate ────────────────────────────────────────
router.post(
  '/generate',
  requireMonthlyReportAccess,
  handleUpload,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo Excel enviado.' });
    }


    const { mes, ano } = req.body;
    if (!mes || !ano) {
      return res.status(400).json({ error: 'Mês e ano são obrigatórios.' });
    }


    try {
      const wb = new ExcelJS.Workbook();
      const stream = Readable.from(req.file.buffer);
      await wb.xlsx.read(stream);

      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ error: 'Planilha vazia ou sem dados.' });

      // ── Lê cabeçalho da linha 1 ─────────────────────────────────────────
      const header = {};
      ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
        header[colNum] = normCol(cell.text ?? '');
      });

      function normCol(name) {
        if (!name) return '';
        return name.toString().trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }

      const COLMAP = {
        UHE:                  'uhe',
        AREA:                 'area',
        PROJ:                 'projeto/atividade',
        PROJRES:              'projeto',
        FORN:                 'fornecedor',
        GEST:                 'gestor',
        PP:                   'pp/contrato',
        VENC:                 'vencimento',
        VAL_CONTR:            'valor contrato',
        REAL_CONTR:           'realizado contrato',
        SALDO_CONTR:          'saldo contrato',
        VAL_SI:               'valor si',
        REAL_SI:              'realizado si',
        SALDO_SI:             'saldo si',
        RESUMO:               'resumo',
        NAT:                  'natureza',
        EMPRESA:              'empresa',
        REAJUSTES:            'reajustes',
        ADITIVOS:             'aditivos',
        ADITIVO_EM_ANDAMENTO: 'aditivo em andamento',
        CRONOGRAMA:           'cronograma',
      };

      const colIdx = {};
      for (const [key, target] of Object.entries(COLMAP)) {
        const found = Object.entries(header).find(([, v]) => v === target);
        if (found) colIdx[key] = parseInt(found[0]);
      }


      // ── Helpers ──────────────────────────────────────────────────────────
      function cellVal(row, key) {
        const idx = colIdx[key];
        if (!idx) return null;
        const cell = row.getCell(idx);
        if (cell.value instanceof Date) return cell.value;
        const v = cell.value;
        if (v === null || v === undefined) return null;
        const raw = (typeof v === 'object' && v !== null && 'result' in v) ? v.result : v;
        const s = String(raw ?? '').trim();
        return s === '' ? null : s;
      }

      function trat(v) {
        if (v === null || v === undefined) return '-';
        if (v instanceof Date) return fmtDateBR(v);
        const s = String(v).trim();
        return s === '' || s === 'null' ? '-' : s;
      }

      function fmtDateBR(d) {
        if (!d || !(d instanceof Date) || isNaN(d)) return '-';
        const dd   = String(d.getDate()).padStart(2, '0');
        const mm   = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
      }

      function parseDate(v) {
        if (!v) return null;
        if (v instanceof Date) return isNaN(v) ? null : v;
        const s = String(v).trim();
        const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (br) return new Date(parseInt(br[3]), parseInt(br[2]) - 1, parseInt(br[1]));
        const d = new Date(s);
        return isNaN(d) ? null : d;
      }

      function moneyToFloat(v) {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return v;
        const s = String(v).replace('R$', '').replace(/\s/g, '')
          .replace(/\./g, '').replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      }

      function fmtBRL(v) {
        const n = moneyToFloat(v);
        if (n === null) return '-';
        return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function moneyOrRaw(v) {
        if (!v || v === '-') return '-';
        const s = String(v);
        if (/[a-zA-Z+;|]/.test(s) || s.includes('  ')) return s;
        const n = moneyToFloat(s);
        return n !== null ? fmtBRL(n) : s;
      }

      function badgeAditivo(v) {
        const s = trat(v).toUpperCase().replace(/Ã/g, 'A');
        if (s === 'SIM') return "<span class='badge info'>SIM</span>";
        if (['NAO', 'NÃO', 'N', 'NAO'].includes(s)) return "<span class='badge success'>NÃO</span>";
        return trat(v);
      }

      function mdToHtml(text) {
        if (!text || text === '-') return '-';
        let s = String(text);
        s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        s = s.replace(/((?:[ \t]*\|[^\n]+\|[ \t]*(?:\n|$))+)/g, (block) => {
          const lines = block.split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('|') && l.endsWith('|'));
          if (!lines.length) return block;
          const dataLines = lines.filter(l => !/^\|[-:\s|]+\|$/.test(l));
          if (!dataLines.length) return block;
          const rows = dataLines.map((line, i) => {
            const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            const tag = i === 0 ? 'th' : 'td';
            return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
          });
          return `<table>${rows.join('')}</table>\n`;
        });
        s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        s = s.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
        s = s.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
        s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/\*(.+?)\*/g,     '<em>$1</em>');
        s = s.replace(/((?:^[ \t]*[-*] .+(?:\n|$))+)/gm, (block) => {
          const items = block.trim().split('\n')
            .map(l => `<li>${l.replace(/^[ \t]*[-*] /, '').trim()}</li>`)
            .join('');
          return `<ul>${items}</ul>\n`;
        });
        s = s.replace(/((?:^[ \t]*\d+\. .+(?:\n|$))+)/gm, (block) => {
          const items = block.trim().split('\n')
            .map(l => `<li>${l.replace(/^[ \t]*\d+\. /, '').trim()}</li>`)
            .join('');
          return `<ol>${items}</ol>\n`;
        });
        const blocks = s.split(/\n{2,}/);
        s = blocks.map(b => {
          b = b.trim();
          if (!b) return '';
          if (/^<(h[1-6]|ul|ol|table|tr|li|div|p)[\s>]/.test(b)) return b;
          return `<p>${b.replace(/\n/g, '<br>')}</p>`;
        }).filter(Boolean).join('\n');
        return s;
      }

      function areaClass(area) {
        const a = (area || '').toLowerCase();
        if (a.includes('elétr') || a.includes('eletr')) return 'el';
        if (a.includes('mecân') || a.includes('mecan')) return 'mec';
        if (a.includes('confiab')) return 'con';
        if (a.includes('civil'))  return 'civil';
        if (a.includes('automa')) return 'auto';
        return '';
      }

      function saldoClass(siVal, siSaldo) {
        const sv = moneyToFloat(siVal) ?? 0;
        const ss = moneyToFloat(siSaldo) ?? 0;
        if (sv <= 0) return '';
        if (ss < 0.1 * sv) return 'warn';
        if (ss < 0.3 * sv) return 'warn2';
        return '';
      }

      const today = new Date();
      const lim4m  = new Date(today); lim4m.setDate(lim4m.getDate()  + 120);
      const lim6m  = new Date(today); lim6m.setDate(lim6m.getDate()  + 180);
      const lim12m = new Date(today); lim12m.setDate(lim12m.getDate() + 365);

      function dueClass(d) {
        if (!d) return '';
        if (d < lim4m)  return 'due-2';
        if (d < lim6m)  return 'due-6';
        if (d < lim12m) return 'due-12';
        return '';
      }

      const rows = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const vencDate = parseDate(cellVal(row, 'VENC'));
        rows.push({
          UHE:     trat(cellVal(row, 'UHE')),
          AREA:    trat(cellVal(row, 'AREA')),
          PROJ:    trat(cellVal(row, 'PROJ')),
          PROJRES: trat(cellVal(row, 'PROJRES')),
          FORN:    trat(cellVal(row, 'FORN')),
          GEST:    trat(cellVal(row, 'GEST')),
          PP:      trat(cellVal(row, 'PP')),
          VENC:    vencDate,
          VAL:     trat(cellVal(row, 'VAL_CONTR')),
          REAL:    trat(cellVal(row, 'REAL_CONTR')),
          SALDO:   trat(cellVal(row, 'SALDO_CONTR')),
          SI:      trat(cellVal(row, 'VAL_SI')),
          REALSI:  trat(cellVal(row, 'REAL_SI')),
          SALDO_SI:trat(cellVal(row, 'SALDO_SI')),
          RESUMO:  trat(cellVal(row, 'RESUMO')),
          NAT:     trat(cellVal(row, 'NAT')),
          EMPRESA: trat(cellVal(row, 'EMPRESA')),
          REAJUSTES:           trat(cellVal(row, 'REAJUSTES')),
          ADITIVOS:            trat(cellVal(row, 'ADITIVOS')),
          ADITIVO_EM_ANDAMENTO:trat(cellVal(row, 'ADITIVO_EM_ANDAMENTO')),
          CRONOGRAMA:          trat(cellVal(row, 'CRONOGRAMA')),
        });
      });


      if (!rows.length)
        return res.status(400).json({ error: 'Nenhum dado encontrado na planilha.' });

      const prox12 = rows
        .filter(r => r.VENC && r.VENC < lim12m)
        .sort((a, b) => a.VENC - b.VENC);

      const UHE_ORDER = ['Jurumirim','Salto Grande','Rosana','Canoas 1','Canoas 2',
                         'Garibaldi','Ilha Solteira','Jupiá'];
      const grouped = {};
      for (const r of rows) {
        grouped[r.UHE] = grouped[r.UHE] || {};
        grouped[r.UHE][r.AREA] = grouped[r.UHE][r.AREA] || [];
        grouped[r.UHE][r.AREA].push(r);
      }

      const orderMap = Object.fromEntries(UHE_ORDER.map((u, i) => [u, i]));
      const uheKeys = Object.keys(grouped).sort((a, b) => {
        const ia = orderMap[a] ?? 9999, ib = orderMap[b] ?? 9999;
        return ia !== ib ? ia - ib : a.localeCompare(b);
      });

      const uheOptions = [...new Set(rows.map(r => r.UHE).filter(u => u !== '-'))]
        .sort().map(u => `<option value='${u}'>${u}</option>`).join('\n');
      const areaOptions = [...new Set(rows.map(r => r.AREA).filter(a => a !== '-'))]
        .sort().map(a => `<option value='${a}'>${a}</option>`).join('\n');

      const table12 = prox12.map(r => `
        <tr class='${dueClass(r.VENC)}' data-kind='row12' data-uhe='${r.UHE}' data-area='${r.AREA}'>
          <td>${r.PP}</td><td>${r.FORN}</td><td>${r.GEST}</td>
          <td>${fmtDateBR(r.VENC)}</td><td>${badgeAditivo(r.ADITIVO_EM_ANDAMENTO)}</td>
        </tr>`).join('\n');

      const sections = [];
      for (let ui = 0; ui < uheKeys.length; ui++) {
        const uhe = uheKeys[ui];
        sections.push(`<section data-kind='uheBlock' data-uhe='${uhe}'>`);
        sections.push(`<h2 class='section-title'>${ui + 1} — ${uhe}</h2>`);
        const areaKeys = Object.keys(grouped[uhe]);
        for (let ai = 0; ai < areaKeys.length; ai++) {
          const area  = areaKeys[ai];
          const aRows = grouped[uhe][area];
          sections.push(`<section data-kind='areaBlock' data-uhe='${uhe}' data-area='${area}'>`);
          sections.push(`<h3 class='section-title'>${ui + 1}.${ai + 1} — ${area}</h3>`);
          sections.push("<div class='grid'>");
          for (const row of aRows) {
            const cls = areaClass(row.AREA);
            const siCls = saldoClass(row.SI, row.SALDO_SI);
            const cor = { el:'#0ea5e9', mec:'#f59e0b', con:'#10b981', civil:'#ef4444', auto:'#8b5cf6' }[cls] || '#0b5cab';
            sections.push(`
<div class='card ${cls}' data-kind="card" data-uhe="${row.UHE}" data-area="${row.AREA}">
  <div class='meta'>
    <span class='pill'><i class='fas fa-landmark'></i> ${row.UHE}</span>
    <span class='pill'><i class='fas fa-tags'></i> ${row.AREA}</span>
    <span class='pill'><i class='fas fa-file-contract'></i> ${row.PP}</span>
    <span class='pill'><i class='fas fa-user-tie'></i> ${row.GEST}</span>
    <span class='pill'><i class='fas fa-industry'></i> ${row.FORN}</span>
    <span class='pill'><i class='fas fa-tag'></i> ${row.NAT}</span>
  </div>
  <h3>${row.PROJ}</h3>
  <p>${row.PROJRES}</p>
  <div class='subcard' style="border:1.5px solid ${cor}55;margin-bottom:.5rem;">
    <div class='kv' style="grid-template-columns:160px 1fr;">
      <div class='k'><i class='fas fa-calendar-alt'></i> Vencimento</div>
      <div class='v'>${fmtDateBR(row.VENC)}</div>
    </div>
  </div>
  <div class="cards-4" style="--c1:26fr;--c2:26fr;--c3:24fr;--c4:24fr;">
    <div class='subcard' style="border:1.5px solid ${cor}55;">
      <div class='subcard-header'>Contrato</div>
      <div class='kv'>
        <div class='k'><i class='fas fa-dollar-sign'></i> Valor</div><div class='v'>${moneyOrRaw(row.VAL)}</div>
        <div class='k'><i class='fas fa-check-circle'></i> Realizado</div><div class='v'>${moneyOrRaw(row.REAL)}</div>
        <div class='k'><i class='fas fa-balance-scale'></i> Saldo</div><div class='v'>${moneyOrRaw(row.SALDO)}</div>
      </div>
    </div>
    <div class='subcard' style="border:1.5px solid ${cor}55;">
      <div class='subcard-header'>SI</div>
      <div class='kv'>
        <div class='k'><i class='fas fa-wallet'></i> Valor</div><div class='v'>${moneyOrRaw(row.SI)}</div>
        <div class='k'><i class='fas fa-check-circle'></i> Realizado</div><div class='v'>${moneyOrRaw(row.REALSI)}</div>
        <div class='k'><i class='fas fa-balance-scale'></i> Saldo</div><div class='v ${siCls}'>${moneyOrRaw(row.SALDO_SI)}</div>
      </div>
    </div>
    <div class='subcard' style="border:1.5px solid ${cor}55;">
      <div class='subcard-header'>Reajustes</div>
      <div class='md-content'>${row.REAJUSTES}</div>
    </div>
    <div class='subcard' style="border:1.5px solid ${cor}55;">
      <div class='subcard-header'>Aditivos</div>
      <div class='kv'><div class='v'>${badgeAditivo(row.ADITIVOS)}</div></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:30fr 50fr;gap:16px;margin-top:.75rem;">
    <div class='subcard' style="border:1.5px solid ${cor}55;">
      <div class='subcard-header'><i class='fas fa-calendar'></i> Cronograma</div>
      <div class='md-content'>${mdToHtml(row.CRONOGRAMA)}</div>
    </div>
    <div class='subcard' style="border:1.5px solid ${cor}55;">
      <div class='subcard-header'><i class='fas fa-tasks'></i> Resumo das Atividades</div>
      <div class='md-content'>${mdToHtml(row.RESUMO)}</div>
    </div>
  </div>
</div>`);
          }
          sections.push('</div></section>');
        }
        sections.push('</section>');
      }


      const html = buildHTML({
        mesAno: `${mes} de ${ano}`,
        uheOptions, areaOptions,
        table12,
        sections: sections.join('\n'),
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition',
        `attachment; filename="Relatorio_Acompanhamento_${mes}_${ano}.html"`);
      res.send(html);

    } catch (err) {
      console.error('[monthly-report] Erro:', err);
      const msg = process.env.NODE_ENV === 'production' ? 'Erro ao processar planilha.' : err.message;
      res.status(500).json({ error: msg });
    }
  }
);

// ── Template HTML ─────────────────────────────────────────────────────────────
function buildHTML({ mesAno, uheOptions, areaOptions, table12, sections }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório Mensal — ${mesAno}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" crossorigin="anonymous">
<style>
@page{size:A3 landscape;margin:5mm;}
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
:root{--scale:.82;--base:calc(11pt*var(--scale));--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--bg:#fff;--el:#0ea5e9;--mec:#f59e0b;--con:#10b981;--civil:#ef4444;--auto:#8b5cf6;--due2:#fde2e2;--due6:#ffe8c7;--due12:#fffdf0;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:#fff;color:var(--ink);font:400 var(--base)/1.45 'Inter',system-ui,Arial;}
h1{font-size:calc(34pt*var(--scale));margin:0 0 8px;color:#0b5cab;}
h2{font-size:calc(22pt*var(--scale));margin:26px 0 12px;}
h3{font-size:calc(12pt*var(--scale));margin:8px 0;color:var(--muted);font-weight:600;}
p{margin:0 0 6px;}.lead{color:var(--muted);}.container{margin:0 5mm;}
.section-title{margin:18px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line);break-after:avoid;}
.cover{height:100vh;display:flex;flex-direction:column;justify-content:center;margin:0 15px;page-break-after:always;}
.shell{display:flex;min-height:100vh;}.main{flex:1;min-width:0;}.main .container{margin:0 5mm;}
.sidebar{width:18%;min-width:200px;max-width:320px;border-right:2px solid var(--line);background:#fbfdff;padding:12px;position:sticky;top:0;height:100vh;overflow:auto;transition:width .2s,padding .2s;}
.sidebar.collapsed{width:36px;min-width:36px;max-width:36px;padding:12px 6px;}
.sidebar.collapsed .sb-top{justify-content:center;}
.sidebar.collapsed .sb-btn{padding:6px 0;width:32px;display:flex;align-items:center;justify-content:center;}
.sidebar.collapsed .sb-title,.sidebar.collapsed .sb-group,.sidebar.collapsed .sb-hint{display:none;}
.sb-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
.sb-title{font-weight:800;color:#0b5cab;font-size:calc(11pt*var(--scale));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px;}
.sb-btn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer;color:#0b5cab;}
.sb-group{margin-top:12px;}.sb-label{font-size:calc(9.5pt*var(--scale));color:var(--muted);font-weight:700;margin:8px 0 6px;}
.sb-select{width:100%;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:#fff;font-size:calc(10pt*var(--scale));}
.sb-clear{width:100%;margin-top:10px;border:1px solid #0b5cab55;background:#0b5cab0d;color:#0b5cab;border-radius:10px;padding:8px 10px;font-weight:700;cursor:pointer;}
.sb-hint{margin-top:10px;color:var(--muted);font-size:calc(9pt*var(--scale));line-height:1.35;}
.sb-cards{display:grid;gap:10px;}
.sb-card{background:#f8fafc;border:1px solid #d1dde8;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.05);}
.sb-card-header{display:flex;align-items:center;gap:6px;padding:6px 10px;font-weight:800;font-size:calc(9pt*var(--scale));color:#0b5cab;background:#e8f2fb;border-bottom:1px solid #d1dde8;}
.sb-card-body{padding:10px 12px 12px;color:var(--muted);font-size:calc(9.2pt*var(--scale));line-height:1.35;}
table{width:100%;border-collapse:separate;border-spacing:0 6px;}
thead th{text-align:left;font-weight:700;font-size:calc(10pt*var(--scale));padding:8px 10px;background:#f8fafc;border:1px solid var(--line);border-bottom:2px solid var(--line);}
tbody td{background:#fff;border:1px solid var(--line);padding:8px 10px;font-size:calc(10pt*var(--scale));}
tr.due-2 td{background:var(--due2)!important;}tr.due-6 td{background:var(--due6)!important;}tr.due-12 td{background:var(--due12)!important;}
tr.due-2 td:first-child{border-left:6px solid #ef4444;}tr.due-6 td:first-child{border-left:6px solid #f59e0b;}tr.due-12 td:first-child{border-left:6px solid #eab308;}
.legend{background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:calc(9.5pt*var(--scale));}
.legend-title{font-weight:600;margin-bottom:6px;}.legend-items{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0;}
.legend-pill{display:inline-block;width:18px;height:10px;border-radius:4px;margin-right:4px;vertical-align:middle;}
.due-2-pill{background:var(--due2);border:1px solid #ef444433;}.due-6-pill{background:var(--due6);border:1px solid #f59e0b33;}.due-12-pill{background:var(--due12);border:1px solid #eab30833;}
.grid{display:grid;gap:10px;break-inside:avoid;}
.card{background:var(--bg);border:1px solid var(--line);border-left:6px solid var(--line);border-radius:10px;padding:10px 12px;box-shadow:0 2px 6px rgba(15,23,42,.04);break-inside:avoid;}
.card.el{border-left-color:var(--el);}.card.mec{border-left-color:var(--mec);}.card.con{border-left-color:var(--con);}.card.civil{border-left-color:var(--civil);}.card.auto{border-left-color:var(--auto);}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 2px;}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:calc(9pt*var(--scale));color:var(--muted);background:#f8fafc;border:1px solid var(--line);border-radius:999px;padding:4px 9px;}
.pill i{display:inline-block;width:1.05em;text-align:center;margin-right:.35em;}
.kv{display:grid;grid-template-columns:160px 1fr;column-gap:14px;row-gap:8px;margin:6px 0 4px;align-items:start;}
.kv .k{color:var(--muted);font-weight:600;padding:3px 0;}.kv .v{padding:3px 0;overflow-wrap:anywhere;word-break:break-word;}
.kv>:nth-child(n+3){border-top:1px dashed var(--line);}
.subcard{border-radius:8px;padding:.5rem 1rem;}.subcard-header{font-weight:700;margin-bottom:.5rem;font-size:.95rem;}
.cards-4{--c1:29fr;--c2:29fr;--c3:24fr;--c4:18fr;display:grid;grid-template-columns:minmax(0,var(--c1)) minmax(0,var(--c2)) minmax(0,var(--c3)) minmax(0,var(--c4));gap:16px;margin-top:.75rem;width:100%;min-width:0;align-items:stretch;}
.cards-4>.subcard{min-width:0;overflow:hidden;}
.warn{color:#b91c1c;}.warn2{color:#b45309;}
.badge{display:inline-block;padding:4px 10px;border-radius:999px;font-weight:700;font-size:calc(9pt*var(--scale));border:1px solid var(--line);background:#f8fafc;color:var(--ink);}
.badge.info{background:#0b5cab14;border-color:#0b5cab33;color:#0b5cab;}.badge.success{background:#10b98114;border-color:#10b98133;color:#0f5132;}
.md-content h1,.md-content h2,.md-content h3{color:#0b5cab;margin:.5rem 0 .3rem;font-size:calc(10.5pt*var(--scale));}
.md-content ul,.md-content ol{padding-left:18px;margin:4px 0;}.md-content li{margin-bottom:4px;line-height:1.4;}
.md-content p{margin:0 0 4px;}.md-content strong{font-weight:700;}.md-content em{font-style:italic;}
.md-content table{width:100%;border-collapse:collapse;margin-top:6px;font-size:calc(9.5pt*var(--scale));}
.md-content th,.md-content td{border:1px solid #e2e8f0;padding:5px 8px;text-align:left;}.md-content th{background:#f8fafc;font-weight:600;}
@media print{.sidebar{display:none!important;}.shell{display:block;}.main .container{margin:0 5mm;}}
</style>
</head>
<body>
<div class='cover'>
  <h1>Relatório Mensal<br>Acompanhamento de Projetos</h1>
  <h2>${mesAno}</h2>
  <h3 class='lead'>Relatório elaborado pela Engenharia de Manutenção</h3>
</div>
<div class="shell">
  <aside class="sidebar" id="sidebar">
    <div class="sb-top">
      <div class="sb-title"><i class="fas fa-filter"></i> Filtros</div>
      <button class="sb-btn" id="sbToggle"><i class="fas fa-filter"></i></button>
    </div>
    <div class="sb-group">
      <div class="sb-label">Usina</div>
      <select class="sb-select" id="filterUHE"><option value="">Todas</option>${uheOptions}</select>
      <div class="sb-label">Disciplina</div>
      <select class="sb-select" id="filterAREA"><option value="">Todas</option>${areaOptions}</select>
      <button class="sb-clear" id="clearFilters"><i class="fas fa-eraser"></i> Limpar filtros</button>
    </div>
    <div class="sb-group">
      <div class="sb-cards">
        <div class="sb-card"><div class="sb-card-header"><i class="fas fa-eye"></i> Exibindo</div><div class="sb-card-body"><div id="statsTotal"></div></div></div>
        <div class="sb-card"><div class="sb-card-header"><i class="fas fa-water"></i> Por Usina</div><div class="sb-card-body"><div id="statsByUHE"></div></div></div>
        <div class="sb-card"><div class="sb-card-header"><i class="fas fa-tags"></i> Por Disciplina</div><div class="sb-card-body"><div id="statsByAREA"></div></div></div>
      </div>
    </div>
  </aside>
  <main class="main"><div class='container'>
    <h2 class='section-title'>Introdução e Objetivo</h2>
    <p class='lead'>O objetivo deste relatório é apresentar a situação dos projetos em andamento na área de Engenharia da CTG Brasil. Os dados foram coletados e organizados para manter todos os integrantes atualizados sobre os processos de cada área e usina.</p>
    <h2 class='section-title'>Projetos com Vencimento nos Próximos 12 Meses</h2>
    <div class="legend">
      <div class="legend-title">Legenda de cores:</div>
      <p>Contratos/projetos com vencimento previsto para os próximos 12 meses, ordenados por data.</p>
      <div class="legend-items">
        <span class="legend-pill due-2-pill"></span> Até 4 meses — atenção imediata
        <span class="legend-pill due-6-pill"></span> De 4 a 6 meses — planejamento
        <span class="legend-pill due-12-pill"></span> De 6 a 12 meses — acompanhamento
      </div>
    </div>
    <table>
      <thead><tr><th>PP/CONTRATO</th><th>FORNECEDOR</th><th>GESTOR</th><th>VENCIMENTO</th><th>ADITIVO?</th></tr></thead>
      <tbody>${table12}</tbody>
    </table>
    ${sections}
  </div></main>
</div>
<script>
(function(){
  const sb=document.getElementById("sidebar"),tog=document.getElementById("sbToggle"),
    fU=document.getElementById("filterUHE"),fA=document.getElementById("filterAREA"),
    clr=document.getElementById("clearFilters"),sT=document.getElementById("statsTotal"),
    sU=document.getElementById("statsByUHE"),sA=document.getElementById("statsByAREA");
  function counts(list,attr){const m=new Map();list.forEach(el=>{const k=(el.getAttribute(attr)||"-").trim();m.set(k,(m.get(k)||0)+1);});return m;}
  function toHtml(m){return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([k,v])=>"• "+k+": <strong>"+v+"</strong>").join("<br>");}
  function stats(){const all=Array.from(document.querySelectorAll("[data-kind='card']")),vis=all.filter(e=>e.style.display!=="none");sT&&(sT.innerHTML="Exibindo <strong>"+vis.length+"</strong> de <strong>"+all.length+"</strong>");sU&&(sU.innerHTML=vis.length?toHtml(counts(vis,"data-uhe")):"-");sA&&(sA.innerHTML=vis.length?toHtml(counts(vis,"data-area")):"-");}
  function filter(){const u=(fU?.value||"").trim(),a=(fA?.value||"").trim();document.querySelectorAll("[data-kind='card']").forEach(el=>{el.style.display=(!u||el.getAttribute("data-uhe")===u)&&(!a||el.getAttribute("data-area")===a)?"":"none";});document.querySelectorAll("[data-kind='row12']").forEach(tr=>{tr.style.display=(!u||tr.getAttribute("data-uhe")===u)&&(!a||tr.getAttribute("data-area")===a)?"":"none";});document.querySelectorAll("[data-kind='areaBlock']").forEach(s=>{s.style.display=s.querySelector("[data-kind='card']:not([style*='display: none'])")?"":"none";});document.querySelectorAll("[data-kind='uheBlock']").forEach(s=>{s.style.display=s.querySelector("[data-kind='areaBlock']:not([style*='display: none'])")?"":"none";});stats();}
  tog?.addEventListener("click",()=>sb?.classList.toggle("collapsed"));
  fU?.addEventListener("change",filter);fA?.addEventListener("change",filter);
  clr?.addEventListener("click",()=>{fU.value="";fA.value="";filter();});
  sb?.classList.add("collapsed");filter();
})();
</script>
</body></html>`;
}

export default router;