import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from 'recharts';
import api from '../utils/api.js';
import { useRole } from '../context/AuthContext.jsx';
import { formatBRL, formatBRLShort, MONTHS_PT } from '../utils/format.js';

const fmt = formatBRLShort;

// Ultra-compact formatter for Y axis — avoids "R$ 380,0k" becoming "R$\n380,0k"
function fmtAxis(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontSize: '0.8rem'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Build monthly data spanning multiple years
function buildMonthlyData(summaries, period) {
  const result = [];
  for (let y = period.start; y <= period.end; y++) {
    MONTHS_PT.forEach((m, i) => {
      const month = i + 1;
      const key = period.start === period.end ? m : `${m}/${y}`;
      const entry = { month: key };
      ['Budget', 'Forecast', 'Realizado'].forEach(type => {
        const apiType = type === 'Realizado' ? 'Actual' : type;
        entry[type] = summaries
          .filter(s => parseInt(s.year) === y && parseInt(s.month) === month && s.type === apiType)
          .reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
      });
      result.push(entry);
    });
  }
  return result;
}

export default function Dashboard({ period, plantFilter = [] }) {
  const [dashData, setDashData] = useState([]);
  const [allSummaries, setAllSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const dashRes = await api.get('/forecast/dashboard', {
          params: { yearStart: period.start, yearEnd: period.end }
        });
        setDashData(dashRes.data);

        // Gather monthly summaries for all projects across the period
        const summaries = [];
        await Promise.all(dashRes.data.map(async proj => {
          try {
            const r = await api.get(`/forecast/project/${proj.id}/summary`);
            r.data.forEach(row => {
              if (parseInt(row.year) >= period.start && parseInt(row.year) <= period.end) {
                summaries.push({ ...row, project_id: proj.id });
              }
            });
          } catch {}
        }));
        setAllSummaries(summaries);
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, [period.start, period.end]);

  const filtered = plantFilter.length > 0
    ? dashData.filter(p => plantFilter.some(f => (p.plants || []).includes(f)))
    : dashData;

  const totalBudget   = filtered.reduce((s, p) => s + parseFloat(p.budget   || 0), 0);
  const totalForecast = filtered.reduce((s, p) => s + parseFloat(p.forecast  || 0), 0);
  const totalActual   = filtered.reduce((s, p) => s + parseFloat(p.actual    || 0), 0);
  const totalSI       = filtered.reduce((s, p) => s + parseFloat(p.si_value  || 0), 0);

  const isSingle     = period.start === period.end;
  const periodLabel  = isSingle ? `${period.start}` : `${period.start}–${period.end}`;
  const filterLabel  = plantFilter.length > 0 ? ` · ${plantFilter.join(', ')}` : '';
  const monthlyData  = buildMonthlyData(allSummaries.filter(s => {
    if (plantFilter.length === 0) return true;
    // find project id from dashData matching this summary row
    const proj = filtered.find(p => String(p.id) === String(s.project_id));
    return !!proj;
  }), period);

  // S-curve (accumulated)
  const sCurveData = monthlyData.reduce((acc, d, i) => {
    const prev = acc[i - 1] || { Budget: 0, Forecast: 0, Realizado: 0 };
    acc.push({
      month: d.month,
      Budget:    prev.Budget    + d.Budget,
      Forecast:  prev.Forecast  + d.Forecast,
      Realizado: prev.Realizado + d.Realizado,
    });
    return acc;
  }, []);

  // Show only every Nth tick when range is wide
  const tickInterval = period.end - period.start >= 2 ? 5 : 0;

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      gap: 12,
    }}>
      {/* KPI cards — compact single row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flexShrink: 0 }}>
        <div className="stat-card budget" style={{ padding: '12px 16px' }}>
          <div className="stat-label">Budget {periodLabel}</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(totalBudget)}</div>
          <div className="stat-sub">{filtered.length} projeto{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat-card forecast" style={{ padding: '12px 16px' }}>
          <div className="stat-label">Forecast {periodLabel}</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(totalForecast)}</div>
          <div className="stat-sub">{totalBudget ? `${((totalForecast / totalBudget) * 100).toFixed(1)}% do budget` : '—'}</div>
        </div>
        <div className="stat-card actual" style={{ padding: '12px 16px' }}>
          <div className="stat-label">Realizado</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(totalActual)}</div>
          <div className="stat-sub">{totalForecast ? `${((totalActual / totalForecast) * 100).toFixed(1)}% do forecast` : '—'}</div>
        </div>
        <div className="stat-card" style={{ padding: '12px 16px' }}>
          <div className="stat-label">SI Total</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(totalSI)}</div>
          <div className="stat-sub">Valor aprovado</div>
        </div>
      </div>

      {/* 3 charts in one row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, flexShrink: 0 }}>
        {/* Monthly bars */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header" style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '7px 14px' }}>
            <span className="card-title" style={{ color: '#fff', fontSize: '0.82rem' }}>Evolução Mensal — {periodLabel}</span>
          </div>
          <div style={{ padding: '10px 12px 6px' }}>
            <ResponsiveContainer width="100%" height={155}>
              <BarChart data={monthlyData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#374151' }} interval={tickInterval} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: '#374151' }} width={64} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#374151' }} />
                <Bar dataKey="Budget" fill="#1E40AF" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Forecast" fill="#15803D" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Realizado" fill="#B45309" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* S-Curve */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header" style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '7px 14px' }}>
            <span className="card-title" style={{ color: '#fff', fontSize: '0.82rem' }}>S-Curve Acumulado — {periodLabel}</span>
          </div>
          <div style={{ padding: '10px 12px 6px' }}>
            <ResponsiveContainer width="100%" height={155}>
              <LineChart data={sCurveData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#374151' }} interval={tickInterval} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: '#374151' }} width={64} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#374151' }} />
                <Line type="monotone" dataKey="Budget" stroke="#1E40AF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Forecast" stroke="#15803D" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Realizado" stroke="#B45309" strokeWidth={2} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By project */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header" style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '7px 14px' }}>
            <span className="card-title" style={{ color: '#fff', fontSize: '0.82rem' }}>Por Projeto — {periodLabel}</span>
          </div>
          <div style={{ padding: '10px 12px 6px' }}>
            <ResponsiveContainer width="100%" height={155}>
              <BarChart
                data={filtered.map(p => ({
                  name: p.code,
                  Budget:    parseFloat(p.budget)   || 0,
                  Forecast:  parseFloat(p.forecast)  || 0,
                  Realizado: parseFloat(p.actual)    || 0,
                }))}
                margin={{ top: 2, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: '#374151' }} width={64} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#374151' }} />
                <Bar dataKey="Budget" fill="#2563EB" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Forecast" fill="#16A34A" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Realizado" fill="#D97706" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary table — fills remaining height, scrolls internally */}
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Table section title — lighter than column headers */}
        <div style={{
          padding: '7px 16px',
          background: '#1E3A6E',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          flexShrink: 0,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            Resumo por Projeto — {periodLabel}
          </span>
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr>
                {['Código', 'Projeto', 'Usinas', 'Budget', 'Forecast', 'Realizado', '% Exec.', 'SI', ''].map(h => (
                  <th key={h} style={{
                    background: 'var(--ctg-navy)', color: '#fff', padding: '8px 14px',
                    textAlign: ['Código', 'Projeto', 'Usinas'].includes(h) ? 'left' : h === '' ? 'center' : 'right',
                    fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    position: 'sticky', top: 0, zIndex: 1,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>Nenhum projeto</td></tr>
              ) : filtered.map((p, i) => {
                const f = parseFloat(p.forecast) || 0;
                const a = parseFloat(p.actual) || 0;
                const exec = f ? ((a / f) * 100).toFixed(1) : '—';
                return (
                  <tr key={p.id}
                    style={{ background: i % 2 ? '#F8FAFC' : 'var(--bg-card)', cursor: 'pointer', borderBottom: '1px solid #E2E8F0' }}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ctg-blue)', fontFamily: 'monospace', fontSize: '0.88rem' }}>{p.code}</td>
                    <td style={{ padding: '10px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {(p.plants || []).map(pl => (
                          <span key={pl} className="plant-tag" style={{ fontSize: '0.68rem' }}>
                            {pl.replace('UHE ', '').replace('PCH ', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#1E40AF', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.budget)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#15803D', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(p.forecast)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#92400E', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.actual)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {exec !== '—' ? (
                        <span style={{
                          background: parseFloat(exec) > 100 ? '#FEF3C7' : '#DCFCE7',
                          color: parseFloat(exec) > 100 ? '#92400E' : '#15803D',
                          padding: '3px 8px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700,
                        }}>{exec}%</span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 500 }}>{fmt(p.si_value)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--ctg-blue)', fontWeight: 700 }}>→</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
