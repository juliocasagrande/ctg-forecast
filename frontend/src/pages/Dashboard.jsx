import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  BarChart,
} from 'recharts';
import api from '../utils/api.js';
import { formatBRL, formatBRLShort, MONTHS_PT } from '../utils/format.js';

const fmt = formatBRLShort;

function fmtAxis(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
}

// Generic tooltip — shows all payload entries
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontSize: '0.8rem',
      maxWidth: 220,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
        {label}
      </div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color ?? p.stroke, display: 'flex', gap: 10, justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ opacity: 0.85 }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Custom tooltip for "Por Projeto" — shows project name instead of code
function ProjectTooltip({ active, payload, label, projectMap }) {
  if (!active || !payload?.length) return null;
  const name = projectMap[label] || label;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontSize: '0.8rem',
      maxWidth: 240,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--ctg-navy)', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6, wordBreak: 'break-word' }}>
        {name}
      </div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.fill, display: 'flex', gap: 10, justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ opacity: 0.85 }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function buildMonthlyData(summaries, period) {
  const result = [];
  for (let y = period.start; y <= period.end; y++) {
    MONTHS_PT.forEach((m, i) => {
      const month  = i + 1;
      const key    = period.start === period.end ? m : `${m}/${y}`;
      const entry  = { month: key };
      ['Budget', 'Forecast', 'Realizado', 'Meta', 'Pool'].forEach(type => {
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

// Days since a date (null → null)
function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr)) / 86_400_000);
}

function UpdateBadge({ dateStr }) {
  const days = daysSince(dateStr);
  if (days === null) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600,
        background: '#FEF3C7', color: '#92400E',
      }}>
        Sem dados
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600,
        background: '#DCFCE7', color: '#15803D',
      }}>
        ● {days === 0 ? 'Hoje' : `${days}d`}
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600,
      background: '#FEE2E2', color: '#991B1B',
    }}>
      ● {days}d
    </span>
  );
}

export default function Dashboard({ period, plantFilter = [] }) {
  const [dashData,     setDashData]     = useState([]);
  const [allSummaries, setAllSummaries] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const dashRes = await api.get('/forecast/dashboard', {
          params: { yearStart: period.start, yearEnd: period.end },
        });
        setDashData(dashRes.data);

        const summaries = [];
        await Promise.all(dashRes.data.map(async proj => {
          try {
            const r = await api.get(`/forecast/project/${proj.id}/summary`);
            r.data.forEach(row => {
              if (parseInt(row.year) >= period.start && parseInt(row.year) <= period.end)
                summaries.push({ ...row, project_id: proj.id });
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

  const totalBudget   = filtered.reduce((s, p) => s + parseFloat(p.budget    || 0), 0);
  const totalForecast = filtered.reduce((s, p) => s + parseFloat(p.forecast   || 0), 0);
  const totalActual   = filtered.reduce((s, p) => s + parseFloat(p.actual     || 0), 0);
  const totalSI       = filtered.reduce((s, p) => s + parseFloat(p.si_value   || 0), 0);

  const isSingle    = period.start === period.end;
  const periodLabel = isSingle ? `${period.start}` : `${period.start}–${period.end}`;

  const filteredSummaries = allSummaries.filter(s =>
    plantFilter.length === 0 || filtered.some(p => String(p.id) === String(s.project_id))
  );

  const monthlyData = buildMonthlyData(filteredSummaries, period);

  // Combined S-Curve: bars = monthly, lines = accumulated
  const combinedData = monthlyData.reduce((acc, d, i) => {
    const prev = acc[i - 1] || { BudgetAcum: 0, ForecastAcum: 0, RealizadoAcum: 0, MetaAcum: 0, PoolAcum: 0 };
    acc.push({
      month:          d.month,
      Budget:         d.Budget,
      Forecast:       d.Forecast,
      Realizado:      d.Realizado,
      Meta:           d.Meta,
      Pool:           d.Pool,
      BudgetAcum:     prev.BudgetAcum    + d.Budget,
      ForecastAcum:   prev.ForecastAcum  + d.Forecast,
      RealizadoAcum:  prev.RealizadoAcum + d.Realizado,
      MetaAcum:       prev.MetaAcum      + d.Meta,
      PoolAcum:       prev.PoolAcum      + d.Pool,
      // Gap area = [Realizado acum, Forecast acum] — shows execution gap
      GapMin:         prev.RealizadoAcum + d.Realizado,
      GapMax:         prev.ForecastAcum  + d.Forecast,
    });
    return acc;
  }, []);

  // project code → name map for tooltip
  const projectMap = {};
  filtered.forEach(p => { projectMap[p.code] = p.name; });

  const tickInterval = period.end - period.start >= 2 ? 5 : 0;

  const cardHeader = (title) => (
    <div style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '7px 14px' }}>
      <span style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}>{title}</span>
    </div>
  );

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flexShrink: 0 }}>
        {[
          { cls: 'budget',   label: `Budget ${periodLabel}`,   val: totalBudget,   sub: `${filtered.length} projeto${filtered.length !== 1 ? 's' : ''}` },
          { cls: 'forecast', label: `Forecast ${periodLabel}`, val: totalForecast, sub: totalBudget ? `${((totalForecast / totalBudget) * 100).toFixed(1)}% do budget` : '—' },
          { cls: 'actual',   label: 'Realizado',               val: totalActual,   sub: totalForecast ? `${((totalActual / totalForecast) * 100).toFixed(1)}% do forecast` : '—' },
          { cls: '',         label: 'SI Total',                val: totalSI,       sub: 'Valor aprovado' },
        ].map(c => (
          <div key={c.label} className={`stat-card ${c.cls}`} style={{ padding: '12px 16px' }}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(c.val)}</div>
            <div className="stat-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Two charts — 60% / 40% */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, flexShrink: 0 }}>

        {/* Combined: bars (monthly) + lines (accumulated) — dual Y axis */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {cardHeader(`Evolução Mensal + S-Curve — ${periodLabel}`)}
          <div style={{ padding: '10px 8px 6px' }}>
            <ResponsiveContainer width="100%" height={175}>
              <ComposedChart data={combinedData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#374151' }} interval={tickInterval} />

                {/* Left Y — monthly values */}
                <YAxis
                  yAxisId="monthly"
                  orientation="left"
                  tickFormatter={fmtAxis}
                  tick={{ fontSize: 9, fill: '#6B7280' }}
                  width={54}
                  label={{ value: 'Mensal', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 8, fill: '#9CA3AF' } }}
                />

                {/* Right Y — accumulated values */}
                <YAxis
                  yAxisId="acum"
                  orientation="right"
                  tickFormatter={fmtAxis}
                  tick={{ fontSize: 9, fill: '#6B7280' }}
                  width={54}
                  label={{ value: 'Acumulado', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 8, fill: '#9CA3AF' } }}
                />

                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '0.72rem', color: '#374151' }}
                  formatter={(value) => {
                    const labels = {
                      Budget: 'Budget (mensal)', Forecast: 'Forecast (mensal)', Realizado: 'Realizado (mensal)',
                      Meta: 'Meta (mensal)', Pool: 'Pool (mensal)',
                      BudgetAcum: 'Budget (acum.)', ForecastAcum: 'Forecast (acum.)', RealizadoAcum: 'Realizado (acum.)',
                      MetaAcum: 'Meta (acum.)', PoolAcum: 'Pool (acum.)',
                      GapMax: 'Diferença Forecast vs Realizado',
                    };
                    return labels[value] || value;
                  }}
                />

                {/* Gap area between Forecast and Realizado (accumulated) */}
                <Area yAxisId="acum" type="monotone" dataKey="GapMax"
                  stroke="none" fill="#94A3B8" fillOpacity={0.25}
                  baseValue="GapMin" legendType="square" />

                {/* Monthly bars */}
                <Bar yAxisId="monthly" dataKey="Budget"    fill="#86EFAC" radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Forecast"  fill="#7DD3FC" radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Realizado" fill="#93C5FD" radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Meta"      fill="#DDD6FE" radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Pool"      fill="#BAE6FD" radius={[2,2,0,0]} barSize={6} />

                {/* Accumulated lines */}
                <Line yAxisId="acum" type="monotone" dataKey="BudgetAcum"    stroke="#15803D" strokeWidth={2} dot={false} />
                <Line yAxisId="acum" type="monotone" dataKey="ForecastAcum"  stroke="#0EA5E9" strokeWidth={2} dot={false} />
                <Line yAxisId="acum" type="monotone" dataKey="RealizadoAcum" stroke="#1E40AF" strokeWidth={2} strokeDasharray="5 3" />
                <Line yAxisId="acum" type="monotone" dataKey="MetaAcum"      stroke="#7C3AED" strokeWidth={2} strokeDasharray="8 3" />
                <Line yAxisId="acum" type="monotone" dataKey="PoolAcum"      stroke="#0891B2" strokeWidth={2} strokeDasharray="4 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Por Projeto */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {cardHeader(`Por Projeto — ${periodLabel}`)}
          <div style={{ padding: '10px 8px 6px' }}>
            <ResponsiveContainer width="100%" height={175}>
              <BarChart
                data={filtered.map(p => ({
                  name:      p.code,
                  Budget:    parseFloat(p.budget)   || 0,
                  Forecast:  parseFloat(p.forecast)  || 0,
                  Realizado: parseFloat(p.actual)    || 0,
                }))}
                margin={{ top: 2, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: '#374151' }} width={54} />
                <Tooltip content={<ProjectTooltip projectMap={projectMap} />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem', color: '#374151' }} />
                <Bar dataKey="Budget"    fill="#16A34A" radius={[2,2,0,0]} />
                <Bar dataKey="Forecast"  fill="#38BDF8" radius={[2,2,0,0]} />
                <Bar dataKey="Realizado" fill="#2563EB" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '7px 16px', background: '#1E3A6E', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            Resumo por Projeto — {periodLabel}
          </span>
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr>
                {['Código','Projeto','Usinas','Budget','Forecast','Realizado','% Exec.','SI','Atualizado',''].map(h => (
                  <th key={h} style={{
                    background: 'var(--ctg-navy)', color: '#fff', padding: '8px 14px',
                    textAlign: ['Código','Projeto','Usinas','Atualizado'].includes(h) ? 'left' : h === '' ? 'center' : 'right',
                    fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    position: 'sticky', top: 0, zIndex: 1,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>Nenhum projeto</td></tr>
              ) : filtered.map((p, i) => {
                const f    = parseFloat(p.forecast) || 0;
                const a    = parseFloat(p.actual)   || 0;
                const exec = f ? ((a / f) * 100).toFixed(1) : '—';
                return (
                  <tr key={p.id}
                    style={{ background: i % 2 ? '#F8FAFC' : 'var(--bg-card)', cursor: 'pointer', borderBottom: '1px solid #E2E8F0' }}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--ctg-blue)', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{p.code}</td>
                    <td style={{ padding: '8px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: '8px 14px', maxWidth: 140 }}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {(p.plants || []).map(pl => (
                          <span key={pl} className="plant-tag" style={{ fontSize: '0.65rem' }}>
                            {pl.replace('UHE ','').replace('PCH ','')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#15803D', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.budget)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#0369A1', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(p.forecast)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: '#1E40AF', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.actual)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      {exec !== '—' ? (
                        <span style={{
                          background: parseFloat(exec) > 100 ? '#FEF3C7' : '#DCFCE7',
                          color: parseFloat(exec) > 100 ? '#991B1B' : '#15803D',
                          padding: '2px 7px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700,
                        }}>{exec}%</span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 500 }}>{fmt(p.si_value)}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <UpdateBadge dateStr={p.last_forecast_update} />
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--ctg-blue)', fontWeight: 700 }}>→</td>
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
