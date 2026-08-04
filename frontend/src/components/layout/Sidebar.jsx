import Icon from '../ui/Icon.jsx';
import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useRole, usePageAccess } from '../../context/AuthContext.jsx';
import api from '../../utils/api.js';

const IC = {
  dashboard: <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M2 4a1 1 0 011-1h5a1 1 0 011 1v5H3V4zm9 0a1 1 0 011-1h5v3h-6V4zM2 11h7v5H3a1 1 0 01-1-1v-4zm9 0h6v4a1 1 0 01-1 1h-5v-5z"/></svg>,
  projects:  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>,
  users:     <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>,
  add:       <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/></svg>,
  profile:   <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>,
  settings:  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>,
  report:    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>,
  polos:     <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z"/></svg>,
  logout:    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h7v-2H4V5h6V3H3zm11.293 4.293a1 1 0 011.414 1.414L13.414 11H9a1 1 0 110-2h4.414l2.293-2.293z" clipRule="evenodd"/></svg>,
  plant:     <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/></svg>,
  monthly:   <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>,
};

const ORDERED_PLANTS = [
  'PCH Palmeiras','PCH Retiro','UHE Canoas 1','UHE Canoas 2',
  'UHE Capivara','UHE Chavantes','UHE Garibaldi','UHE Ilha Solteira',
  'UHE Jupiá','UHE Jurumirim','UHE Rosana','UHE Salto',
  'UHE Salto Grande','UHE Taquaruçu',
];

// Group projects by their plants, keeping plant order
// Projects with no plant go to a "Sem usina" group
function groupByPlant(projects) {
  const groups = {}; // plant -> [project]

  for (const p of projects) {
    const plants = p.plants?.length ? p.plants : ['Sem usina'];
    for (const plant of plants) {
      if (!groups[plant]) groups[plant] = [];
      // Avoid duplicating a project in the same plant group
      if (!groups[plant].find(x => x.id === p.id)) {
        groups[plant].push(p);
      }
    }
  }

  // Return in ordered-plant order, with "Sem usina" at the end
  const result = [];
  for (const plant of ORDERED_PLANTS) {
    if (groups[plant]?.length) result.push({ plant, projects: groups[plant] });
  }
  if (groups['Sem usina']?.length) {
    result.push({ plant: 'Sem usina', projects: groups['Sem usina'] });
  }
  return result;
}

export default function Sidebar({ open, onClose, onNewProject, projects }) {
  const { user, logout } = useAuth();
  const { isAdmin, isGestor, isCoordenador, isPlanejador, isGerente } = useRole();
  const forecastAccess         = usePageAccess('forecast');
  const projectsAccess         = usePageAccess('projects');
  const polosAccess            = usePageAccess('polos');
  const reportAccess           = usePageAccess('report');
  const projectsTrackingAccess = usePageAccess('projects_tracking');
  const iacsAccess             = usePageAccess('iacs');
  const scheduleProjectAccess  = usePageAccess('schedule_project');
  const workloadAccess         = usePageAccess('workload');
  const vacationsAccess        = usePageAccess('vacations');
  const metasAccess            = usePageAccess('metas');
  const documentsAccess        = usePageAccess('documents');
  const drawingsAccess         = usePageAccess('drawings');
  const pmsAccess              = usePageAccess('pms');
  const equipamentosAccess     = usePageAccess('equipamentos');
  const equipamentosAdminAccess = usePageAccess('equipamentos_admin');

  const showOrcamentoSection  = [forecastAccess, projectsAccess, polosAccess, reportAccess].some(a => a !== 'none');
  const showProcessosSection = [projectsTrackingAccess, iacsAccess, scheduleProjectAccess].some(a => a !== 'none');
  const showPessoasSection   = [workloadAccess, vacationsAccess, metasAccess].some(a => a !== 'none');
  const showDocumentosSection = [documentsAccess, drawingsAccess, pmsAccess].some(a => a !== 'none');
  const showAtivosSection    = [equipamentosAccess, equipamentosAdminAccess].some(a => a !== 'none');

  const userEmail = user?.email?.trim().toLowerCase() || '';
  const isNativeAdmin = isAdmin && (!user?._originalRole || user._originalRole === 'admin');
  const canManageSidebar = isGestor || isCoordenador || isPlanejador;
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadMap, setUnreadMap]     = useState({});
  const [collapsed, setCollapsed]     = useState({});
  const [feedbackUnread, setFeedbackUnread] = useState(0);

  // Poll unread message counts (single batch request)
  useEffect(() => {
    if (!projects?.length) return;
    const fetchUnread = async () => {
      try {
        const r = await api.get('/forecast/unread-counts');
        setUnreadMap(r.data);
      } catch {}
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 60000);
    return () => clearInterval(t);
  }, [projects]);

  // Poll feedback unread count (only for developer)
  useEffect(() => {
    if (userEmail !== 'julio.casagrande@ctgbr.com.br') return;
    const fetchFeedback = async () => {
      try {
        const r = await api.get('/feedback/stats');
        setFeedbackUnread(parseInt(r.data.unread) || 0);
      } catch {}
    };
    fetchFeedback();
    const t = setInterval(fetchFeedback, 60000);
    return () => clearInterval(t);
  }, [userEmail]);

  const roleLabel = {
    admin:       'Administrador',
    coordenador: 'Coordenador',
    engenheiro:  'Engenheiro',
    planejador:  'Planejador',
    gerente:     'Gerente',
    diretor:     'Diretor',
  }[user?._originalRole || user?.role] || '';
  const areaLabel = {
    eletrica:       'Eng. Elétrica',
    mecanica:       'Eng. Mecânica',
    confiabilidade: 'Eng. Confiabilidade',
    modernizacao:   'Modernização',
  }[user?.area] || null;

  const initials = user?.name?.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

  const navItem = (to, icon, label) => (
    <NavLink to={to} onClick={onClose}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      {icon}<span>{label}</span>
    </NavLink>
  );

  const togglePlant = (plant) =>
    setCollapsed(prev => ({ ...prev, [plant]: !prev[plant] }));

  const grouped = groupByPlant(projects || []);

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <nav className={`sidebar ${open ? 'open' : ''}`}>

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="brand">CTG<span>.</span>Engenharia</div>
          <div className="subtitle">{roleLabel}{areaLabel ? ` · ${areaLabel}` : ''}</div>
        </div>

        <div className="sidebar-nav">
            {navItem('/', IC.dashboard, 'Início')}

          {/* Gestor / Engenheiro / Planejador (also shown for override-admins who have a non-admin original role) */}
          {!isNativeAdmin && <>

            {showOrcamentoSection && <>
              {/* ── SEÇÃO: Gestão de Orçamento ── */}
              <div style={{ margin: '6px 8px 4px', borderTop: '1px solid rgba(255,255,255,0.10)' }} />
              <div className="nav-section-label" style={{color:"rgba(255,255,255,0.75)"}}>
                Gestão de Orçamento
              </div>
              {forecastAccess !== 'none' && navItem('/forecast', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M2 4a1 1 0 011-1h5a1 1 0 011 1v5H3V4zm9 0a1 1 0 011-1h5v3h-6V4zM2 11h7v5H3a1 1 0 01-1-1v-4zm9 0h6v4a1 1 0 01-1 1h-5v-5z"/></svg>, 'Forecast')}
              {projectsAccess !== 'none' && navItem('/projects', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>, 'Projetos')}
              {polosAccess !== 'none' && navItem('/polos', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z"/></svg>, 'Polos')}
              {reportAccess !== 'none' && navItem('/report', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>, 'Relatórios')}
            </>}

            {showProcessosSection && <>
              {/* ── SEÇÃO: Gestão de Processos ── */}
              <div style={{ margin: '6px 8px 4px', borderTop: '1px solid rgba(255,255,255,0.10)' }} />
              <div className="nav-section-label" style={{color:"rgba(255,255,255,0.75)"}}>
                Gestão de Processos
              </div>
              {projectsTrackingAccess !== 'none' && navItem('/lists/projects-tracking', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>, 'Acompanhamento Projetos')}
              {iacsAccess !== 'none' && navItem('/lists/iacs', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>, 'IACs 2026')}
              {scheduleProjectAccess !== 'none' && navItem('/lists/schedule-project', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v3H3V4zm0 5h14v7a1 1 0 01-1 1H4a1 1 0 01-1-1V9zm3 2a1 1 0 000 2h2a1 1 0 100-2H6zm5 0a1 1 0 100 2h3a1 1 0 100-2h-3z"/></svg>, 'Project CTG')}
            </>}

            {showPessoasSection && <>
              {/* ── SEÇÃO: Gestão de Pessoas ── */}
              <div style={{ margin: '6px 8px 4px', borderTop: '1px solid rgba(255,255,255,0.10)' }} />
              <div className="nav-section-label" style={{color:"rgba(255,255,255,0.75)"}}>
                Gestão de Pessoas
              </div>
              {workloadAccess !== 'none' && navItem('/workload', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M3 17a1 1 0 011-1h1v-5a1 1 0 112 0v5h2V9a1 1 0 112 0v8h2v-3a1 1 0 112 0v3h1a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg>, 'Controle de Carga')}
              {vacationsAccess !== 'none' && navItem('/vacations', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>, 'Férias')}
              {metasAccess !== 'none' && navItem('/metas', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H4zm0 2h12v6H4V7z"/></svg>, 'Metas')}
            </>}

            {showDocumentosSection && <>
              {/* ── SEÇÃO: Gestão de Documentos ── */}
              <div style={{ margin: '6px 8px 4px', borderTop: '1px solid rgba(255,255,255,0.10)' }} />
              <div className="nav-section-label" style={{color:"rgba(255,255,255,0.75)"}}>
                Gestão de Documentos
              </div>
              {documentsAccess !== 'none' && navItem('/documents', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>, 'Controle Documentos')}
              {drawingsAccess !== 'none' && navItem('/drawings', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M4 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H4zm1 2h10v10H5V5zm2 2v2h2V7H7zm4 0v2h2V7h-2zM7 11v2h2v-2H7zm4 0v2h6v-2h-6z" clipRule="evenodd"/></svg>, 'Controle Desenhos')}
              {pmsAccess !== 'none' && navItem('/pms', <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>, 'PMS')}
            </>}

            {showAtivosSection && <>
              {/* ── SEÇÃO: Gestão de Ativos ── */}
              <div style={{ margin: '6px 8px 4px', borderTop: '1px solid rgba(255,255,255,0.10)' }} />
              <div className="nav-section-label" style={{color:"rgba(255,255,255,0.75)"}}>
                Gestão de Ativos
              </div>
              {equipamentosAccess !== 'none' && navItem('/engineering/equipamentos',
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2V4a1 1 0 00-1-1H7a1 1 0 00-1 1v1H4zm7 5a1 1 0 10-2 0v3a1 1 0 102 0v-3z"/>
                </svg>,
                'Mapa de Equipamentos'
              )}
              {equipamentosAdminAccess !== 'none' && navItem('/engineering/equipamentos-admin',
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
                </svg>,
                'Tabela de Equipamentos'
              )}
            </>}

          </>}

          {/* Admin */}
          {isAdmin && <>
            <div style={{ margin: '6px 8px 4px', borderTop: '1px solid rgba(255,255,255,0.10)' }} />
            <div className="nav-section-label">Administração</div>
            {navItem('/admin', IC.users, 'Gerenciar Usuários')}
          </>}

          {/* Projects listed only on Projects page */}
        </div>

        {/* User footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 8px' }}>
          {/* Help & Feedback — above user info */}
          <div style={{ display: 'flex', gap: 4, padding: '0 8px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 6 }}>
            <NavLink to="/tutorial" onClick={onClose}
              className={({ isActive }) => `nav-item sidebar-footer-item ${isActive ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', padding: '6px 0', fontSize: '0.72rem' }}>
              <Icon name="question-circle" style={{ width: 14, textAlign: 'center' }} />
              <span>Tutorial</span>
            </NavLink>
            <NavLink to="/feedback" onClick={onClose}
              className={({ isActive }) => `nav-item sidebar-footer-item ${isActive ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', padding: '6px 0', fontSize: '0.72rem' }}>
              <Icon name="lightbulb" style={{ width: 14, textAlign: 'center' }} />
              <span>Sugestões</span>
            </NavLink>
          </div>

          {/* Feedback Inbox — only for developer */}
          {userEmail === 'julio.casagrande@ctgbr.com.br' && (
            <NavLink to="/feedback/inbox" onClick={onClose}
              className={({ isActive }) => `nav-item sidebar-footer-item ${isActive ? 'active' : ''}`}
              style={{ padding: '6px 8px', fontSize: '0.72rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="inbox" style={{ width: 14, textAlign: 'center' }} />
              <span style={{ flex: 1 }}>Inbox de Feedback</span>
              {feedbackUnread > 0 && (
                <span style={{
                  background: '#DC2626', color: '#fff', fontSize: '0.58rem', fontWeight: 700,
                  borderRadius: 10, minWidth: 16, height: 16, padding: '0 5px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{feedbackUnread}</span>
              )}
            </NavLink>
          )}

          {/* Avatar + name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(0,174,239,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, color: '#00AEEF', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </div>
            </div>
          </div>

          {/* Nav items — one per line */}
          {(isPlanejador || isGestor || userEmail === 'julio.casagrande@ctgbr.com.br') && (
            <NavLink to="/settings" onClick={onClose}
              className={({ isActive }) => `nav-item sidebar-footer-item ${isActive ? 'active' : ''}`}>
              <Icon name="gear" style={{ width: 16, textAlign: 'center' }} />
              <span>Configurações</span>
            </NavLink>
          )}
          <NavLink to="/profile" onClick={onClose}
            className={({ isActive }) => `nav-item sidebar-footer-item ${isActive ? 'active' : ''}`}>
            <Icon name="circle-user" style={{ width: 16, textAlign: 'center' }} />
            <span>Meu Perfil</span>
          </NavLink>
          <button className="nav-item sidebar-footer-item sidebar-logout"
            onClick={async () => { await logout(); navigate('/login'); }}>
            <Icon name="right-from-bracket" style={{ width: 16, textAlign: 'center' }} />
            <span>Sair</span>
          </button>
        </div>
      </nav>
    </>
  );
}


