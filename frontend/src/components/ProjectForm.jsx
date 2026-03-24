import { useState, useEffect } from 'react';
import Modal from './ui/Modal.jsx';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';
import { useRole } from '../context/AuthContext.jsx';

const PLANTS = [
  'PCH Palmeiras',
  'PCH Retiro',
  'UHE Canoas 1',
  'UHE Canoas 2',
  'UHE Capivara',
  'UHE Chavantes',
  'UHE Garibaldi',
  'UHE Ilha Solteira',
  'UHE Jupiá',
  'UHE Jurumirim',
  'UHE Rosana',
  'UHE Salto',
  'UHE Salto Grande',
  'UHE Taquaruçu',
];

const EMPTY = { code: '', name: '', description: '', si_value: '', pool_value: '', plants: [], engineer_ids: [] };

export default function ProjectForm({ open, onClose, project, onSaved, onDeleted }) {
  const [form, setForm] = useState(EMPTY);
  const [engineers, setEngineers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const { toast } = useToast();
  const { canManage } = useRole();

  useEffect(() => {
    if (!open) return;
    api.get('/users/engineers').then(r => setEngineers(r.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (project) {
      setForm({
        code: project.code || '',
        name: project.name || '',
        description: project.description || '',
        si_value: project.si_value || '',
        pool_value: project.pool_value || '',
        plants: project.plants || [],
        engineer_ids: (project.engineers || []).map(e => e.id),
      });
    } else {
      setForm(EMPTY);
    }
    setDeleteConfirm('');
    setShowDangerZone(false);
  }, [project, open]);

  const set = f => e => setForm(prev => ({ ...prev, [f]: e.target.value }));

  const togglePlant = (plant) => {
    setForm(prev => ({
      ...prev,
      plants: prev.plants.includes(plant)
        ? prev.plants.filter(p => p !== plant)
        : [...prev.plants, plant],
    }));
  };

  const toggleEngineer = (id) => {
    setForm(prev => ({
      ...prev,
      engineer_ids: prev.engineer_ids.includes(id)
        ? prev.engineer_ids.filter(e => e !== id)
        : [...prev.engineer_ids, id],
    }));
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast('Código e nome obrigatórios', 'error');
    setSaving(true);
    try {
      const payload = {
        ...form,
        si_value: parseFloat(form.si_value) || 0,
        pool_value: parseFloat(form.pool_value) || 0,
      };
      let saved;
      if (project?.id) {
        saved = (await api.put(`/projects/${project.id}`, payload)).data;
        toast('Projeto atualizado', 'success');
      } else {
        saved = (await api.post('/projects', payload)).data;
        toast('Projeto criado', 'success');
      }
      onSaved?.(saved);
      onClose();
    } catch (err) { toast(err.response?.data?.error || 'Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (deleteConfirm.trim() !== project.name.trim()) {
      toast('Nome do projeto não confere', 'error');
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/projects/${project.id}`, { data: { confirmName: deleteConfirm.trim() } });
      toast(`Projeto "${project.name}" excluído permanentemente`, 'success');
      onDeleted?.();
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao excluir projeto', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const sectionHeader = (label) => (
    <div style={{
      background: 'var(--ctg-navy)',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '0.7rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: 12,
      marginTop: 4,
    }}>
      {label}
    </div>
  );

  const isEditing = !!project?.id;
  const nameMatches = isEditing && deleteConfirm.trim() === (project.name || '').trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Editar Projeto' : 'Novo Projeto'}
      maxWidth={620}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Projeto'}
          </button>
        </>
      }
    >
      {/* Identificação */}
      {sectionHeader('Identificação')}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Código *</label>
          <input className="form-input" placeholder="ex: 10053" value={form.code} onChange={set('code')} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nome do Projeto *</label>
          <input className="form-input" placeholder="ex: Substituição SCADA — UHE JUR" value={form.name} onChange={set('name')} />
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">Descrição</label>
        <textarea className="form-textarea" style={{ minHeight: 56 }} placeholder="Observações gerais..." value={form.description} onChange={set('description')} />
      </div>

      {/* Financeiro */}
      {sectionHeader('Valores')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Valor SI (R$)</label>
          <input className="form-input input-currency" type="number" step="0.01" min="0" placeholder="0.00" value={form.si_value} onChange={set('si_value')} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">POOL (R$)</label>
          <input className="form-input input-currency" type="number" step="0.01" min="0" placeholder="0.00" value={form.pool_value} onChange={set('pool_value')} />
        </div>
      </div>

      {/* Usinas */}
      {sectionHeader('Usinas Atendidas')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 4 }}>
        {PLANTS.map(plant => (
          <label key={plant} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
            border: `1.5px solid ${form.plants.includes(plant) ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-sm)',
            background: form.plants.includes(plant) ? 'var(--budget-bg)' : 'var(--bg-card)',
            cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none',
            fontSize: '0.8rem', fontWeight: form.plants.includes(plant) ? 600 : 400,
            color: form.plants.includes(plant) ? 'var(--budget-text)' : 'var(--text-primary)',
          }}>
            <input
              type="checkbox"
              checked={form.plants.includes(plant)}
              onChange={() => togglePlant(plant)}
              style={{ accentColor: 'var(--ctg-blue)', width: 14, height: 14, flexShrink: 0 }}
            />
            {plant}
          </label>
        ))}
      </div>

      {/* Engenheiros */}
      {engineers.length > 0 && (
        <>
          {sectionHeader('Engenheiros Responsáveis')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
            {engineers.map(eng => (
              <label key={eng.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                border: `1.5px solid ${form.engineer_ids.includes(eng.id) ? 'var(--forecast-text)' : 'var(--border-strong)'}`,
                borderRadius: 'var(--radius-sm)',
                background: form.engineer_ids.includes(eng.id) ? 'var(--forecast-bg)' : 'var(--bg-card)',
                cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={form.engineer_ids.includes(eng.id)}
                  onChange={() => toggleEngineer(eng.id)}
                  style={{ accentColor: '#166534', width: 14, height: 14, flexShrink: 0 }}
                />
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: '#166534',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {eng.avatar_initials}
                </div>
                <div>
                  <div style={{ fontSize: '0.83rem', fontWeight: form.engineer_ids.includes(eng.id) ? 600 : 400, color: form.engineer_ids.includes(eng.id) ? 'var(--forecast-text)' : 'var(--text-primary)' }}>
                    {eng.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{eng.email}</div>
                </div>
              </label>
            ))}
          </div>
        </>
      )}

      {/* ── Zona de Perigo — excluir projeto ── */}
      {isEditing && canManage && (
        <div style={{ marginTop: 20 }}>
          {!showDangerZone ? (
            <button
              onClick={() => setShowDangerZone(true)}
              style={{
                background: 'none', border: '1.5px dashed var(--border-strong)',
                borderRadius: 'var(--radius-sm)', padding: '10px 16px',
                cursor: 'pointer', width: '100%', textAlign: 'left',
                color: 'var(--text-muted)', fontSize: '0.78rem',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.color = '#DC2626'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              ⚠️ Excluir este projeto...
            </button>
          ) : (
            <div style={{
              border: '1.5px solid #DC2626',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}>
              <div style={{
                background: '#DC2626',
                color: '#fff',
                padding: '8px 14px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>⚠️ Zona de Perigo</span>
                <button
                  onClick={() => { setShowDangerZone(false); setDeleteConfirm(''); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                >✕</button>
              </div>

              <div style={{ padding: '14px 16px', background: '#FEF2F2' }}>
                <p style={{ fontSize: '0.8rem', color: '#991B1B', margin: '0 0 6px', fontWeight: 600 }}>
                  Esta ação é irreversível.
                </p>
                <p style={{ fontSize: '0.76rem', color: '#7F1D1D', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Todos os dados serão permanentemente excluídos: entradas de forecast, mensagens, notas, atividades e atribuições de engenheiros.
                </p>

                <label style={{ fontSize: '0.75rem', color: '#991B1B', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Para confirmar, digite o nome do projeto:
                  <span style={{
                    display: 'inline-block', marginLeft: 6, padding: '1px 8px',
                    background: '#FECACA', borderRadius: 4, fontWeight: 700,
                    fontSize: '0.78rem', fontFamily: 'monospace', userSelect: 'all',
                  }}>
                    {project.name}
                  </span>
                </label>

                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={project.name}
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: '100%', padding: '8px 12px',
                    border: `1.5px solid ${nameMatches ? '#DC2626' : '#FECACA'}`,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.83rem', fontFamily: 'monospace',
                    background: '#fff', color: '#1F2937',
                    outline: 'none', transition: 'border-color 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#DC2626'; }}
                  onBlur={e => { if (!nameMatches) e.target.style.borderColor = '#FECACA'; }}
                />

                <button
                  onClick={handleDelete}
                  disabled={!nameMatches || deleting}
                  style={{
                    marginTop: 12, width: '100%', padding: '10px',
                    background: nameMatches ? '#DC2626' : '#E5E7EB',
                    color: nameMatches ? '#fff' : '#9CA3AF',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem', fontWeight: 700,
                    cursor: nameMatches ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'Excluindo...' : `Excluir projeto "${project.code}" permanentemente`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}