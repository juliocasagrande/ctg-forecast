import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api.js';
import { useAuth, useRole } from '../context/AuthContext.jsx';
import { formatBRL, formatBRLShort, MONTHS_PT, CATEGORIES } from '../utils/format.js';
import ForecastWizard from './ForecastWizard.jsx';
import ProjectChat from './ProjectChat.jsx';
import Modal from './ui/Modal.jsx';
import { useToast } from './ui/Toast.jsx';

const fmt = formatBRLShort;

const ROLE_LABELS  = { admin:'Administrador', gestor:'Gestor', engenheiro:'Engenheiro', planejador:'Planejador' };
const ROLE_COLORS  = { admin:'#001F5B', gestor:'#0070B8', engenheiro:'#166534', planejador:'#7C3AED' };

// Tabs available per role inside the Forecast section
const FORECAST_TABS = {
  planejador: [
    { id: 'Budget',              label: 'Budget'             },
    { id: 'Actual',              label: 'Realizado'          },
    { id: 'ActualConsolidated',  label: 'Realizado Anterior' },
    { id: 'Pool',                label: 'Pool'               },
    { id: 'Meta',                label: 'Meta'               },
  ],
  engenheiro: [
    { id: 'Forecast', label: 'Forecast'  },
    { id: 'Actual',   label: 'Realizado' },
  ],
  gestor: [],
};

function Avatar({ name, initials, role, size=32 }) {
  return (
    <div style={{width:size,height:size,borderRadius:'50%',background:ROLE_COLORS[role]||'#888',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:700,color:'#fff',flexShrink:0}}>
      {initials||name?.slice(0,2).toUpperCase()}
    </div>
  );
}

// ── SI Warning ───────────────────────────────────────────────────────────────
function SIWarning({ forecastTotal, actualTotal, consolidatedActual, siValue }) {
  const si = parseFloat(siValue)||0, fc = parseFloat(forecastTotal)||0;
  const ac = parseFloat(actualTotal)||0, cons = parseFloat(consolidatedActual)||0;
  const over = fc + ac + cons - si;
  if (!si || over <= 0) return null;
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,background:'#FEF2F2',border:'1.5px solid #FCA5A5',borderRadius:'var(--radius-sm)',padding:'6px 12px',fontSize:'0.78rem',color:'#991B1B',fontWeight:600,marginBottom:10}}>
      ⚠ Realizado + Forecast excede a SI em {formatBRL(over)}
    </div>
  );
}

// ── Read-only table (gestor) ──────────────────────────────────────────────────
function ReadOnlyTable({ entries, year, siValue, consolidatedActual }) {
  const get = (cat, type, month) =>
    parseFloat(entries.find(e=>e.category===cat&&e.type===type&&parseInt(e.year)===year&&parseInt(e.month)===month)?.value||0);
  const rowTotal = (cat, type) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+get(cat,type,m),0);
  const colTotal = (month, type) => CATEGORIES.reduce((s,c)=>s+get(c,type,month),0);
  const grandTotal = (type) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+colTotal(m,type),0);
  const f = v => v ? v.toLocaleString('pt-BR',{maximumFractionDigits:0}) : '—';
  return (
    <>
      <SIWarning forecastTotal={grandTotal('Forecast')} actualTotal={grandTotal('Actual')}
        consolidatedActual={consolidatedActual} siValue={siValue} />
      <div className="table-wrapper">
        <table className="forecast-table">
          <thead>
            <tr><th className="col-label">Categoria / Tipo</th>{MONTHS_PT.map(m=><th key={m}>{m}</th>)}<th>Total</th></tr>
          </thead>
          <tbody>
            {CATEGORIES.map(cat=>(
              <>
                <tr key={`h-${cat}`} className="cat-header-row"><td colSpan={14}>{cat}</td></tr>
                {['Budget','Forecast','Actual','Meta','Pool'].map(type=>(
                  <tr key={`${cat}-${type}`} className={`row-${type === 'Actual' ? 'actual' : type === 'Meta' ? 'meta' : type === 'Pool' ? 'pool' : type.toLowerCase()}`}>
                    <td className="td-label">{type}</td>
                    {Array.from({length:12},(_,i)=>i+1).map(m=><td key={m}>{f(get(cat,type,m))}</td>)}
                    <td style={{fontWeight:700}}>{f(rowTotal(cat,type))}</td>
                  </tr>
                ))}
              </>
            ))}
            <tr className="cat-header-row"><td colSpan={14}>TOTAL GERAL</td></tr>
            {['Budget','Forecast','Actual','Meta','Pool'].map(type=>{
              const th = {
                Budget:  { row:'#DCFCE7', midBg:'#86EFAC', text:'#15803D', border:'#4ADE80' },
                Forecast:{ row:'#E0F2FE', midBg:'#7DD3FC', text:'#0369A1', border:'#38BDF8' },
                Actual:  { row:'#DBEAFE', midBg:'#93C5FD', text:'#1E40AF', border:'#60A5FA' },
                Meta:    { row:'#EDE9FE', midBg:'#C4B5FD', text:'#6D28D9', border:'#A78BFA' },
                Pool:    { row:'#CFFAFE', midBg:'#67E8F9', text:'#0E7490', border:'#22D3EE' },
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
    </>
  );
}

// ── Consolidated Actual Panel ─────────────────────────────────────────────────
function ConsolidatedActualPanel({ projectId, siValue, forecastTotal, actualTotal }) {
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
  const overSI = si && total > si;

  return (
    <div style={{marginTop:8}}>
      {overSI && <SIWarning forecastTotal={forecastTotal} actualTotal={actualTotal} consolidatedActual={data.value} siValue={si}/>}
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

export default function ProjectDetail({ onEdit }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isEngenheiro, isPlanejador, isGestor, isAdmin, canManage } = useRole();

  const [project,      setProject]    = useState(null);
  const [entries,      setEntries]    = useState([]);
  const [notes,        setNotes]      = useState([]);
  const [engineers,    setEngineers]  = useState([]);
  const [allEngineers, setAllEngineers] = useState([]);
  const [consolidated, setConsolidated] = useState({ value:0 });
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
  const { toast } = useToast();

  // Set default forecastType based on role
  useEffect(() => {
    if (forecastType) return;
    if (isPlanejador) setForecastType('Budget');
    else if (isEngenheiro) setForecastType('Forecast');
  }, [isPlanejador, isEngenheiro]);

  const fetchProject = useCallback(async () => {
    try {
      const [pRes, eRes, nRes, engRes, consRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/forecast/project/${id}`),
        api.get(`/forecast/project/${id}/notes`),
        api.get(`/projects/${id}/engineers`),
        api.get(`/forecast/project/${id}/actual-consolidated`),
      ]);
      setProject(pRes.data);
      setEntries(eRes.data);
      setNotes(nRes.data);
      setEngineers(engRes.data);
      setConsolidated(consRes.data || { value:0 });
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

  // Totals for SI warning
  const totalForecast = entries.filter(e=>e.type==='Forecast').reduce((s,e)=>s+parseFloat(e.value||0),0);
  const totalActual   = entries.filter(e=>e.type==='Actual').reduce((s,e)=>s+parseFloat(e.value||0),0);
  const siValue       = parseFloat(project?.si_value)||0;
  const overSI        = siValue && (totalForecast + totalActual + parseFloat(consolidated.value||0)) > siValue;

  const totalFor = (type) => entries.filter(e=>e.type===type&&parseInt(e.year)===selectedYear).reduce((s,e)=>s+parseFloat(e.value||0),0);

  const chartData = MONTHS_PT.map((m,i) => {
    const get = type => entries.filter(e=>parseInt(e.year)===selectedYear&&parseInt(e.month)===i+1&&e.type===type).reduce((s,e)=>s+parseFloat(e.value||0),0);
    return { month:m, Budget:get('Budget'), Forecast:get('Forecast'), Realizado:get('Actual'), Meta:get('Meta'), Pool:get('Pool') };
  });

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
  const handleExport = async () => {
    try {
      const token = localStorage.getItem('ctg_token');
      const base  = import.meta.env.VITE_API_URL || '/api';
      // Planejador gets the consolidated report; others get the project-specific export
      const url   = isPlanejador
        ? `${base}/export/planejador`
        : `${base}/export/project/${id}`;
      const res   = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao gerar arquivo');
      const blob     = await res.blob();
      const filename = isPlanejador
        ? `CTG_Forecast_Planejador_${new Date().getFullYear()}.xlsx`
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
    : isEngenheiro
      ? FORECAST_TABS.engenheiro
      : FORECAST_TABS.gestor;

  return (
    <div>
      {/* ── Project header card ── */}
      <div className="card" style={{marginBottom:14}}>
        <div className="project-detail-header" style={{padding:'14px 18px',display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--ctg-blue)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:2}}>{project.code}</div>
            <h2 style={{fontFamily:'var(--font-display)',fontSize:'1.25rem',color:'var(--ctg-navy)',lineHeight:1.2,marginBottom:4}}>{project.name}</h2>
            {project.description && <p style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:6}}>{project.description}</p>}
            {overSI && <SIWarning forecastTotal={totalForecast} actualTotal={totalActual} consolidatedActual={consolidated.value} siValue={siValue}/>}
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

          {/* Totals */}
          <div className="project-detail-totals" style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-start'}}>
            {[
              {label:'Budget',   v:totalFor('Budget'),   cls:'budget'},
              {label:'Forecast', v:totalFor('Forecast'), cls:'forecast'},
              {label:'Realizado',v:totalFor('Actual'),   cls:'actual'},
              {label:'SI', v:project.si_value, cls: overSI ? 'actual' : '', border: overSI ? '1.5px solid #FCA5A5' : 'none'},
            ].map(s=>(
              <div key={s.label} style={{padding:'8px 12px',background:s.cls?`var(--${s.cls}-bg)`:'var(--bg-app)',border:s.border||'none',borderRadius:'var(--radius-md)',minWidth:85,textAlign:'center'}}>
                <div style={{fontSize:'0.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:s.cls?`var(--${s.cls}-text)`:'var(--text-muted)',marginBottom:2}}>{s.label}</div>
                <div style={{fontFamily:'var(--font-display)',fontSize:'0.95rem',color:(s.label==='SI'&&overSI)?'#DC2626':'var(--text-primary)'}}>{fmt(s.v)}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="project-detail-actions" style={{display:'flex',gap:6,alignItems:'center',flexShrink:0,flexDirection:'column'}}>
              {canManage && <button className="btn btn-secondary btn-sm" onClick={()=>onEdit?.(project)}>✎ Editar</button>}
            <button className="btn btn-export btn-sm" onClick={handleExport}>⬇ Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={handleCheckin} style={{borderColor:'var(--ctg-blue)',color:'var(--ctg-blue)'}}>✓ Check-in</button>
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
                  <span className="year-display">{selectedYear}</span>
                  <button className="year-btn" onClick={()=>setSelectedYear(y=>y+1)}>›</button>
                </div>
              </div>
              <ReadOnlyTable entries={entries} year={selectedYear} siValue={project.si_value} consolidatedActual={consolidated.value}/>
            </>
          )}

          {/* Planejador/Engenheiro: wizard with year tabs built-in */}
          {roleForecastTabs.length > 0 && forecastType === 'ActualConsolidated' ? (
            <div className="card">
              <div className="card-header"><span className="card-title">Realizado Consolidado — Anos Anteriores</span></div>
              <div className="card-body">
                <p style={{fontSize:'0.82rem',color:'var(--text-secondary)',marginBottom:12}}>
                  Registre aqui o valor total realizado em anos anteriores ao período atual.
                </p>
                <ConsolidatedActualPanel
                  projectId={id} siValue={project.si_value}
                  forecastTotal={totalForecast} actualTotal={totalActual}
                />
              </div>
            </div>
          ) : roleForecastTabs.length > 0 && (
            <ForecastWizard
              key="wizard"
              projectId={id}
              entries={entries}
              year={selectedYear}
              onYearChange={setSelectedYear}
              onSaved={fetchProject}
              editType={forecastType}
              availableTypes={roleForecastTabs.filter(t => t.id !== 'ActualConsolidated').map(t => t.id)}
              siValue={project.si_value}
              consolidatedActual={consolidated.value}
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
              <span className="year-display">{selectedYear}</span>
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y+1)}>›</button>
            </div>
          </div>
          <ReadOnlyTable entries={entries} year={selectedYear} siValue={project.si_value} consolidatedActual={consolidated.value}/>
        </>
      )}

      {/* ── Charts tab ── */}
      {mainTab==='charts' && (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <div className="year-selector">
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y-1)}>‹</button>
              <span className="year-display">{selectedYear}</span>
              <button className="year-btn" onClick={()=>setSelectedYear(y=>y+1)}>›</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Evolução Mensal — {selectedYear}</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="month" tick={{fontSize:11,fill:'#374151'}}/>
                  <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:11,fill:'#374151'}} width={72}/>
                  <Tooltip formatter={v=>formatBRL(v)}/>
                  <Legend wrapperStyle={{fontSize:'0.82rem'}}/>
                  <Bar dataKey="Budget"    fill="#16A34A" radius={[3,3,0,0]}/>
                  <Bar dataKey="Forecast"  fill="#38BDF8" radius={[3,3,0,0]}/>
                  <Bar dataKey="Realizado" fill="#2563EB" radius={[3,3,0,0]}/>
                  <Bar dataKey="Meta"      fill="#7C3AED" radius={[3,3,0,0]}/>
                  <Bar dataKey="Pool"      fill="#0891B2" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">S-Curve Acumulado — {selectedYear}</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={chartData.reduce((acc,d,i)=>{
                    const p=acc[i-1]||{Budget:0,Forecast:0,Realizado:0,Meta:0,Pool:0};
                    acc.push({month:d.month,Budget:p.Budget+d.Budget,Forecast:p.Forecast+d.Forecast,Realizado:p.Realizado+d.Realizado,Meta:p.Meta+d.Meta,Pool:p.Pool+d.Pool});
                    return acc;
                  },[])}
                  margin={{top:4,right:8,left:0,bottom:0}}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="month" tick={{fontSize:11,fill:'#374151'}}/>
                  <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:11,fill:'#374151'}} width={72}/>
                  <Tooltip formatter={v=>formatBRL(v)}/>
                  <Legend wrapperStyle={{fontSize:'0.82rem'}}/>
                  <Line type="monotone" dataKey="Budget"    stroke="#15803D" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="Forecast"  stroke="#0EA5E9" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="Realizado" stroke="#1E40AF" strokeWidth={2} strokeDasharray="5 3"/>
                  <Line type="monotone" dataKey="Meta"      stroke="#7C3AED" strokeWidth={2} strokeDasharray="8 3"/>
                  <Line type="monotone" dataKey="Pool"      stroke="#0891B2" strokeWidth={2} strokeDasharray="4 2"/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

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
