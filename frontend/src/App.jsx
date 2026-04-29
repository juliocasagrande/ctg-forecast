import Icon from './components/ui/Icon.jsx';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, NavLink } from 'react-router-dom';
import { useAuth, useRole } from './context/AuthContext.jsx';
import { useSettings } from './context/SettingsContext.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectDetail from './components/ProjectDetail.jsx';
import ProjectForm from './components/ProjectForm.jsx';
import Profile from './components/Profile.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import PolosPage from './pages/PolosPage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import TutorialPage from './pages/TutorialPage.jsx';
import FeedbackPage from './pages/FeedbackPage.jsx';
import FeedbackInbox from './pages/FeedbackInbox.jsx';
import VacationsPage from './pages/VacationsPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import IACsPage from './pages/IACsPage.jsx';
import ProjectsTrackingPage from './pages/ProjectsTrackingPage.jsx';
import AdminPanel from './components/admin/AdminPanel.jsx';
import AlertBell from './components/ui/AlertBell.jsx';
import ChatBadge from './components/ui/ChatBadge.jsx';
import api from './utils/api.js';

// ── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#F8FAFC', padding: 40,
        }}>
          <div style={{
            maxWidth: 480, textAlign: 'center', background: '#fff',
            borderRadius: 16, padding: '40px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: '1px solid #E2E8F0',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#001F5B', marginBottom: 8 }}>
              Algo deu errado
            </h1>
            <p style={{ fontSize: '0.88rem', color: '#64748B', lineHeight: 1.6, marginBottom: 24 }}>
              Ocorreu um erro inesperado na aplicação. Tente recarregar a página.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => window.location.reload()} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#001F5B', color: '#fff', fontWeight: 600, fontSize: '0.9rem',
              }}>
                Recarregar página
              </button>
              <button onClick={() => { window.location.href = '/'; }} style={{
                padding: '10px 24px', borderRadius: 8, border: '1.5px solid #CBD5E1', cursor: 'pointer',
                background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.9rem',
              }}>
                Ir ao Dashboard
              </button>
            </div>
            {this.state.error && (
              <details style={{ marginTop: 20, textAlign: 'left' }}>
                <summary style={{ fontSize: '0.75rem', color: '#94A3B8', cursor: 'pointer' }}>Detalhes técnicos</summary>
                <pre style={{ fontSize: '0.7rem', color: '#DC2626', background: '#FEF2F2', padding: 12, borderRadius: 8, marginTop: 8, overflow: 'auto', maxHeight: 120 }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ALL_PLANTS = [
  'PCH Palmeiras','PCH Retiro','UHE Canoas 1','UHE Canoas 2',
  'UHE Capivara','UHE Chavantes','UHE Garibaldi','UHE Ilha Solteira',
  'UHE Jupiá','UHE Jurumirim','UHE Rosana','UHE Salto',
  'UHE Salto Grande','UHE Taquaruçu',
];

// ── Period Slider ────────────────────────────────────────────────────────────
function PeriodSelector({ period, onChange }) {
  const settings = useSettings();
  const activeStart = parseInt(settings.active_year_start) || 2026;
  const activeEnd   = parseInt(settings.active_year_end)   || 2031;
  const MIN_YEAR = activeStart - 1; // consolidated year
  const MAX_YEAR = activeEnd;
  const years = [];
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) years.push(y);
  const isSingle = period.start === period.end;
  const label = isSingle ? `${period.start}` : `${period.start} – ${period.end}`;

  return (
    <div className="period-selector">
      <div className="period-tracks">
        <div className="period-track-label" style={{ gridColumn: '1', fontSize: '0.58rem' }}>De</div>
        <input type="range" className="period-slider"
          min={MIN_YEAR} max={MAX_YEAR} value={period.start}
          onChange={e => {
            const val = parseInt(e.target.value);
            onChange({ start: val, end: Math.max(val, period.end) });
          }}
        />
        <div className="period-track-label" style={{ fontSize: '0.58rem' }}>Até</div>
        <input type="range" className="period-slider"
          min={MIN_YEAR} max={MAX_YEAR} value={period.end}
          onChange={e => {
            const val = parseInt(e.target.value);
            onChange({ start: Math.min(period.start, val), end: val });
          }}
        />
        <div className="period-years">
          {years.map(y => (
            <span key={y} className={`period-year-tick
              ${y >= period.start && y <= period.end ? 'in-range' : ''}
              ${y === period.start || y === period.end ? 'endpoint' : ''}`}>
              {y}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Plant Filter Dropdown ────────────────────────────────────────────────────
function PlantFilter({ activePlants, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (plant) => {
    onChange(selected.includes(plant)
      ? selected.filter(p => p !== plant)
      : [...selected, plant]
    );
  };

  const sublabel = selected.length === 0
    ? 'Todas'
    : selected.length === 1
      ? selected[0].replace('UHE ', '').replace('PCH ', '')
      : `${selected.length} selecionadas`;

  if (activePlants.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger — mirrors period-selector layout */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{
          fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', fontFamily: 'var(--font-body)',
          color: selected.length > 0 ? 'var(--ctg-blue)' : 'var(--ctg-navy)',
          display: 'block', lineHeight: 1,
        }}>
          Usina
        </span>

        {/* Sub-row: selection value + chevron */}
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: '0.72rem',
          fontWeight: selected.length > 0 ? 600 : 400,
          color: selected.length > 0 ? 'var(--ctg-blue)' : 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          whiteSpace: 'nowrap',
        }}>
          {sublabel}
          {selected.length > 0 && (
            <span
              onClick={e => { e.stopPropagation(); onChange([]); }}
              title="Limpar filtro"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--ctg-blue)', color: '#fff',
                fontSize: '0.6rem', fontWeight: 700, lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </span>
          )}
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1 }}>
            {open ? '▲' : '▼'}
          </span>
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          minWidth: 230,
          zIndex: 200,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '9px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--ctg-navy)',
          }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.7)' }}>
              Filtrar por Usina
            </span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.72rem', color: 'var(--ctg-accent)', fontWeight: 600,
                fontFamily: 'var(--font-body)',
              }}>
                Limpar
              </button>
            )}
          </div>

          {/* Options */}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {activePlants.map(plant => (
              <label key={plant} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px',
                cursor: 'pointer',
                background: selected.includes(plant) ? 'var(--budget-bg)' : 'transparent',
                transition: 'background 0.12s',
                fontSize: '0.83rem',
                fontWeight: selected.includes(plant) ? 600 : 400,
                color: selected.includes(plant) ? 'var(--ctg-navy)' : 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
              }}>
                <input
                  type="checkbox"
                  checked={selected.includes(plant)}
                  onChange={() => toggle(plant)}
                  style={{ accentColor: 'var(--ctg-blue)', width: 14, height: 14, flexShrink: 0 }}
                />
                {plant}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Project Filter Dropdown ──────────────────────────────────────────────────
function ProjectFilter({ projects, plantFilter, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter options by active plant filter
  const options = useMemo(() => {
    let base = projects;
    if (plantFilter.length > 0)
      base = base.filter(p => plantFilter.some(pl => (p.plants || []).includes(pl)));
    return base;
  }, [projects, plantFilter]);

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const sublabel = selected.length === 0
    ? 'Todos'
    : selected.length === 1
      ? (options.find(p => p.id === selected[0])?.code ?? '1 projeto')
      : `${selected.length} projetos`;

  if (options.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{
          fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', fontFamily: 'var(--font-body)',
          color: selected.length > 0 ? 'var(--ctg-blue)' : 'var(--ctg-navy)',
          display: 'block', lineHeight: 1,
        }}>Projeto</span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: '0.72rem', fontWeight: selected.length > 0 ? 600 : 400,
          color: selected.length > 0 ? 'var(--ctg-blue)' : 'var(--text-muted)',
          fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
        }}>
          {sublabel}
          {selected.length > 0 && (
            <span onClick={e => { e.stopPropagation(); onChange([]); }} title="Limpar"
              style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:14,height:14,borderRadius:'50%',background:'var(--ctg-blue)',color:'#fff',fontSize:'0.6rem',fontWeight:700,lineHeight:1,flexShrink:0,cursor:'pointer' }}>
              ×
            </span>
          )}
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          minWidth: 260, zIndex: 200, overflow: 'hidden',
        }}>
          <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--ctg-navy)' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'rgba(255,255,255,0.7)' }}>Filtrar por Projeto</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} style={{ background:'none',border:'none',cursor:'pointer',
                fontSize:'0.72rem',color:'var(--ctg-accent)',fontWeight:600,fontFamily:'var(--font-body)' }}>
                Limpar
              </button>
            )}
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {options.map(p => (
              <label key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer',
                background: selected.includes(p.id) ? 'var(--budget-bg)' : 'transparent',
                fontSize: '0.8rem', fontWeight: selected.includes(p.id) ? 600 : 400,
                color: selected.includes(p.id) ? 'var(--ctg-navy)' : 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
              }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)}
                  style={{ accentColor: 'var(--ctg-blue)', width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--ctg-blue)', marginRight: 2 }}>{p.code}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="loading-spinner" style={{ minHeight: '100vh' }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

function MobileBottomNav({ onLogout, isPlanejador, unreadCount = 0 }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ||
    (path !== '/' && location.pathname.startsWith(path));

  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" end className={`mobile-bottom-nav-item ${location.pathname === '/' ? 'active' : ''}`}>
        <Icon name="house-chimney" />
        <span>Dashboard</span>
      </NavLink>

      <NavLink to="/polos" className={`mobile-bottom-nav-item ${isActive('/polos') ? 'active' : ''}`}>
        <Icon name="layer-group" /><span>Polos</span>
      </NavLink>
      <NavLink to="/projects" className={`mobile-bottom-nav-item ${isActive('/projects') ? 'active' : ''}`}>
        <Icon name="folder-open" />
        <span>Projetos</span>
      </NavLink>

      <NavLink to="/profile" className={`mobile-bottom-nav-item ${isActive('/profile') ? 'active' : ''}`}>
        <Icon name="circle-user" />
        <span>Perfil</span>
      </NavLink>

      {isPlanejador && (
        <NavLink to="/settings" className={`mobile-bottom-nav-item ${isActive('/settings') ? 'active' : ''}`}>
          <Icon name="gear" />
          <span>Config.</span>
        </NavLink>
      )}

      <button className="mobile-bottom-nav-item logout-btn" onClick={onLogout}>
        <Icon name="right-from-bracket" />
        <span>Sair</span>
      </button>
    </nav>
  );
}


// ── Planejador / Relatório Geral export modal ─────────────────────────────────
const PLANNER_TYPES  = ['Budget','Forecast','Actual','Meta','Pool'];
const TYPE_LABEL_MAP = { Budget:'Budget', Forecast:'Forecast', Actual:'Realizado', Meta:'Meta', Pool:'Pool' };
const TYPE_COLOR_MAP = {
  Budget:   { bg:'#F0FDF4', border:'#BBF7D0', text:'#15803D' },
  Forecast: { bg:'#F0F9FF', border:'#BAE6FD', text:'#0369A1' },
  Actual:   { bg:'#EFF6FF', border:'#BFDBFE', text:'#1E40AF' },
  Meta:     { bg:'#F5F3FF', border:'#DDD6FE', text:'#6D28D9' },
  Pool:     { bg:'#F0F9FF', border:'#BAE6FD', text:'#0891B2' },
};

function PlanejadorExportModal({ open, onClose }) {
  const [selTypes, setSelTypes] = useState([...PLANNER_TYPES]);
  const [exporting, setExporting] = useState(false);

  const toggle = (val) =>
    setSelTypes(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const token  = localStorage.getItem('ctg_token');
      const base   = import.meta.env.VITE_API_URL || '/api';
      const params = new URLSearchParams();
      selTypes.forEach(t => params.append('types', t));
      const fetchOpts = { credentials: 'include' };
      if (token) fetchOpts.headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`${base}/export/planejador?${params.toString()}`, fetchOpts);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href  = URL.createObjectURL(blob);
      link.download = `CTG_Engenharia_Planejador_${new Date().getFullYear()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      onClose();
    } catch { alert('Erro ao exportar'); }
    finally { setExporting(false); }
  };

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📊 Relatório Geral</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
            color:'rgba(255,255,255,0.7)', fontSize:'1.1rem', padding:'0 4px' }}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginBottom:8 }}>
            O relatório incluirá <strong>todos os projetos</strong> com dados de Forecast mês a mês
            de Jan/2026 a Dez/2031.
          </p>
          <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:16,
            padding:'8px 12px', background:'var(--bg-app)', borderRadius:'var(--radius-sm)',
            borderLeft:'3px solid var(--ctg-blue)' }}>
            ℹ Engenheiros verão apenas seus próprios projetos.
            Planejadores verão todos os projetos.
          </p>

          <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase',
            letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>
            Colunas a incluir
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {PLANNER_TYPES.map(type => {
              const th  = TYPE_COLOR_MAP[type] || {};
              const sel = selTypes.includes(type);
              return (
                <label key={type} style={{
                  display:'flex', alignItems:'center', gap:7, padding:'7px 14px',
                  borderRadius:'var(--radius-md)', cursor:'pointer',
                  background: sel ? th.bg : 'var(--bg-app)',
                  border: `1.5px solid ${sel ? th.border : 'var(--border-strong)'}`,
                  fontSize:'0.83rem', fontWeight: sel ? 600 : 400,
                  color: sel ? th.text : 'var(--text-secondary)',
                  transition:'all 0.15s', userSelect:'none',
                }}>
                  <input type="checkbox" checked={sel} onChange={() => toggle(type)}
                    style={{ accentColor: th.text || 'var(--ctg-blue)', width:14, height:14 }} />
                  {TYPE_LABEL_MAP[type] || type}
                </label>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-export" onClick={handleExport}
            disabled={selTypes.length === 0 || exporting}>
            {exporting ? 'Gerando...' : '📊 Exportar'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Mobile filter modal (bottom-sheet) ──────────────────────────────────────
// ── Area dropdown filter (vacations + polos) ──────────────────────────────────
const AREA_OPTIONS_LIST = [
  { value: '', label: 'Todas' },
  { value: 'eletrica', label: 'Elétrica' },
  { value: 'mecanica', label: 'Mecânica' },
  { value: 'confiabilidade', label: 'Confiabilidade' },
  { value: 'modernizacao', label: 'Modernização' },
];

function AreaFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = AREA_OPTIONS_LIST.find(o => o.value === value) || AREA_OPTIONS_LIST[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{
          fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', fontFamily: 'var(--font-body)',
          color: value ? 'var(--ctg-blue)' : 'var(--ctg-navy)',
          display: 'block', lineHeight: 1,
        }}>Área</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem',
          fontWeight: value ? 600 : 400, color: value ? 'var(--ctg-blue)' : 'var(--text-muted)',
          fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
          {selected.label}
          {value && (
            <span onClick={e => { e.stopPropagation(); onChange(''); }}
              style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',
                width:14,height:14,borderRadius:'50%',background:'var(--ctg-blue)',color:'#fff',
                fontSize:'0.6rem',fontWeight:700,lineHeight:1,flexShrink:0 }}>×</span>
          )}
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0,
          background:'var(--bg-card)', border:'1px solid var(--border-strong)',
          borderRadius:'var(--radius-md)', boxShadow:'var(--shadow-lg)',
          minWidth:160, zIndex:200, overflow:'hidden' }}>
          <div style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)',
            background:'var(--ctg-navy)', color:'#fff',
            fontSize:'0.72rem', fontWeight:700, letterSpacing:'0.05em' }}>ÁREA</div>
          {AREA_OPTIONS_LIST.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ width:'100%', textAlign:'left', padding:'8px 14px',
                background: value === opt.value ? 'rgba(0,102,179,0.08)' : 'transparent',
                border:'none', cursor:'pointer', fontSize:'0.82rem',
                fontWeight: value === opt.value ? 700 : 400,
                color: value === opt.value ? 'var(--ctg-blue)' : 'var(--text-primary)',
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              {opt.label}
              {value === opt.value && <span style={{ color:'var(--ctg-blue)', fontSize:'0.75rem' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function MobileFilterModal({ open, onClose, period, onPeriod, activePlants, plantFilter, onPlantFilter, isPlanejador, onOpenExport }) {
  if (!open) return null;
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:500,
      background:'rgba(0,0,0,0.45)', backdropFilter:'blur(2px)',
      display:'flex', alignItems:'flex-end',
    }} onClick={onClose}>
      <div style={{
        background:'var(--bg-card)', width:'100%', borderRadius:'16px 16px 0 0',
        padding:'16px 20px calc(16px + env(safe-area-inset-bottom,0px))',
        boxShadow:'0 -4px 32px rgba(0,0,0,0.18)',
        maxHeight:'80vh', overflowY:'auto',
      }} onClick={e=>e.stopPropagation()}>
        {/* Handle bar */}
        <div style={{ width:40, height:4, background:'var(--border-strong)', borderRadius:2, margin:'0 auto 16px' }} />
        
        <div style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--ctg-navy)', marginBottom:14 }}>Filtros</div>
        
        {/* Period */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>Período</div>
          <PeriodSelector period={period} onChange={onPeriod} />
        </div>
        
        {/* Plant filter */}
        {activePlants.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>Usina</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button
                style={{ padding:'5px 12px', borderRadius:20, border:'1.5px solid var(--border-strong)',
                  background: plantFilter.length===0 ? 'var(--ctg-navy)' : 'transparent',
                  color: plantFilter.length===0 ? '#fff' : 'var(--text-secondary)',
                  fontSize:'0.78rem', cursor:'pointer', fontFamily:'var(--font-body)' }}
                onClick={() => onPlantFilter([])}>Todas</button>
              {activePlants.map(pl => (
                <button key={pl}
                  style={{ padding:'5px 12px', borderRadius:20, border:'1.5px solid var(--border-strong)',
                    background: plantFilter.includes(pl) ? 'var(--ctg-blue)' : 'transparent',
                    color: plantFilter.includes(pl) ? '#fff' : 'var(--text-secondary)',
                    fontSize:'0.78rem', cursor:'pointer', fontFamily:'var(--font-body)' }}
                  onClick={() => onPlantFilter(prev => prev.includes(pl) ? prev.filter(x=>x!==pl) : [...prev, pl])}>
                  {pl.replace('UHE ','').replace('PCH ','')}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-secondary" style={{ width:'100%', justifyContent:'center', marginTop:8 }}
          onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function getPageMeta(pathname) {
  if (pathname === '/') return { title: 'Dashboard', sub: null };
  if (pathname === '/projects') return { title: 'Projetos', sub: null };
  if (pathname === '/admin') return { title: 'Administração', sub: 'Gestão de Usuários' };
  if (pathname === '/profile') return { title: 'Meu Perfil', sub: null };
  if (pathname === '/settings') return { title: 'Configurações', sub: null };
  if (pathname === '/polos') return { title: 'Visão Geral Consolidada — CTG Brasil', sub: null };
  if (pathname === '/report') return { title: 'Relatório HTML', sub: 'Configurar e exportar' };
  if (pathname === '/tutorial') return { title: 'Tutorial', sub: 'Como utilizar o sistema' };
  if (pathname === '/feedback') return { title: 'Sugestões e Feedback', sub: 'Envie sua contribuição' };
  if (pathname === '/feedback/inbox') return { title: 'Inbox de Feedback', sub: 'Mensagens dos usuários do sistema' };
  if (pathname === '/vacations') return { title: 'Controle de Férias', sub: null };
  if (pathname === '/documents') return { title: 'Controle de Documentos', sub: null };
  if (pathname === '/lists/iacs') return { title: 'IACs 2026'};
  if (pathname === '/lists/projects-tracking') return { title: 'Acompanhamento de Projetos', sub: 'Relatório mensal — contratos em andamento' };
  if (pathname.startsWith('/projects/')) return { title: 'Projetos', sub: null };
  return { title: 'CTG.Engenharia', sub: null };
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, logout } = useAuth();
  const { isAdmin, isPlanejador, isCoordenador, isGerente } = useRole();
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [projects, setProjects]             = useState([]);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [period, setPeriod]                 = useState({ start: 2025, end: 2027 });
  const [filterModalOpen,   setFilterModalOpen]   = useState(false);
  const [planjExportModal, setPlanjExportModal] = useState(false);
  const [plantFilter, setPlantFilter]       = useState([]);
  const [projectFilter, setProjectFilter]   = useState([]);
  const [areaFilter, setAreaFilter]         = useState('');
  const [vacYear, setVacYear]               = useState(new Date().getFullYear());
  const location  = useLocation();
  const navigate  = useNavigate();

  const fetchProjects = async () => {
    if (!user || user.role === 'admin') return;
    try { setProjects((await api.get('/projects')).data); } catch {}
  };

  useEffect(() => { if (user) fetchProjects(); }, [user]);

  const openNewProject = () => { setEditingProject(null); setProjectFormOpen(true); };
  const openEditProject = async (p) => {
    try { setEditingProject((await api.get(`/projects/${p.id}`)).data); }
    catch { setEditingProject(p); }
    setProjectFormOpen(true);
  };
  const handleProjectSaved = (saved) => {
    fetchProjects();
    if (!editingProject) navigate(`/projects/${saved.id}`);
    setEditingProject(null);
  };
  const handleProjectDeleted = () => {
    setProjectFormOpen(false);
    setEditingProject(null);
    fetchProjects();
    navigate('/projects');
  };

  if (loading) return <div className="loading-spinner" style={{ minHeight: '100vh' }}><div className="spinner" /></div>;
  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );

  const { title, sub } = getPageMeta(location.pathname);
  const showControls   = ['/', '/projects', '/polos', '/vacations'].includes(location.pathname) && !isAdmin;

  // Active plants = plants that exist in at least one project
  const activePlants = ALL_PLANTS.filter(pl => projects.some(p => (p.plants || []).includes(pl)));

  return (
    <ErrorBoundary>
    <div className="app-layout">
      <ToastProvider />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewProject={openNewProject}
        projects={projects}
      />

      <div className="main-content">
        {/* ── MOBILE: single sticky header row ── */}
        <header className="page-header mobile-header">
          {/* Mobile: menu toggle inline with title */}
          <button className="sidebar-toggle-inline" onClick={() => setSidebarOpen(o => !o)}>☰</button>

          {/* Title */}
          <div className="mobile-header-title">
            <h1 className="page-title">{title}</h1>
            {sub && <div className="page-subtitle">{sub}</div>}
          </div>

          {/* Desktop: full controls — always same height, pill always visible */}
          <div className="header-controls-desktop">
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>

              {/* ── Botões da página de acompanhamento ── */}
              {location.pathname === '/lists/projects-tracking' && (() => {
                const canImport = ['coordenador', 'planejador', 'admin'].includes(user?.role) ||
                  user?.email === 'julio.casagrande@ctgbr.com.br';
                return (
                  <>
                    <button onClick={() => {
                      window.dispatchEvent(new CustomEvent('new-project'));
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 18px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg, #001F5B, #0b5cab)',
                      color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(11,92,171,0.25)',
                      marginRight: 8, whiteSpace: 'nowrap',
                    }}>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                      </svg>
                      Novo Projeto
                    </button>
                    {canImport && (
                      <button onClick={() => {
                        window.dispatchEvent(new CustomEvent('import-projects'));
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 14px', borderRadius: 10, border: '1.5px solid #0b5cab',
                        background: '#fff',
                        color: '#0b5cab', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                        marginRight: 8, whiteSpace: 'nowrap',
                      }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                        </svg>
                        Importar
                      </button>
                    )}
                    <button onClick={() => {
                      window._exportProjectsTracking?.();
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 10, border: '1.5px solid #10B981',
                      background: '#fff',
                      color: '#059669', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                      marginRight: 8, whiteSpace: 'nowrap',
                    }}>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm7-13a1 1 0 011 1v4.586l1.707-1.707a1 1 0 111.414 1.414l-3.414 3.414a1 1 0 01-1.414 0l-3.414-3.414a1 1 0 111.414-1.414L9 9.586V5a1 1 0 011-1z" clipRule="evenodd"/>
                      </svg>
                      Exportar
                    </button>
                    {canImport && (
                      <button onClick={() => {
                        window.dispatchEvent(new CustomEvent('generate-html-report'));
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 14px', borderRadius: 10, border: '1.5px solid #F59E0B',
                        background: '#fff',
                        color: '#92400E', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                        marginRight: 8, whiteSpace: 'nowrap',
                      }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
                        </svg>
                        Relatório HTML
                      </button>
                    )}
                  </>
                );
              })()}

              {/* ── Botões da página de IACs ── */}
              {location.pathname === '/lists/iacs' && (() => {
                const canImport = ['gestor', 'coordenador', 'planejador', 'admin'].includes(user?.role) ||
                  user?.email === 'julio.casagrande@ctgbr.com.br';
                const isEngenheiro = user?.role === 'engenheiro' && user?.email !== 'julio.casagrande@ctgbr.com.br';
                return (
                  <>
                    {!isEngenheiro && (
                      <button onClick={() => {
                        window.dispatchEvent(new CustomEvent('new-iac'));
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 18px', borderRadius: 10, border: 'none',
                        background: 'linear-gradient(135deg, #001F5B, #0b5cab)',
                        color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(11,92,171,0.25)',
                        marginRight: 8, whiteSpace: 'nowrap',
                      }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                        </svg>
                        Novo IAC
                      </button>
                    )}
                    {canImport && !isEngenheiro && (
                      <button onClick={() => {
                        window.dispatchEvent(new CustomEvent('import-iacs'));
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 14px', borderRadius: 10, border: '1.5px solid #0b5cab',
                        background: '#fff',
                        color: '#0b5cab', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                        marginRight: 8, whiteSpace: 'nowrap',
                      }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                        </svg>
                        Importar
                      </button>
                    )}
                    <button onClick={() => {
                      window._exportIACs?.();
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 10, border: '1.5px solid #10B981',
                      background: '#fff',
                      color: '#059669', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                      marginRight: 8, whiteSpace: 'nowrap',
                    }}>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm7-13a1 1 0 011 1v4.586l1.707-1.707a1 1 0 111.414 1.414l-3.414 3.414a1 1 0 01-1.414 0l-3.414-3.414a1 1 0 111.414-1.414L9 9.586V5a1 1 0 011-1z" clipRule="evenodd"/>
                      </svg>
                      Exportar
                    </button>
                  </>
                );
              })()}

              {/* ── Botões da página de Documentos ── */}
              {location.pathname === '/documents' && (() => {
                const canManage = ['admin', 'gestor', 'coordenador', 'planejador'].includes(user?.role) ||
                  user?.email === 'julio.casagrande@ctgbr.com.br';
                return (
                  <>
                    {canManage && (
                      <button onClick={() => {
                        window.dispatchEvent(new CustomEvent('import-documents-docx'));
                      }} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 14px', borderRadius: 10, border: '1.5px solid #0b5cab',
                        background: '#fff',
                        color: '#0b5cab', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                        marginRight: 8, whiteSpace: 'nowrap',
                      }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                        </svg>
                        Importar
                      </button>
                    )}
                    <button onClick={() => {
                      window._exportDocumentsExcel?.();
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 10, border: '1.5px solid #10B981',
                      background: '#fff',
                      color: '#059669', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                      marginRight: 8, whiteSpace: 'nowrap',
                    }}>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm7-13a1 1 0 011 1v4.586l1.707-1.707a1 1 0 111.414 1.414l-3.414 3.414a1 1 0 01-1.414 0l-3.414-3.414a1 1 0 111.414-1.414L9 9.586V5a1 1 0 011-1z" clipRule="evenodd"/>
                      </svg>
                      Exportar Excel
                    </button>
                    <button onClick={() => {
                      window._exportDocumentsHTML?.();
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 10, border: '1.5px solid #CBD5E1',
                      background: '#fff',
                      color: '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                      marginRight: 8, whiteSpace: 'nowrap',
                    }}>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
                      </svg>
                      Exportar HTML
                    </button>
                  </>
                );
              })()}

              <AlertBell />

              {/* ── Pill de filtros — sempre renderizado para altura consistente ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                marginLeft: 10,
                padding: '3px 10px 3px 8px',
                background: 'rgba(0,31,91,0.06)',
                border: '1px solid rgba(0,31,91,0.12)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                position: 'relative',
                minHeight: 36,
              }}>
                {/* Ícone de filtro decorativo — sempre visível */}
                <svg viewBox="0 0 16 16" fill="none" stroke="var(--ctg-blue)" strokeWidth="1.5"
                  width="13" height="13" style={{ opacity: 0.45, flexShrink: 0, marginRight: 4 }}>
                  <path d="M2 4h12M4.5 8h7M7 12h2" strokeLinecap="round"/>
                </svg>

                {/* Filtro de usina — páginas com showControls exceto férias */}
                {showControls && location.pathname !== '/vacations' && (
                  <PlantFilter
                    activePlants={activePlants}
                    selected={plantFilter}
                    onChange={(v) => { setPlantFilter(v); setProjectFilter([]); }}
                  />
                )}

                {/* Filtro de projeto — só no dashboard */}
                {showControls && location.pathname === '/' && (
                  <>
                    <div style={{ width: 1, height: 20, background: 'rgba(0,31,91,0.12)', margin: '0 4px', flexShrink: 0 }} />
                    <ProjectFilter
                      projects={projects}
                      plantFilter={plantFilter}
                      selected={projectFilter}
                      onChange={setProjectFilter}
                    />
                  </>
                )}

                {/* Filtro de área — férias */}
                {showControls && location.pathname === '/vacations' && (
                  <>
                    <div style={{ width: 1, height: 20, background: 'rgba(0,31,91,0.12)', margin: '0 4px', flexShrink: 0 }} />
                    <AreaFilter value={areaFilter} onChange={setAreaFilter} />
                  </>
                )}

                {/* Seletor de ano — apenas férias */}
                {showControls && location.pathname === '/vacations' && (
                  <>
                    <div style={{ width: 1, height: 20, background: 'rgba(0,31,91,0.15)', margin: '0 8px', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-body)', color: 'var(--ctg-navy)', lineHeight: 1 }}>Ano</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <button onClick={() => setVacYear(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '0 1px', lineHeight: 1, fontFamily: 'var(--font-body)' }}>‹</button>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--ctg-navy)', minWidth: 32, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{vacYear}</span>
                        <button onClick={() => setVacYear(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '0 1px', lineHeight: 1, fontFamily: 'var(--font-body)' }}>›</button>
                      </div>
                    </div>
                  </>
                )}

                {/* Seletor de período — todas as páginas exceto férias */}
                {!showControls || location.pathname !== '/vacations' ? (
                  <>
                    <div style={{ width: 1, height: 20, background: 'rgba(0,31,91,0.15)', margin: '0 8px', flexShrink: 0 }} />
                    <PeriodSelector period={period} onChange={setPeriod} />
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Mobile: bell + filter button only */}
          <div className="header-controls-mobile">
            {/* Botão Novo Projeto (apenas na página de acompanhamento) */}
            {location.pathname === '/lists/projects-tracking' && (
              <button onClick={() => {
                window.dispatchEvent(new CustomEvent('new-project'));
              }} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #001F5B, #0b5cab)',
                color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                </svg>
                Novo Projeto
              </button>
            )}
            {/* Botão Novo IAC (apenas na página de IACs, não para engenheiros, exceto julio.casagrande) */}
            {location.pathname === '/lists/iacs' && (user?.role !== 'engenheiro' || user?.email === 'julio.casagrande@ctgbr.com.br') && (
              <button onClick={() => {
                window.dispatchEvent(new CustomEvent('new-iac'));
              }} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #001F5B, #0b5cab)',
                color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
                </svg>
                Novo IAC
              </button>
            )}
            <AlertBell />
            {showControls && (
              <button
                className="mobile-filter-btn"
                onClick={() => setFilterModalOpen(true)}
                aria-label="Filtros"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V15a1 1 0 01-.553.894l-4 2A1 1 0 017 17v-6.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                </svg>
                {(plantFilter.length > 0) && <span className="filter-badge">{plantFilter.length}</span>}
              </button>
            )}
          </div>
        </header>

        {/* Mobile filter modal */}
        <MobileFilterModal
          open={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          period={period}
          onPeriod={setPeriod}
          activePlants={activePlants}
          plantFilter={plantFilter}
          onPlantFilter={setPlantFilter}
          isPlanejador={isPlanejador}
          onOpenExport={() => setPlanjExportModal(true)}
        />

        <main className="page-body">
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />

            <Route path="/" element={
              <RequireAuth>
                {isAdmin
                  ? <Navigate to="/admin" replace />
                  : <Dashboard period={period} plantFilter={plantFilter} projectFilter={projectFilter} onProjectFilterChange={setProjectFilter} />
                }
              </RequireAuth>
            } />

            <Route path="/projects" element={
              <RequireAuth>
                <ProjectsPage
                  projects={projects}
                  period={period}
                  plantFilter={plantFilter}
                  onEditProject={openEditProject}
                  onProjectsChange={fetchProjects}
                />
              </RequireAuth>
            } />

            <Route path="/projects/:id" element={
              <RequireAuth><ProjectDetail onEdit={openEditProject} /></RequireAuth>
            } />

            <Route path="/admin" element={
              <RequireAuth>
                <RequireRole roles={['admin']}><AdminPanel /></RequireRole>
              </RequireAuth>
            } />

            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/polos" element={<RequireAuth><PolosPage period={period} plantFilter={plantFilter} /></RequireAuth>} />
            <Route path="/report" element={<RequireAuth><ReportPage /></RequireAuth>} />
            <Route path="/tutorial" element={<RequireAuth><TutorialPage /></RequireAuth>} />
            <Route path="/feedback" element={<RequireAuth><FeedbackPage /></RequireAuth>} />
            <Route path="/feedback/inbox" element={<RequireAuth><FeedbackInbox /></RequireAuth>} />
            <Route path="/vacations" element={<RequireAuth><VacationsPage areaFilter={areaFilter} year={vacYear} onYearChange={setVacYear} /></RequireAuth>} />
            <Route path="/documents" element={<RequireAuth><DocumentsPage /></RequireAuth>} />
            <Route path="/lists/iacs" element={<RequireAuth><IACsPage /></RequireAuth>} />
            <Route path="/lists/projects-tracking" element={<RequireAuth><ProjectsTrackingPage /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <ProjectForm
        open={projectFormOpen}
        onClose={() => { setProjectFormOpen(false); setEditingProject(null); }}
        project={editingProject}
        onSaved={handleProjectSaved}
        onDeleted={handleProjectDeleted}
      />

      {/* Planejador export modal */}
      <PlanejadorExportModal
        open={planjExportModal}
        onClose={() => setPlanjExportModal(false)}
      />

      {/* Chat assistant badge — visible in all authenticated pages */}
      {!isAdmin && <ChatBadge />}

      {/* Mobile bottom navigation — hidden on desktop via CSS */}
      {!isAdmin && (
        <MobileBottomNav
          isPlanejador={isPlanejador}
          onLogout={() => { logout(); navigate('/login'); }}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}