import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  BarChart,
} from 'recharts';
import api from '../utils/api.js';
import { useTypeColors } from '../context/SettingsContext.jsx';
import { formatBRL, formatBRLShort, MONTHS_PT } from '../utils/format.js';

const fmt = formatBRLShort;

function fmtAxis(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
}

// Tooltip label helper: "Jan" + year context → "Jan/2026"
function fmtTooltipLabel(label, period) {
  if (!label) return label;
  // Multi-year format already has "/" e.g. "Jan/2026"
  if (String(label).includes('/')) return label;
  // Single year — append year from period
  const yr = period?.start || new Date().getFullYear();
  return `${label}/${yr}`;
}


// Friendly label map for all chart series
const SERIES_LABELS = {
  Budget:        'Budget (mensal)',
  Forecast:      'Forecast (mensal)',
  Realizado:     'Realizado (mensal)',
  Meta:          'Meta (mensal)',
  Pool:          'Pool (mensal)',
  BudgetAcum:    'Budget (acum.)',
  ForecastAcum:  'Forecast (acum.)',
  RealizadoAcum: 'Realizado (acum.)',
  MetaAcum:      'Meta (acum.)',
  PoolAcum:      'Pool (acum.)',
};

// Generic tooltip — shows all entries, never clips, skips gap internals
function ChartTooltip({ active, payload, label, period }) {
  if (!active || !payload?.length) return null;
  const skip = new Set(['GapMax', 'GapMin']);
  const entries = payload.filter(p => !skip.has(p.name));
  if (!entries.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)',
      fontSize: '0.8rem', minWidth: 180, maxWidth: 260, zIndex: 9999, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 7, color: 'var(--ctg-navy)',
        fontSize: '0.85rem', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>
        {fmtTooltipLabel(label, period)}
      </div>
      {entries.map(p => (
        <div key={p.name} style={{
          color: p.color ?? p.stroke ?? p.fill,
          display: 'flex', gap: 14, justifyContent: 'space-between',
          marginBottom: 3, fontSize: '0.78rem',
        }}>
          <span style={{ opacity: 0.85, whiteSpace: 'nowrap' }}>{SERIES_LABELS[p.name] || p.name}:</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: p.value === 0 ? 'var(--text-muted)' : undefined }}>
            {p.value === 0 ? '—' : formatBRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Custom tooltip for "Por Projeto" — shows project name instead of code
function ProjectTooltip({ active, payload, label, projectMap }) {
  if (!active || !payload?.length) return null;
  const name = projectMap[label] || label;
  const entries = payload.filter(p => p.value !== 0);
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)',
      fontSize: '0.8rem', minWidth: 180, maxWidth: 260, zIndex: 9999, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--ctg-navy)', fontSize: '0.82rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 6,
        wordBreak: 'break-word', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>
        {name}
      </div>
      {entries.map(p => (
        <div key={p.name} style={{ color: p.fill, display: 'flex', gap: 14, justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ opacity: 0.85 }}>{p.name}:</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(p.value)}</span>
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
  const C = useTypeColors();
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
        background: '#DCFCE7', color: C.budget,
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
  const C = useTypeColors();
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
      <div className="dash-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flexShrink: 0 }}>
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
      <div className="dash-charts-row" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, flexShrink: 0 }}>

        {/* Combined: bars (monthly) + lines (accumulated) — dual Y axis */}
        <div className="card dash-chart-combined" style={{ overflow: 'visible' }}>
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

                <Tooltip content={<ChartTooltip period={period} />} isAnimationActive={false} wrapperStyle={{ zIndex: 9999, maxWidth: 'min(260px, 70vw)' }} allowEscapeViewBox={{ x: false, y: true }} />
                <Legend wrapperStyle={{ fontSize: '0.68rem', color: '#374151', paddingTop: 4 }} formatter={(value) => SERIES_LABELS[value] || (value === 'GapMax' ? 'Dif. Forecast vs Realizado' : value)} className="dash-legend" />

                {/* Gap area between Forecast and Realizado (accumulated) */}
                <Area yAxisId="acum" type="monotone" dataKey="GapMax"
                  stroke="none" fill="#94A3B8" fillOpacity={0.25}
                  baseValue="GapMin" legendType="square" />

                {/* Monthly bars */}
                <Bar yAxisId="monthly" dataKey="Budget"    fill={C.budget+'88'} radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Forecast"  fill={C.forecast+'88'} radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Realizado" fill={C.actual+'88'} radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Meta"      fill={C.meta+'88'} radius={[2,2,0,0]} barSize={6} />
                <Bar yAxisId="monthly" dataKey="Pool"      fill={C.pool+'88'} radius={[2,2,0,0]} barSize={6} />

                {/* Accumulated lines */}
                <Line yAxisId="acum" type="monotone" dataKey="BudgetAcum"    stroke={C.budget} strokeWidth={2} dot={false} />
                <Line yAxisId="acum" type="monotone" dataKey="ForecastAcum"  stroke={C.forecast} strokeWidth={2} dot={false} />
                <Line yAxisId="acum" type="monotone" dataKey="RealizadoAcum" stroke={C.actual} strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} />
                <Line yAxisId="acum" type="monotone" dataKey="MetaAcum"      stroke={C.meta} strokeWidth={2} strokeDasharray="8 3" dot={false} activeDot={{ r: 3 }} />
                <Line yAxisId="acum" type="monotone" dataKey="PoolAcum"      stroke={C.pool} strokeWidth={2} strokeDasharray="4 2" dot={false} activeDot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Por Projeto */}
        <div className="card dash-chart-project" style={{ overflow: 'visible' }}>
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
                <Tooltip content={<ProjectTooltip projectMap={projectMap} />} isAnimationActive={false} wrapperStyle={{ zIndex: 9999, maxWidth: 'min(260px, 70vw)' }} allowEscapeViewBox={{ x: false, y: true }} />
                <Legend wrapperStyle={{ fontSize: '0.68rem', color: '#374151', paddingTop: 4 }} className="dash-legend" />
                <Bar dataKey="Budget"    fill={C.budget} radius={[2,2,0,0]} />
                <Bar dataKey="Forecast"  fill={C.forecast} radius={[2,2,0,0]} />
                <Bar dataKey="Realizado" fill={C.actual} radius={[2,2,0,0]} />
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
          <table className="dash-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
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
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: C.budget, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.budget)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: C.forecast, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(p.forecast)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: C.actual, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.actual)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      {exec !== '—' ? (
                        <span style={{
                          background: parseFloat(exec) > 100 ? '#FEF3C7' : '#DCFCE7',
                          color: parseFloat(exec) > 100 ? '#991B1B' : C.budget,
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
