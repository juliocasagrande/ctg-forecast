import Icon from '../ui/Icon.jsx';
import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useRole } from '../../context/AuthContext.jsx';
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
  const { isAdmin, isGestor, isPlanejador } = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadMap, setUnreadMap]     = useState({});
  const [collapsed, setCollapsed]     = useState({});

  // Poll unread message counts
  useEffect(() => {
    if (!projects?.length) return;
    const fetch = async () => {
      const counts = {};
      await Promise.all(projects.map(async p => {
        try {
          const r = await api.get(`/projects/${p.id}/messages/unread-count`);
          counts[p.id] = r.data.unread;
        } catch {}
      }));
      setUnreadMap(counts);
    };
    fetch();
    const t = setInterval(fetch, 15000);
    return () => clearInterval(t);
  }, [projects]);

  const roleLabel = { admin:'Administrador', gestor:'Gestor', engenheiro:'Engenheiro', planejador:'Planejador' }[user?.role] || '';
  const initials  = user?.name?.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('') || '??';

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
          <div className="brand">CTG<span>.</span>Forecast</div>
          <div className="subtitle">v2.0 — {roleLabel}</div>
        </div>

        <div className="sidebar-nav">

          {/* Admin */}
          {isAdmin && <>
            <div className="nav-section-label">Administração</div>
            {navItem('/admin', IC.users, 'Gerenciar Usuários')}
            {navItem('/', IC.dashboard, 'Dashboard')}
          </>}

          {/* Gestor / Engenheiro */}
          {!isAdmin && <>
            <div className="nav-section-label" style={{color:"rgba(255,255,255,0.85)"}}>Visão Geral</div>
            {navItem('/', IC.dashboard, 'Dashboard')}
            {/* Projetos row with inline + button for gestor/planejador */}
            <div style={{ display:'flex', alignItems:'center', gap:2 }}>
              <NavLink to="/projects" onClick={onClose}
                className={({ isActive }) => `nav-item ${isActive && !location.pathname.includes('/projects/') ? 'active' : ''}`}
                style={{ flex:1 }}>
                {IC.projects}<span>Projetos</span>
              </NavLink>
              {(isGestor || isPlanejador) && (
                <button
                  title="Novo Projeto"
                  onClick={() => { onNewProject?.(); onClose(); }}
                  style={{
                    flexShrink:0, width:26, height:26,
                    background:'rgba(255,255,255,0.08)',
                    border:'1px solid rgba(255,255,255,0.12)',
                    borderRadius:'var(--radius-sm)',
                    color:'rgba(255,255,255,0.7)',
                    cursor:'pointer', fontSize:'1rem', lineHeight:1,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(0,174,239,0.25)'; e.currentTarget.style.color='#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='rgba(255,255,255,0.7)'; }}
                >+</button>
              )}
            </div>
            {navItem('/polos', IC.polos || IC.dashboard, 'Visão Geral')}
            {!isAdmin && navItem('/report', IC.report || IC.dashboard, 'Relatório HTML')}
          </>}

          {/* Projects grouped by plant */}
          {!isAdmin && grouped.length > 0 && (
            <>
              <div className="nav-section-label" style={{ marginTop:10, color:"rgba(255,255,255,0.85)" }}>Meus Projetos</div>

              {grouped.map(({ plant, projects: pjs }) => {
                const plantCollapsed = collapsed[plant] !== false; // default true
                const groupUnread = pjs.reduce((s, p) => s + (unreadMap[p.id] || 0), 0);

                return (
                  <div key={plant}>
                    {/* Plant group header */}
                    <button
                      onClick={() => togglePlant(plant)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        width: '100%',
                        padding: '6px 10px 5px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {/* Plant icon */}
                      <span style={{ color: 'rgba(0,174,239,0.7)', flexShrink: 0 }}>{IC.plant}</span>

                      {/* Plant name */}
                      <span style={{
                        flex: 1,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        color: 'rgba(255,255,255,0.55)',
                        textAlign: 'left',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {plant}
                      </span>

                      {/* Unread badge for group */}
                      {groupUnread > 0 && isCollapsed && (
                        <span style={{
                          background: '#00AEEF', color: '#fff',
                          fontSize: '0.58rem', fontWeight: 700,
                          borderRadius: 10, padding: '1px 5px', flexShrink: 0,
                        }}>
                          {groupUnread}
                        </span>
                      )}

                      {/* Collapse chevron */}
                      <span style={{
                        fontSize: '0.6rem',
                        color: 'rgba(255,255,255,0.3)',
                        flexShrink: 0,
                        transition: 'transform 0.2s',
                        transform: plantCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}>
                        ▾
                      </span>
                    </button>

                    {/* Project items */}
                    {!plantCollapsed && pjs.map(p => {
                      const unread = unreadMap[p.id] || 0;
                      return (
                        <button
                          key={p.id}
                          className="nav-item"
                          style={{ paddingLeft: 22, paddingTop: 5, paddingBottom: 5 }}
                          onClick={() => { navigate(`/projects/${p.id}`); onClose(); }}
                        >
                          {/* Indent line */}
                          <span style={{
                            width: 1, height: 16, background: 'rgba(255,255,255,0.12)',
                            flexShrink: 0, borderRadius: 1,
                          }} />

                          {/* Project name — truncated */}
                          <span style={{
                            fontSize: '0.78rem',
                            lineHeight: 1.35,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            textAlign: 'left',
                          }}>
                            {p.name}
                          </span>

                          {/* Unread badge */}
                          {unread > 0 && (
                            <span style={{
                              background: '#00AEEF', color: '#fff',
                              fontSize: '0.58rem', fontWeight: 700,
                              borderRadius: 10, padding: '1px 5px', flexShrink: 0,
                            }}>
                              {unread}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* User footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 8px' }}>
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
          {isPlanejador && (
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
            onClick={() => { logout(); navigate('/login'); }}>
            <Icon name="right-from-bracket" style={{ width: 16, textAlign: 'center' }} />
            <span>Sair</span>
          </button>
        </div>
      </nav>
    </>
  );
}
