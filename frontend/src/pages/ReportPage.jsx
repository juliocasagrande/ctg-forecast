import { useState, useCallback } from 'react';
import api from '../utils/api.js';
import { useTypeColors } from '../context/SettingsContext.jsx';

const MIN_YEAR = 2023, MAX_YEAR = new Date().getFullYear() + 3;

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  if (!v || v === 0) return 'R$ 0';
  const abs = Math.abs(parseFloat(v));
  const sig = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sig}R$ ${(abs/1_000_000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}M`;
  if (abs >= 1_000)     return `${sig}R$ ${(abs/1_000).toLocaleString('pt-BR',{maximumFractionDigits:0})}k`;
  return `${sig}R$ ${abs.toLocaleString('pt-BR',{maximumFractionDigits:0})}`;
}

const SECTION_OPTIONS = [
  { id:'kpis',       label:'Resumo Executivo',           desc:'KPIs consolidados no topo'          },
  { id:'table',      label:'Tabela Polo / Usina / Projeto', desc:'Dados financeiros hierárquicos'  },
  { id:'scurve',     label:'S-Curve por Usina',          desc:'Evolução mensal acumulada'           },
  { id:'bars',       label:'Gráfico por Projeto',        desc:'Comparativo Budget × Forecast × Realizado' },
  { id:'notes',      label:'Notas e Avisos',             desc:'Últimas anotações de cada projeto'  },
];

const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── Build the self-contained HTML report ─────────────────────────────────────
function buildHTML(data, config, C) {
  const { projects, polos, kpis, yearStart, yearEnd } = data;
  const { sections, title, subtitle, detailLevel } = config;
  const periodLabel = yearStart===yearEnd ? `${yearStart}` : `${yearStart}–${yearEnd}`;

  // Lookup helpers
  const getPlantProjects = (plant) => projects.filter(p => (p.plants||[]).includes(plant));

  function kpiCard(label, value, color, bg) {
    return `<div class="kpi-card" style="border-top:3px solid ${color};background:${bg}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value" style="color:${color}">${fmtBRL(value)}</div>
    </div>`;
  }

  // ── S-Curve chart per plant (inline Chart.js) ──
  function scurveChart(plant) {
    const pjs = getPlantProjects(plant);
    if (!pjs.length) return '';
    const months = MONTH_LABELS;
    // Aggregate monthly data across all projects in plant
    const budget = new Array(12).fill(0), forecast = new Array(12).fill(0), actual = new Array(12).fill(0);
    pjs.forEach(p => {
      const ch = p.charts?.[yearStart] || {};
      (ch.budget||[]).forEach((v,i)=>budget[i]+=v);
      (ch.forecast||[]).forEach((v,i)=>forecast[i]+=v);
      (ch.actual||[]).forEach((v,i)=>actual[i]+=v);
    });
    // Accumulate
    const acc = (arr) => arr.reduce((a,v,i)=>[...a, (a[i-1]||0)+v],[]);
    const id = `chart_${plant.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'')}`;
    return `
    <div class="chart-card">
      <div class="chart-title">S-Curve — ${plant} — ${periodLabel}</div>
      <canvas id="${id}" height="120"></canvas>
      <script>
        (function(){
          const ctx = document.getElementById('${id}').getContext('2d');
          new Chart(ctx, {
            type:'line',
            data:{
              labels:${JSON.stringify(months.map(m=>`${m}/${yearStart}`))},
              datasets:[
                {label:'Budget (acum.)',    data:${JSON.stringify(acc(budget))},   borderColor:'${C.budget}',   backgroundColor:'${C.budget}22',  borderWidth:2,fill:false,pointRadius:2,tension:0.4},
                {label:'Forecast (acum.)',  data:${JSON.stringify(acc(forecast))}, borderColor:'${C.forecast}', backgroundColor:'${C.forecast}22',borderWidth:2,fill:false,pointRadius:2,tension:0.4},
                {label:'Realizado (acum.)', data:${JSON.stringify(acc(actual))},   borderColor:'${C.actual}',   backgroundColor:'${C.actual}22',  borderWidth:2,fill:true, pointRadius:2,tension:0.4,borderDash:[5,3]},
              ]
            },
            options:{
              responsive:true,
              plugins:{legend:{labels:{font:{size:10},boxWidth:12}},tooltip:{callbacks:{label:function(c){return c.dataset.label+': R$ '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:2})}}}},
              scales:{y:{ticks:{callback:function(v){return v>=1000000?'R$'+(v/1000000).toFixed(1)+'M':v>=1000?'R$'+(v/1000).toFixed(0)+'k':'R$'+v},font:{size:9}},grid:{color:'#F1F5F9'}},x:{ticks:{font:{size:9}},grid:{display:false}}}
            }
          });
        })();
      </script>
    </div>`;
  }

  // ── Bar chart per project ──
  function barChart(plant) {
    const pjs = getPlantProjects(plant);
    if (!pjs.length) return '';
    const id = `bar_${plant.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'')}`;
    return `
    <div class="chart-card">
      <div class="chart-title">Por Projeto — ${plant}</div>
      <canvas id="${id}" height="100"></canvas>
      <script>
        (function(){
          const ctx = document.getElementById('${id}').getContext('2d');
          new Chart(ctx, {
            type:'bar',
            data:{
              labels:${JSON.stringify(pjs.map(p=>p.code))},
              datasets:[
                {label:'Budget',    data:${JSON.stringify(pjs.map(p=>parseFloat(p.budget||0)))},   backgroundColor:'${C.budget}BB'},
                {label:'Forecast',  data:${JSON.stringify(pjs.map(p=>parseFloat(p.forecast||0)))}, backgroundColor:'${C.forecast}BB'},
                {label:'Realizado', data:${JSON.stringify(pjs.map(p=>parseFloat(p.actual||0)))},   backgroundColor:'${C.actual}BB'},
              ]
            },
            options:{
              responsive:true,
              plugins:{legend:{labels:{font:{size:10},boxWidth:12}},tooltip:{callbacks:{label:function(c){return c.dataset.label+': R$ '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:2})}}}},
              scales:{y:{ticks:{callback:function(v){return v>=1000000?'R$'+(v/1000000).toFixed(1)+'M':v>=1000?'R$'+(v/1000).toFixed(0)+'k':'R$'+v},font:{size:9}},grid:{color:'#F1F5F9'}},x:{ticks:{font:{size:9}},grid:{display:false}}}
            }
          });
        })();
      </script>
    </div>`;
  }

  // ── Table rows ──
  function tableBody() {
    let html = '';
    let totBudget=0, totForecast=0, totActual=0, totActFcst=0;

    polos.forEach(polo => {
      const poloProjs = polo.plants.flatMap(pl => getPlantProjects(pl));
      if (!poloProjs.length) return;
      const pb = poloProjs.reduce((s,p)=>s+parseFloat(p.budget||0),0);
      const pf = poloProjs.reduce((s,p)=>s+parseFloat(p.forecast||0),0);
      const pa = poloProjs.reduce((s,p)=>s+parseFloat(p.actual||0),0);
      totBudget+=pb; totForecast+=pf; totActual+=pa; totActFcst+=(pa+pf);

      html += `<tr class="row-polo">
        <td colspan="2"><span class="expand-btn" onclick="toggleGroup('polo_${polo.id}')">▼</span> ${polo.name}</td>
        <td class="num c-budget">${fmtBRL(pb)}</td>
        <td class="num c-forecast">${fmtBRL(pf)}</td>
        <td class="num c-actual">${fmtBRL(pa)}</td>
        <td class="num">${fmtBRL(pa+pf)}</td>
        <td class="num ${(pf-pa)<0?'neg':''}">${fmtBRL(pf-pa)}</td>
      </tr>`;

      polo.plants.forEach(plant => {
        const plantProjs = getPlantProjects(plant);
        if (!plantProjs.length) return;
        const ub = plantProjs.reduce((s,p)=>s+parseFloat(p.budget||0),0);
        const uf = plantProjs.reduce((s,p)=>s+parseFloat(p.forecast||0),0);
        const ua = plantProjs.reduce((s,p)=>s+parseFloat(p.actual||0),0);

        html += `<tr class="row-plant group-polo_${polo.id}">
          <td></td>
          <td><span class="expand-btn" onclick="toggleGroup('plant_${plant.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'')}')">▼</span> ${plant}</td>
          <td class="num c-budget">${fmtBRL(ub)}</td>
          <td class="num c-forecast">${fmtBRL(uf)}</td>
          <td class="num c-actual">${fmtBRL(ua)}</td>
          <td class="num">${fmtBRL(ua+uf)}</td>
          <td class="num ${(uf-ua)<0?'neg':''}">${fmtBRL(uf-ua)}</td>
        </tr>`;

        if (detailLevel === 'full') {
          plantProjs.forEach(p => {
            const pKey = `plant_${plant.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'')}`;
            const vari = parseFloat(p.forecast||0) - parseFloat(p.actual||0);
            html += `<tr class="row-proj group-${pKey}">
              <td class="proj-code">${p.code}</td>
              <td>${p.name}</td>
              <td class="num c-budget">${fmtBRL(p.budget)}</td>
              <td class="num c-forecast">${fmtBRL(p.forecast)}</td>
              <td class="num c-actual">${fmtBRL(p.actual)}</td>
              <td class="num">${fmtBRL(parseFloat(p.actual||0)+parseFloat(p.forecast||0))}</td>
              <td class="num ${vari<0?'neg':''}">${fmtBRL(vari)}</td>
            </tr>`;
          });
        }
      });
    });

    html += `<tr class="row-total">
      <td colspan="2">Total Geral</td>
      <td class="num">${fmtBRL(totBudget)}</td>
      <td class="num">${fmtBRL(totForecast)}</td>
      <td class="num">${fmtBRL(totActual)}</td>
      <td class="num">${fmtBRL(totActFcst)}</td>
      <td class="num ${(totForecast-totActual)<0?'neg':''}">${fmtBRL(totForecast-totActual)}</td>
    </tr>`;
    return html;
  }

  // ── Notes section ──
  function notesSection() {
    const withNotes = projects.filter(p => p.notes?.length > 0);
    if (!withNotes.length) return '<p style="color:#94A3B8;font-size:0.85rem">Nenhuma nota registrada.</p>';
    return withNotes.map(p => `
      <div class="notes-project">
        <div class="notes-proj-header">
          <span class="notes-code">${p.code}</span>
          <span class="notes-name">${p.name}</span>
          <span class="notes-plant">${(p.plants||[]).join(', ')}</span>
        </div>
        ${p.notes.map(n=>`
          <div class="note-item">
            <div class="note-meta">${n.user_name||'—'} · ${n.note_date ? new Date(n.note_date).toLocaleDateString('pt-BR') : ''}</div>
            <div class="note-content">${n.content}</div>
          </div>`).join('')}
      </div>`).join('');
  }

  // ── Assemble full HTML ──
  const now = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title || 'Relatório CTG Brasil'}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;background:#F8FAFC;color:#1E293B;font-size:13px}
/* Header */
.report-header{background:linear-gradient(135deg,#001F5B 0%,#0070B8 100%);color:#fff;padding:32px 40px 24px;position:relative;overflow:hidden}
.report-header::after{content:'';position:absolute;bottom:-30px;right:-30px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.04)}
.report-logo{font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
.report-logo span{color:#00AEEF}
.report-title{font-size:26px;font-weight:700;margin-bottom:4px;margin-top:12px}
.report-subtitle{font-size:13px;opacity:0.75;margin-bottom:16px}
.report-meta{font-size:11px;opacity:0.55;border-top:1px solid rgba(255,255,255,0.15);padding-top:12px;margin-top:12px;display:flex;gap:24px}
/* Content */
.content{padding:28px 40px;max-width:1100px;margin:0 auto}
/* KPIs */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px}
.kpi-card{background:#fff;border-radius:10px;padding:16px 18px;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
.kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748B;margin-bottom:6px}
.kpi-value{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
/* Section headers */
.section{margin-bottom:32px}
.section-title{font-size:15px;font-weight:700;color:#001F5B;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0;display:flex;align-items:center;gap:8px}
.section-title::before{content:'';display:inline-block;width:4px;height:16px;background:#0070B8;border-radius:2px}
/* Table */
.data-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
.data-table th{background:#001F5B;color:#fff;padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;font-weight:700}
.data-table th:first-child,.data-table th:nth-child(2){text-align:left}
.data-table td{padding:7px 12px;border-bottom:1px solid #F1F5F9}
.data-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.data-table .c-budget{color:${C.budget};font-weight:600}
.data-table .c-forecast{color:${C.forecast};font-weight:600}
.data-table .c-actual{color:${C.actual};font-weight:600}
.data-table .neg{color:#DC2626!important;font-weight:600}
.row-polo{background:#0F2D6B;color:#fff;cursor:pointer}
.row-polo td{color:#fff;font-weight:700;font-size:13px}
.row-polo .c-budget{color:#86EFAC!important}
.row-polo .c-forecast{color:#BAE6FD!important}
.row-polo .c-actual{color:#C7D2FE!important}
.row-plant{background:#EBF3FC;cursor:pointer}
.row-plant td{color:#1E3A5F;font-weight:600}
.row-proj{background:#fff}
.row-proj:hover{background:#F8FAFC}
.row-total{background:#D1FAE5;font-weight:800}
.row-total td{color:#065F46;padding:10px 12px;border-top:2px solid #6EE7B7}
.proj-code{color:#0070B8;font-weight:700;font-size:11px}
.expand-btn{cursor:pointer;font-size:10px;margin-right:6px;opacity:0.6;user-select:none;display:inline-block;width:12px}
/* Charts */
.charts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:18px;margin-bottom:8px}
.chart-card{background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
.chart-title{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:12px}
/* Notes */
.notes-project{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
.notes-proj-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #F1F5F9}
.notes-code{background:#EFF6FF;color:#1E40AF;font-weight:700;font-size:11px;padding:2px 8px;border-radius:20px}
.notes-name{font-weight:600;color:#1E293B;font-size:13px}
.notes-plant{font-size:11px;color:#64748B;margin-left:auto}
.note-item{margin-bottom:10px;padding:10px 12px;background:#F8FAFC;border-radius:6px;border-left:3px solid #CBD5E1}
.note-meta{font-size:10px;color:#94A3B8;margin-bottom:4px}
.note-content{font-size:12px;color:#334155;line-height:1.5}
/* Print */
@media print{
  body{background:#fff}
  .content{padding:16px 20px}
  .chart-card{break-inside:avoid}
  .section{break-inside:avoid}
  .report-header{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:linear-gradient(135deg,#001F5B 0%,#0070B8 100%)!important}
  .row-polo{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .row-plant{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .row-total{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>

<div class="report-header">
  <div class="report-logo">CTG<span>.</span>Forecast</div>
  <div class="report-title">${title || 'Relatório de Forecast'}</div>
  ${subtitle ? `<div class="report-subtitle">${subtitle}</div>` : ''}
  <div class="report-meta">
    <span>📅 Período: ${periodLabel}</span>
    <span>🏭 ${projects.length} projetos</span>
    <span>📄 Gerado em ${now}</span>
  </div>
</div>

<div class="content">

${sections.includes('kpis') ? `
<div class="section">
  <div class="section-title">Resumo Executivo</div>
  <div class="kpi-grid">
    ${kpiCard('Budget',   kpis.budget,   C.budget,   '#F0FDF4')}
    ${kpiCard('Forecast', kpis.forecast, C.forecast, '#F0F9FF')}
    ${kpiCard('Realizado',kpis.actual,   C.actual,   '#EFF6FF')}
    ${kpiCard('ACT + Forecast', kpis.actual+kpis.forecast, '#475569','#F8FAFC')}
    ${kpiCard('Pool',     kpis.pool,     C.pool,     '#F0F9FF')}
  </div>
</div>` : ''}

${sections.includes('table') ? `
<div class="section">
  <div class="section-title">Visão por Polo / Usina / Projeto</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width:70px">Código</th>
        <th>Empresa / Usina / Projeto</th>
        <th>Budget</th><th>Forecast</th><th>Realizado</th>
        <th>ACT+Fcst</th><th>Variação</th>
      </tr>
    </thead>
    <tbody>${tableBody()}</tbody>
  </table>
</div>` : ''}

${sections.includes('scurve') ? `
<div class="section">
  <div class="section-title">S-Curve por Usina — Evolução Mensal</div>
  <div class="charts-grid">
    ${polos.flatMap(polo => polo.plants.filter(pl => getPlantProjects(pl).length > 0).map(pl => scurveChart(pl))).join('')}
  </div>
</div>` : ''}

${sections.includes('bars') ? `
<div class="section">
  <div class="section-title">Comparativo por Projeto</div>
  <div class="charts-grid">
    ${polos.flatMap(polo => polo.plants.filter(pl => getPlantProjects(pl).length > 0).map(pl => barChart(pl))).join('')}
  </div>
</div>` : ''}

${sections.includes('notes') ? `
<div class="section">
  <div class="section-title">Notas e Avisos</div>
  ${notesSection()}
</div>` : ''}

</div>

<script>
function toggleGroup(cls) {
  document.querySelectorAll('.group-'+cls).forEach(function(row){
    row.style.display = row.style.display==='none' ? '' : 'none';
  });
}
// Default: hide project rows (polo+usina expanded, projects collapsed)
${detailLevel !== 'full' ? `
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('.row-proj').forEach(function(r){r.style.display='none';});
});` : ''}
<\/script>
</body>
</html>`;
}

// ── React Page ────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const C = useTypeColors();
  const currentYear = new Date().getFullYear();

  const [config, setConfig] = useState({
    title:       'Relatório de Forecast — CTG Brasil',
    subtitle:    '',
    yearStart:   currentYear,
    yearEnd:     currentYear,
    sections:    ['kpis','table','scurve','bars','notes'],
    detailLevel: 'polo-usina', // 'polo-usina' | 'full'
  });
  const [loading,    setLoading]    = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [generated,  setGenerated]  = useState(false);

  const upd = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));
  const toggleSection = (id) => setConfig(prev => ({
    ...prev,
    sections: prev.sections.includes(id)
      ? prev.sections.filter(s => s !== id)
      : [...prev.sections, id],
  }));

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/report/data?yearStart=${config.yearStart}&yearEnd=${config.yearEnd}`);
      const html = buildHTML(r.data, {
        ...config,
        detailLevel: config.detailLevel === 'full' ? 'full' : 'polo-usina',
      }, C);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      if (previewSrc) URL.revokeObjectURL(previewSrc);
      setPreviewSrc(url);
      setGenerated(true);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar relatório.');
    } finally { setLoading(false); }
  }, [config, C]);

  const download = () => {
    if (!previewSrc) return;
    const a = document.createElement('a');
    a.href     = previewSrc;
    a.download = `CTG_Forecast_${config.yearStart}${config.yearEnd!==config.yearStart?`-${config.yearEnd}`:''}.html`;
    a.click();
  };

  const print = () => {
    document.getElementById('report-preview-frame')?.contentWindow?.print();
  };

  return (
    <div style={{ display:'flex', gap:18, height:'calc(100vh - 80px)', minHeight:0 }}>

      {/* ── LEFT PANEL: config ── */}
      <div style={{
        width:300, flexShrink:0, display:'flex', flexDirection:'column', gap:14,
        overflowY:'auto', paddingRight:4,
      }}>

        {/* Title & Subtitle */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div className="card-title" style={{ marginBottom:12 }}>📝 Identificação</div>
          <label style={{ display:'block', marginBottom:10 }}>
            <div style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase',
              letterSpacing:'0.07em', color:'var(--text-muted)', marginBottom:5 }}>Título</div>
            <input className="form-input" value={config.title}
              onChange={e => upd('title', e.target.value)}
              style={{ width:'100%', padding:'7px 10px' }} />
          </label>
          <label style={{ display:'block' }}>
            <div style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase',
              letterSpacing:'0.07em', color:'var(--text-muted)', marginBottom:5 }}>Subtítulo (opcional)</div>
            <input className="form-input" value={config.subtitle}
              placeholder="Ex.: Reunião de Gestão — Mar/2026"
              onChange={e => upd('subtitle', e.target.value)}
              style={{ width:'100%', padding:'7px 10px' }} />
          </label>
        </div>

        {/* Period */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div className="card-title" style={{ marginBottom:12 }}>📅 Período</div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <label style={{ flex:1 }}>
              <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'0.07em', color:'var(--text-muted)', marginBottom:4 }}>De</div>
              <select className="form-input" value={config.yearStart}
                onChange={e => upd('yearStart', parseInt(e.target.value))}
                style={{ width:'100%' }}>
                {Array.from({length:MAX_YEAR-MIN_YEAR+1},(_,i)=>MIN_YEAR+i).map(y=>(
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label style={{ flex:1 }}>
              <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'0.07em', color:'var(--text-muted)', marginBottom:4 }}>Até</div>
              <select className="form-input" value={config.yearEnd}
                onChange={e => upd('yearEnd', parseInt(e.target.value))}
                style={{ width:'100%' }}>
                {Array.from({length:MAX_YEAR-MIN_YEAR+1},(_,i)=>MIN_YEAR+i).filter(y=>y>=config.yearStart).map(y=>(
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Sections */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div className="card-title" style={{ marginBottom:12 }}>📋 Seções</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {SECTION_OPTIONS.map(opt => {
              const sel = config.sections.includes(opt.id);
              return (
                <label key={opt.id} style={{
                  display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px',
                  borderRadius:'var(--radius-sm)', cursor:'pointer',
                  background: sel ? 'var(--ctg-light)' : 'var(--bg-app)',
                  border: `1.5px solid ${sel ? 'var(--ctg-blue)' : 'var(--border)'}`,
                  transition:'all 0.15s',
                }}>
                  <input type="checkbox" checked={sel} onChange={()=>toggleSection(opt.id)}
                    style={{ marginTop:2, accentColor:'var(--ctg-blue)', flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:'0.82rem', fontWeight:600,
                      color: sel ? 'var(--ctg-navy)' : 'var(--text-secondary)' }}>{opt.label}</div>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:1 }}>{opt.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Detail level */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div className="card-title" style={{ marginBottom:12 }}>🔍 Nível de Detalhe (Tabela)</div>
          {[
            { id:'polo-usina', label:'Polo + Usina', desc:'Projetos colapsados por padrão' },
            { id:'full',       label:'Polo + Usina + Projeto', desc:'Todos os projetos expandidos' },
          ].map(opt => {
            const sel = config.detailLevel === opt.id;
            return (
              <label key={opt.id} style={{
                display:'flex', alignItems:'flex-start', gap:10, padding:'8px 10px',
                borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:8,
                background: sel ? 'var(--ctg-light)' : 'var(--bg-app)',
                border: `1.5px solid ${sel ? 'var(--ctg-blue)' : 'var(--border)'}`,
                transition:'all 0.15s',
              }}>
                <input type="radio" checked={sel} onChange={()=>upd('detailLevel',opt.id)}
                  style={{ marginTop:2, accentColor:'var(--ctg-blue)', flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:'0.82rem', fontWeight:600,
                    color: sel ? 'var(--ctg-navy)' : 'var(--text-secondary)' }}>{opt.label}</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:1 }}>{opt.desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Actions */}
        <button className="btn btn-primary" onClick={generate} disabled={loading}
          style={{ width:'100%', justifyContent:'center', padding:'10px', fontSize:'0.88rem' }}>
          {loading ? '⏳ Gerando...' : '▶ Gerar Relatório'}
        </button>

        {generated && (
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-export" onClick={download}
              style={{ flex:1, justifyContent:'center' }}>
              ⬇ Baixar .html
            </button>
            <button className="btn btn-secondary" onClick={print}
              style={{ flex:1, justifyContent:'center' }}>
              🖨 Imprimir
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: preview ── */}
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
        <div className="card" style={{ flex:1, minHeight:0, overflow:'hidden', padding:0 }}>
          {previewSrc ? (
            <iframe
              id="report-preview-frame"
              src={previewSrc}
              style={{ width:'100%', height:'100%', border:'none' }}
              title="Preview do relatório"
            />
          ) : (
            <div style={{
              height:'100%', display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:16,
              color:'var(--text-muted)',
            }}>
              <div style={{ fontSize:'3rem', opacity:0.25 }}>📊</div>
              <div style={{ fontSize:'0.9rem', fontWeight:600, opacity:0.5 }}>
                Configure as opções e clique em "Gerar Relatório"
              </div>
              <div style={{ fontSize:'0.78rem', opacity:0.35 }}>
                O preview aparecerá aqui
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
