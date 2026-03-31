import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import api from '../utils/api.js';
import { useTypeColors } from '../context/SettingsContext.jsx';
import { useRole } from '../context/AuthContext.jsx';
import { EngineerBadges } from '../components/ui/EngineerBadge.jsx';
import { formatBRL, formatBRLShort, MONTHS_PT } from '../utils/format.js';
import ChartTooltip from '../components/ui/ChartTooltip.jsx';

const fmt = formatBRLShort;

function fmtAxis(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace('.', ',')}M`;
  if (abs >= 1_000)     return `R$ ${(v / 1_000).toFixed(2).replace('.', ',')}k`;
  return `R$ ${v}`;
}

const ORDERED_PLANTS = [
  'PCH Palmeiras','PCH Retiro','UHE Canoas 1','UHE Canoas 2',
  'UHE Capivara','UHE Chavantes','UHE Garibaldi','UHE Ilha Solteira',
  'UHE Jupiá','UHE Jurumirim','UHE Rosana','UHE Salto',
  'UHE Salto Grande','UHE Taquaruçu',
];

// ── Multi-select dropdown ────────────────────────────────────────────────────
function MultiSelect({ label, options, selected, onChange, renderOption }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const displayText = selected.length === 0
    ? `Todos`
    : selected.length === 1
      ? (renderOption ? renderOption(options.find(o => o.value === selected[0])) : selected[0])
      : `${selected.length} selecionados`;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 160 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '7px 12px', borderRadius: 'var(--radius-sm)',
        border: `1.5px solid ${selected.length > 0 ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
        background: selected.length > 0 ? 'var(--budget-bg)' : 'var(--bg-card)',
        color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 500,
        cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--font-body)',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayText}</span>
        <span style={{ fontSize: '0.6rem', opacity: 0.5, flexShrink: 0, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          zIndex: 200, maxHeight: 260, overflowY: 'auto',
        }}>
          {/* Clear all */}
          {selected.length > 0 && (
            <button onClick={() => { onChange([]); }} style={{
              width: '100%', padding: '7px 12px', border: 'none', background: 'transparent',
              textAlign: 'left', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--ctg-blue)',
              fontWeight: 600, borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-body)',
            }}>
              Limpar seleção
            </button>
          )}
          {options.map(opt => {
            const isSelected = selected.includes(opt.value);
            return (
              <button key={opt.value} onClick={() => toggle(opt.value)} style={{
                width: '100%', padding: '7px 12px', border: 'none',
                background: isSelected ? 'var(--budget-bg)' : 'transparent',
                textAlign: 'left', cursor: 'pointer', fontSize: '0.75rem',
                color: isSelected ? 'var(--ctg-navy)' : 'var(--text-primary)',
                fontWeight: isSelected ? 600 : 400, display: 'flex', gap: 8, alignItems: 'center',
                borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-body)',
              }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${isSelected ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
                  background: isSelected ? 'var(--ctg-blue)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                }}>{isSelected ? '✓' : ''}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
// ── Helpers for update badge ────────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function UpdateBadge({ dateStr }) {
  const C = useTypeColors();
  const days = daysSince(dateStr);
  if (days === null) return <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:10,fontSize:'0.72rem',fontWeight:600,background:'#FEF3C7',color:'#92400E' }}>Sem dados</span>;
  if (days <= 30) return <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:10,fontSize:'0.72rem',fontWeight:600,background:'#DCFCE7',color:C.budget }}>● {days === 0 ? 'Hoje' : `${days}d`}</span>;
  return <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:10,fontSize:'0.72rem',fontWeight:600,background:'#FEE2E2',color:'#991B1B' }}>● {days}d</span>;
}

export default function SCurvePage({ period }) {
  const C = useTypeColors();
  const { isEngenheiro } = useRole();
  const showEngCol = !isEngenheiro;
  const navigate = useNavigate();
  const [dashData,     setDashData]     = useState([]);
  const [allSummaries, setAllSummaries] = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Filters
  const [selectedYears,   setSelectedYears]   = useState([]);
  const [selectedPlants,  setSelectedPlants]  = useState([]);
  const [selectedProjects,setSelectedProjects]= useState([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [dashRes, sumRes] = await Promise.all([
          api.get('/forecast/dashboard', { params: { yearStart: period.start, yearEnd: period.end } }),
          api.get('/forecast/summaries', { params: { yearStart: period.start, yearEnd: period.end } }),
        ]);
        setDashData(dashRes.data);
        setAllSummaries(sumRes.data);
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, [period.start, period.end]);

  // Available options
  const availablePlants = useMemo(() => {
    const plants = new Set();
    dashData.forEach(p => (p.plants || []).forEach(pl => plants.add(pl)));
    return ORDERED_PLANTS.filter(pl => plants.has(pl));
  }, [dashData]);

  const availableYears = useMemo(() => {
    const years = [];
    for (let y = period.start; y <= period.end; y++) years.push(y);
    return years;
  }, [period.start, period.end]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    let projects = dashData;
    if (selectedPlants.length > 0) {
      projects = projects.filter(p => selectedPlants.some(pl => (p.plants || []).includes(pl)));
    }
    if (selectedProjects.length > 0) {
      projects = projects.filter(p => selectedProjects.includes(p.id));
    }
    return projects;
  }, [dashData, selectedPlants, selectedProjects]);

  const filteredProjectIds = useMemo(() => new Set(filteredProjects.map(p => String(p.id))), [filteredProjects]);

  // Filtered summaries
  const filteredSummaries = useMemo(() => {
    return allSummaries.filter(s => {
      if (!filteredProjectIds.has(String(s.project_id))) return false;
      if (selectedYears.length > 0 && !selectedYears.includes(parseInt(s.year))) return false;
      return true;
    });
  }, [allSummaries, filteredProjectIds, selectedYears]);

  // Build monthly data
  const effectiveYearStart = selectedYears.length > 0 ? Math.min(...selectedYears) : period.start;
  const effectiveYearEnd   = selectedYears.length > 0 ? Math.max(...selectedYears) : period.end;
  const effectivePeriod = { start: effectiveYearStart, end: effectiveYearEnd };

  // Separate monthly vs consolidated summaries (month=0 = consolidated from backend)
  const monthlySummaries = useMemo(() =>
    filteredSummaries.filter(s => parseInt(s.month) > 0),
    [filteredSummaries]
  );
  const consolidatedSummaries = useMemo(() =>
    filteredSummaries.filter(s => parseInt(s.month) === 0),
    [filteredSummaries]
  );

  // Current date for Realizado cutoff
  const nowSC = new Date();
  const nowYear  = nowSC.getFullYear();
  const nowMonth = nowSC.getMonth() + 1;

  // Last month with any Actual data (for Forecast blending)
  const lastActualPointSC = useMemo(() => {
    let lastY = 0, lastM = 0;
    monthlySummaries.forEach(s => {
      if (s.type !== 'Actual') return;
      const y = parseInt(s.year), m = parseInt(s.month), v = parseFloat(s.total || 0);
      if (v > 0 && (y > lastY || (y === lastY && m > lastM))) { lastY = y; lastM = m; }
    });
    return { year: lastY, month: lastM };
  }, [monthlySummaries]);

  const monthlyData = useMemo(() => {
    const { year: lastActY, month: lastActM } = lastActualPointSC;
    const result = [];
    for (let y = effectiveYearStart; y <= effectiveYearEnd; y++) {
      if (selectedYears.length > 0 && !selectedYears.includes(y)) continue;
      MONTHS_PT.forEach((m, i) => {
        const month = i + 1;
        const key = effectiveYearStart === effectiveYearEnd ? m : `${m}/${y}`;
        const entry = { month: key };

        const actualVal = monthlySummaries
          .filter(s => parseInt(s.year) === y && parseInt(s.month) === month && s.type === 'Actual')
          .reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
        const forecastVal = monthlySummaries
          .filter(s => parseInt(s.year) === y && parseInt(s.month) === month && s.type === 'Forecast')
          .reduce((sum, s) => sum + parseFloat(s.total || 0), 0);

        // Realizado: zero after current calendar month
        const isAfterNow = y > nowYear || (y === nowYear && month > nowMonth);
        entry['Realizado'] = isAfterNow ? 0 : actualVal;

        // Forecast line: Actual up to lastActual, Forecast thereafter
        const isBeforeOrAtLastActual = lastActY > 0 &&
          (y < lastActY || (y === lastActY && month <= lastActM));
        entry['Forecast'] = isBeforeOrAtLastActual ? actualVal : forecastVal;

        ['Budget', 'Meta', 'Pool'].forEach(type => {
          entry[type] = monthlySummaries
            .filter(s => parseInt(s.year) === y && parseInt(s.month) === month && s.type === type)
            .reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
        });

        result.push(entry);
      });
    }
    return result;
  }, [monthlySummaries, effectiveYearStart, effectiveYearEnd, selectedYears, nowYear, nowMonth, lastActualPointSC]);

  // Combined: bars (monthly) + lines (accumulated) — same as Dashboard
  const combinedData = useMemo(() => monthlyData.reduce((acc, d, i) => {
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
    });
    return acc;
  }, []), [monthlyData]);

  // KPIs
  const totalBudget   = filteredProjects.reduce((s, p) => s + parseFloat(p.budget || 0), 0);
  const totalForecast = filteredProjects.reduce((s, p) => s + parseFloat(p.act_forecast ?? p.forecast ?? 0), 0);
  const totalActual   = filteredProjects.reduce((s, p) => s + parseFloat(p.actual || 0), 0);
  const totalActForecast = filteredProjects.reduce((s, p) => s + parseFloat(p.act_forecast ?? p.forecast ?? 0), 0);

  const yearSpan = effectiveYearEnd - effectiveYearStart;
  const tickInterval = yearSpan === 0 ? 0 : yearSpan === 1 ? 2 : 5;

  const yearLabel = selectedYears.length === 0
    ? `${period.start}–${period.end}`
    : selectedYears.length === 1 ? `${selectedYears[0]}` : selectedYears.join(', ');

  // Dropdown options
  const yearOptions = availableYears.map(y => ({ value: y, label: String(y) }));
  const plantOptions = availablePlants.map(pl => ({ value: pl, label: pl }));
  const projectOptions = useMemo(() => {
    let base = dashData;
    if (selectedPlants.length > 0) {
      base = base.filter(p => selectedPlants.some(pl => (p.plants || []).includes(pl)));
    }
    return base.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  }, [dashData, selectedPlants]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Filters bar */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <MultiSelect label="Ano" options={yearOptions} selected={selectedYears} onChange={setSelectedYears} />
          <MultiSelect label="Usina" options={plantOptions} selected={selectedPlants}
            onChange={(v) => { setSelectedPlants(v); setSelectedProjects([]); }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <MultiSelect label="Projeto" options={projectOptions} selected={selectedProjects} onChange={setSelectedProjects} />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="dash-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { cls: 'budget',   label: `Budget ${yearLabel}`,   val: totalBudget,   sub: `${filteredProjects.length} projeto(s)` },
          { cls: 'forecast', label: `Forecast ${yearLabel}`, val: totalForecast, sub: totalBudget ? `${((totalForecast / totalBudget) * 100).toFixed(1)}% do budget` : '—' },
          { cls: 'actual',   label: 'Realizado',             val: totalActual,   sub: totalForecast ? `${((totalActual / totalForecast) * 100).toFixed(1)}% do forecast` : '—' },
          { cls: '',         label: 'SI Total',              val: filteredProjects.reduce((s,p)=>s+parseFloat(p.si_value||0),0), sub: 'Valor aprovado' },
        ].map(c => (
          <div key={c.label} className={`stat-card ${c.cls}`} style={{ padding: '10px 14px' }}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value" style={{ fontSize: '1.15rem' }}>{fmt(c.val)}</div>
            <div className="stat-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* S-Curve chart — bars + lines, dual Y axis */}
      <div className="card" style={{ overflow: 'visible' }}>
        <div style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '8px 16px' }}>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
            Evolução Mensal + Curva S — {yearLabel}
          </span>
        </div>
        <div style={{ padding: '12px 8px 6px' }}>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={combinedData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#374151' }} interval={tickInterval} />

              {/* Left Y — monthly values */}
              <YAxis yAxisId="monthly" orientation="left" tickFormatter={fmtAxis}
                tick={{ fontSize: 9, fill: '#6B7280' }} width={58}
                label={{ value: 'Mensal', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 8, fill: '#9CA3AF' } }}
              />

              {/* Right Y — accumulated values */}
              <YAxis yAxisId="acum" orientation="right" tickFormatter={fmtAxis}
                tick={{ fontSize: 9, fill: '#6B7280' }} width={58}
                label={{ value: 'Acumulado', angle: 90, position: 'insideRight', offset: 12, style: { fontSize: 8, fill: '#9CA3AF' } }}
              />

              <Tooltip isAnimationActive={false} content={<ChartTooltip period={effectivePeriod} />}
                wrapperStyle={{ zIndex: 9999, maxWidth: 'min(280px, 80vw)' }} allowEscapeViewBox={{ x: false, y: true }} />

              <Legend wrapperStyle={{ fontSize: '0.68rem', color: '#374151', paddingTop: 4 }} formatter={(value) => {
                const L = {
                  Budget: 'Budget (mensal)', Forecast: 'Forecast (mensal)', Realizado: 'Realizado (mensal)',
                  Meta: 'Meta (mensal)', Pool: 'Pool (mensal)',
                  BudgetAcum: 'Budget (acum.)', ForecastAcum: 'Forecast (acum.)', RealizadoAcum: 'Realizado (acum.)',
                  MetaAcum: 'Meta (acum.)', PoolAcum: 'Pool (acum.)',
                };
                return L[value] || value;
              }} className="dash-legend" />

              {/* Monthly bars */}
              <Bar yAxisId="monthly" dataKey="Budget"    fill={C.budget+'88'}   radius={[2,2,0,0]} barSize={6} />
              <Bar yAxisId="monthly" dataKey="Forecast"  fill={C.forecast+'88'} radius={[2,2,0,0]} barSize={6} />
              <Bar yAxisId="monthly" dataKey="Realizado" fill={C.actual+'88'}   radius={[2,2,0,0]} barSize={6} />
              <Bar yAxisId="monthly" dataKey="Meta"      fill={C.meta+'88'}     radius={[2,2,0,0]} barSize={6} />
              <Bar yAxisId="monthly" dataKey="Pool"      fill={C.pool+'88'}     radius={[2,2,0,0]} barSize={6} />

              {/* Accumulated lines */}
              <Line yAxisId="acum" type="linear" dataKey="BudgetAcum"    stroke={C.budget}   strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="acum" type="linear" dataKey="ForecastAcum"  stroke={C.forecast} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="acum" type="linear" dataKey="RealizadoAcum" stroke={C.actual}   strokeWidth={2.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="acum" type="linear" dataKey="MetaAcum"      stroke={C.meta}     strokeWidth={2}   strokeDasharray="8 3" dot={false} activeDot={{ r: 3 }} />
              <Line yAxisId="acum" type="linear" dataKey="PoolAcum"      stroke={C.pool}     strokeWidth={2}   strokeDasharray="4 2" dot={false} activeDot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '7px 16px' }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.04em' }}>
            Projetos no filtro — {filteredProjects.length} projeto(s)
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr>
                {['Código','Projeto','Usinas',...(showEngCol ? ['Eng.'] : []),'Budget','Forecast','Realizado','% Exec.','SI','Atualizado',''].map(h => (
                  <th key={h} style={{
                    background: 'var(--ctg-navy)', color: '#fff', padding: '8px 14px',
                    textAlign: ['Código','Projeto','Usinas','Atualizado','Eng.'].includes(h) ? 'left' : h === '' ? 'center' : 'right',
                    fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    position: 'sticky', top: 0, zIndex: 1,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr><td colSpan={showEngCol ? 11 : 10} style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)' }}>Nenhum projeto</td></tr>
              ) : filteredProjects.map((p, i) => {
                const f = parseFloat(p.forecast) || 0;
                const a = parseFloat(p.actual) || 0;
                const exec = f ? ((a / f) * 100).toFixed(1) : '—';
                return (
                  <tr key={p.id} style={{ background: i % 2 ? '#F8FAFC' : 'var(--bg-card)', cursor: 'pointer', borderBottom: '1px solid #E2E8F0' }}
                    onClick={() => navigate(`/projects/${p.id}`)}>
                    <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--ctg-blue)', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{p.code}</td>
                    <td style={{ padding: '8px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: '8px 14px', maxWidth: 140 }}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {(p.plants || []).map(pl => (
                          <span key={pl} className="plant-tag" style={{ fontSize: '0.65rem' }}>{pl.replace('UHE ','').replace('PCH ','')}</span>
                        ))}
                      </div>
                    </td>
                    {showEngCol && (
                      <td style={{ padding: '8px 10px' }}>
                        <EngineerBadges engineers={p.engineers} engineerInitials={p.engineer_initials} size={26} />
                      </td>
                    )}
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