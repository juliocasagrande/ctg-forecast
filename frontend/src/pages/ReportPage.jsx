import { useState, useCallback } from 'react';
import api from '../utils/api.js';
import { useRole } from '../context/AuthContext.jsx';
import { useTypeColors, useSettings } from '../context/SettingsContext.jsx';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  if (!v || v === 0) return 'R$ 0,00';
  const abs = Math.abs(parseFloat(v));
  const sig = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sig}R$ ${(abs/1_000_000).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}M`;
  if (abs >= 1_000)     return `${sig}R$ ${(abs/1_000).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}k`;
  return `${sig}R$ ${abs.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

const SECTION_OPTIONS = [
  { id:'kpis',   label:'KPIs + S-Curves',              desc:'Hierarquia: Geral → Usina → Projeto' },
  { id:'table',  label:'Tabela Polo / Usina / Projeto', desc:'Dados financeiros hierárquicos'      },
];

const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── Build the self-contained HTML report ─────────────────────────────────────
function buildHTML(data, config, C) {
  const { projects, polos, kpis, yearStart, yearEnd } = data;
  const { sections, title, subtitle, detailLevel } = config;
  const periodLabel = yearStart===yearEnd ? `${yearStart}` : `${yearStart}–${yearEnd}`;
  const showProjects = detailLevel === 'full';

  const getPlantProjects = (plant) => projects.filter(p => (p.plants||[]).includes(plant));

  // ── KPI card helpers ──────────────────────────────────────────────────────
  function kpiCard(label, value, color, bg, size) {
    const s = size || 'md';
    const valSize = s==='lg' ? '22px' : s==='sm' ? '13px' : '17px';
    const lblSize = s==='lg' ? '10px' : s==='sm' ? '8px'  : '9px';
    const pad     = s==='lg' ? '16px 18px' : s==='sm' ? '8px 10px' : '12px 14px';
    return `<div class="kpi-card" style="border-top:3px solid ${color};background:${bg};padding:${pad}">
      <div class="kpi-label" style="font-size:${lblSize}">${label}</div>
      <div class="kpi-value" style="color:${color};font-size:${valSize}">${fmtBRL(value)}</div>
    </div>`;
  }

  function kpiRow(pjs, size) {
    const sz = size || 'md';
    const pb = pjs.reduce((s,p)=>s+parseFloat(p.budget||0),0);
    const pf = pjs.reduce((s,p)=>s+parseFloat(p.forecast||0),0);
    const pa = pjs.reduce((s,p)=>s+parseFloat(p.actual||0),0);
    const pp = pjs.reduce((s,p)=>s+parseFloat(p.pool||0),0);
    return `<div class="kpi-grid">
      ${kpiCard('Budget',    pb,    C.budget,   '#F0FDF4', sz)}
      ${kpiCard('Forecast',  pf,    C.forecast, '#F0F9FF', sz)}
      ${kpiCard('Realizado', pa,    C.actual,   '#EFF6FF', sz)}
      ${kpiCard('ACT+Fcst',  pa+pf, '#475569',  '#F8FAFC', sz)}
      ${kpiCard('Pool',      pp,    C.pool,     '#F0F9FF', sz)}
    </div>`;
  }

  // ── S-Curve ───────────────────────────────────────────────────────────────
  function scurve(id, titleTxt, pjs, height) {
    const h = height || 110;
    const allLabels = [], allB = [], allF = [], allA = [], allAF = [], allP = [];
    for (let y = yearStart; y <= yearEnd; y++) {
      MONTH_LABELS.forEach((m, mi) => {
        allLabels.push(m+'/'+y);
        let b=0,f=0,a=0,p=0;
        pjs.forEach(function(pr) {
          const ch = pr.charts&&pr.charts[y] ? pr.charts[y] : {};
          b+=(ch.budget&&ch.budget[mi])||0;
          f+=(ch.forecast&&ch.forecast[mi])||0;
          a+=(ch.actual&&ch.actual[mi])||0;
          p+=(ch.pool&&ch.pool[mi])||0;
        });
        allB.push(b); allF.push(f); allA.push(a); allP.push(p);
        allAF.push(a > 0 ? a : f);
      });
    }
    const acc = function(arr){return arr.reduce(function(a,v,i){return a.concat([(a[i-1]||0)+v]);},[]); };
    const hasData = allB.some(function(v){return v>0;})||allF.some(function(v){return v>0;})||allA.some(function(v){return v>0;});
    if (!hasData) return '';
    const safeId = id.replace(/[^a-zA-Z0-9_]/g,'_');
    const labelsJson = JSON.stringify(allLabels);
    const bJson  = JSON.stringify(acc(allB));
    const fJson  = JSON.stringify(acc(allF));
    const aJson  = JSON.stringify(acc(allA));
    const afJson = JSON.stringify(acc(allAF));
    const pJson  = JSON.stringify(acc(allP));
    const cb = C.budget, cf = C.forecast, ca = C.actual, cp = C.pool||'#0891B2';
    const hasPool = allP.some(function(v){return v>0;});
    let ds = '[';
    ds += '{label:"Budget (acum.)",data:'+bJson+',borderColor:"'+cb+'",backgroundColor:"'+cb+'22",borderWidth:2,fill:false,pointRadius:0,tension:0.25},';
    ds += '{label:"Forecast (acum.)",data:'+fJson+',borderColor:"'+cf+'",backgroundColor:"'+cf+'22",borderWidth:2,fill:false,pointRadius:0,tension:0.25},';
    ds += '{label:"Realizado (acum.)",data:'+aJson+',borderColor:"'+ca+'",backgroundColor:"'+ca+'22",borderWidth:2,fill:true,pointRadius:0,tension:0.25,borderDash:[5,3]},';
    ds += '{label:"ACT+Forecast",data:'+afJson+',borderColor:"#475569",backgroundColor:"#47556922",borderWidth:2,fill:false,pointRadius:0,tension:0.25,borderDash:[3,2]},';
    if (hasPool) { ds += '{label:"Pool (acum.)",data:'+pJson+',borderColor:"'+cp+'",backgroundColor:"'+cp+'22",borderWidth:1.5,fill:false,pointRadius:0,tension:0.25,borderDash:[6,4]},'; }
    ds += ']';
    return '<div class="chart-card">'      +'<div class="chart-title">'+titleTxt+'</div>'      +'<canvas id="'+safeId+'" height="'+h+'"></canvas>'      +'<script>(function(){'      +'var ctx=document.getElementById("'+safeId+'").getContext("2d");'      +'new Chart(ctx,{type:"line",data:{labels:'+labelsJson+',datasets:'+ds+'},'      +'options:{responsive:true,plugins:{legend:{labels:{font:{size:9},boxWidth:10}},tooltip:{callbacks:{label:function(c){return c.dataset.label+": R$ "+c.raw.toLocaleString("pt-BR",{minimumFractionDigits:2});}}}},'      +'scales:{y:{ticks:{callback:function(v){return v>=1000000?"R$"+(v/1000000).toFixed(1)+"M":v>=1000?"R$"+(v/1000).toFixed(0)+"k":"R$"+v;},font:{size:8}},grid:{color:"#F1F5F9"}},x:{ticks:{font:{size:8},maxRotation:45},grid:{display:false}}}}});'      +'})();<\/script>'      +'</div>';
  }

  // ── Bar chart per plant ───────────────────────────────────────────────────

  // ── Table rows ────────────────────────────────────────────────────────────
  function tableBody() {
    let html = '';
    let totBudget=0, totPool=0, totActual=0, totForecast=0, totActFcst=0;
    polos.forEach(function(polo) {
      const poloProjs = polo.plants.reduce(function(a,pl){return a.concat(getPlantProjects(pl));},[]);
      if (!poloProjs.length) return;
      const pb  = poloProjs.reduce(function(s,p){return s+parseFloat(p.budget||0);},0);
      const pp  = poloProjs.reduce(function(s,p){return s+parseFloat(p.pool||0);},0);
      const pa  = poloProjs.reduce(function(s,p){return s+parseFloat(p.actual||0);},0);
      const pf  = poloProjs.reduce(function(s,p){return s+parseFloat(p.forecast||0);},0);
      const paf = poloProjs.reduce(function(s,p){return s+(p.act_forecast||0);},0);
      totBudget+=pb; totPool+=pp; totActual+=pa; totForecast+=pf; totActFcst+=paf;
      html+='<tr class="row-polo"><td colspan="2"><span class="expand-btn" onclick="toggleGroup(\'polo_'+polo.id+'\')">▼</span> '+polo.name+'</td>'
        +'<td class="num c-budget">'+fmtBRL(pb)+'</td><td class="num" style="color:#EF4444">'+fmtBRL(pp)+'</td>'
        +'<td class="num c-actual">'+fmtBRL(pa)+'</td><td class="num c-forecast">'+fmtBRL(pf)+'</td>'
        +'<td class="num">'+fmtBRL(paf)+'</td><td class="num '+(pb-paf<0?'neg':'')+'">'+fmtBRL(pb-paf)+'</td></tr>';
      polo.plants.forEach(function(plant) {
        const plantProjs = getPlantProjects(plant);
        if (!plantProjs.length) return;
        const ub  = plantProjs.reduce(function(s,p){return s+parseFloat(p.budget||0);},0);
        const up  = plantProjs.reduce(function(s,p){return s+parseFloat(p.pool||0);},0);
        const ua  = plantProjs.reduce(function(s,p){return s+parseFloat(p.actual||0);},0);
        const uf  = plantProjs.reduce(function(s,p){return s+parseFloat(p.forecast||0);},0);
        const uaf = plantProjs.reduce(function(s,p){return s+(p.act_forecast||0);},0);
        const plantKey='plant_'+plant.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
        html+='<tr class="row-plant group-polo_'+polo.id+'"><td></td>'
          +'<td><span class="expand-btn" onclick="toggleGroup(\''+plantKey+'\')">▼</span> '+plant+'</td>'
          +'<td class="num c-budget">'+fmtBRL(ub)+'</td><td class="num" style="color:#EF4444">'+fmtBRL(up)+'</td>'
          +'<td class="num c-actual">'+fmtBRL(ua)+'</td><td class="num c-forecast">'+fmtBRL(uf)+'</td>'
          +'<td class="num">'+fmtBRL(uaf)+'</td><td class="num '+(ub-uaf<0?'neg':'')+'">'+fmtBRL(ub-uaf)+'</td></tr>';
        if (showProjects) {
          plantProjs.forEach(function(p) {
            // Pular projetos sem dados no período
            const projB=parseFloat(p.budget||0), projF=parseFloat(p.forecast||0), projA=parseFloat(p.actual||0);
            if (projB===0 && projF===0 && projA===0) return;
            const projAF=p.act_forecast||0;
            html+='<tr class="row-proj group-'+plantKey+'"><td class="proj-code">'+p.code+'</td><td>'+p.name+'</td>'
              +'<td class="num c-budget">'+fmtBRL(p.budget)+'</td><td class="num" style="color:#EF4444">'+fmtBRL(p.pool)+'</td>'
              +'<td class="num c-actual">'+fmtBRL(p.actual)+'</td><td class="num c-forecast">'+fmtBRL(p.forecast)+'</td>'
              +'<td class="num">'+fmtBRL(projAF)+'</td><td class="num '+(projB-projAF<0?'neg':'')+'">'+fmtBRL(projB-projAF)+'</td></tr>';
          });
        }
      });
    });
    const totVar=totBudget-totActFcst;
    html+='<tr class="row-total"><td colspan="2">Total Geral</td>'
      +'<td class="num">'+fmtBRL(totBudget)+'</td><td class="num">'+fmtBRL(totPool)+'</td>'
      +'<td class="num">'+fmtBRL(totActual)+'</td><td class="num">'+fmtBRL(totForecast)+'</td>'
      +'<td class="num">'+fmtBRL(totActFcst)+'</td><td class="num '+(totVar<0?'neg':'')+'">'+fmtBRL(totVar)+'</td></tr>';
    return html;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // Renderiza notas de um projeto individual (logo abaixo da S-Curve do projeto)
  function projectNotes(p) {
    if (!p.notes || !p.notes.length) return '';
    const items = p.notes.map(function(n){
      return '<div class="note-item">'
        +'<div class="note-meta">'+(n.user_name||'—')+' · '+(n.note_date?new Date(n.note_date).toLocaleDateString('pt-BR'):'')+' </div>'
        +'<div class="note-content">'+n.content+'</div>'
        +'</div>';
    }).join('');
    return '<div class="proj-notes-block">'
      +'<div class="proj-notes-label">Notas e Avisos</div>'
      +items
      +'</div>';
  }


  // ── KPIs + S-Curves hierárquico ───────────────────────────────────────────
  // Estrutura:
  //   KPIs Gerais (lg)
  //   Tabela Geral
  //   S-Curve Geral
  //   [por usina]:
  //     KPIs da Usina (md)
  //     S-Curve da Usina
  //     [por projeto, se showProjects]:
  //       KPIs do Projeto (sm)
  //       S-Curve do Projeto
  function hierSection() {
    let html = '';

    // ── 1. KPIs Gerais ──
    html += '<div class="section hier-block">'
      +'<div class="section-title">KPIs Gerais</div>'
      +'<div class="kpi-grid">'
      +kpiCard('Budget',    kpis.budget,   C.budget,   '#F0FDF4','lg')
      +kpiCard('Forecast',  kpis.forecast, C.forecast, '#F0F9FF','lg')
      +kpiCard('Realizado', kpis.actual,   C.actual,   '#EFF6FF','lg')
      +kpiCard('ACT+Fcst',  kpis.actual+kpis.forecast,'#475569','#F8FAFC','lg')
      +kpiCard('Pool',      kpis.pool,     C.pool,     '#F0F9FF','lg')
      +'</div></div>';

    // ── 2. Tabela Geral ──
    if (sections.includes('table')) {
      html += '<div class="section">'
        +'<div class="section-title">Tabela Geral — Polo / Usina'+(showProjects?' / Projeto':'')+'</div>'
        +'<table class="data-table"><thead><tr>'
        +'<th style="width:70px">Código</th><th>Empresa / Usina / Projeto</th>'
        +'<th>Budget</th><th style="color:#EF4444">Pool</th><th>Realizado</th>'
        +'<th>Forecast</th><th>ACT+Fcst</th><th>Variação</th>'
        +'</tr></thead><tbody>'+tableBody()+'</tbody></table></div>';
    }

    // ── 3. S-Curve Geral ──
    html += '<div class="section hier-block">'
      +'<div class="section-title">S-Curve Geral</div>'
      +'<div class="charts-grid charts-grid-1">'
      +scurve('scurve_global','S-Curve Consolidada — Todos os Projetos — '+periodLabel,projects,110)
      +'</div></div>';

    // ── 4. Por usina ──
    // Estrutura de cada usina:
    //   [hier-block hier-plant]
    //     Cabeçalho da usina (nome + polo)
    //     KPIs da usina
    //     S-Curve da usina
    //     [se showProjects] Para cada projeto:
    //       Separador com nome do projeto
    //       KPIs do projeto (sm)
    //       S-Curve do projeto
    //       Notas do projeto (se houver)
    //   [/hier-block]
    polos.forEach(function(polo) {
      polo.plants.forEach(function(plant) {
        const pjs = getPlantProjects(plant);
        if (!pjs.length) return;

        // Verificar se a usina tem algum dado no período
        const plantHasData = pjs.some(function(p){
          return parseFloat(p.budget||0)>0 || parseFloat(p.forecast||0)>0 || parseFloat(p.actual||0)>0;
        });
        if (!plantHasData) return;

        // Abre o bloco da usina
        html += '<div class="section hier-block hier-plant">';

        // Cabeçalho da usina
        html += '<div class="hier-plant-header">'
          +'<span class="hier-plant-name">'+plant+'</span>'
          +'<span class="hier-polo-badge">'+polo.name+'</span>'
          +'</div>';

        // KPIs da usina
        html += kpiRow(pjs,'md');

        // S-Curve da usina
        html += '<div class="charts-grid charts-grid-1" style="margin-top:16px">'
          +scurve('scurve_'+plant,'S-Curve — '+plant+' — '+periodLabel,pjs,80)
          +'</div>';

        // Por projeto (apenas se showProjects)
        if (showProjects) {
          pjs.forEach(function(p) {
            const charts = p.charts || {};
            const keys = Object.keys(charts);
            let hasData = false;
            for (let i=0; i<keys.length; i++){
              const yr = charts[keys[i]];
              const all = [].concat(yr.budget||[], yr.forecast||[], yr.actual||[]);
              if (all.some(function(v){return v>0;})) { hasData=true; break; }
            }
            if (!hasData) return;

            // Separador do projeto
            html += '<div class="proj-separator">'
              +'<span class="proj-sep-code">'+p.code+'</span>'
              +'<span class="proj-sep-name">'+p.name+'</span>'
              +'</div>';

            // KPIs do projeto
            html += '<div class="section-label-sm" style="font-size:9px;margin-top:8px">KPIs — '+p.code+'</div>'
              +kpiRow([p],'sm');

            // S-Curve do projeto
            html += '<div class="charts-grid charts-grid-1" style="margin-top:12px">'
              +scurve('scurve_proj_'+p.id,p.code+' — '+p.name,[p],65)
              +'</div>';

            // Notas do projeto logo abaixo da S-Curve
            html += projectNotes(p);
          });
        }

        // Fecha o bloco da usina
        html += '</div>';
      });
    });

    return html;
  }
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
.report-header{background:linear-gradient(135deg,#001F5B 0%,#0070B8 100%);color:#fff;padding:32px 40px 24px}
.report-logo{font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
.report-logo span{color:#00AEEF}
.report-title{font-size:26px;font-weight:700;margin-bottom:4px;margin-top:12px}
.report-subtitle{font-size:13px;opacity:0.75;margin-bottom:16px}
.report-meta{font-size:11px;opacity:0.55;border-top:1px solid rgba(255,255,255,0.15);padding-top:12px;margin-top:12px;display:flex;gap:24px;flex-wrap:wrap}
.content{padding:28px 40px;max-width:1100px;margin:0 auto}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}
.kpi-card{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
.kpi-label{font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748B;margin-bottom:5px}
.kpi-value{font-weight:800;font-variant-numeric:tabular-nums}
.section{margin-bottom:20px}
.section-title{font-size:15px;font-weight:700;color:#001F5B;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0;display:flex;align-items:center;gap:8px}
.section-title::before{content:'';display:inline-block;width:4px;height:16px;background:#0070B8;border-radius:2px}
.section-label-sm{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;margin-bottom:8px}
.hier-block{background:#fff;border-radius:12px;padding:18px 20px;box-shadow:0 1px 6px rgba(0,0,0,0.06);margin-bottom:14px}
.hier-plant{border-left:4px solid #0070B8}
.hier-plant-chart{border-left:4px solid #0070B830;padding-left:20px}
.hier-plant-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #E2E8F0}

.hier-plant-name{font-size:15px;font-weight:800;color:#001F5B}
.hier-polo-badge{margin-left:auto;font-size:10px;background:#EBF3FC;color:#0070B8;padding:3px 10px;border-radius:20px;font-weight:600}
.proj-separator{display:flex;align-items:center;gap:10px;margin:18px 0 10px;padding:8px 12px;border-top:1px solid #E2E8F0;background:#F1F5F9;border-radius:6px}
.proj-sep-code{font-size:11px;font-weight:700;background:#EFF6FF;color:#1E40AF;padding:2px 8px;border-radius:20px;flex-shrink:0}
.proj-sep-name{font-size:13px;font-weight:600;color:#1E293B}
.data-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
.data-table th{background:#001F5B;color:#fff;padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;font-weight:700}
.data-table th:first-child,.data-table th:nth-child(2){text-align:left}
.data-table td{padding:7px 12px;border-bottom:1px solid #F1F5F9}
.data-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.data-table .c-budget{color:${C.budget};font-weight:600}
.data-table .c-forecast{color:${C.forecast};font-weight:600}
.data-table .c-actual{color:${C.actual};font-weight:600}
.data-table .neg{color:#DC2626!important;font-weight:600}
.row-polo{background:#0F2D6B;cursor:pointer}
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
.charts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:16px;margin-bottom:8px}
.charts-grid-1{grid-template-columns:1fr!important}
.chart-card{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
.chart-title{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px}
.notes-project{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
.notes-proj-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #F1F5F9}
.notes-code{background:#EFF6FF;color:#1E40AF;font-weight:700;font-size:11px;padding:2px 8px;border-radius:20px}
.notes-name{font-weight:600;color:#1E293B;font-size:13px}
.notes-plant{font-size:11px;color:#64748B;margin-left:auto}
.note-item{margin-bottom:10px;padding:10px 12px;background:#F8FAFC;border-radius:6px;border-left:3px solid #CBD5E1}
.note-meta{font-size:10px;color:#94A3B8;margin-bottom:4px}
.note-content{font-size:12px;color:#334155;line-height:1.5}
.proj-notes-block{margin-top:12px;padding-top:12px;border-top:1px solid #E2E8F0}
.proj-notes-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;margin-bottom:8px}
@media print{
  body{background:#fff}
  .content{padding:16px 20px}
  .hier-block{break-inside:avoid}
  .chart-card{break-inside:avoid}
  .report-header,.row-polo,.row-plant,.row-total,.hier-plant{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="report-header">
  <div class="report-logo">CTG<span>.</span>Forecast</div>
  <div class="report-title">${title || 'Relatório de Forecast'}</div>
  ${subtitle ? `<div class="report-subtitle">${subtitle}</div>` : ''}
  <div class="report-meta">
    <span>Período: ${periodLabel}</span>
    <span>${projects.length} projetos</span>
    <span>${showProjects ? 'Polo + Usina + Projeto' : 'Polo + Usina'}</span>
    <span>Gerado em ${now}</span>
  </div>
</div>
<div class="content">
${sections.includes('kpis') ? hierSection() : ''}

</div>
<script>
function toggleGroup(cls){document.querySelectorAll('.group-'+cls).forEach(function(r){r.style.display=r.style.display==='none'?'':'none';});}
${!showProjects ? "document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.row-proj').forEach(function(r){r.style.display='none';});});" : ''}
<\/script>
</body>
</html>`;
}


// ── React Page ────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const C = useTypeColors();
  const settings = useSettings();
  const { isEngenheiro } = useRole();
  const activeStart = parseInt(settings.active_year_start) || 2026;
  const activeEnd   = parseInt(settings.active_year_end)   || 2031;
  const MIN_YEAR = activeStart - 1;
  const MAX_YEAR = activeEnd;
  const currentYear = new Date().getFullYear();

  const [config, setConfig] = useState({
    title:       'Relatório de Engenharia — CTG Brasil',
    subtitle:    '',
    yearStart:   currentYear,
    yearEnd:     currentYear,
    sections:    ['kpis','table','scurve','bars','notes'],
    detailLevel: 'full', // 'polo-usina' | 'full'
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
          {isEngenheiro && (
            <div style={{
              marginTop:10, padding:'8px 10px', borderRadius:'var(--radius-sm)',
              background:'#EFF6FF', borderLeft:'3px solid var(--ctg-blue)',
              fontSize:'0.75rem', color:'#1E40AF', lineHeight:1.5,
            }}>
              ℹ Você verá apenas os projetos atribuídos a você.
            </div>
          )}
        </div>

        {/* Period */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div className="card-title" style={{ marginBottom:12 }}>Período</div>
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
          <div className="card-title" style={{ marginBottom:12 }}>Nível de Detalhe</div>
          {[
            { id:'polo-usina', label:'Polo + Usina', desc:'KPIs gerais + KPIs por usina' },
            { id:'full',       label:'Polo + Usina + Projeto', desc:'S-Curves e KPIs por projeto' },
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

        {/* Actions — generate + download icons on same row */}
        <div style={{ display:'flex', gap:8, alignItems:'stretch' }}>
          <button className="btn btn-primary" onClick={generate} disabled={loading}
            style={{ flex:1, justifyContent:'center', padding:'10px', fontSize:'0.88rem' }}>
            {loading ? '⏳ Gerando...' : '▶ Gerar Relatório'}
          </button>

          {/* HTML download */}
          <button
            onClick={download}
            disabled={!generated}
            title="Baixar como .html"
            style={{
              width:42, flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: generated ? '#F0FDF4' : 'var(--bg-app)',
              border: `1.5px solid ${generated ? '#15803D' : 'var(--border)'}`,
              borderRadius:'var(--radius-sm)',
              cursor: generated ? 'pointer' : 'not-allowed',
              opacity: generated ? 1 : 0.4,
              transition:'all 0.15s',
              padding:0,
            }}
            onMouseEnter={e => generated && (e.currentTarget.style.background='#DCFCE7')}
            onMouseLeave={e => generated && (e.currentTarget.style.background='#F0FDF4')}
          >
            {/* HTML file icon */}
            <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
              <rect x="3" y="2" width="10" height="16" rx="1.5" stroke="#15803D" strokeWidth="1.4" fill="none"/>
              <path d="M13 2l4 4h-4V2z" fill="#15803D" opacity="0.6"/>
              <text x="4.5" y="14" fontSize="4.5" fontWeight="700" fill="#15803D" fontFamily="monospace">&lt;/&gt;</text>
            </svg>
          </button>

          {/* PDF print/save */}
          <button
            onClick={print}
            disabled={!generated}
            title="Imprimir / Salvar como PDF"
            style={{
              width:42, flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: generated ? '#FFF7ED' : 'var(--bg-app)',
              border: `1.5px solid ${generated ? '#EA580C' : 'var(--border)'}`,
              borderRadius:'var(--radius-sm)',
              cursor: generated ? 'pointer' : 'not-allowed',
              opacity: generated ? 1 : 0.4,
              transition:'all 0.15s',
              padding:0,
            }}
            onMouseEnter={e => generated && (e.currentTarget.style.background='#FFEDD5')}
            onMouseLeave={e => generated && (e.currentTarget.style.background='#FFF7ED')}
          >
            {/* PDF icon */}
            <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
              <rect x="3" y="2" width="10" height="16" rx="1.5" stroke="#EA580C" strokeWidth="1.4" fill="none"/>
              <path d="M13 2l4 4h-4V2z" fill="#EA580C" opacity="0.6"/>
              <text x="4" y="14" fontSize="4.5" fontWeight="700" fill="#EA580C" fontFamily="sans-serif">PDF</text>
            </svg>
          </button>
        </div>
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