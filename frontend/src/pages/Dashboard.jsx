import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  BarChart,
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
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
}

// ── Project tooltip ───────────────────────────────────────────────────────────
function ProjectTooltip({ active, payload, label, projectMap }) {
  if (!active || !payload?.length) return null;
  const name    = projectMap[label] || label;
  const entries = payload.filter(p => p.value !== 0);
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)',
      fontSize: '0.8rem', minWidth: 180, maxWidth: 260, zIndex: 9999, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--ctg-navy)', fontSize: '0.82rem' }}>{label}</div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 6,
        wordBreak: 'break-word', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>{name}</div>
      {entries.map(p => (
        <div key={p.name} style={{ color: p.fill, display: 'flex', gap: 14, justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ opacity: 0.85 }}>{p.name}:</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Update badge ──────────────────────────────────────────────────────────────
function UpdateBadge({ dateStr }) {
  const C = useTypeColors();
  if (!dateStr) return <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:10,fontSize:'0.7rem',fontWeight:600,background:'#FEF3C7',color:'#92400E' }}>Sem dados</span>;
  const days = Math.floor((Date.now() - new Date(dateStr)) / 86_400_000);
  if (isNaN(days)) return null;
  if (days <= 30) return <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:10,fontSize:'0.7rem',fontWeight:600,background:'#DCFCE7',color:C.budget }}>● {days === 0 ? 'Hoje' : `${days}d`}</span>;
  return <span style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:10,fontSize:'0.7rem',fontWeight:600,background:'#FEE2E2',color:'#991B1B' }}>● {days}d</span>;
}

// ── Tooltip via portal (escapa overflow:hidden do modal) ──────────────────────
function ModalChartTooltip({ active, payload, label, period }) {
  const [mousePos, setMousePos] = useState(null);

  useEffect(() => {
    const h = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    document.addEventListener('mousemove', h);
    return () => document.removeEventListener('mousemove', h);
  }, []);

  if (!active || !payload?.length || !mousePos) return null;

  const TIP_W = 300, TIP_H = 290, OFF = 18;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = mousePos.x + OFF;
  let top  = mousePos.y + OFF;
  if (left + TIP_W > vw - 8) left = mousePos.x - TIP_W - OFF;
  if (top  + TIP_H > vh - 8) top  = mousePos.y - TIP_H - OFF;

  return createPortal(
    <div style={{ position: 'fixed', left, top, zIndex: 99999, pointerEvents: 'none' }}>
      <ChartTooltip active={active} payload={payload} label={label} period={period} />
    </div>,
    document.body
  );
}

// ── S-Curve expanded modal ────────────────────────────────────────────────────
function SCurveModal({ open, onClose, combinedData, period, tickInterval }) {
  const C = useTypeColors();

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const LEGEND_LABELS = {
    Budget: 'Budget (mensal)', Forecast: 'Forecast (mensal)', Realizado: 'Realizado (mensal)',
    Meta: 'Meta (mensal)', Pool: 'Pool (mensal)',
    BudgetAcum: 'Budget (acum.)', ForecastAcum: 'Forecast (acum.)', RealizadoAcum: 'Realizado (acum.)',
    MetaAcum: 'Meta (acum.)', PoolAcum: 'Pool (acum.)',
  };

  return createPortal(
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,23,42,0.70)', backdropFilter: 'blur(4px)',
      }} onClick={onClose} />

      {/* Modal — 95vw × 95vh ignorando sidebar */}
      <div style={{
        position: 'fixed',
        top: '2.5vh', left: '2.5vw',
        width: '95vw', height: '95vh',
        zIndex: 2001,
        background: 'var(--bg-card)',
        borderRadius: 16,
        boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column',
        overflow: 'visible',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          background: 'var(--ctg-navy)', padding: '13px 22px', flexShrink: 0,
          borderRadius: '16px 16px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>
            Curva S — Evolução Mensal + Acumulado
          </span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 8,
            color: '#fff', cursor: 'pointer', padding: '5px 14px',
            fontSize: '0.82rem', fontWeight: 700,
          }}>✕ Fechar</button>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, minHeight: 0, padding: '18px 20px 14px', overflow: 'visible' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={combinedData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#374151' }} interval={tickInterval} />
              <YAxis yAxisId="monthly" orientation="left" tickFormatter={fmtAxis}
                tick={{ fontSize: 10, fill: '#6B7280' }} width={68}
                label={{ value: 'Mensal', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 9, fill: '#9CA3AF' } }} />
              <YAxis yAxisId="acum" orientation="right" tickFormatter={fmtAxis}
                tick={{ fontSize: 10, fill: '#6B7280' }} width={68}
                label={{ value: 'Acumulado', angle: 90, position: 'insideRight', offset: 12, style: { fontSize: 9, fill: '#9CA3AF' } }} />
              <Tooltip
                isAnimationActive={false}
                content={(props) => <ModalChartTooltip {...props} period={period} />}
                wrapperStyle={{ display: 'none' }}
              />
              <Legend wrapperStyle={{ fontSize: '0.74rem', color: '#374151', paddingTop: 8 }}
                formatter={v => LEGEND_LABELS[v] || v} />
              <Bar yAxisId="monthly" dataKey="Budget"    fill={C.budget+'88'}   radius={[2,2,0,0]} barSize={9} />
              <Bar yAxisId="monthly" dataKey="Forecast"  fill={C.forecast+'88'} radius={[2,2,0,0]} barSize={9} />
              <Bar yAxisId="monthly" dataKey="Realizado" fill={C.actual+'88'}   radius={[2,2,0,0]} barSize={9} />
              <Bar yAxisId="monthly" dataKey="Meta"      fill={C.meta+'88'}     radius={[2,2,0,0]} barSize={9} />
              <Bar yAxisId="monthly" dataKey="Pool"      fill={C.pool+'88'}     radius={[2,2,0,0]} barSize={9} />
              <Line yAxisId="acum" type="linear" dataKey="BudgetAcum"    stroke={C.budget}   strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              <Line yAxisId="acum" type="linear" dataKey="ForecastAcum"  stroke={C.forecast} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              <Line yAxisId="acum" type="linear" dataKey="RealizadoAcum" stroke={C.actual}   strokeWidth={2.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 5 }} />
              <Line yAxisId="acum" type="linear" dataKey="MetaAcum"      stroke={C.meta}     strokeWidth={2}   strokeDasharray="8 3" dot={false} />
              <Line yAxisId="acum" type="linear" dataKey="PoolAcum"      stroke={C.pool}     strokeWidth={2}   strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Tooltip via portal para gráfico de projetos no modal ─────────────────────
function ModalProjectTooltip({ active, payload, label, projectMap }) {
  const [mousePos, setMousePos] = useState(null);

  useEffect(() => {
    const h = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    document.addEventListener('mousemove', h);
    return () => document.removeEventListener('mousemove', h);
  }, []);

  if (!active || !payload?.length || !mousePos) return null;

  const TIP_W = 280, TIP_H = 200, OFF = 18;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = mousePos.x + OFF;
  let top  = mousePos.y + OFF;
  if (left + TIP_W > vw - 8) left = mousePos.x - TIP_W - OFF;
  if (top  + TIP_H > vh - 8) top  = mousePos.y - TIP_H - OFF;

  const name    = projectMap[label] || label;
  const entries = payload.filter(p => p.value !== 0);

  return createPortal(
    <div style={{ position: 'fixed', left, top, zIndex: 99999, pointerEvents: 'none' }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-lg)',
        fontSize: '0.8rem', minWidth: 200, maxWidth: 280,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--ctg-navy)', fontSize: '0.85rem' }}>{label}</div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 6,
          wordBreak: 'break-word', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>{name}</div>
        {entries.map(p => (
          <div key={p.name} style={{ color: p.fill, display: 'flex', gap: 14, justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ opacity: 0.85 }}>{p.name}:</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(p.value)}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

// ── Por Projeto — modal expandido ─────────────────────────────────────────────
function ProjectChartModal({ open, onClose, data, projectMap, periodLabel }) {
  const C = useTypeColors();

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(15,23,42,0.70)', backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div style={{
        position:'fixed', top:'2.5vh', left:'2.5vw', width:'95vw', height:'95vh',
        zIndex:2001, background:'var(--bg-card)', borderRadius:16,
        boxShadow:'0 32px 80px rgba(0,0,0,0.45)',
        display:'flex', flexDirection:'column', overflow:'visible',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ background:'var(--ctg-navy)', padding:'13px 22px', flexShrink:0, borderRadius:'16px 16px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ color:'#fff', fontWeight:600, fontSize:'0.95rem' }}>Por Projeto — {periodLabel}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.14)', border:'none', borderRadius:8, color:'#fff', cursor:'pointer', padding:'5px 14px', fontSize:'0.82rem', fontWeight:700 }}>✕ Fechar</button>
        </div>

        <div style={{ flex:1, minHeight:0, padding:'18px 20px 14px', overflow:'visible' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top:8, right:24, left:0, bottom:40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize:11, fill:'#374151' }}
                angle={data.length > 8 ? -35 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} interval={0} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize:10, fill:'#6B7280' }} width={68} />
              <Tooltip
                isAnimationActive={false}
                content={(props) => <ModalProjectTooltip {...props} projectMap={projectMap} />}
                wrapperStyle={{ display:'none' }}
              />
              <Legend wrapperStyle={{ fontSize:'0.78rem', color:'#374151', paddingTop:8 }} />
              <Bar dataKey="Budget"    fill={C.budget}   radius={[3,3,0,0]} />
              <Bar dataKey="Forecast"  fill={C.forecast} radius={[3,3,0,0]} />
              <Bar dataKey="Realizado" fill={C.actual}   radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Tabela — modal expandido ──────────────────────────────────────────────────
function TableModal({ open, onClose, filtered, showEngCol, periodLabel, C, navigate }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(15,23,42,0.70)', backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div style={{
        position:'fixed', top:'2.5vh', left:'2.5vw', width:'95vw', height:'95vh',
        zIndex:2001, background:'var(--bg-card)', borderRadius:16,
        boxShadow:'0 32px 80px rgba(0,0,0,0.45)',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ background:'var(--ctg-navy)', padding:'13px 22px', flexShrink:0, borderRadius:'16px 16px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ color:'#fff', fontWeight:600, fontSize:'0.95rem' }}>Resumo por Projeto — {periodLabel}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.14)', border:'none', borderRadius:8, color:'#fff', cursor:'pointer', padding:'5px 14px', fontSize:'0.82rem', fontWeight:700 }}>✕ Fechar</button>
        </div>

        <div style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.9rem' }}>
            <thead>
              <tr>
                {['Código','Projeto','Usinas',...(showEngCol ? ['Eng.'] : []),'Budget','Forecast','Realizado','% Exec.','SI','Atualizado',''].map(h => (
                  <th key={h} style={{
                    background:'var(--ctg-navy)', color:'#fff', padding:'9px 16px',
                    textAlign: ['Código','Projeto','Usinas','Atualizado','Eng.'].includes(h) ? 'left' : h==='' ? 'center' : 'right',
                    fontWeight:700, fontSize:'0.74rem', whiteSpace:'nowrap',
                    letterSpacing:'0.04em', textTransform:'uppercase',
                    position:'sticky', top:0, zIndex:1,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={showEngCol ? 11 : 10} style={{ textAlign:'center', padding:40, color:'var(--text-secondary)' }}>Nenhum projeto</td></tr>
              ) : filtered.map((p, i) => {
                const f    = parseFloat(p.forecast) || 0;
                const a    = parseFloat(p.actual)   || 0;
                const exec = f ? ((a / f) * 100).toFixed(1) : '—';
                return (
                  <tr key={p.id}
                    style={{ background: i % 2 ? '#F8FAFC' : 'var(--bg-card)', cursor:'pointer', borderBottom:'1px solid #E2E8F0' }}
                    onClick={() => { onClose(); navigate(`/projects/${p.id}`); }}
                  >
                    <td style={{ padding:'9px 16px', fontWeight:700, color:'var(--ctg-blue)', fontFamily:'monospace', fontSize:'0.88rem', whiteSpace:'nowrap' }}>{p.code}</td>
                    <td style={{ padding:'9px 16px', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text-primary)', fontWeight:500 }}>{p.name}</td>
                    <td style={{ padding:'9px 16px', maxWidth:160 }}>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        {(p.plants || []).map(pl => (
                          <span key={pl} className="plant-tag" style={{ fontSize:'0.68rem' }}>{pl.replace('UHE ','').replace('PCH ','')}</span>
                        ))}
                      </div>
                    </td>
                    {showEngCol && (
                      <td style={{ padding:'9px 12px' }}>
                        <EngineerBadges engineers={p.engineers} engineerInitials={p.engineer_initials} size={26} />
                      </td>
                    )}
                    <td style={{ padding:'9px 16px', textAlign:'right', color:C.budget,   fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{fmt(p.budget)}</td>
                    <td style={{ padding:'9px 16px', textAlign:'right', color:C.forecast, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(p.forecast)}</td>
                    <td style={{ padding:'9px 16px', textAlign:'right', color:C.actual,   fontVariantNumeric:'tabular-nums', fontWeight:500 }}>{fmt(p.actual)}</td>
                    <td style={{ padding:'9px 16px', textAlign:'right' }}>
                      {exec !== '—' ? (
                        <span style={{ background: parseFloat(exec) > 100 ? '#FEF3C7' : '#DCFCE7', color: parseFloat(exec) > 100 ? '#991B1B' : C.budget, padding:'2px 8px', borderRadius:10, fontSize:'0.76rem', fontWeight:700 }}>{exec}%</span>
                      ) : <span style={{ color:'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding:'9px 16px', textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--text-primary)', fontWeight:500 }}>{fmt(p.si_value)}</td>
                    <td style={{ padding:'9px 16px' }}><UpdateBadge dateStr={p.last_forecast_update} /></td>
                    <td style={{ padding:'9px 16px', textAlign:'center', color:'var(--ctg-blue)', fontWeight:700 }}>→</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Card header ───────────────────────────────────────────────────────────────
function CardHeader({ title, action }) {
  return (
    <div style={{
      background: 'var(--ctg-navy)',
      borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
      padding: '6px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 600 }}>{title}</span>
      {action}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ period, plantFilter = [], projectFilter = [] }) {
  const C = useTypeColors();
  const { isEngenheiro } = useRole();
  const showEngCol = !isEngenheiro;
  const navigate   = useNavigate();

  const [dashData,     setDashData]     = useState([]);
  const [allSummaries, setAllSummaries] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [scurveOpen,         setScurveOpen]         = useState(false);
  const [projectChartOpen,   setProjectChartOpen]   = useState(false);
  const [tableOpen,          setTableOpen]          = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [dashRes, sumRes] = await Promise.all([
          api.get('/forecast/dashboard', { params: { yearStart: period.start, yearEnd: period.end } }),
          api.get('/forecast/summaries',  { params: { yearStart: period.start, yearEnd: period.end } }),
        ]);
        setDashData(dashRes.data);
        setAllSummaries(sumRes.data);
      } catch {}
      setLoading(false);
    };
    fetchAll();
  }, [period.start, period.end]);

  // Filtered projects — all filters come from the header
  const filtered = useMemo(() => {
    let projects = dashData;
    if (plantFilter.length > 0)
      projects = projects.filter(p => plantFilter.some(f => (p.plants || []).includes(f)));
    if (projectFilter.length > 0)
      projects = projects.filter(p => projectFilter.includes(p.id));
    return projects;
  }, [dashData, plantFilter, projectFilter]);

  const filteredIds = useMemo(() => new Set(filtered.map(p => String(p.id))), [filtered]);

  const filteredSummaries = useMemo(() =>
    allSummaries.filter(s => filteredIds.has(String(s.project_id))),
    [allSummaries, filteredIds]
  );

  // Monthly data
  const monthlyData = useMemo(() => {
    const result = [];
    for (let y = period.start; y <= period.end; y++) {
      MONTHS_PT.forEach((m, i) => {
        const month = i + 1;
        const key   = period.start === period.end ? m : `${m}/${y}`;
        const entry = { month: key };
        ['Budget', 'Forecast', 'Realizado', 'Meta', 'Pool'].forEach(type => {
          const apiType = type === 'Realizado' ? 'Actual' : type;
          entry[type] = filteredSummaries
            .filter(s => parseInt(s.year) === y && parseInt(s.month) === month && s.type === apiType)
            .reduce((sum, s) => sum + parseFloat(s.total || 0), 0);
        });
        result.push(entry);
      });
    }
    return result;
  }, [filteredSummaries, period]);

  // S-Curve accumulated data
  const combinedData = useMemo(() => monthlyData.reduce((acc, d, i) => {
    const prev = acc[i - 1] || { BudgetAcum: 0, ForecastAcum: 0, RealizadoAcum: 0, MetaAcum: 0, PoolAcum: 0 };
    acc.push({
      ...d,
      BudgetAcum:    prev.BudgetAcum    + d.Budget,
      ForecastAcum:  prev.ForecastAcum  + d.Forecast,
      RealizadoAcum: prev.RealizadoAcum + d.Realizado,
      MetaAcum:      prev.MetaAcum      + d.Meta,
      PoolAcum:      prev.PoolAcum      + d.Pool,
    });
    return acc;
  }, []), [monthlyData]);

  // KPIs
  const totalBudget   = filtered.reduce((s, p) => s + parseFloat(p.budget    || 0), 0);
  const totalForecast = filtered.reduce((s, p) => s + parseFloat(p.forecast   || 0), 0);
  const totalActual   = filtered.reduce((s, p) => s + parseFloat(p.actual     || 0), 0);
  const totalSI       = filtered.reduce((s, p) => s + parseFloat(p.si_value   || 0), 0);

  const periodLabel  = period.start === period.end ? `${period.start}` : `${period.start}–${period.end}`;
  const yearSpan     = period.end - period.start;
  const tickInterval = yearSpan === 0 ? 0 : yearSpan === 1 ? 2 : 5;

  const projectMap = useMemo(() => {
    const map = {};
    filtered.forEach(p => { map[p.code] = p.name; });
    return map;
  }, [filtered]);

  const LEGEND_LABELS = {
    Budget: 'Budget (mensal)', Forecast: 'Forecast (mensal)', Realizado: 'Realizado (mensal)',
    Meta: 'Meta (mensal)', Pool: 'Pool (mensal)',
    BudgetAcum: 'Budget (acum.)', ForecastAcum: 'Forecast (acum.)', RealizadoAcum: 'Realizado (acum.)',
    MetaAcum: 'Meta (acum.)', PoolAcum: 'Pool (acum.)',
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <>
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', minHeight: 0,
        gap: 10, overflow: 'hidden',
      }}>

        {/* ── KPI cards ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0 }}>
          {[
            { cls: 'budget',   label: `Budget ${periodLabel}`,   val: totalBudget,   sub: `${filtered.length} projeto${filtered.length !== 1 ? 's' : ''}` },
            { cls: 'forecast', label: `Forecast ${periodLabel}`, val: totalForecast, sub: totalBudget   ? `${((totalForecast / totalBudget)   * 100).toFixed(1)}% do budget`   : '—' },
            { cls: 'actual',   label: 'Realizado',               val: totalActual,   sub: totalForecast ? `${((totalActual   / totalForecast) * 100).toFixed(1)}% do forecast` : '—' },
            { cls: '',         label: 'SI Total',                val: totalSI,       sub: 'Valor aprovado' },
          ].map(c => (
            <div key={c.label} className={`stat-card ${c.cls}`} style={{ padding: '10px 14px' }}>
              <div className="stat-label">{c.label}</div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{fmt(c.val)}</div>
              <div className="stat-sub">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Charts row ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10, flexShrink: 0 }}>

          {/* S-Curve */}
          <div className="card" style={{ overflow: 'visible' }}>
            <CardHeader
              title={`Evolução Mensal + S-Curve — ${periodLabel}`}
              action={
                <button onClick={() => setScurveOpen(true)} title="Expandir gráfico" style={{
                  background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6,
                  color: '#fff', cursor: 'pointer', padding: '3px 8px', fontSize: '0.72rem',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                    <path d="M1.5 1h4a.5.5 0 010 1H2.707l3.647 3.646a.5.5 0 01-.708.708L2 2.707V5.5a.5.5 0 01-1 0v-4A.5.5 0 011.5 1zM14.5 1a.5.5 0 01.5.5v4a.5.5 0 01-1 0V2.707l-3.646 3.647a.5.5 0 01-.708-.708L13.293 2H10.5a.5.5 0 010-1h4zM1.5 15a.5.5 0 01-.5-.5v-4a.5.5 0 011 0v2.793l3.646-3.647a.5.5 0 01.708.708L2.707 14H5.5a.5.5 0 010 1h-4zM10 10.854a.5.5 0 01.708-.708L14 13.293V10.5a.5.5 0 011 0v4a.5.5 0 01-.5.5h-4a.5.5 0 010-1h2.793l-3.647-3.646a.5.5 0 01.354-.5z"/>
                  </svg>
                  Expandir
                </button>
              }
            />
            <div style={{ padding: '8px 6px 4px' }}>
              <ResponsiveContainer width="100%" height={168}>
                <ComposedChart data={combinedData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#374151' }} interval={tickInterval} />
                  <YAxis yAxisId="monthly" orientation="left" tickFormatter={fmtAxis}
                    tick={{ fontSize: 8, fill: '#6B7280' }} width={50}
                    label={{ value: 'Mensal', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 7, fill: '#9CA3AF' } }} />
                  <YAxis yAxisId="acum" orientation="right" tickFormatter={fmtAxis}
                    tick={{ fontSize: 8, fill: '#6B7280' }} width={50}
                    label={{ value: 'Acumulado', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 7, fill: '#9CA3AF' } }} />
                  <Tooltip isAnimationActive={false} content={<ChartTooltip period={period} />}
                    wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
                    allowEscapeViewBox={{ x: true, y: true }} />
                  <Legend wrapperStyle={{ fontSize: '0.62rem', color: '#374151', paddingTop: 2 }}
                    formatter={v => LEGEND_LABELS[v] || v} className="dash-legend" />
                  <Bar yAxisId="monthly" dataKey="Budget"    fill={C.budget+'88'}   radius={[2,2,0,0]} barSize={5} />
                  <Bar yAxisId="monthly" dataKey="Forecast"  fill={C.forecast+'88'} radius={[2,2,0,0]} barSize={5} />
                  <Bar yAxisId="monthly" dataKey="Realizado" fill={C.actual+'88'}   radius={[2,2,0,0]} barSize={5} />
                  <Bar yAxisId="monthly" dataKey="Meta"      fill={C.meta+'88'}     radius={[2,2,0,0]} barSize={5} />
                  <Bar yAxisId="monthly" dataKey="Pool"      fill={C.pool+'88'}     radius={[2,2,0,0]} barSize={5} />
                  <Line yAxisId="acum" type="linear" dataKey="BudgetAcum"    stroke={C.budget}   strokeWidth={2} dot={false} />
                  <Line yAxisId="acum" type="linear" dataKey="ForecastAcum"  stroke={C.forecast} strokeWidth={2} dot={false} />
                  <Line yAxisId="acum" type="linear" dataKey="RealizadoAcum" stroke={C.actual}   strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} />
                  <Line yAxisId="acum" type="linear" dataKey="MetaAcum"      stroke={C.meta}     strokeWidth={1.5} strokeDasharray="8 3" dot={false} />
                  <Line yAxisId="acum" type="linear" dataKey="PoolAcum"      stroke={C.pool}     strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Por Projeto */}
          <div className="card" style={{ overflow: 'visible' }}>
            <CardHeader
              title={`Por Projeto — ${periodLabel}`}
              action={
                <button onClick={() => setProjectChartOpen(true)} title="Expandir gráfico" style={{
                  background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6,
                  color: '#fff', cursor: 'pointer', padding: '3px 8px', fontSize: '0.72rem',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                    <path d="M1.5 1h4a.5.5 0 010 1H2.707l3.647 3.646a.5.5 0 01-.708.708L2 2.707V5.5a.5.5 0 01-1 0v-4A.5.5 0 011.5 1zM14.5 1a.5.5 0 01.5.5v4a.5.5 0 01-1 0V2.707l-3.646 3.647a.5.5 0 01-.708-.708L13.293 2H10.5a.5.5 0 010-1h4zM1.5 15a.5.5 0 01-.5-.5v-4a.5.5 0 011 0v2.793l3.646-3.647a.5.5 0 01.708.708L2.707 14H5.5a.5.5 0 010 1h-4zM10 10.854a.5.5 0 01.708-.708L14 13.293V10.5a.5.5 0 011 0v4a.5.5 0 01-.5.5h-4a.5.5 0 010-1h2.793l-3.647-3.646a.5.5 0 01.354-.5z"/>
                  </svg>
                  Expandir
                </button>
              }
            />
            <div style={{ padding: '8px 6px 4px' }}>
              <ResponsiveContainer width="100%" height={168}>
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
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#374151' }} />
                  <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 9, fill: '#374151' }} width={50} />
                  <Tooltip isAnimationActive={false} content={<ProjectTooltip projectMap={projectMap} />}
                    wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
                    allowEscapeViewBox={{ x: true, y: true }} />
                  <Legend wrapperStyle={{ fontSize: '0.62rem', color: '#374151', paddingTop: 2 }} className="dash-legend" />
                  <Bar dataKey="Budget"    fill={C.budget}   radius={[2,2,0,0]} />
                  <Bar dataKey="Forecast"  fill={C.forecast} radius={[2,2,0,0]} />
                  <Bar dataKey="Realizado" fill={C.actual}   radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Summary table ─────────────────────────────────────────────── */}
        <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '6px 12px', background: '#1E3A6E', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.76rem', fontWeight: 600, letterSpacing: '0.04em' }}>
              Resumo por Projeto — {periodLabel}
            </span>
            <button onClick={() => setTableOpen(true)} title="Expandir tabela" style={{
              background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6,
              color: '#fff', cursor: 'pointer', padding: '3px 8px', fontSize: '0.72rem',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                <path d="M1.5 1h4a.5.5 0 010 1H2.707l3.647 3.646a.5.5 0 01-.708.708L2 2.707V5.5a.5.5 0 01-1 0v-4A.5.5 0 011.5 1zM14.5 1a.5.5 0 01.5.5v4a.5.5 0 01-1 0V2.707l-3.646 3.647a.5.5 0 01-.708-.708L13.293 2H10.5a.5.5 0 010-1h4zM1.5 15a.5.5 0 01-.5-.5v-4a.5.5 0 011 0v2.793l3.646-3.647a.5.5 0 01.708.708L2.707 14H5.5a.5.5 0 010 1h-4zM10 10.854a.5.5 0 01.708-.708L14 13.293V10.5a.5.5 0 011 0v4a.5.5 0 01-.5.5h-4a.5.5 0 010-1h2.793l-3.647-3.646a.5.5 0 01.354-.5z"/>
              </svg>
              Expandir
            </button>
          </div>
          <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1 }}>
            <table className="dash-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {['Código','Projeto','Usinas',...(showEngCol ? ['Eng.'] : []),'Budget','Forecast','Realizado','% Exec.','SI','Atualizado',''].map(h => (
                    <th key={h} style={{
                      background: 'var(--ctg-navy)', color: '#fff', padding: '7px 12px',
                      textAlign: ['Código','Projeto','Usinas','Atualizado','Eng.'].includes(h) ? 'left' : h === '' ? 'center' : 'right',
                      fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      position: 'sticky', top: 0, zIndex: 1,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={showEngCol ? 11 : 10} style={{ textAlign: 'center', padding: 28, color: 'var(--text-secondary)' }}>Nenhum projeto</td></tr>
                ) : filtered.map((p, i) => {
                  const f    = parseFloat(p.forecast) || 0;
                  const a    = parseFloat(p.actual)   || 0;
                  const exec = f ? ((a / f) * 100).toFixed(1) : '—';
                  return (
                    <tr key={p.id}
                      style={{ background: i % 2 ? '#F8FAFC' : 'var(--bg-card)', cursor: 'pointer', borderBottom: '1px solid #E2E8F0' }}
                      onClick={() => navigate(`/projects/${p.id}`)}
                    >
                      <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--ctg-blue)', fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{p.code}</td>
                      <td style={{ padding: '7px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: '7px 12px', maxWidth: 130 }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {(p.plants || []).map(pl => (
                            <span key={pl} className="plant-tag" style={{ fontSize: '0.62rem' }}>
                              {pl.replace('UHE ','').replace('PCH ','')}
                            </span>
                          ))}
                        </div>
                      </td>
                      {showEngCol && (
                        <td style={{ padding: '7px 10px' }}>
                          <EngineerBadges engineers={p.engineers} engineerInitials={p.engineer_initials} size={24} />
                        </td>
                      )}
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: C.budget,   fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.budget)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: C.forecast, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(p.forecast)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: C.actual,   fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.actual)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        {exec !== '—' ? (
                          <span style={{
                            background: parseFloat(exec) > 100 ? '#FEF3C7' : '#DCFCE7',
                            color: parseFloat(exec) > 100 ? '#991B1B' : C.budget,
                            padding: '2px 6px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700,
                          }}>{exec}%</span>
                        ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 500 }}>{fmt(p.si_value)}</td>
                      <td style={{ padding: '7px 12px' }}><UpdateBadge dateStr={p.last_forecast_update} /></td>
                      <td style={{ padding: '7px 12px', textAlign: 'center', color: 'var(--ctg-blue)', fontWeight: 700 }}>→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* S-Curve modal */}
      <SCurveModal
        open={scurveOpen}
        onClose={() => setScurveOpen(false)}
        combinedData={combinedData}
        period={period}
        tickInterval={tickInterval}
      />

      {/* Por Projeto modal */}
      <ProjectChartModal
        open={projectChartOpen}
        onClose={() => setProjectChartOpen(false)}
        data={filtered.map(p => ({
          name:      p.code,
          Budget:    parseFloat(p.budget)   || 0,
          Forecast:  parseFloat(p.forecast)  || 0,
          Realizado: parseFloat(p.actual)    || 0,
        }))}
        projectMap={projectMap}
        periodLabel={periodLabel}
      />

      {/* Tabela modal */}
      <TableModal
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        filtered={filtered}
        showEngCol={showEngCol}
        periodLabel={periodLabel}
        C={C}
        navigate={navigate}
      />
    </>
  );
}