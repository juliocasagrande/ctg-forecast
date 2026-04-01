import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { ComposedChart, BarChart, Bar, LineChart, Line, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api.js';
import { useTypeColors, useSettings } from '../context/SettingsContext.jsx';
import { useAuth, useRole } from '../context/AuthContext.jsx';
import { formatBRL, formatBRLShort, MONTHS_PT, CATEGORIES } from '../utils/format.js';
import ForecastWizard from './ForecastWizard.jsx';
import ProjectChat from './ProjectChat.jsx';
import Modal from './ui/Modal.jsx';
import { useToast } from './ui/Toast.jsx';
import ChartTooltip from './ui/ChartTooltip.jsx';

const fmt = formatBRLShort;

const ROLE_LABELS  = { admin:'Administrador', gestor:'Gestor', engenheiro:'Engenheiro', planejador:'Planejador' };
const ROLE_COLORS  = { admin:'#001F5B', gestor:'#0070B8', engenheiro:'#166534', planejador:'#7C3AED' };

// Tabs available per role inside the Forecast section
const FORECAST_TABS = {
  planejador: [
    { id: 'Budget',              label: 'Budget'             },
    { id: 'Forecast',            label: 'Forecast'           },
    { id: 'Actual',              label: 'Realizado'          },
    { id: 'Pool',                label: 'Pool'               },
    { id: 'Meta',                label: 'Meta'               },
  ],
  engenheiro: [
    { id: 'Forecast', label: 'Forecast'  },
    { id: 'Actual',   label: 'Realizado' },
  ],
  coordenador: [
    { id: 'Budget',              label: 'Budget'             },
    { id: 'Forecast',            label: 'Forecast'           },
    { id: 'Actual',              label: 'Realizado'          },
    { id: 'Pool',                label: 'Pool'               },
    { id: 'Meta',                label: 'Meta'               },
  ],
  gerente: [], // read-only, no wizard tabs
  gestor: [
    { id: 'Budget',              label: 'Budget'             },
    { id: 'Forecast',            label: 'Forecast'           },
    { id: 'Actual',              label: 'Realizado'          },
    { id: 'Pool',                label: 'Pool'               },
    { id: 'Meta',                label: 'Meta'               },
  ],
};

function Avatar({ name, initials, role, size=32 }) {
  return (
    <div style={{width:size,height:size,borderRadius:'50%',background:ROLE_COLORS[role]||'#888',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:700,color:'#fff',flexShrink:0}}>
      {initials||name?.slice(0,2).toUpperCase()}
    </div>
  );
}

// ── SI Warning ───────────────────────────────────────────────────────────────
function SIWarning({ projection, siValue }) {
  const si = parseFloat(siValue)||0;
  const proj = parseFloat(projection)||0;
  const over = proj - si;
  if (!si || over <= 0) return null;
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,background:'#FEF2F2',border:'1.5px solid #FCA5A5',borderRadius:'var(--radius-sm)',padding:'6px 12px',fontSize:'0.78rem',color:'#991B1B',fontWeight:600,marginBottom:10}}>
      ⚠ Proje\u00e7\u00e3o (Realizado + Forecast restante) excede a SI em {formatBRL(over)}
    </div>
  );
}

// ── Read-only table (gestor) ──────────────────────────────────────────────────
function ReadOnlyTable({ entries, year, siValue, consolidatedActual, siProjection }) {
  const C = useTypeColors();
  const [tooltip, setTooltip] = useState(null); // { x, y, comments: [{user, type, text}] }
  const getEntry = (cat, type, month) =>
    entries.find(e=>e.category===cat&&e.type===type&&parseInt(e.year)===year&&parseInt(e.month)===month);
  const get = (cat, type, month) => parseFloat(getEntry(cat,type,month)?.value||0);
  const getComment = (cat, type, month) => getEntry(cat,type,month)?.comment || '';
  const getCommentUser = (cat, type, month) => getEntry(cat,type,month)?.updated_by_name || '';
  const rowTotal = (cat, type) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+get(cat,type,m),0);
  const colTotal = (month, type) => CATEGORIES.reduce((s,c)=>s+get(c,type,month),0);
  const grandTotal = (type) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+colTotal(m,type),0);
  const f = v => v ? v.toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2}) : '—';

  // Gather all comments for a given cat+month across all types
  const getAllComments = (cat, month) => {
    const TYPE_LABELS = { Budget:'Budget', Forecast:'Forecast', Actual:'Realizado', Meta:'Meta', Pool:'Pool' };
    return ['Budget','Forecast','Actual','Meta','Pool']
      .map(type => {
        const comment = getComment(cat, type, month);
        if (!comment) return null;
        return { user: getCommentUser(cat, type, month), type: TYPE_LABELS[type], text: comment };
      })
      .filter(Boolean);
  };

  const handleCellEnter = (e, cat, month) => {
    const comments = getAllComments(cat, month);
    if (comments.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, comments, month, cat });
  };
  const handleCellLeave = () => setTooltip(null);

  const TYPE_COLORS = { Budget: C.budget, Forecast: C.forecast, Realizado: C.actual, Meta: C.meta, Pool: C.pool };

  return (
    <>
      <SIWarning projection={siProjection} siValue={siValue} />
      <div className="table-wrapper" style={{position:'relative'}}>
        <table className="forecast-table">
          <thead>
            <tr><th className="col-label">Categoria / Tipo</th>{MONTHS_PT.map(m=><th key={m}>{m}</th>)}<th>Total</th></tr>
          </thead>
          <tbody>
            {CATEGORIES.map(cat=>(
              <Fragment key={cat}>
                <tr className="cat-header-row"><td colSpan={14}>{cat}</td></tr>
                {['Budget','Forecast','Actual','Meta','Pool'].map(type=>(
                  <tr key={`${cat}-${type}`} className={`row-${type === 'Actual' ? 'actual' : type === 'Meta' ? 'meta' : type === 'Pool' ? 'pool' : type.toLowerCase()}`}>
                    <td className="td-label">{type}</td>
                    {Array.from({length:12},(_,i)=>i+1).map(m=>{
                      const hasComment = !!getComment(cat,type,m);
                      return (
                        <td key={m}
                          onMouseEnter={e => handleCellEnter(e, cat, m)}
                          onMouseLeave={handleCellLeave}
                          style={hasComment ? { cursor:'help' } : undefined}
                        >{f(get(cat,type,m))}</td>
                      );
                    })}
                    <td style={{fontWeight:700}}>{f(rowTotal(cat,type))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="cat-header-row total-geral"><td colSpan={14}>TOTAL GERAL</td></tr>
            {['Budget','Forecast','Actual','Meta','Pool'].map(type=>{
              const th = {
                Budget:  { row:C.budget+'22', midBg:C.budget+'66', text:C.budget, border:C.budget },
                Forecast:{ row:C.forecast+'22', midBg:C.forecast+'66', text:C.forecast, border:C.forecast },
                Actual:  { row:C.actual+'22', midBg:C.actual+'66', text:C.actual, border:C.actual },
                Meta:    { row:C.meta+'22', midBg:C.meta+'66', text:C.meta, border:C.meta },
                Pool:    { row:C.pool+'22', midBg:C.pool+'66', text:C.pool, border:C.pool },
              }[type];
              return (
                <tr key={`tot-${type}`} style={{background:th.row}}>
                  <td className="td-label" style={{
                    color: th.text,
                    background: th.midBg,
                    fontWeight: 700,
                    borderLeft: `4px solid ${th.border}`,
                  }}>{type==='Actual'?'Realizado':type}</td>
                  {Array.from({length:12},(_,i)=>i+1).map(m=><td key={m} style={{fontWeight:700,color:th.text}}>{f(colTotal(m,type))}</td>)}
                  <td style={{fontWeight:800,fontSize:'0.88rem',color:th.text}}>{f(grandTotal(type))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating comment tooltip — portaled to body to escape overflow */}
      {tooltip && createPortal(
        <div style={{
          position:'fixed', left: tooltip.x, top: tooltip.y,
          transform:'translate(-50%, -100%)',
          background:'var(--bg-card)', border:'1px solid var(--border)',
          borderRadius:8, padding:'10px 14px', boxShadow:'0 4px 20px rgba(0,0,0,0.12)',
          fontSize:'0.8rem', minWidth:220, maxWidth:340, zIndex:9999, pointerEvents:'none',
        }}>
          <div style={{ fontWeight:700, marginBottom:6, color:'var(--ctg-navy)', fontSize:'0.82rem',
            borderBottom:'1px solid var(--border)', paddingBottom:5 }}>
            {MONTHS_PT[tooltip.month - 1]} — {tooltip.cat}
          </div>
          {tooltip.comments.map((c, i) => (
            <div key={i} style={{ marginBottom: i < tooltip.comments.length - 1 ? 8 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <span style={{ width:8, height:8, borderRadius:2, background: TYPE_COLORS[c.type] || 'var(--ctg-blue)', flexShrink:0 }}/>
                <span style={{ fontSize:'0.7rem', fontWeight:700, color: TYPE_COLORS[c.type] || 'var(--text-primary)' }}>{c.type}</span>
                {c.user && <span style={{ fontSize:'0.65rem', color:'var(--text-muted)', fontWeight:500 }}>— {c.user}</span>}
              </div>
              <div style={{ fontSize:'0.76rem', color:'var(--text-secondary)', paddingLeft:14, lineHeight:1.4 }}>
                {c.text}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Consolidated Year Table — summary view for past years ────────────────────
function ConsolidatedYearTable({ yearConsData, year }) {
  const C = useTypeColors();
  // New simplified format: single value with category='Total', type='Actual'
  const getTotal = () => {
    const row = yearConsData.find(e => parseInt(e.year) === year && e.type === 'Actual' && e.category === 'Total');
    if (row) return parseFloat(row.value) || 0;
    // Fallback: sum old per-category format for backwards compatibility
    const oldRows = yearConsData.filter(e => parseInt(e.year) === year && e.type === 'Actual');
    return oldRows.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
  };
  const total = getTotal();
  const f = v => v ? v.toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2}) : '—';

  if (!total) {
    return (
      <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)',fontSize:'0.9rem'}}>
        <p style={{marginBottom:8,fontSize:'1.1rem'}}>📦</p>
        <p>Nenhum valor consolidado registrado para {year}.</p>
        <p style={{fontSize:'0.8rem',marginTop:4}}>Acesse a aba <strong>Forecast</strong> → <strong>{year} consolidado</strong> para inserir o valor.</p>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius:'var(--radius-md)',border:`2px solid ${C.actual}`,overflow:'hidden',maxWidth:400,
    }}>
      <div style={{
        padding:'14px 20px',background:`linear-gradient(135deg, ${C.actual}EE, ${C.actual}BB)`,
        color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',
      }}>
        <span style={{fontWeight:700,fontSize:'0.95rem'}}>Realizado Consolidado — {year}</span>
      </div>
      <div style={{padding:'20px',background:C.actual+'12',textAlign:'center'}}>
        <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Valor Total Realizado</div>
        <div style={{fontFamily:'var(--font-display)',fontSize:'1.8rem',color:C.actual,fontWeight:700}}>
          R$ {f(total)}
        </div>
      </div>
    </div>
  );
}

// ── Consolidated Year Charts — simplified for single Actual value ─────────────
function ConsolidatedYearCharts({ yearConsData, year }) {
  const C = useTypeColors();
  const getTotal = () => {
    const row = yearConsData.find(e => parseInt(e.year) === year && e.type === 'Actual' && e.category === 'Total');
    if (row) return parseFloat(row.value) || 0;
    const oldRows = yearConsData.filter(e => parseInt(e.year) === year && e.type === 'Actual');
    return oldRows.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
  };
  const total = getTotal();

  if (!total) {
    return (
      <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)',fontSize:'0.9rem'}}>
        Nenhum dado consolidado para {year}.
      </div>
    );
  }

  return (
    <div style={{textAlign:'center',padding:'24px',background:'var(--bg-card)',borderRadius:'var(--radius-md)',border:'1px solid var(--border)'}}>
      <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Realizado Consolidado — {year}</div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'2rem',color:C.actual,fontWeight:700}}>
        {formatBRL(total)}
      </div>
    </div>
  );
}

// ── Consolidated Actual Panel ─────────────────────────────────────────────────
function ConsolidatedActualPanel({ projectId, siValue, forecastTotal, actualTotal, siProjection }) {
  const [data, setData]     = useState({ value:0, comment:'' });
  const [editing, setEditing] = useState(false);
  const [val, setVal]       = useState('');
  const [cmt, setCmt]       = useState('');
  const { toast } = useToast();
  const si = parseFloat(siValue)||0;

  const load = useCallback(() => {
    api.get(`/forecast/project/${projectId}/actual-consolidated`)
      .then(r => { setData(r.data||{value:0,comment:''}); setVal(r.data?.value||''); setCmt(r.data?.comment||''); })
      .catch(()=>{});
  }, [projectId]);

  useEffect(()=>{ load(); }, [load]);

  const handleSave = async () => {
    try {
      await api.post(`/forecast/project/${projectId}/actual-consolidated`, {
        value: parseFloat(String(val).replace(/\./g,'').replace(',','.')) || 0, comment: cmt,
      });
      load(); setEditing(false);
      toast('Realizado consolidado salvo', 'success');
    } catch { toast('Erro ao salvar', 'error'); }
  };

  const total = (parseFloat(data.value)||0) + (parseFloat(forecastTotal)||0) + (parseFloat(actualTotal)||0);
  const overSI = si && (siProjection || total) > si;

  return (
    <div style={{marginTop:8}}>
      {overSI && <SIWarning projection={siProjection || total} siValue={si}/>}
      {editing ? (
        <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:12}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Valor Realizado (R$)</label>
            <input className="form-input" type="text" inputMode="decimal" placeholder="0,00"
              value={val} onChange={e=>setVal(e.target.value)} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Observação</label>
            <input className="form-input" type="text" placeholder="Ex: Realizado acumulado até 2025"
              value={cmt} onChange={e=>setCmt(e.target.value)} />
          </div>
          <div style={{gridColumn:'1/-1',display:'flex',gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>Salvar</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{display:'flex',gap:24,alignItems:'center'}}>
          <div>
            <div style={{fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',marginBottom:2}}>Valor</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'1.5rem',color: overSI ? '#DC2626' : 'var(--ctg-navy)'}}>
              {formatBRL(data.value||0)}
            </div>
          </div>
          {data.comment && (
            <div>
              <div style={{fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',marginBottom:2}}>Observação</div>
              <div style={{fontSize:'0.85rem',color:'var(--text-secondary)'}}>{data.comment}</div>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(true)} style={{marginLeft:'auto'}}>✎ Editar</button>
        </div>
      )}
    </div>
  );
}

// ── Activity Panel ────────────────────────────────────────────────────────────
function ActivityPanel({ projectId }) {
  const [activity, setActivity] = useState(null);
  useEffect(()=>{
    api.get(`/forecast/project/${projectId}/activity`).then(r=>setActivity(r.data)).catch(()=>{});
  },[projectId]);
  if (!activity) return null;

  const roleMap = {};
  const update = (r, action) => {
    if (!roleMap[r.role] || new Date(r.last_at) > new Date(roleMap[r.role].last_at))
      roleMap[r.role] = { ...r, action };
  };
  activity.forecast.forEach(r => update(r, 'Dados atualizados'));
  activity.checkins.forEach(r => update(r, 'Check-in realizado'));
  activity.consolidated.forEach(r => update(r, 'Realizado consolidado'));

  const items = Object.values(roleMap);
  if (!items.length) return null;

  return (
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
      {items.map(e => {
        const days = Math.floor((Date.now() - new Date(e.last_at)) / 86400000);
        const fresh = days <= 30;
        return (
          <div key={e.role} style={{display:'flex',flexDirection:'column',gap:2,padding:'7px 11px',borderRadius:'var(--radius-md)',background: fresh ? '#F0FDF4' : '#FEF2F2',border:`1px solid ${fresh ? '#BBF7D0' : '#FECACA'}`,minWidth:120}}>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{width:7,height:7,borderRadius:'50%',background: fresh ? '#16A34A' : '#DC2626',flexShrink:0}}/>
              <span style={{fontSize:'0.65rem',fontWeight:700,color: fresh ? '#15803D' : '#991B1B',textTransform:'uppercase',letterSpacing:'0.06em'}}>{ROLE_LABELS[e.role]||e.role}</span>
            </div>
            <div style={{fontSize:'0.75rem',fontWeight:500,color:'var(--text-primary)'}}>{e.user_name}</div>
            <div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>{e.action}</div>
            <div style={{fontSize:'0.65rem',fontWeight:600,color: fresh ? '#15803D' : '#DC2626'}}>
              {days===0?'Hoje':days===1?'Ontem':`Há ${days} dias`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Year + Type tab bar ───────────────────────────────────────────────────────
const MAIN_TABS = [
  {id:'forecast', label:'📋 Forecast'},
  {id:'tabela',   label:'📊 Tabela'},
  {id:'charts',   label:'📈 Gráficos'},
  {id:'chat',     label:'💬 Chat'},
  {id:'notes',    label:'📌 Avisos'},
];


// ── Export Modal — category + type selection ──────────────────────────────────
const EXPORT_CATEGORIES = ['Viagens', 'Contratos', 'POs'];
const EXPORT_TYPES_BY_ROLE = {
  engenheiro:  ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
  coordenador: ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
  gestor:      ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
  planejador:  ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
  admin:       ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
};
const TYPE_LABELS = { Budget:'Budget', Forecast:'Forecast', Actual:'Realizado', Meta:'Meta', Pool:'Pool' };

function ExportModal({ open, onClose, onConfirm, role, isEngenheiro }) {
  const availableTypes = EXPORT_TYPES_BY_ROLE[role] || EXPORT_TYPES_BY_ROLE.gestor;
  const [exportScope, setExportScope] = useState('projeto'); // 'projeto' | 'geral'
  const [selCats,  setSelCats]  = useState([...EXPORT_CATEGORIES]);
  const [selTypes, setSelTypes] = useState([...availableTypes]);

  const toggle = (arr, setArr, val) =>
    setArr(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📊 Exportar Excel</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color:'rgba(255,255,255,0.7)' }}>✕</button>
        </div>
        <div className="modal-body">
          {/* Export scope selector */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>
              Tipo de exportação
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[
                { id:'projeto', label:'📄 Este projeto', desc:'Dados deste projeto apenas' },
                { id:'geral',   label:'📊 Relatório Geral', desc: isEngenheiro ? 'Meus projetos (Jan/2026 – Dez/2031)' : 'Todos os projetos (Jan/2026 – Dez/2031)' },
              ].map(opt => (
                <label key={opt.id} style={{
                  flex:1, padding:'10px 12px', borderRadius:'var(--radius-md)', cursor:'pointer',
                  background: exportScope===opt.id ? 'var(--ctg-light)' : 'var(--bg-app)',
                  border: `1.5px solid ${exportScope===opt.id ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
                  userSelect:'none', transition:'all 0.15s',
                }}>
                  <input type="radio" name="scope" value={opt.id} checked={exportScope===opt.id}
                    onChange={() => setExportScope(opt.id)} style={{ marginRight:6, accentColor:'var(--ctg-blue)' }} />
                  <span style={{ fontSize:'0.83rem', fontWeight:600, color: exportScope===opt.id ? 'var(--ctg-navy)' : 'var(--text-secondary)' }}>{opt.label}</span>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2, marginLeft:20 }}>{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>
          <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginBottom:16 }}>
            {exportScope==='projeto'
              ? 'Selecione as categorias e tipos de dados deste projeto.'
              : 'Selecione os tipos de dados para o relatório geral.'}
          </p>
          {/* Show categories only for project export */}

          {/* Categories — only for project export */}
          {exportScope === 'projeto' && <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>
              Categorias
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {EXPORT_CATEGORIES.map(cat => (
                <label key={cat} style={{
                  display:'flex', alignItems:'center', gap:7, padding:'7px 14px',
                  borderRadius:'var(--radius-md)', cursor:'pointer',
                  background: selCats.includes(cat) ? 'var(--ctg-light)' : 'var(--bg-app)',
                  border: `1.5px solid ${selCats.includes(cat) ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
                  fontSize:'0.83rem', fontWeight: selCats.includes(cat) ? 600 : 400,
                  color: selCats.includes(cat) ? 'var(--ctg-navy)' : 'var(--text-secondary)',
                  transition:'all 0.15s', userSelect:'none',
                }}>
                  <input type="checkbox" checked={selCats.includes(cat)}
                    onChange={() => toggle(EXPORT_CATEGORIES, setSelCats, cat)}
                    style={{ accentColor:'var(--ctg-blue)', width:14, height:14 }} />
                  {cat}
                </label>
              ))}
            </div>
          </div>}

          {/* Types */}
          <div>
            <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>
              Tipos de dados
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {availableTypes.map(type => {
                const theme = {
                  Budget:   { bg:'var(--budget-bg)',   border:'var(--budget-border)',   text:'var(--budget-text)'   },
                  Forecast: { bg:'var(--forecast-bg)', border:'var(--forecast-border)', text:'var(--forecast-text)' },
                  Actual:   { bg:'var(--actual-bg)',   border:'var(--actual-border)',   text:'var(--actual-text)'   },
                  Meta:     { bg:'#F5F3FF', border:'#DDD6FE', text:'#6D28D9' },
                  Pool:     { bg:'#F0F9FF', border:'#BAE6FD', text:'#0369A1' },
                }[type] || {};
                const sel = selTypes.includes(type);
                return (
                  <label key={type} style={{
                    display:'flex', alignItems:'center', gap:7, padding:'7px 14px',
                    borderRadius:'var(--radius-md)', cursor:'pointer',
                    background: sel ? theme.bg : 'var(--bg-app)',
                    border: `1.5px solid ${sel ? theme.border : 'var(--border-strong)'}`,
                    fontSize:'0.83rem', fontWeight: sel ? 600 : 400,
                    color: sel ? theme.text : 'var(--text-secondary)',
                    transition:'all 0.15s', userSelect:'none',
                  }}>
                    <input type="checkbox" checked={sel}
                      onChange={() => toggle(availableTypes, setSelTypes, type)}
                      style={{ accentColor: theme.text || 'var(--ctg-blue)', width:14, height:14 }} />
                    {TYPE_LABELS[type] || type}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-export"
            disabled={selTypes.length === 0 || (exportScope==='projeto' && selCats.length === 0)}
            onClick={() => { onConfirm(selCats, selTypes, exportScope); onClose(); }}>
            📊 Exportar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetail({ onEdit }) {
  const C = useTypeColors();
  const settings = useSettings();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isEngenheiro, isPlanejador, isGestor, isAdmin, canManage, isCoordenador } = useRole();
  const isGerente = user?.role === 'gerente';

  // Year config from settings
  const activeStart = parseInt(settings.active_year_start) || 2026;
  const activeEnd   = parseInt(settings.active_year_end)   || 2031;
  const yearConfig = useMemo(() => ({
    activeStart,
    activeEnd,
    consolidatedYears: [activeStart - 1],
  }), [activeStart, activeEnd]);

  const [project,      setProject]    = useState(null);
  const [entries,      setEntries]    = useState([]);
  const [notes,        setNotes]      = useState([]);
  const [engineers,    setEngineers]  = useState([]);
  const [allEngineers, setAllEngineers] = useState([]);
  const [consolidated, setConsolidated] = useState({ value:0 });
  const [yearConsData, setYearConsData] = useState([]); // year_consolidated entries
  const [unreadCount,  setUnreadCount] = useState(0);
  const [loading,      setLoading]    = useState(true);

  // Main tab
  const [mainTab, setMainTab] = useState('forecast');

  // Forecast sub-navigation
  const currentYear = new Date().getFullYear();
  const [years,        setYears]       = useState([currentYear]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [forecastType, setForecastType] = useState(''); // set after role determined

  // Notes state
  const [noteContent,  setNoteContent] = useState('');
  const [noteDate,     setNoteDate]    = useState(new Date().toISOString().split('T')[0]);
  const [addingNote,   setAddingNote]  = useState(false);
  const [editingNote,  setEditingNote] = useState(null);
  const [assignModal,  setAssignModal] = useState(false);
  const [exportModal,  setExportModal]  = useState(false);
  const { toast } = useToast();

  // Set default forecastType based on role
  useEffect(() => {
    if (forecastType) return;
    if (isPlanejador) setForecastType('Budget');
    else if (isGestor) setForecastType('Budget');
    else if (isEngenheiro) setForecastType('Forecast');
  }, [isPlanejador, isEngenheiro]);

  const fetchProject = useCallback(async () => {
    try {
      const [pRes, eRes, nRes, engRes, consRes, ycRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/forecast/project/${id}`),
        api.get(`/forecast/project/${id}/notes`),
        api.get(`/projects/${id}/engineers`),
        api.get(`/forecast/project/${id}/actual-consolidated`),
        api.get(`/forecast/project/${id}/year-consolidated`),
      ]);
      setProject(pRes.data);
      setEntries(eRes.data);
      setNotes(nRes.data);
      setEngineers(engRes.data);
      setConsolidated(consRes.data || { value:0 });
      setYearConsData(ycRes.data || []);
    } catch { navigate('/'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchProject(); }, [id]);

  useEffect(() => {
    if (!canManage && !isPlanejador) return;
    api.get('/users/engineers').then(r => setAllEngineers(r.data)).catch(()=>{});
  }, [canManage, isPlanejador]);

  useEffect(() => {
    api.get(`/projects/${id}/messages/unread-count`)
      .then(r => setUnreadCount(r.data.unread)).catch(()=>{});
  }, [id, mainTab]);

  // Year navigation
  const handleYearNav = (y, mode) => {
    if (mode === 'add-before' || mode === 'add-after') {
      setYears(prev => {
        const next = [...prev, y].sort((a,b) => a-b);
        return next;
      });
      setSelectedYear(y);
    } else {
      setSelectedYear(y);
    }
  };

  // ── SI Warning: Actual até último mês preenchido + Forecast subsequente + consolidado ──
  const computeSITotal = () => {
    // Find years that have consolidated data (those always take precedence)
    const consYearsActual = new Set(
      (yearConsData || [])
        .filter(e => (e.type === 'Actual' || (e.type === 'Actual' && e.category === 'Total')) && parseFloat(e.value||0) > 0)
        .map(e => parseInt(e.year))
    );

    // 1. Consolidated years — sum all Actual consolidated
    const consActual = (yearConsData || [])
      .filter(e => (e.type === 'Actual') && parseFloat(e.value||0) > 0)
      .reduce((s,e) => s + parseFloat(e.value||0), 0);

    // 2. For each active year WITHOUT consolidated, compute: Actual up to last month + Forecast after
    const activeYears = [...new Set(entries.map(e => parseInt(e.year)))].filter(y => !consYearsActual.has(y)).sort();
    let yearTotal = 0;

    for (const yr of activeYears) {
      const yearEntries = entries.filter(e => parseInt(e.year) === yr);
      const actualMonths = yearEntries
        .filter(e => e.type === 'Actual' && parseFloat(e.value || 0) > 0)
        .map(e => parseInt(e.month));
      const lastActualMonth = actualMonths.length > 0 ? Math.max(...actualMonths) : 0;

      const actualSum = yearEntries
        .filter(e => e.type === 'Actual' && parseInt(e.month) <= lastActualMonth)
        .reduce((s, e) => s + parseFloat(e.value || 0), 0);

      const forecastSum = yearEntries
        .filter(e => e.type === 'Forecast' && parseInt(e.month) > lastActualMonth)
        .reduce((s, e) => s + parseFloat(e.value || 0), 0);

      yearTotal += actualSum + forecastSum;
    }

    return consActual + yearTotal;
  };

  const siProjection = computeSITotal();
  const siValue       = parseFloat(project?.si_value)||0;
  const overSI        = siValue && siProjection > siValue;

  // totalForecast/totalActual for display (consolidated takes precedence)
  const consYearsForForecast = new Set((yearConsData||[]).filter(e=>e.type==='Forecast'&&parseFloat(e.value||0)>0).map(e=>parseInt(e.year)));
  const consYearsForActual = new Set((yearConsData||[]).filter(e=>e.type==='Actual'&&parseFloat(e.value||0)>0).map(e=>parseInt(e.year)));

  const totalForecast = entries.filter(e=>e.type==='Forecast'&&!consYearsForForecast.has(parseInt(e.year))).reduce((s,e)=>s+parseFloat(e.value||0),0)
    + (yearConsData || []).filter(e=>e.type==='Forecast'&&parseFloat(e.value||0)>0).reduce((s,e)=>s+parseFloat(e.value||0),0);
  const totalActual = entries.filter(e=>e.type==='Actual'&&!consYearsForActual.has(parseInt(e.year))).reduce((s,e)=>s+parseFloat(e.value||0),0)
    + (yearConsData || []).filter(e=>e.type==='Actual'&&parseFloat(e.value||0)>0).reduce((s,e)=>s+parseFloat(e.value||0),0);

  const totalFor = (type) => {
    if (isConsolidatedYear) return getConsTotal(type === 'Actual' ? 'Actual' : type);
    return entries.filter(e=>e.type===type&&parseInt(e.year)===selectedYear).reduce((s,e)=>s+parseFloat(e.value||0),0);
  };

  // Total across ALL years (for header cards — no year filter)
  // year_consolidated ALWAYS takes precedence when it exists
  // Rule: Actual consolidated adds to Budget AND Actual totals; Forecast consolidated adds to Forecast total
  const totalAllFor = (type) => {
    const consTypeForDisplay = type === 'Budget' ? 'Actual' : type;

    const consActualYears = new Set(
      (yearConsData || [])
        .filter(e => e.type === 'Actual' && parseFloat(e.value||0) > 0)
        .map(e => parseInt(e.year))
    );

    const consYears = new Set(
      (yearConsData || [])
        .filter(e => e.type === consTypeForDisplay && parseFloat(e.value||0) > 0)
        .map(e => parseInt(e.year))
    );

    const excludeYears = (type === 'Budget' || type === 'Forecast')
      ? new Set([...consYears, ...consActualYears])
      : consYears;

    // Para Forecast: blenda Actual até último mês realizado + Forecast depois
    // (mesma lógica do computeSITotal — é o "Forecast Atual" do Excel)
    if (type === 'Forecast') {
      const activeYears = [...new Set(entries.map(e => parseInt(e.year)))]
        .filter(y => !excludeYears.has(y))
        .sort();

      const blended = activeYears.reduce((total, yr) => {
        const yearEntries = entries.filter(e => parseInt(e.year) === yr);
        const actualMonths = yearEntries
          .filter(e => e.type === 'Actual' && parseFloat(e.value||0) > 0)
          .map(e => parseInt(e.month));
        const lastActM = actualMonths.length > 0 ? Math.max(...actualMonths) : 0;

        const actualSum = yearEntries
          .filter(e => e.type === 'Actual' && parseInt(e.month) <= lastActM)
          .reduce((s, e) => s + parseFloat(e.value||0), 0);

        const forecastSum = yearEntries
          .filter(e => e.type === 'Forecast' && parseInt(e.month) > lastActM)
          .reduce((s, e) => s + parseFloat(e.value||0), 0);

        return total + actualSum + forecastSum;
      }, 0);

      // Anos consolidados com Actual substituem o Forecast
      const fromConsolidated = (yearConsData || [])
        .filter(e => e.type === 'Actual' && parseFloat(e.value||0) > 0)
        .reduce((s, e) => s + parseFloat(e.value||0), 0);

      return blended + fromConsolidated;
    }

    // Budget / Actual / Meta / Pool — lógica original
    const fromEntries = entries
      .filter(e => e.type === type && !excludeYears.has(parseInt(e.year)))
      .reduce((s,e) => s + parseFloat(e.value||0), 0);

    const fromConsolidated = (yearConsData || [])
      .filter(e => (e.type === consTypeForDisplay || (e.type === 'Actual' && e.category === 'Total' && consTypeForDisplay === 'Actual')) && parseFloat(e.value||0) > 0)
      .reduce((s,e) => s + parseFloat(e.value||0), 0);

    return fromEntries + fromConsolidated;
  };

  // Consolidated year detection
  const isConsolidatedYear = yearConfig.consolidatedYears.includes(selectedYear);

  // Helper to get consolidated values for current selectedYear
  const getConsVal = (type, cat) => {
    const row = yearConsData.find(e => parseInt(e.year) === selectedYear && e.type === type && e.category === cat);
    return parseFloat(row?.value) || 0;
  };
  const getConsTotal = (type) => {
    // New format: single value with category='Total'
    const totalRow = yearConsData.find(e => parseInt(e.year) === selectedYear && e.type === type && e.category === 'Total');
    if (totalRow) return parseFloat(totalRow.value) || 0;
    // Fallback: sum old per-category format
    return CATEGORIES.reduce((s, c) => s + getConsVal(type, c), 0);
  };

  const chartData = useMemo(() => {
    // Encontra o último mês com Actual > 0 para o ano selecionado
    const actualEntries = entries.filter(e => parseInt(e.year) === selectedYear && e.type === 'Actual' && parseFloat(e.value || 0) > 0);
    const lastActM = actualEntries.length > 0 ? Math.max(...actualEntries.map(e => parseInt(e.month))) : 0;
    const nowYear = new Date().getFullYear(), nowMonth = new Date().getMonth() + 1;

    return MONTHS_PT.map((m, i) => {
      const month = i + 1;
      const get = type => entries.filter(e => parseInt(e.year) === selectedYear && parseInt(e.month) === month && e.type === type).reduce((s, e) => s + parseFloat(e.value || 0), 0);
      const actual = get('Actual'), forecast = get('Forecast');
      // Previsão: Actual nos meses realizados, Forecast nos meses futuros
      const isAfterNow = selectedYear > nowYear || (selectedYear === nowYear && month > nowMonth);
      const previsao = isAfterNow ? forecast : (lastActM > 0 && month <= lastActM ? actual : forecast);
      return { month: m, Budget: get('Budget'), 'Previsão': previsao, Meta: get('Meta'), Pool: get('Pool') };
    });
  }, [entries, selectedYear]);

  const sCurveData = useMemo(() => chartData.reduce((acc, d, i) => {
    const p = acc[i-1] || { Budget: 0, 'Previsão': 0, Meta: 0, Pool: 0 };
    acc.push({ month: d.month, Budget: p.Budget + d.Budget, 'Previsão': p['Previsão'] + d['Previsão'], Meta: p.Meta + d.Meta, Pool: p.Pool + d.Pool });
    return acc;
  }, []), [chartData]);

  // Handlers
  const handleAssign = async (userId) => {
    try { await api.post(`/projects/${id}/engineers`, { user_id: userId }); await fetchProject(); toast('Engenheiro designado', 'success'); }
    catch { toast('Erro', 'error'); }
  };
  const handleUnassign = async (userId) => {
    if (!confirm('Remover engenheiro?')) return;
    try { await api.delete(`/projects/${id}/engineers/${userId}`); setEngineers(prev=>prev.filter(e=>e.id!==userId)); toast('Removido', 'success'); }
    catch { toast('Erro', 'error'); }
  };
  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await api.post(`/forecast/project/${id}/notes`, { note_date: noteDate, content: noteContent });
      setNoteContent(''); setAddingNote(false); fetchProject();
      toast('Aviso adicionado', 'success');
    } catch { toast('Erro', 'error'); }
  };
  const handleEditNote = async () => {
    if (!editingNote?.content.trim()) return;
    try {
      await api.put(`/forecast/notes/${editingNote.id}`, { content: editingNote.content, note_date: editingNote.note_date });
      setEditingNote(null); fetchProject(); toast('Aviso atualizado', 'success');
    } catch { toast('Erro', 'error'); }
  };
  const handleDeleteNote = async (noteId) => {
    if (!confirm('Excluir aviso?')) return;
    try { await api.delete(`/forecast/notes/${noteId}`); setNotes(prev=>prev.filter(n=>n.id!==noteId)); toast('Aviso removido', 'success'); }
    catch { toast('Erro', 'error'); }
  };
  const handleCheckin = async () => {
    try { await api.post(`/forecast/project/${id}/checkin`); toast('Check-in registrado', 'success'); }
    catch { toast('Erro ao registrar check-in', 'error'); }
  };
  const handleExport = async (categories = null, types = null, scope = 'projeto') => {
    try {
      const token = localStorage.getItem('ctg_token');
      const base  = import.meta.env.VITE_API_URL || '/api';
      const params = new URLSearchParams();
      if (types) types.forEach(t => params.append('types', t));
      const isGeral = scope === 'geral';
      // Categories only apply to project-specific export
      if (categories && !isGeral) categories.forEach(c => params.append('categories', c));
      const qs = params.toString() ? `?${params.toString()}` : '';
      const url = isGeral
        ? `${base}/export/planejador${qs}`
        : `${base}/export/project/${id}${qs}`;
      const fetchOpts = { credentials: 'include' };
      if (token) fetchOpts.headers = { 'Authorization': `Bearer ${token}` };
      const res   = await fetch(url, fetchOpts);
      if (!res.ok) throw new Error('Erro ao gerar arquivo');
      const blob     = await res.blob();
      const filename = isGeral
        ? `CTG_Forecast_Geral_${new Date().getFullYear()}.xlsx`
        : `${project.code} - ${project.name}.xlsx`;
      const link = document.createElement('a');
      link.href  = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      toast('Erro ao exportar Excel', 'error');
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner"/></div>;
  if (!project) return null;

  const unassignedEngineers = allEngineers.filter(e => !engineers.find(a => a.id === e.id));
  const mainTabsWithBadge   = MAIN_TABS.map(t => t.id==='chat' && unreadCount>0 ? {...t, label:`💬 Chat (${unreadCount})`} : t);

  // Determine type tabs for current role
  const roleForecastTabs = isPlanejador
    ? FORECAST_TABS.planejador
    : isGestor
      ? FORECAST_TABS.gestor
      : isCoordenador
        ? FORECAST_TABS.coordenador
        : isGerente
          ? FORECAST_TABS.gerente
          : isEngenheiro
            ? FORECAST_TABS.engenheiro
            : FORECAST_TABS.gestor;

  return (
    <div>
      {/* ── Project header card ── */}
      <div className="card" style={{marginBottom:14}}>
        <div className="project-detail-header" style={{padding:'14px 18px',display:'flex',alignItems:'stretch',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--ctg-blue)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:2}}>{project.code}</div>
            {/* Plant name + project name inline */}
            <h2 style={{fontFamily:'var(--font-display)',fontSize:'1.25rem',color:'var(--ctg-navy)',lineHeight:1.3,marginBottom:4}}>
              {project.plants?.length > 0 && (
                <span style={{color:'var(--ctg-blue)'}}>{project.plants.join(', ')} — </span>
              )}
              {project.name}
            </h2>
            {project.description && <p style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:6}}>{project.description}</p>}
            {overSI && <SIWarning projection={siProjection} siValue={siValue}/>}
            {/* Engineers */}
            <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
              {engineers.map(e=>(
                <div key={e.id} style={{display:'flex',alignItems:'center',gap:5,background:'var(--forecast-bg)',padding:'3px 8px 3px 5px',borderRadius:20,fontSize:'0.75rem',color:'var(--forecast-text)'}}>
                  <Avatar name={e.name} initials={e.avatar_initials} role="engenheiro" size={20}/>
                  {e.name}
                  {canManage && <button style={{background:'none',border:'none',cursor:'pointer',color:'inherit',padding:'0 0 0 2px',opacity:0.6}} onClick={()=>handleUnassign(e.id)}>✕</button>}
                </div>
              ))}
              {canManage && <button className="btn btn-ghost btn-sm" onClick={()=>setAssignModal(true)}>+ Designar Engenheiro</button>}
            </div>
            {/* ActivityPanel removed */}
          </div>

          {/* Totals — 4 cards side by side, filling full height */}
          <div className="project-detail-totals" style={{display:'flex',flexDirection:'row',gap:6,flexShrink:0,alignSelf:'stretch'}}>
            {[
              {label:'Budget',   v:totalAllFor('Budget'),   cls:'budget'},
              {label:'Forecast', v:totalAllFor('Forecast'), cls:'forecast'},
              {label:'Realizado',v:totalAllFor('Actual'),   cls:'actual'},
            ].map(s=>(
              <div key={s.label} style={{
                padding:'0 14px',
                background:s.cls?`var(--${s.cls}-bg)`:'var(--bg-app)',
                border:`1px solid ${s.cls?`var(--${s.cls}-border)`:'var(--border)'}`,
                borderRadius:'var(--radius-md)',
                minWidth:140,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                textAlign:'center',
              }}>
                <div style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:s.cls?`var(--${s.cls}-text)`:'var(--text-muted)',marginBottom:2}}>{s.label}</div>
                <div style={{fontFamily:'var(--font-display)',fontSize:'0.92rem',color:'var(--text-primary)',lineHeight:1.2}}>{formatBRL(s.v)}</div>
              </div>
            ))}
            {/* SI card with SI - Forecast variation */}
            {(() => {
              const siV = parseFloat(project?.si_value)||0;
              const forecastV = totalAllFor('Forecast');
              const diff = siV - forecastV;
              const isPos = diff >= 0;
              return (
                <div style={{
                  padding:'0 14px',
                  background: overSI ? 'var(--actual-bg)' : 'var(--bg-app)',
                  border:`1px solid ${overSI ? 'var(--actual-border)' : 'var(--border)'}`,
                  borderRadius:'var(--radius-md)',
                  minWidth:140,
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  textAlign:'center',
                }}>
                  <div style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',marginBottom:2}}>SI</div>
                  <div style={{fontFamily:'var(--font-display)',fontSize:'0.92rem',color: overSI ? '#DC2626' : 'var(--text-primary)',lineHeight:1.2}}>{formatBRL(siV)}</div>
                  {siV > 0 && forecastV > 0 && (
                    <div style={{display:'flex',alignItems:'center',gap:3,marginTop:3,fontSize:'0.68rem',fontWeight:700,color: isPos ? '#16A34A' : '#DC2626'}}>
                      <span style={{fontSize:'0.75rem'}}>{isPos ? '▲' : '▼'}</span>
                      <span>{formatBRL(Math.abs(diff))}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Actions */}
          <div className="project-detail-actions" style={{display:'flex',gap:6,alignItems:'stretch',flexShrink:0,flexDirection:'column',minWidth:118}}>
            {canManage && (
              <button className="btn btn-secondary btn-sm" onClick={()=>onEdit?.(project)}
                style={{width:'100%',justifyContent:'center'}}>
                ✎ Editar
              </button>
            )}
            <button className="btn btn-export btn-sm" onClick={() => setExportModal(true)}
              style={{width:'100%',justifyContent:'center'}}>
              📊 Excel
            </button>
            <button className="btn btn-sm" onClick={handleCheckin}
              style={{width:'100%',justifyContent:'center',background:'var(--ctg-blue)',color:'#fff',border:'none'}}>
              ✓ Check-in
            </button>
          </div>
        </div>
      </div>

      {/* ── Main tab bar ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:12}}>
        <div className="tabs" style={{flex:1,minWidth:0,marginBottom:0}}>
          {mainTabsWithBadge.map(t=>(
            <button key={t.id} className={`tab-btn ${mainTab===t.id?'active':''}`}
              onClick={()=>{setMainTab(t.id);if(t.id==='chat')setUnreadCount(0);}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Forecast tab ── */}
      {mainTab==='forecast' && (
        <>
          {/* Gestor: read-only table with year selector */}
          {roleForecastTabs.length === 0 && (
            <>
              <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
                <div className="year-selector">
                  <button className="year-btn" onClick={()=>setSelectedYear(y=>y-1)}>‹</button>
                  <span className="year-display">{selectedYear}{isConsolidatedYear ? ' (consolidado)' : ''}</span>
                  <button className="year-btn" onClick={()=>setSelectedYear(y=>y+1)}>›</button>
                </div>
              </div>
              {isConsolidatedYear
                ? <ConsolidatedYearTable yearConsData={yearConsData} year={selectedYear}/>
                : <ReadOnlyTable entries={entries} year={selectedYear} siValue={project.si_value} consolidatedActual={consolidated.value} siProjection={siProjection}/>
              }
            </>
          )}

          {/* Planejador/Engenheiro/Gestor: wizard with year tabs built-in */}
          {roleForecastTabs.length > 0 && (
            <ForecastWizard
              key="wizard"
              projectId={id}
              entries={entries}
              year={selectedYear}
              onYearChange={setSelectedYear}
              onSaved={fetchProject}
              editType={forecastType}
              availableTypes={roleForecastTabs.map(t => t.id)}
              siValue={project.si_value}
              consolidatedActual={consolidated.value}
              siProjection={siProjection}
              yearConfig={yearConfig}
            />
          )}
        </>
      )}

      {/* ── Tabela tab ── */}
      {mainTab==='tabela' && (
        <>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <div className="year-selector">
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y-1)}>‹</button>
              <span className="year-display">{selectedYear}{isConsolidatedYear ? ' (consolidado)' : ''}</span>
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y+1)}>›</button>
            </div>
          </div>
          {isConsolidatedYear
            ? <ConsolidatedYearTable yearConsData={yearConsData} year={selectedYear}/>
            : <ReadOnlyTable entries={entries} year={selectedYear} siValue={project.si_value} consolidatedActual={consolidated.value} siProjection={siProjection}/>
          }
        </>
      )}

      {/* ── Charts tab ── */}
      {mainTab==='charts' && isConsolidatedYear && (
        <>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <div className="year-selector">
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y-1)}>‹</button>
              <span className="year-display">{selectedYear} (consolidado)</span>
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y+1)}>›</button>
            </div>
          </div>
          <ConsolidatedYearCharts yearConsData={yearConsData} year={selectedYear}/>
        </>
      )}
      {mainTab==='charts' && !isConsolidatedYear && (() => {
        // Donut data: total by category for Forecast
        const donutData = CATEGORIES.map(cat => ({
          name: cat,
          value: chartData.reduce((s, d) => s + (d['Previsão'] && entries.filter(e=>e.category===cat&&e.type==='Forecast'&&parseInt(e.year)===selectedYear&&parseInt(e.month)===(MONTHS_PT.indexOf(d.month)+1)).reduce((ss,e)=>ss+parseFloat(e.value||0),0) || 0), 0),
        })).filter(d => d.value > 0);
        const CAT_COLORS = ['#0EA5E9', '#8B5CF6', '#F59E0B'];

        // Execution: Realizado / Forecast per category
        const execData = CATEGORIES.map(cat => {
          const fc = entries.filter(e=>e.category===cat&&e.type==='Forecast'&&parseInt(e.year)===selectedYear).reduce((s,e)=>s+parseFloat(e.value||0),0);
          const ac = entries.filter(e=>e.category===cat&&e.type==='Actual'&&parseInt(e.year)===selectedYear).reduce((s,e)=>s+parseFloat(e.value||0),0);
          return { name: cat, Forecast: fc, Realizado: ac, pct: fc > 0 ? ((ac/fc)*100).toFixed(1) : '0.0' };
        });

        // Budget vs Forecast comparison per category
        const budgetVsForecast = CATEGORIES.map(cat => {
          const bg = entries.filter(e=>e.category===cat&&e.type==='Budget'&&parseInt(e.year)===selectedYear).reduce((s,e)=>s+parseFloat(e.value||0),0);
          const fc = entries.filter(e=>e.category===cat&&e.type==='Forecast'&&parseInt(e.year)===selectedYear).reduce((s,e)=>s+parseFloat(e.value||0),0);
          return { name: cat, Budget: bg, Forecast: fc };
        });

        // Combined data for main chart — Previsão absorve Actual+Forecast
        const combinedChartData = chartData.map((d, i) => ({
          ...d,
          BudgetAcum:   sCurveData[i]?.Budget    || 0,
          PrevisãoAcum: sCurveData[i]?.['Previsão'] || 0,
          MetaAcum:     sCurveData[i]?.Meta       || 0,
          PoolAcum:     sCurveData[i]?.Pool       || 0,
        }));

        return (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <div className="year-selector">
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y-1)}>‹</button>
              <span className="year-display">{selectedYear}</span>
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y+1)}>›</button>
            </div>
          </div>

          {/* 1. Combined: bars (monthly) + lines (accumulated) — like Dashboard */}
          <div className="card">
            <div className="card-header"><span className="card-title">Evolução Mensal + S-Curve — {selectedYear}</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={combinedChartData} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="month" tick={{fontSize:11,fill:'#374151'}}/>
                  <YAxis yAxisId="monthly" orientation="left" tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:'#6B7280'}} width={68}
                    label={{value:'Mensal',angle:-90,position:'insideLeft',offset:10,style:{fontSize:9,fill:'#9CA3AF'}}} />
                  <YAxis yAxisId="acum" orientation="right" tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:'#6B7280'}} width={68}
                    label={{value:'Acumulado',angle:90,position:'insideRight',offset:10,style:{fontSize:9,fill:'#9CA3AF'}}} />
                  <Tooltip isAnimationActive={false} content={<ChartTooltip year={selectedYear} />} wrapperStyle={{zIndex:9999}} allowEscapeViewBox={{x:false,y:true}} />
                  <Legend wrapperStyle={{fontSize:'0.78rem'}} className="project-chart-legend"/>

                  {/* Monthly bars */}
                  <Bar yAxisId="monthly" dataKey="Budget"   fill={C.budget+'88'}   radius={[2,2,0,0]} barSize={8} name="Budget (mensal)" />
                  <Bar yAxisId="monthly" dataKey="Previsão" fill={C.forecast+'88'} radius={[2,2,0,0]} barSize={8} name="Previsão (mensal)" />
                  <Bar yAxisId="monthly" dataKey="Meta"     fill={C.meta+'88'}     radius={[2,2,0,0]} barSize={8} name="Meta (mensal)" />
                  <Bar yAxisId="monthly" dataKey="Pool"     fill={C.pool+'88'}     radius={[2,2,0,0]} barSize={8} name="Pool (mensal)" />

                  {/* Accumulated lines */}
                  <Line yAxisId="acum" type="linear" dataKey="BudgetAcum"   stroke={C.budget}   strokeWidth={2} dot={false} name="Budget (acum.)" />
                  <Line yAxisId="acum" type="linear" dataKey="PrevisãoAcum" stroke={C.forecast} strokeWidth={2} dot={false} name="Previsão (acum.)" />
                  <Line yAxisId="acum" type="linear" dataKey="MetaAcum"     stroke={C.meta}     strokeWidth={2} strokeDasharray="8 3" dot={false} name="Meta (acum.)" />
                  <Line yAxisId="acum" type="linear" dataKey="PoolAcum"     stroke={C.pool}     strokeWidth={2} strokeDasharray="4 2" dot={false} name="Pool (acum.)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Row: Donut by category + Execution bar */}
          <div className="project-charts-row">

            {/* Donut: Forecast distribution by category */}
            <div className="card">
              <div className="card-header"><span className="card-title">Forecast por Categoria — {selectedYear}</span></div>
              <div className="card-body" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:220}}>
                {donutData.length === 0 ? (
                  <span style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>Sem dados de Forecast</span>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                        paddingAngle={3} dataKey="value" nameKey="name"
                        label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}
                        labelLine={{stroke:'#94A3B8',strokeWidth:1}}
                        style={{fontSize:'0.75rem'}}
                      >
                        {donutData.map((_, idx) => <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip isAnimationActive={false} content={<ChartTooltip year={selectedYear} />} wrapperStyle={{zIndex:9999}} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Execution: Forecast vs Realizado per category */}
            <div className="card">
              <div className="card-header"><span className="card-title">Execução por Categoria — {selectedYear}</span></div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={execData} layout="vertical" margin={{top:4,right:16,left:4,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                    <XAxis type="number" tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:'#374151'}} />
                    <YAxis type="category" dataKey="name" tick={{fontSize:12,fill:'#374151'}} width={72} />
                    <Tooltip isAnimationActive={false} content={<ChartTooltip year={selectedYear} />} wrapperStyle={{zIndex:9999}} />
                    <Legend wrapperStyle={{fontSize:'0.78rem'}} className="project-chart-legend" />
                    <Bar dataKey="Previsão"   fill={C.forecast} radius={[0,3,3,0]} barSize={14} name="Forecast" />
                    <Bar dataKey="Realizado"  fill={C.actual}   radius={[0,3,3,0]} barSize={14} name="Realizado" />
                  </BarChart>
                </ResponsiveContainer>
                {/* Execution percentages */}
                <div style={{display:'flex',gap:12,justifyContent:'center',paddingTop:8,flexWrap:'wrap'}}>
                  {execData.map(d => (
                    <div key={d.name} style={{textAlign:'center',padding:'6px 14px',borderRadius:'var(--radius-md)',background:parseFloat(d.pct)>100?'#FEF2F2':parseFloat(d.pct)>0?'#F0FDF4':'var(--bg-app)',border:`1px solid ${parseFloat(d.pct)>100?'#FCA5A5':parseFloat(d.pct)>0?'#BBF7D0':'var(--border)'}`}}>
                      <div style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase'}}>{d.name}</div>
                      <div style={{fontSize:'1rem',fontWeight:700,color:parseFloat(d.pct)>100?'#DC2626':parseFloat(d.pct)>0?'#166534':'var(--text-muted)'}}>{d.pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Budget vs Forecast comparison */}
          <div className="card">
            <div className="card-header"><span className="card-title">Budget vs Forecast por Categoria — {selectedYear}</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={budgetVsForecast} margin={{top:4,right:16,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="name" tick={{fontSize:12,fill:'#374151'}} />
                  <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:'#374151'}} width={68} />
                  <Tooltip isAnimationActive={false} content={<ChartTooltip year={selectedYear} />} wrapperStyle={{zIndex:9999}} />
                  <Legend wrapperStyle={{fontSize:'0.78rem'}} className="project-chart-legend" />
                  <Bar dataKey="Budget"   fill={C.budget}   radius={[3,3,0,0]} name="Budget" />
                  <Bar dataKey="Forecast" fill={C.forecast} radius={[3,3,0,0]} name="Forecast" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Chat tab ── */}
      {mainTab==='chat' && <ProjectChat projectId={id}/>}

      {/* ── Notes/Avisos tab ── */}
      {mainTab==='notes' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Avisos e Histórico</span>
            <button className="btn btn-primary btn-sm" onClick={()=>{setAddingNote(v=>!v);setEditingNote(null);}}>
              {addingNote ? 'Cancelar' : '+ Novo Aviso'}
            </button>
          </div>
          <div className="card-body">
            {addingNote && (
              <div style={{background:'var(--bg-app)',borderRadius:'var(--radius-md)',padding:14,marginBottom:16}}>
                <div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:12,marginBottom:10}}>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Data</label>
                    <input className="form-input" type="date" value={noteDate} onChange={e=>setNoteDate(e.target.value)}/>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Conteúdo</label>
                    <textarea className="form-textarea" style={{minHeight:60}} placeholder="Descreva o aviso..."
                      value={noteContent} onChange={e=>setNoteContent(e.target.value)} autoFocus/>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleAddNote}>Salvar Aviso</button>
              </div>
            )}
            {notes.length===0 ? (
              <div className="empty-state" style={{padding:'30px 0'}}><h3>Sem avisos</h3></div>
            ) : notes.map(n=>(
              <div key={n.id} className="note-item">
                {editingNote?.id===n.id ? (
                  <div style={{flex:1,display:'grid',gridTemplateColumns:'160px 1fr',gap:10}}>
                    <input className="form-input" type="date" value={editingNote.note_date||''} onChange={e=>setEditingNote(v=>({...v,note_date:e.target.value}))}/>
                    <textarea className="form-textarea" style={{minHeight:50}} value={editingNote.content} onChange={e=>setEditingNote(v=>({...v,content:e.target.value}))}/>
                    <div style={{gridColumn:'1/-1',display:'flex',gap:8}}>
                      <button className="btn btn-primary btn-sm" onClick={handleEditNote}>Salvar</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setEditingNote(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="note-date">{n.note_date?new Date(n.note_date).toLocaleDateString('pt-BR'):''}</div>
                    <div className="note-content" style={{flex:1}}>
                      {n.user_name && <span style={{fontSize:'0.72rem',fontWeight:700,color:'var(--ctg-blue)',marginRight:6}}>[{n.user_name}]</span>}
                      {n.content}
                    </div>
                    <div style={{display:'flex',gap:4,flexShrink:0}}>
                      <button className="btn btn-ghost btn-icon" onClick={()=>setEditingNote({id:n.id,content:n.content,note_date:n.note_date})}>✎</button>
                      <button className="btn btn-ghost btn-icon" style={{color:'#DC2626'}} onClick={()=>handleDeleteNote(n.id)}>✕</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Export Modal ── */}
      <ExportModal
        open={exportModal}
        onClose={() => setExportModal(false)}
        onConfirm={handleExport}
        role={user?.role}
        isEngenheiro={isEngenheiro}
      />

      {/* ── Assign Modal ── */}
      <Modal open={assignModal} onClose={()=>setAssignModal(false)} title="Designar Engenheiro">
        {unassignedEngineers.length===0 ? (
          <p style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>Todos os engenheiros já estão designados.</p>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {unassignedEngineers.map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:'var(--bg-app)',borderRadius:'var(--radius-sm)'}}>
                <Avatar name={e.name} initials={e.avatar_initials} role="engenheiro" size={32}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:'0.88rem'}}>{e.name}</div>
                  <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{e.email}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={()=>{handleAssign(e.id);setAssignModal(false);}}>Designar</button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}