import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api.js';
import { useAuth, useRole } from '../context/AuthContext.jsx';
import { formatBRL, formatBRLShort, MONTHS_PT, CATEGORIES } from '../utils/format.js';
import ForecastWizard from './ForecastWizard.jsx';
import ProjectChat from './ProjectChat.jsx';
import Modal from './ui/Modal.jsx';
import { useToast } from './ui/Toast.jsx';

const fmt = formatBRLShort;

function Avatar({ name, initials, role, size=32 }) {
  const colors = { admin:'#001F5B', gestor:'#0070B8', engenheiro:'#166534' };
  return (
    <div style={{width:size,height:size,borderRadius:'50%',background:colors[role]||'#888',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.35,fontWeight:700,color:'#fff',flexShrink:0}}>
      {initials||name?.slice(0,2).toUpperCase()}
    </div>
  );
}

function YearSelector({ year, onChange }) {
  return (
    <div className="year-selector">
      <button className="year-btn" onClick={()=>onChange(year-1)}>‹</button>
      <span className="year-display">{year}</span>
      <button className="year-btn" onClick={()=>onChange(year+1)}>›</button>
    </div>
  );
}

// Read-only table for gestor viewing engineer's data
function ReadOnlyTable({ entries, year }) {
  const get = (cat, type, month) =>
    parseFloat(entries.find(e=>e.category===cat&&e.type===type&&parseInt(e.year)===year&&parseInt(e.month)===month)?.value||0);
  const rowTotal = (cat, type) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+get(cat,type,m),0);
  const colTotal = (month, type) => CATEGORIES.reduce((s,c)=>s+get(c,type,month),0);
  const grandTotal = (type) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+colTotal(m,type),0);
  const f = v => v ? v.toLocaleString('pt-BR',{maximumFractionDigits:0}) : '—';

  return (
    <div className="table-wrapper">
      <table className="forecast-table">
        <thead>
          <tr><th className="col-label">Categoria / Tipo</th>{MONTHS_PT.map(m=><th key={m}>{m}</th>)}<th>Total</th></tr>
        </thead>
        <tbody>
          {CATEGORIES.map(cat=>(
            <>
              <tr key={`h-${cat}`} className="cat-header-row"><td colSpan={14}>{cat}</td></tr>
              {['Budget','Forecast','Actual'].map(type=>(
                <tr key={`${cat}-${type}`} className={`row-${type.toLowerCase()}`}>
                  <td className="td-label">{type}</td>
                  {Array.from({length:12},(_,i)=>i+1).map(m=><td key={m}>{f(get(cat,type,m))}</td>)}
                  <td style={{fontWeight:700}}>{f(rowTotal(cat,type))}</td>
                </tr>
              ))}
            </>
          ))}
          <tr className="cat-header-row"><td colSpan={14}>TOTAL GERAL</td></tr>
          {['Budget','Forecast','Actual'].map(type=>(
            <tr key={`tot-${type}`} className="total-row">
              <td className="td-label" style={{color:'#fff',background:'var(--ctg-navy)'}}>{type}</td>
              {Array.from({length:12},(_,i)=>i+1).map(m=><td key={m} style={{fontWeight:700}}>{f(colTotal(m,type))}</td>)}
              <td style={{fontWeight:800,fontSize:'0.88rem'}}>{f(grandTotal(type))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  {id:'forecast', label:'Forecast'},
  {id:'charts',   label:'Gráficos'},
  {id:'chat',     label:'Chat'},
  {id:'notes',    label:'Avisos'},
];

export default function ProjectDetail({ onEdit }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isEngenheiro, isPlanejador, isGestor, isAdmin, canManage } = useRole();
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [notes, setNotes] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [allEngineers, setAllEngineers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('forecast');
  const [year, setYear] = useState(new Date().getFullYear());
  const [assignModal, setAssignModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingNote, setAddingNote] = useState(false);
  const { toast } = useToast();

  const fetchProject = useCallback(async () => {
    try {
      const [pRes, eRes, nRes, engRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/forecast/project/${id}`),
        api.get(`/forecast/project/${id}/notes`),
        api.get(`/projects/${id}/engineers`),
      ]);
      setProject(pRes.data);
      setEntries(eRes.data);
      setNotes(nRes.data);
      setEngineers(engRes.data);
    } catch { navigate('/'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchProject(); }, [id]);

  useEffect(() => {
    if (!canManage) return;
    api.get('/users/engineers').then(r => setAllEngineers(r.data)).catch(()=>{});
  }, [canManage]);

  useEffect(() => {
    api.get(`/projects/${id}/messages/unread-count`)
      .then(r => setUnreadCount(r.data.unread)).catch(()=>{});
  }, [id, tab]);

  // Totals for current year
  const totalFor = (type) => entries.filter(e=>e.type===type&&parseInt(e.year)===year).reduce((s,e)=>s+parseFloat(e.value||0),0);

  // Chart data
  const chartData = MONTHS_PT.map((m,i)=>{
    const get = type => entries.filter(e=>parseInt(e.year)===year&&parseInt(e.month)===i+1&&e.type===type).reduce((s,e)=>s+parseFloat(e.value||0),0);
    return {month:m, Budget:get('Budget'), Forecast:get('Forecast'), Realizado:get('Actual')};
  });

  const handleAssign = async (userId) => {
    try {
      await api.post(`/projects/${id}/engineers`, { user_id: userId });
      await fetchProject();
      toast('Engenheiro designado', 'success');
    } catch { toast('Erro ao designar', 'error'); }
  };

  const handleUnassign = async (userId) => {
    if (!confirm('Remover engenheiro do projeto?')) return;
    try {
      await api.delete(`/projects/${id}/engineers/${userId}`);
      setEngineers(prev => prev.filter(e => e.id !== userId));
      toast('Removido do projeto', 'success');
    } catch { toast('Erro', 'error'); }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await api.post(`/forecast/project/${id}/notes`, { note_date: noteDate, content: noteContent });
      setNoteContent(''); setAddingNote(false);
      fetchProject();
      toast('Nota adicionada', 'success');
    } catch { toast('Erro', 'error'); }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm('Excluir nota?')) return;
    try {
      await api.delete(`/forecast/notes/${noteId}`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast('Nota removida', 'success');
    } catch { toast('Erro', 'error'); }
  };

  const handleExport = () => window.open(`${import.meta.env.VITE_API_URL||'/api'}/export/project/${id}`, '_blank');

  if (loading) return <div className="loading-spinner"><div className="spinner"/></div>;
  if (!project) return null;

  const unassignedEngineers = allEngineers.filter(e => !engineers.find(a => a.id === e.id));
  const tabsWithBadge = TABS.map(t => t.id === 'chat' && unreadCount > 0
    ? { ...t, label: `Chat${unreadCount > 0 ? ` (${unreadCount})` : ''}` }
    : t
  );

  return (
    <div>
      {/* Project header card */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{padding:'16px 20px',display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--ctg-blue)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:3}}>{project.code}</div>
            <h2 style={{fontFamily:'var(--font-display)',fontSize:'1.25rem',color:'var(--ctg-navy)',lineHeight:1.2,marginBottom:6}}>{project.name}</h2>
            {project.description && <p style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{project.description}</p>}

            {/* Engineers assigned */}
            <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap',alignItems:'center'}}>
              {engineers.map(e=>(
                <div key={e.id} style={{display:'flex',alignItems:'center',gap:5,background:'var(--forecast-bg)',padding:'3px 8px 3px 5px',borderRadius:20,fontSize:'0.75rem',color:'var(--forecast-text)'}}>
                  <Avatar name={e.name} initials={e.avatar_initials} role="engenheiro" size={20}/>
                  {e.name}
                  {canManage && <button style={{background:'none',border:'none',cursor:'pointer',color:'inherit',padding:'0 0 0 2px',lineHeight:1,opacity:0.6}} onClick={()=>handleUnassign(e.id)}>✕</button>}
                </div>
              ))}
              {canManage && (
                <button className="btn btn-ghost btn-sm" onClick={()=>setAssignModal(true)}>
                  + Designar Engenheiro
                </button>
              )}
            </div>
          </div>

          {/* Year totals */}
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {[{label:'Budget',v:totalFor('Budget'),cls:'budget'},{label:'Forecast',v:totalFor('Forecast'),cls:'forecast'},{label:'Realizado',v:totalFor('Actual'),cls:'actual'},{label:'SI',v:project.si_value,cls:''}].map(s=>(
              <div key={s.label} style={{padding:'10px 14px',background:s.cls?`var(--${s.cls}-bg)`:'var(--bg-app)',borderRadius:'var(--radius-md)',minWidth:95,textAlign:'center'}}>
                <div style={{fontSize:'0.62rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:s.cls?`var(--${s.cls}-text)`:'var(--text-muted)',marginBottom:2}}>{s.label}</div>
                <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',color:'var(--text-primary)'}}>{fmt(s.v)}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
            {canManage && <button className="btn btn-secondary btn-sm" onClick={()=>onEdit?.(project)}>✎ Editar</button>}
            <button className="btn btn-export btn-sm" onClick={handleExport}>⬇ Excel</button>
          </div>
        </div>
      </div>

      {/* Tabs + year */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div className="tabs" style={{flex:1,minWidth:0,marginBottom:0}}>
          {tabsWithBadge.map(t=>(
            <button key={t.id} className={`tab-btn ${tab===t.id?'active':''}`} onClick={()=>{setTab(t.id);if(t.id==='chat')setUnreadCount(0);}}>
              {t.label}
            </button>
          ))}
        </div>
        {tab!=='chat' && tab!=='notes' && <YearSelector year={year} onChange={setYear}/>}
      </div>

      {/* Forecast tab */}
      {tab==='forecast' && (
        isEngenheiro
          ? <ForecastWizard projectId={id} entries={entries} year={year} onSaved={fetchProject} editType="Forecast" />
          : isPlanejador
            ? <ForecastWizard projectId={id} entries={entries} year={year} onSaved={fetchProject} editType="Budget" />
            : <ReadOnlyTable entries={entries} year={year}/>
      )}

      {/* Charts tab */}
      {tab==='charts' && (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div className="card">
            <div className="card-header"><span className="card-title">Evolução Mensal — {year}</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="month" tick={{fontSize:11}}/>
                  <YAxis tickFormatter={fmt} tick={{fontSize:10}} width={72}/>
                  <Tooltip formatter={(v)=>formatBRL(v)}/>
                  <Legend/>
                  <Bar dataKey="Budget" fill="#2563EB" radius={[3,3,0,0]}/>
                  <Bar dataKey="Forecast" fill="#16A34A" radius={[3,3,0,0]}/>
                  <Bar dataKey="Realizado" fill="#D97706" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">S-Curve Acumulado — {year}</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={(() => { let b=0,f=0,a=0; return chartData.map(d=>{ b+=d.Budget;f+=d.Forecast;a+=d.Realizado; return {month:d.month,Budget:b,Forecast:f,Realizado:a}; }); })()} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="month" tick={{fontSize:10}}/>
                  <YAxis tickFormatter={fmt} tick={{fontSize:10}} width={72}/>
                  <Tooltip formatter={v=>formatBRL(v)}/>
                  <Legend/>
                  <Line type="monotone" dataKey="Budget" stroke="#1E40AF" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="Forecast" stroke="#15803D" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="Realizado" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 2"/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Chat tab */}
      {tab==='chat' && <ProjectChat projectId={id}/>}

      {/* Notes tab */}
      {tab==='notes' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Avisos e Histórico</span>
            <button className="btn btn-primary btn-sm" onClick={()=>setAddingNote(v=>!v)}>
              {addingNote ? 'Cancelar' : '+ Nova Nota'}
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
                    <textarea className="form-textarea" style={{minHeight:60}} placeholder="Descreva a alteração..." value={noteContent} onChange={e=>setNoteContent(e.target.value)} autoFocus/>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleAddNote}>Salvar Nota</button>
              </div>
            )}
            {notes.length===0 ? (
              <div className="empty-state" style={{padding:'30px 0'}}><h3>Sem notas</h3></div>
            ) : notes.map(n=>(
              <div key={n.id} className="note-item">
                <div className="note-date">{n.note_date?new Date(n.note_date).toLocaleDateString('pt-BR'):''}</div>
                <div className="note-content">
                  {n.user_name && <span style={{fontSize:'0.72rem',fontWeight:700,color:'var(--ctg-blue)',marginRight:6}}>[{n.user_name}]</span>}
                  {n.content}
                </div>
                {canManage && <button className="btn btn-ghost btn-icon" style={{color:'#DC2626'}} onClick={()=>handleDeleteNote(n.id)}>✕</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign Modal */}
      <Modal open={assignModal} onClose={()=>setAssignModal(false)} title="Designar Engenheiro">
        {unassignedEngineers.length===0 ? (
          <p style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>Todos os engenheiros já estão designados, ou não há engenheiros cadastrados.</p>
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
