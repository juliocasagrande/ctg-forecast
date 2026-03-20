import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useRole } from './context/AuthContext.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ProjectDetail from './components/ProjectDetail.jsx';
import ProjectForm from './components/ProjectForm.jsx';
import Profile from './components/Profile.jsx';
import AdminPanel from './components/admin/AdminPanel.jsx';
import AlertBell from './components/ui/AlertBell.jsx';
import api from './utils/api.js';

const MIN_YEAR = 2023;
const MAX_YEAR = new Date().getFullYear() + 3;

const ALL_PLANTS = [
  'PCH Palmeiras','PCH Retiro','UHE Canoas 1','UHE Canoas 2',
  'UHE Capivara','UHE Chavantes','UHE Garibaldi','UHE Ilha Solteira',
  'UHE Jupiá','UHE Jurumirim','UHE Rosana','UHE Salto',
  'UHE Salto Grande','UHE Taquaruçu',
];

// ── Period Slider ────────────────────────────────────────────────────────────
function PeriodSelector({ period, onChange }) {
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
        {/* "Usina" label — same font-display as period-label */}
        <span className="period-label" style={{
          color: selected.length > 0 ? 'var(--ctg-blue)' : 'var(--ctg-navy)',
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

function getPageMeta(pathname) {
  if (pathname === '/') return { title: 'Dashboard', sub: null };
  if (pathname === '/projects') return { title: 'Projetos', sub: null };
  if (pathname === '/admin') return { title: 'Administração', sub: 'Gestão de Usuários' };
  if (pathname === '/profile') return { title: 'Meu Perfil', sub: null };
  if (pathname.startsWith('/projects/')) return { title: 'Projetos', sub: null };
  return { title: 'CTG Forecast', sub: null };
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading } = useAuth();
  const { isAdmin, isPlanejador } = useRole();
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [projects, setProjects]             = useState([]);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [period, setPeriod]                 = useState({ start: new Date().getFullYear(), end: new Date().getFullYear() });
  const [plantFilter, setPlantFilter]       = useState([]);
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

  if (loading) return <div className="loading-spinner" style={{ minHeight: '100vh' }}><div className="spinner" /></div>;
  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );

  const { title, sub } = getPageMeta(location.pathname);
  const showControls   = ['/', '/projects'].includes(location.pathname) && !isAdmin;

  // Active plants = plants that exist in at least one project
  const activePlants = ALL_PLANTS.filter(pl => projects.some(p => (p.plants || []).includes(pl)));

  return (
    <div className="app-layout">
      <ToastProvider />
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}>☰</button>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewProject={openNewProject}
        projects={projects}
      />

      <div className="main-content">
        <header className="page-header">
          {/* Left: page title */}
          <div>
            <h1 className="page-title" style={{ fontSize: '2rem', lineHeight: 1 }}>{title}</h1>
            {sub && <div className="page-subtitle">{sub}</div>}
          </div>

          {/* Right: alerts + plant filter + period slider */}
          {showControls && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isPlanejador && (
                <button
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('ctg_token');
                      const base  = import.meta.env.VITE_API_URL || '/api';
                      const res   = await fetch(`${base}/export/planejador`, {
                        headers: { 'Authorization': `Bearer ${token}` },
                      });
                      if (!res.ok) throw new Error();
                      const blob = await res.blob();
                      const link = document.createElement('a');
                      link.href  = URL.createObjectURL(blob);
                      link.download = `CTG_Forecast_Planejador_${new Date().getFullYear()}.xlsx`;
                      link.click();
                      URL.revokeObjectURL(link.href);
                    } catch { alert('Erro ao exportar'); }
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                    border: '1.5px solid #15803D', background: '#F0FDF4',
                    color: '#15803D', fontWeight: 600, fontSize: '0.8rem',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}
                >
                  ⬇ Relatório Geral
                </button>
              )}
              <AlertBell />
              <PlantFilter
                activePlants={activePlants}
                selected={plantFilter}
                onChange={setPlantFilter}
              />
              <PeriodSelector period={period} onChange={setPeriod} />
            </div>
          )}
          {/* Alert bell on non-dashboard pages too */}
          {!showControls && !isAdmin && (
            <AlertBell />
          )}
        </header>

        <main className="page-body">
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />

            <Route path="/" element={
              <RequireAuth>
                {isAdmin
                  ? <Navigate to="/admin" replace />
                  : <Dashboard period={period} plantFilter={plantFilter} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <ProjectForm
        open={projectFormOpen}
        onClose={() => { setProjectFormOpen(false); setEditingProject(null); }}
        project={editingProject}
        onSaved={handleProjectSaved}
      />
    </div>
  );
}
