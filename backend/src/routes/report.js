import express from 'express';
import { pool }  from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

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
    const engJoin = role==='engenheiro'
      ? `INNER JOIN project_assignments ea ON ea.project_id=p.id AND ea.user_id=${userId}` : '';

    // All projects with totals
    const projRes = await pool.query(`
      SELECT p.id, p.code, p.name, p.plants, p.si_value, p.pool_value,
        COALESCE(fe_agg.budget, 0)   AS budget,
        COALESCE(fe_agg.forecast, 0) AS forecast,
        COALESCE(fe_agg.actual, 0)   AS actual,
        COALESCE(fe_agg.pool, 0)     AS pool,
        COALESCE(fe_agg.meta, 0)     AS meta,
        eng_agg.engineers,
        fe_agg.last_update
      FROM projects p ${engJoin}
      LEFT JOIN (
        SELECT project_id,
          SUM(CASE WHEN type='Budget'   AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS budget,
          SUM(CASE WHEN type='Forecast' AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS forecast,
          SUM(CASE WHEN type='Actual'   AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS actual,
          SUM(CASE WHEN type='Pool'     AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS pool,
          SUM(CASE WHEN type='Meta'     AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS meta,
          MAX(updated_at) AS last_update
        FROM forecast_entries GROUP BY project_id
      ) fe_agg ON fe_agg.project_id = p.id
      LEFT JOIN (
        SELECT pa.project_id, STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) AS engineers
        FROM project_assignments pa
        JOIN users u ON u.id = pa.user_id AND u.role = 'engenheiro'
        GROUP BY pa.project_id
      ) eng_agg ON eng_agg.project_id = p.id
      ORDER BY p.code
    `, [yrS, yrE]);

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
      for (let y = yrS; y <= yrE; y++) {
        charts[y] = {
          budget:    monthlyArr(monthly,'Budget',y),
          forecast:  monthlyArr(monthly,'Forecast',y),
          actual:    monthlyArr(monthly,'Actual',y),
          meta:      monthlyArr(monthly,'Meta',y),
          pool:      monthlyArr(monthly,'Pool',y),
        };
      }
      return { ...p, monthly, notes, charts };
    });

    // Global KPIs
    const totBudget   = projects.reduce((s,p) => s+parseFloat(p.budget||0),  0);
    const totForecast = projects.reduce((s,p) => s+parseFloat(p.forecast||0),0);
    const totActual   = projects.reduce((s,p) => s+parseFloat(p.actual||0),  0);
    const totPool     = projects.reduce((s,p) => s+parseFloat(p.pool||0),    0);
    const totSI       = projects.reduce((s,p) => s+parseFloat(p.si_value||0),0);

    res.json({ projects, polos:POLOS, yearStart:yrS, yearEnd:yrE,
      kpis:{ budget:totBudget, forecast:totForecast, actual:totActual, pool:totPool, si:totSI },
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

export default router;
