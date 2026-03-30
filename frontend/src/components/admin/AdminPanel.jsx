import { useState, useEffect } from 'react';
import api from '../../utils/api.js';
import { useToast } from '../ui/Toast.jsx';
import Modal from '../ui/Modal.jsx';
import PasswordInput, { getPasswordStrength } from '../ui/PasswordInput.jsx';

const ROLE_LABELS = {
  admin:       'Administrador',
  gestor:      'Gestor (legado)',
  coordenador: 'Coordenador',
  engenheiro:  'Engenheiro',
  planejador:  'Planejador',
  gerente:     'Gerente / Diretor',
};
const ROLE_COLORS = {
  admin:       '#001F5B',
  gestor:      '#0070B8',
  coordenador: '#0070B8',
  engenheiro:  '#166534',
  planejador:  '#7C3AED',
  gerente:     '#B45309',
};

const AREA_LABELS = {
  eletrica:       'Eng. Elétrica',
  mecanica:       'Eng. Mecânica',
  confiabilidade: 'Eng. Confiabilidade',
  modernizacao:   'Modernização',
  coordenacao:    'Coordenação',
};

function RoleBadge({ role }) {
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: (ROLE_COLORS[role] || '#888') + '18', color: ROLE_COLORS[role] || '#888' }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function AreaBadge({ area }) {
  if (!area) return null;
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: 'rgba(0,31,91,0.07)', color: 'var(--ctg-navy)', marginLeft: 5 }}>
      {AREA_LABELS[area] || area}
    </span>
  );
}

function Avatar({ initials, role }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: ROLE_COLORS[role] || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

const NEEDS_AREA = ['engenheiro', 'coordenador'];
const AREA_OPTIONS = [
  { value: 'eletrica',       label: 'Eng. Elétrica' },
  { value: 'mecanica',       label: 'Eng. Mecânica' },
  { value: 'confiabilidade', label: 'Eng. Confiabilidade' },
  { value: 'modernizacao',   label: 'Modernização' },
];

const EMPTY_USER = { name: '', email: '', password: '', role: 'engenheiro', area: '' };

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      const [usersRes, pendingRes] = await Promise.all([
        api.get('/users'),
        api.get('/users/pending'),
      ]);
      setUsers(usersRes.data);
      setPending(pendingRes.data);
    } catch { toast('Erro ao carregar usuários', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleApprove = async (u) => {
    try {
      await api.post(`/users/${u.id}/approve`);
      setPending(prev => prev.filter(p => p.id !== u.id));
      fetchUsers();
      toast(`${u.name} aprovado com sucesso`, 'success');
    } catch { toast('Erro ao aprovar', 'error'); }
  };

  const handleReject = async (u) => {
    if (!confirm(`Rejeitar solicitação de ${u.name}?`)) return;
    try {
      await api.post(`/users/${u.id}/reject`);
      setPending(prev => prev.filter(p => p.id !== u.id));
      toast('Solicitação rejeitada', 'success');
    } catch { toast('Erro ao rejeitar', 'error'); }
  };

  const openNew = () => { setEditingUser(null); setForm(EMPTY_USER); setModalOpen(true); };
  const openEdit = (u) => {
    setEditingUser(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, area: u.area || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return toast('Preencha nome e email', 'error');
    if (!editingUser && !form.password) return toast('Senha obrigatória para novo usuário', 'error');
    if (NEEDS_AREA.includes(form.role) && !form.area) return toast('Selecione a área de atuação', 'error');
    setSaving(true);
    try {
      const payload = { ...form, area: NEEDS_AREA.includes(form.role) ? form.area : null };
      if (editingUser) {
        const r = await api.put(`/users/${editingUser.id}`, payload);
        setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...r.data } : u));
        toast('Usuário atualizado', 'success');
      } else {
        const r = await api.post('/users', payload);
        setUsers(prev => [...prev, { ...r.data, project_count: 0 }]);
        toast('Usuário criado com sucesso', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao salvar', 'error');
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (u) => {
    if (!confirm(`Desativar ${u.name}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: false } : x));
      toast('Usuário desativado', 'success');
    } catch { toast('Erro ao desativar', 'error'); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) return toast('Mínimo 8 caracteres', 'error');
    try {
      await api.post(`/users/${resetModal.id}/reset-password`, { new_password: newPassword });
      toast('Senha redefinida', 'success');
      setResetModal(null); setNewPassword('');
    } catch { toast('Erro ao redefinir senha', 'error'); }
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = !filterRole || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const stats = {
    total:        users.length,
    coordenadores: users.filter(u => u.role === 'coordenador' || u.role === 'gestor').length,
    engenheiros:  users.filter(u => u.role === 'engenheiro').length,
    planejadores: users.filter(u => u.role === 'planejador').length,
    gerentes:     users.filter(u => u.role === 'gerente').length,
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  const formNeedsArea = NEEDS_AREA.includes(form.role);

  return (
    <div>
      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total de Usuários',  value: stats.total,        sub: `${users.filter(u => u.active).length} ativos` },
          { label: 'Coordenadores',      value: stats.coordenadores, color: '#0070B8' },
          { label: 'Planejadores',       value: stats.planejadores,  color: '#7C3AED' },
          { label: 'Engenheiros',        value: stats.engenheiros,   color: '#166534' },
          { label: 'Gerentes/Diretores', value: stats.gerentes,      color: '#B45309' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--accent': s.color }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            {s.sub && <div className="stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          Usuários Ativos
        </button>
        <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          Aprovações Pendentes
          {pending.length > 0 && (
            <span style={{ marginLeft: 7, background: '#DC2626', color: '#fff', fontSize: '0.62rem', fontWeight: 700, borderRadius: 10, padding: '1px 6px' }}>
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {/* Pending tab */}
      {activeTab === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <div className="empty-state">
              <div className="icon" style={{fontSize:'1.5rem', color:'var(--forecast-text)'}}>OK</div>
              <h3>Nenhuma solicitação pendente</h3>
              <p>Todas as solicitações de acesso foram processadas.</p>
            </div>
          ) : pending.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 10 }}>
              <Avatar initials={u.avatar_initials} role={u.role} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <RoleBadge role={u.role} />
                  {u.area && <AreaBadge area={u.area} />}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => handleApprove(u)}>✓ Aprovar</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleReject(u)}>✕ Rejeitar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="form-input" placeholder="Buscar por nome ou email..." value={search}
              onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280, marginBottom: 0 }} />
            <select className="form-select" value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ maxWidth: 200, marginBottom: 0 }}>
              <option value="">Todos os perfis</option>
              <option value="admin">Administrador</option>
              <option value="coordenador">Coordenador</option>
              <option value="planejador">Planejador</option>
              <option value="engenheiro">Engenheiro</option>
              <option value="gerente">Gerente / Diretor</option>
            </select>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openNew}>
              + Novo Usuário
            </button>
          </div>

          <div className="card">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {['Usuário', 'E-mail', 'Perfil / Área', 'Projetos', 'Status', ''].map(h => (
                    <th key={h} style={{ background: 'var(--ctg-navy)', color: '#fff', padding: '9px 14px', textAlign: h === '' ? 'center' : 'left', fontWeight: 600, fontSize: '0.75rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id} style={{ background: i % 2 ? 'var(--bg-app)' : 'var(--bg-card)', opacity: u.active ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar initials={u.avatar_initials} role={u.role} />
                        <span style={{ fontWeight: 600 }}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <RoleBadge role={u.role} />
                      {u.area && <AreaBadge area={u.area} />}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-secondary)' }}>{u.project_count}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: u.active ? '#F0FDF4' : '#FEE2E2', color: u.active ? '#166534' : '#DC2626' }}>
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✎</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setResetModal(u); setNewPassword(''); }}>Senha</button>
                        {u.active && <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(u)}>✕</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editingUser ? 'Editar Usuário' : 'Novo Usuário'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}
            disabled={saving || (!editingUser && !getPasswordStrength(form.password).allPassed)}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">Nome completo *</label>
          <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome Sobrenome" />
        </div>
        <div className="form-group">
          <label className="form-label">E-mail *</label>
          <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@ctgbrasil.com" />
        </div>
        {!editingUser && (
          <PasswordInput
            label="Senha *"
            value={form.password}
            onChange={v => setForm(f => ({ ...f, password: v }))}
            placeholder="Crie uma senha segura"
          />
        )}
        <div className="form-group">
          <label className="form-label">Perfil</label>
          <select className="form-select" value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value, area: '' }))}>
            <option value="admin">Administrador</option>
            <option value="coordenador">Coordenador</option>
            <option value="planejador">Planejador</option>
            <option value="engenheiro">Engenheiro</option>
            <option value="gerente">Gerente / Diretor</option>
          </select>
        </div>
        {formNeedsArea && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Área de atuação *</label>
            <select className="form-select" value={form.area}
              onChange={e => setForm(f => ({ ...f, area: e.target.value }))}>
              <option value="">Selecione a área</option>
              {AREA_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetModal} onClose={() => setResetModal(null)}
        title={`Redefinir Senha — ${resetModal?.name}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setResetModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleResetPassword}
            disabled={!getPasswordStrength(newPassword).allPassed}>Redefinir</button>
        </>}>
        <PasswordInput
          label="Nova Senha"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="Crie uma senha segura"
          autoFocus
        />
      </Modal>
    </div>
  );
}
