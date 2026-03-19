import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/AuthContext.jsx';
import { formatBRLShort } from '../utils/format.js';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';

const fmt = formatBRLShort;

export default function ProjectsList({ projects, onEditProject, onProjectsChange }) {
  const { canManage } = useRole();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleDelete = async (e, p) => {
    e.stopPropagation();
    if (!confirm(`Excluir "${p.name}"?\nTodos os dados serão removidos.`)) return;
    try {
      await api.delete(`/projects/${p.id}`);
      onProjectsChange?.();
      toast('Projeto excluído', 'success');
    } catch { toast('Erro ao excluir', 'error'); }
  };

  if (!projects || projects.length === 0) {
    return (
      <div className="empty-state">
        
        <h3>Nenhum projeto encontrado</h3>
        <p>{canManage ? 'Use "+ Novo Projeto" na barra lateral para começar.' : 'Nenhum projeto foi designado para você ainda.'}</p>
      </div>
    );
  }

  return (
    <div className="project-grid">
      {projects.map(p => (
        <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
          <div className="project-code">{p.code}</div>
          <div className="project-name">{p.name}</div>

          {/* Plant tags */}
          {p.plants?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {p.plants.map(pl => (
                <span key={pl} className="plant-tag">{pl}</span>
              ))}
            </div>
          )}

          {p.description && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {p.description}
            </p>
          )}

          <div className="project-meta">
            <span className="meta-pill budget">Bdg {fmt(p.total_budget)}</span>
            <span className="meta-pill forecast">Fcst {fmt(p.total_forecast)}</span>
            <span className="meta-pill actual">Real {fmt(p.total_actual)}</span>
            {p.engineer_count > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Eng. {p.engineer_count}</span>}
            {p.message_count  > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--ctg-blue)' }}>Msg. {p.message_count}</span>}
          </div>

          {canManage && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost btn-sm"
                onClick={e => { e.stopPropagation(); onEditProject(p); }}>
                ✎ Editar
              </button>
              <button className="btn btn-danger btn-sm" onClick={e => handleDelete(e, p)}>✕</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
