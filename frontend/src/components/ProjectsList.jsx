import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/AuthContext.jsx';
import { formatBRLShort } from '../utils/format.js';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';

const fmt = formatBRLShort;

const ORDERED_PLANTS = [
  'PCH Palmeiras','PCH Retiro','UHE Canoas 1','UHE Canoas 2',
  'UHE Capivara','UHE Chavantes','UHE Garibaldi','UHE Ilha Solteira',
  'UHE Jupiá','UHE Jurumirim','UHE Rosana','UHE Salto',
  'UHE Salto Grande','UHE Taquaruçu',
];

export default function ProjectsList({ projects, onEditProject, onProjectsChange }) {
  const { canManage, isAdmin } = useRole();
  const navigate      = useNavigate();
  const { toast, confirm } = useToast();

  const handleDelete = async (e, p) => {
    e.stopPropagation();
    if (!await confirm({
      title: 'Excluir projeto',
      message: `Excluir "${p.name}"?\nTodos os dados serao removidos.`,
      confirmLabel: 'Excluir',
    })) return;
    try {
      await api.delete(`/projects/${p.id}`);
      onProjectsChange?.();
      toast('Projeto excluído', 'success');
    } catch { toast('Erro ao excluir', 'error'); }
  };

  // Group projects by plant in canonical order
  const grouped = useMemo(() => {
    const result = [];
    const seen   = new Set();

    for (const plant of ORDERED_PLANTS) {
      const pjs = projects.filter(p => (p.plants || []).includes(plant));
      if (pjs.length > 0) result.push({ plant, projects: pjs });
      pjs.forEach(p => seen.add(p.id));
    }
    // Catch any unassigned projects
    const unassigned = projects.filter(p => !seen.has(p.id));
    if (unassigned.length > 0) result.push({ plant: null, projects: unassigned });
    return result;
  }, [projects]);

  if (!projects || projects.length === 0) {
    return (
      <div className="empty-state">
        <h3>Nenhum projeto encontrado</h3>
        <p>{canManage ? 'Use "+ Novo Projeto" na barra lateral para começar.' : 'Nenhum projeto foi designado para você ainda.'}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {grouped.map(({ plant, projects: pjs }, gi) => (
        <div key={plant || 'unassigned'}>

          {/* Plant separator — subtle label + line */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: gi === 0 ? '0 0 14px' : '24px 0 14px',
          }}>
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.09em', color: 'var(--ctg-blue)', opacity: 0.75,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {plant || 'Sem usina'}
            </span>
            <div style={{
              flex: 1, height: 1,
              background: 'linear-gradient(to right, var(--ctg-blue) 0%, transparent 100%)',
              opacity: 0.18,
            }} />
            <span style={{
              fontSize: '0.65rem', color: 'var(--text-muted)',
              flexShrink: 0, opacity: 0.7,
            }}>
              {pjs.length} projeto{pjs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Cards grid for this plant */}
          <div className="project-grid">
            {pjs.map(p => (
              <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="project-code">{p.code}</div>
                <div className="project-name">{p.name}</div>

                {p.plants?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                    {p.plants.map(pl => (
                      <span key={pl} className="plant-tag">{pl}</span>
                    ))}
                  </div>
                )}

                {p.description && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {p.description}
                  </p>
                )}

                <div className="project-meta">
                  <span className="meta-pill budget">Bdg {fmt(p.total_budget)}</span>
                  <span className="meta-pill forecast">Fcst {fmt(p.act_forecast ?? p.total_forecast)}</span>
                  <span className="meta-pill actual">Real {fmt(p.total_actual)}</span>
                  {p.engineer_names && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display:'flex', alignItems:'center', gap:4 }}>
                      <span style={{
                        display:'inline-flex', alignItems:'center', justifyContent:'center',
                        width:18, height:18, borderRadius:'50%', background:'#166534', color:'#fff',
                        fontSize:'0.5rem', fontWeight:700, flexShrink:0,
                      }}>{p.engineer_initials ? p.engineer_initials.split(', ')[0] : '?'}</span>
                      {p.engineer_names}
                    </span>
                  )}
                  {p.message_count  > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--ctg-blue)' }}>Msg. {p.message_count}</span>}
                </div>

                {canManage && (
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); onEditProject(p); }}>
                      ✎ Editar
                    </button>
                    {isAdmin && <button className="btn btn-danger btn-sm" onClick={e => handleDelete(e, p)}>✕</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
