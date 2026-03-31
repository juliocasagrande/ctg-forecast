import express from 'express';
import { pool }  from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// Safe error helper
function safeError(res, err) {
  console.error(`[ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}

const POLOS = [
  { id:'paranapanema', name:'Rio Paranapanema', plants:[
    'UHE Jurumirim','UHE Taquaruçu','UHE Rosana','UHE Chavantes',
    'UHE Canoas 1','UHE Canoas 2','PCH Retiro','PCH Palmeiras',
    'UHE Capivara','UHE Salto Grande',
  ]},
  { id:'canoas',  name:'Rio Canoas', plants:['UHE Garibaldi'] },
  { id:'verde',   name:'Rio Verde',  plants:['UHE Salto'] },
  { id:'parana',  name:'Rio Paraná', plants:['UHE Ilha Solteira','UHE Jupiá'] },
];
const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmtBRL(v) {
  if (!v || v === 0) return 'R$ 0';
  const abs = Math.abs(parseFloat(v));
  const sig = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sig}R$ ${(abs/1_000_000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}M`;
  if (abs >= 1_000)     return `${sig}R$ ${(abs/1_000).toLocaleString('pt-BR',{maximumFractionDigits:0})}k`;
  return `${sig}R$ ${abs.toLocaleString('pt-BR',{maximumFractionDigits:0})}`;
}
function fmtPct(a,b) {
  if (!b || b===0) return '—';
  const p = ((a/b)*100).toFixed(1);
  return `${p}%`;
}
function sum(rows, type, yearStart, yearEnd) {
  return rows.filter(r => r.type===type && r.year>=yearStart && r.year<=yearEnd)
             .reduce((s,r) => s + parseFloat(r.total||0), 0);
}
function monthlyArr(rows, type, year) {
  return MONTHS_PT.map((_,mi) => {
    const r = rows.find(r => r.type===type && parseInt(r.year)===year && parseInt(r.month)===mi+1);
    return parseFloat(r?.total||0);
  });
}

// GET /api/report/data?yearStart=2026&yearEnd=2026&sections=...
router.get('/data', async (req, res) => {
  try {
    const { yearStart=2026, yearEnd=2026 } = req.query;
    const yrS = parseInt(yearStart), yrE = parseInt(yearEnd);
    const { role, id: userId } = req.user;

    // FIX: userId era interpolado diretamente na string SQL — substituído por
    // parâmetro posicional $3 para prevenir SQL injection.
    const isEng = role === 'engenheiro';
    const engJoinClause = isEng
      ? 'INNER JOIN project_assignments ea ON ea.project_id=p.id AND ea.user_id=$3'
      : '';
    const params = isEng ? [yrS, yrE, userId] : [yrS, yrE];

    // All projects with totals
    // Rule: Actual consolidated adds to Budget AND Actual; Forecast consolidated adds to Forecast
    const projRes = await pool.query(`
      SELECT p.id, p.code, p.name, p.plants, p.si_value, p.pool_value,
        COALESCE(SUM(CASE WHEN combined.type='Budget'   THEN combined.value ELSE 0 END),0)
          + COALESCE(SUM(CASE WHEN combined.source='consolidated' AND combined.type='Actual' THEN combined.value ELSE 0 END),0) AS budget,
        COALESCE(SUM(CASE WHEN combined.type='Forecast' THEN combined.value ELSE 0 END),0) AS forecast,
        COALESCE(SUM(CASE WHEN combined.type='Actual'   THEN combined.value ELSE 0 END),0) AS actual,
        COALESCE(SUM(CASE WHEN combined.type='Pool'     THEN combined.value ELSE 0 END),0) AS pool,
        COALESCE(SUM(CASE WHEN combined.type='Meta'     THEN combined.value ELSE 0 END),0) AS meta,
        eng_agg.engineers,
        MAX(combined.updated_at) AS last_update
      FROM projects p ${engJoinClause}
      LEFT JOIN (
        SELECT fe.project_id, fe.type, fe.value, fe.updated_at, 'entries' AS source
        FROM forecast_entries fe
        WHERE fe.year BETWEEN $1 AND $2
          AND NOT EXISTS (
            SELECT 1 FROM year_consolidated yc2
            WHERE yc2.project_id = fe.project_id
              AND yc2.year = fe.year
              AND (yc2.type = fe.type OR (yc2.type = 'Actual' AND yc2.category = 'Total' AND fe.type = 'Actual'))
              AND yc2.value > 0
          )
        UNION ALL
        SELECT yc.project_id, yc.type, yc.value, yc.consolidated_at AS updated_at, 'consolidated' AS source
        FROM year_consolidated yc
        WHERE yc.year BETWEEN $1 AND $2 AND yc.value > 0
      ) combined ON combined.project_id = p.id
      LEFT JOIN (
        SELECT pa.project_id, STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) AS engineers
        FROM project_assignments pa
        JOIN users u ON u.id = pa.user_id AND u.role = 'engenheiro'
        GROUP BY pa.project_id
      ) eng_agg ON eng_agg.project_id = p.id
      GROUP BY p.id, p.code, p.name, p.plants, p.si_value, p.pool_value, eng_agg.engineers
      ORDER BY p.code
    `, params);

    // Monthly data for each project (for charts)
    const monthlyRes = await pool.query(`
      SELECT project_id, type, year, month, SUM(value) AS total
      FROM forecast_entries
      WHERE year BETWEEN $1 AND $2
      GROUP BY project_id, type, year, month
      ORDER BY project_id, year, month
    `, [yrS, yrE]);

    // Notes for each project
    const notesRes = await pool.query(`
      SELECT pn.project_id, pn.content, pn.note_date, u.name AS user_name
      FROM project_notes pn
      LEFT JOIN users u ON u.id=pn.user_id
      ORDER BY pn.project_id, pn.note_date DESC
      LIMIT 200
    `);

    // Assemble per project
    const projects = projRes.rows.map(p => {
      const monthly = monthlyRes.rows.filter(r => r.project_id===p.id);
      const notes   = notesRes.rows.filter(r => r.project_id===p.id).slice(0,5);
      const charts  = {};
      let actForecastTotal = 0;
      for (let y = yrS; y <= yrE; y++) {
        const budgetArr   = monthlyArr(monthly,'Budget',y);
        const forecastArr = monthlyArr(monthly,'Forecast',y);
        const actualArr   = monthlyArr(monthly,'Actual',y);
        charts[y] = {
          budget:    budgetArr,
          forecast:  forecastArr,
          actual:    actualArr,
          meta:      monthlyArr(monthly,'Meta',y),
          pool:      monthlyArr(monthly,'Pool',y),
        };
        for (let m = 0; m < 12; m++) {
          actForecastTotal += actualArr[m] > 0 ? actualArr[m] : forecastArr[m];
        }
      }
      const monthlyActualTotal   = Object.values(charts).reduce((s, yr) => s + yr.actual.reduce((a,b) => a+b, 0), 0);
      const monthlyForecastTotal = Object.values(charts).reduce((s, yr) => s + yr.forecast.reduce((a,b) => a+b, 0), 0);
      const projActual   = parseFloat(p.actual   || 0);
      const projForecast = parseFloat(p.forecast || 0);
      const consActualDiff   = projActual   - monthlyActualTotal;
      const consForecastDiff = projForecast - monthlyForecastTotal;
      if (consActualDiff > 0) actForecastTotal += consActualDiff;
      else if (consForecastDiff > 0 && consActualDiff <= 0) actForecastTotal += consForecastDiff;

      return { ...p, monthly, notes, charts, act_forecast: actForecastTotal };
    });

    // Global KPIs
    const totBudget      = projects.reduce((s,p) => s+parseFloat(p.budget||0),   0);
    const totForecast    = projects.reduce((s,p) => s+parseFloat(p.forecast||0), 0);
    const totActual      = projects.reduce((s,p) => s+parseFloat(p.actual||0),   0);
    const totPool        = projects.reduce((s,p) => s+parseFloat(p.pool||0),     0);
    const totSI          = projects.reduce((s,p) => s+parseFloat(p.si_value||0), 0);
    const totActForecast = projects.reduce((s,p) => s + (p.act_forecast || 0),   0);

    res.json({ projects, polos:POLOS, yearStart:yrS, yearEnd:yrE,
      kpis:{ budget:totBudget, forecast:totForecast, actual:totActual, pool:totPool, si:totSI, actForecast:totActForecast },
    });
  } catch(err) { safeError(res, err); }
});

export default router;
