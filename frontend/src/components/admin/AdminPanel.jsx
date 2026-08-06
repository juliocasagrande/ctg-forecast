import { useState, useEffect } from 'react';
import api from '../../utils/api.js';
import { useToast } from '../ui/Toast.jsx';
import Modal from '../ui/Modal.jsx';
import PasswordInput, { getPasswordStrength } from '../ui/PasswordInput.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PAGE_REGISTRY } from '../../config/pages.js';

const PAGE_ACCESS_OPTS = [
  { value: 'none',   icon: '—', label: '— Sem acesso',  title: 'Sem acesso' },
  { value: 'viewer', icon: '👁', label: '👁 Ver',        title: 'Somente visualização' },
  { value: 'editor', icon: '✏', label: '✏ Editar',      title: 'Visualizar e editar' },
];

// Agrupa as páginas (já ordenadas por seção em PAGE_REGISTRY) em blocos contíguos
// para exibir um cabeçalho de seção acima das colunas na grade de permissões.
const PAGE_SECTIONS = PAGE_REGISTRY.reduce((groups, p) => {
  const last = groups[groups.length - 1];
  if (last && last.section === p.section) last.count += 1;
  else groups.push({ section: p.section, count: 1 });
  return groups;
}, []);

// Uma cor pastel por seção (mesma ordem das seções do Sidebar), usada para tingir
// o cabeçalho de grupo e as colunas correspondentes na grade de permissões.
const SECTION_COLORS = {
  'Gestão de Orçamento':  { r: 14,  g: 165, b: 233 }, // sky
  'Gestão de Processos':  { r: 139, g: 92,  b: 246 }, // violet
  'Gestão de Pessoas':    { r: 16,  g: 185, b: 129 }, // emerald
  'Gestão de Documentos': { r: 245, g: 158, b: 11  }, // amber
  'Gestão de Ativos':     { r: 236, g: 72,  b: 153 }, // pink
};

function sectionRgba(section, alpha) {
  const c = SECTION_COLORS[section];
  return c ? `rgba(${c.r},${c.g},${c.b},${alpha})` : undefined;
}

function PageAccessCell({ current, onChange, disabled }) {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--border-strong)', opacity: disabled ? 0.5 : 1 }}>
      {PAGE_ACCESS_OPTS.map(opt => {
        const active = current === opt.value;
        const colors = {
          none:   { activeBg: '#E2E8F0', activeColor: '#475569' },
          viewer: { activeBg: '#DBEAFE', activeColor: '#1D4ED8' },
          editor: { activeBg: '#DCFCE7', activeColor: '#15803D' },
        }[opt.value];
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '5px 8px',
              border: 'none',
              borderRight: opt.value !== 'editor' ? '1px solid var(--border)' : 'none',
              cursor: disabled ? 'default' : 'pointer',
              background: active ? colors.activeBg : 'var(--bg-card)',
              color: active ? colors.activeColor : 'var(--text-muted)',
              fontWeight: active ? 700 : 400,
              fontSize: '0.8rem',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              transition: 'all 0.12s',
            }}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

// Cabeçalho colorido de card — usado na aba "Grupos de Permissão" para diferenciar
// visualmente os blocos (Grupo, Membros, Páginas, Botões) de relance.
function CardHeader({ color, children }) {
  return (
    <div style={{
      background: color, color: '#fff', padding: '9px 14px',
      borderRadius: 'var(--radius-md, 10px) var(--radius-md, 10px) 0 0',
      fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      {children}
    </div>
  );
}

const CARD_COLORS = {
  group:   'var(--ctg-navy)',
  members: 'var(--ctg-navy)',
  pages:   'var(--ctg-navy)',
  buttons: 'var(--ctg-navy)',
};

const ROLE_LABELS = {
  admin:       'Administrador',
  coordenador: 'Coordenador',
  engenheiro:  'Engenheiro',
  planejador:  'Planejador',
  gerente:     'Gerente',
  diretor:     'Diretor',
};
const ROLE_COLORS = {
  admin:       '#001F5B',
  coordenador: '#0070B8',
  engenheiro:  '#166534',
  planejador:  '#7C3AED',
  gerente:     '#B45309',
  diretor:     '#9D174D',
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
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupPages, setGroupPages] = useState([]);
  const [groupPagesLoading, setGroupPagesLoading] = useState(false);
  const [groupPagesSavingCell, setGroupPagesSavingCell] = useState(null);
  const [groupButtons, setGroupButtons] = useState([]);
  const [groupButtonsLoading, setGroupButtonsLoading] = useState(false);
  const [groupButtonsSavingCell, setGroupButtonsSavingCell] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set());
  const [savedMemberIds, setSavedMemberIds] = useState(new Set());
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [membersSaving, setMembersSaving] = useState(false);
  const { toast, confirm } = useToast();
  const { user: currentUser, refreshUser } = useAuth();

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

  useEffect(() => {
    if (activeTab === 'groups' && !groupsLoaded) loadGroups();
  }, [activeTab, groupsLoaded]);

  useEffect(() => {
    if (selectedGroupId != null) {
      loadGroupPages(selectedGroupId);
      loadGroupButtons(selectedGroupId);
      loadGroupMembers(selectedGroupId);
    }
  }, [selectedGroupId]);

  const handleApprove = async (u) => {
    try {
      await api.post(`/users/${u.id}/approve`);
      setPending(prev => prev.filter(p => p.id !== u.id));
      fetchUsers();
      toast(`${u.name} aprovado com sucesso`, 'success');
    } catch { toast('Erro ao aprovar', 'error'); }
  };

  const handleReject = async (u) => {
    if (!await confirm({
      title: 'Rejeitar solicitacao',
      message: `Rejeitar solicitacao de ${u.name}?`,
      confirmLabel: 'Rejeitar',
    })) return;
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

  const loadGroups = async () => {
    setGroupsLoading(true);
    try {
      const r = await api.get('/permission-groups');
      setGroups(r.data);
      setGroupsLoaded(true);
      if (selectedGroupId == null && r.data.length) setSelectedGroupId(r.data[0].id);
      return r.data;
    } catch {
      toast('Erro ao carregar grupos de permissão', 'error');
      return null;
    } finally { setGroupsLoading(false); }
  };

  const openNewGroup = () => { setEditingGroup(null); setGroupForm({ name: '', description: '' }); setGroupModalOpen(true); };
  const openEditGroup = (g) => { setEditingGroup(g); setGroupForm({ name: g.name, description: g.description || '' }); setGroupModalOpen(true); };

  const handleGroupSave = async () => {
    if (!groupForm.name.trim()) return toast('Nome do grupo é obrigatório', 'error');
    setGroupSaving(true);
    try {
      let groupId = editingGroup?.id;
      if (editingGroup) {
        await api.put(`/permission-groups/${editingGroup.id}`, groupForm);
        toast('Grupo atualizado', 'success');
      } else {
        const r = await api.post('/permission-groups', groupForm);
        groupId = r.data.id;
        toast('Grupo criado', 'success');
      }
      setGroupModalOpen(false);
      await loadGroups();
      if (!editingGroup) setSelectedGroupId(groupId);
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao salvar grupo', 'error');
    } finally { setGroupSaving(false); }
  };

  const handleGroupDelete = async (g) => {
    const defaultWarning = g.default_for_role
      ? ` Este é o grupo padrão de "${ROLE_LABELS[g.default_for_role] || g.default_for_role}" — usuários desse cargo criados ou aprovados depois da exclusão NÃO receberão nenhum grupo automaticamente (ficarão sem acesso até serem atribuídos manualmente).`
      : '';
    if (!await confirm({
      title: 'Excluir grupo',
      message: `Excluir "${g.name}"? Os ${g.member_count} usuário(s) desse grupo perdem esse acesso (a menos que estejam em outro grupo).${defaultWarning}`,
      confirmLabel: 'Excluir',
    })) return;
    const wasSelected = selectedGroupId === g.id;
    try {
      await api.delete(`/permission-groups/${g.id}`);
      if (wasSelected) setSelectedGroupId(null);
      toast('Grupo excluído', 'success');
      const freshGroups = await loadGroups();
      // loadGroups() checa selectedGroupId ainda com o valor obsoleto (closure desta
      // render), então reseleciona explicitamente aqui usando a lista recém-buscada.
      if (wasSelected && freshGroups) {
        setSelectedGroupId(freshGroups.length ? freshGroups[0].id : null);
      }
      fetchUsers();
    } catch { toast('Erro ao excluir grupo', 'error'); }
  };

  const loadGroupPages = async (groupId) => {
    setGroupPagesLoading(true);
    try {
      const r = await api.get(`/permission-groups/${groupId}/page-access`);
      setGroupPages(r.data);
    } catch {
      toast('Erro ao carregar páginas do grupo', 'error');
    } finally { setGroupPagesLoading(false); }
  };

  const handleGroupPageChange = async (groupId, pageKey, value) => {
    const cellId = `${pageKey}`;
    setGroupPagesSavingCell(cellId);
    try {
      await api.put(`/permission-groups/${groupId}/page-access`, { pages: [{ page_key: pageKey, access: value }] });
      await loadGroupPages(groupId);
      refreshUser(); // se o admin estiver nesse grupo, reflete na hora
    } catch {
      toast('Erro ao salvar permissão do grupo', 'error');
    } finally {
      setGroupPagesSavingCell(prev => prev === cellId ? null : prev);
    }
  };

  const loadGroupButtons = async (groupId) => {
    setGroupButtonsLoading(true);
    try {
      const r = await api.get(`/permission-groups/${groupId}/button-access`);
      setGroupButtons(r.data);
    } catch {
      toast('Erro ao carregar botões do grupo', 'error');
    } finally { setGroupButtonsLoading(false); }
  };

  const handleGroupButtonChange = async (groupId, pageKey, buttonKey, enabled) => {
    const cellId = `${pageKey}:${buttonKey}`;
    setGroupButtonsSavingCell(cellId);
    try {
      await api.put(`/permission-groups/${groupId}/button-access`, { buttons: [{ page_key: pageKey, button_key: buttonKey, enabled }] });
      await loadGroupButtons(groupId);
      refreshUser();
    } catch {
      toast('Erro ao salvar botão do grupo', 'error');
    } finally {
      setGroupButtonsSavingCell(prev => prev === cellId ? null : prev);
    }
  };

  const loadGroupMembers = async (groupId) => {
    setGroupMembersLoading(true);
    try {
      const r = await api.get(`/permission-groups/${groupId}/members`);
      const ids = new Set(r.data.map(u => u.id));
      setSelectedMemberIds(ids);
      setSavedMemberIds(ids);
    } catch {
      toast('Erro ao carregar membros do grupo', 'error');
    } finally { setGroupMembersLoading(false); }
  };

  const membersDirty = selectedMemberIds.size !== savedMemberIds.size
    || [...selectedMemberIds].some(id => !savedMemberIds.has(id));

  // Troca de grupo selecionado na barra lateral. Se houver alterações não salvas na
  // seleção de membros do grupo atual, confirma com o usuário antes de descartá-las.
  const handleSelectGroup = async (groupId) => {
    if (groupId === selectedGroupId) return;
    if (membersDirty) {
      if (!await confirm({
        title: 'Alterações não salvas',
        message: 'Você tem alterações não salvas na seleção de membros deste grupo. Trocar de grupo agora vai descartá-las. Deseja continuar?',
        confirmLabel: 'Descartar e trocar',
      })) return;
    }
    setSelectedGroupId(groupId);
  };

  const toggleMember = (userId) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleMembersSave = async (groupId) => {
    setMembersSaving(true);
    try {
      await api.put(`/permission-groups/${groupId}/members`, { user_ids: [...selectedMemberIds] });
      setSavedMemberIds(new Set(selectedMemberIds));
      toast('Membros do grupo atualizados', 'success');
      await loadGroups();
      await fetchUsers();
      if (currentUser && selectedMemberIds.has(currentUser.id)) refreshUser();
    } catch {
      toast('Erro ao salvar membros', 'error');
    } finally { setMembersSaving(false); }
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
        setUsers(prev => [...prev, { ...r.data, project_count: 0, permission_groups: [] }]);
        toast('Usuário criado com sucesso — grupo padrão do cargo atribuído automaticamente', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao salvar', 'error');
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (u) => {
    if (!await confirm({
      title: 'Desativar usuario',
      message: `Desativar ${u.name}?`,
      confirmLabel: 'Desativar',
    })) return;
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
    coordenadores: users.filter(u => u.role === 'coordenador').length,
    engenheiros:  users.filter(u => u.role === 'engenheiro').length,
    planejadores: users.filter(u => u.role === 'planejador').length,
    gerentes:     users.filter(u => u.role === 'gerente').length,
    diretores:    users.filter(u => u.role === 'diretor').length,
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  const formNeedsArea = NEEDS_AREA.includes(form.role);
  const memberCandidates = users.filter(u =>
    !memberSearch || u.name.toLowerCase().includes(memberSearch.toLowerCase()) || u.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div>
      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total de Usuários',  value: stats.total,        sub: `${users.filter(u => u.active).length} ativos` },
          { label: 'Coordenadores',      value: stats.coordenadores, color: '#0070B8' },
          { label: 'Planejadores',       value: stats.planejadores,  color: '#7C3AED' },
          { label: 'Engenheiros',        value: stats.engenheiros,   color: '#166534' },
          { label: 'Gerentes',           value: stats.gerentes,      color: '#B45309' },
          { label: 'Diretores',          value: stats.diretores,     color: '#9D174D' },
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
        <button className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>
          Grupos de Permissão
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
              <option value="gerente">Gerente</option>
              <option value="diretor">Diretor</option>
            </select>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openNew}>
              + Novo Usuário
            </button>
          </div>

          <div className="card">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {['Usuário', 'E-mail', 'Perfil / Área', 'Grupos', 'Projetos', 'Status', ''].map(h => (
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
                    <td style={{ padding: '10px 14px' }}>
                      {u.permission_groups?.length ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {u.permission_groups.map(g => (
                            <span key={g.id} style={{ fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: 'rgba(15,118,110,0.12)', color: '#0F766E' }}>
                              {g.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span title="Sem grupo — sem acesso a nenhuma página" style={{ fontSize: '0.65rem', fontWeight: 700, color: '#DC2626' }}>sem grupo</span>
                      )}
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

      {/* Groups tab */}
      {activeTab === 'groups' && (
        <div>
          {groupsLoading && !groups.length ? (
            <div className="loading-spinner"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
              {/* Lista de grupos */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <CardHeader color={CARD_COLORS.group}>Grupos</CardHeader>
                <div style={{ padding: 8 }}>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={openNewGroup}>
                    + Novo Grupo
                  </button>
                  {groups.map(g => (
                    <div key={g.id}
                      onClick={() => handleSelectGroup(g.id)}
                      style={{
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                        background: selectedGroupId === g.id ? 'var(--ctg-navy)' : 'transparent',
                        color: selectedGroupId === g.id ? '#fff' : 'var(--text-primary)',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                        <span style={{
                          fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                          background: selectedGroupId === g.id ? 'rgba(255,255,255,0.15)' : 'rgba(0,31,91,0.08)',
                        }}>{g.member_count}</span>
                      </div>
                      {g.default_for_role && (
                        <div style={{ fontSize: '0.65rem', opacity: 0.75, marginTop: 2 }}>padrão de {ROLE_LABELS[g.default_for_role] || g.default_for_role}</div>
                      )}
                    </div>
                  ))}
                  {!groups.length && <div className="empty-state" style={{ padding: 12 }}><p style={{ fontSize: '0.8rem' }}>Nenhum grupo criado ainda.</p></div>}
                </div>
              </div>

              {/* Painel do grupo selecionado */}
              {selectedGroupId == null ? (
                <div className="empty-state"><p>Selecione ou crie um grupo para configurar.</p></div>
              ) : (() => {
                const g = groups.find(x => x.id === selectedGroupId);
                if (!g) return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <CardHeader color={CARD_COLORS.group}>
                        <span>{g.name}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#fff' }} onClick={() => openEditGroup(g)}>✎ Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleGroupDelete(g)}>Excluir</button>
                        </div>
                      </CardHeader>
                      <div style={{ padding: 14 }}>
                        {g.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{g.description}</div>}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{g.member_count} usuário(s) neste grupo</div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <CardHeader color={CARD_COLORS.members}>
                        <span>Membros</span>
                        <button className={`btn btn-sm ${membersDirty ? 'btn-success' : 'btn-primary'}`} disabled={membersSaving || groupMembersLoading} onClick={() => handleMembersSave(selectedGroupId)}>
                          {membersSaving ? 'Salvando...' : membersDirty ? 'Salvar alterações' : 'Salvar membros'}
                        </button>
                      </CardHeader>
                      <div style={{ padding: 14 }}>
                        <input className="form-input" placeholder="Buscar usuário..." value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)} style={{ marginBottom: 10 }} />
                        {groupMembersLoading ? <div className="loading-spinner"><div className="spinner" /></div> : (
                          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {memberCandidates.map(u => (
                              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem' }}>
                                <input type="checkbox" checked={selectedMemberIds.has(u.id)} onChange={() => toggleMember(u.id)} />
                                <Avatar initials={u.avatar_initials} role={u.role} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                                <RoleBadge role={u.role} />
                              </label>
                            ))}
                            {!memberCandidates.length && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: 8 }}>Nenhum usuário encontrado.</div>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <CardHeader color={CARD_COLORS.pages}>Páginas</CardHeader>
                      <div style={{ padding: 14 }}>
                        {groupPagesLoading ? <div className="loading-spinner"><div className="spinner" /></div> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {PAGE_SECTIONS.map(sec => {
                              const pages = groupPages.filter(p => PAGE_REGISTRY.find(r => r.key === p.page_key)?.section === sec.section);
                              return (
                                <div key={sec.section}>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 4px' }}>{sec.section}</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {pages.map(p => (
                                      <div key={p.page_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px' }}>
                                        <span style={{ fontSize: '0.82rem' }}>{p.label}</span>
                                        <PageAccessCell
                                          current={p.access}
                                          onChange={val => handleGroupPageChange(selectedGroupId, p.page_key, val)}
                                          disabled={groupPagesSavingCell === p.page_key}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <CardHeader color={CARD_COLORS.buttons}>Botões</CardHeader>
                      <div style={{ padding: 14 }}>
                        {groupButtonsLoading ? <div className="loading-spinner"><div className="spinner" /></div> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {groupButtons.map(p => (
                              <div key={p.page_key}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                                  {PAGE_REGISTRY.find(r => r.key === p.page_key)?.label || p.page_key}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                  {p.buttons.map(b => {
                                    const cellId = `${p.page_key}:${b.button_key}`;
                                    const saving = groupButtonsSavingCell === cellId;
                                    return (
                                      <label key={b.button_key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', opacity: saving ? 0.5 : 1, cursor: saving ? 'wait' : 'pointer' }}>
                                        <button type="button" disabled={saving}
                                          onClick={() => handleGroupButtonChange(selectedGroupId, p.page_key, b.button_key, !b.enabled)}
                                          style={{
                                            width: 30, height: 20, borderRadius: 10, border: 'none', position: 'relative',
                                            cursor: saving ? 'wait' : 'pointer', background: b.enabled ? '#15803D' : '#E2E8F0',
                                          }}>
                                          <span style={{ position: 'absolute', top: 2, left: b.enabled ? 12 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.15s' }} />
                                        </button>
                                        {b.label}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        onSave={saving || (!editingUser && !getPasswordStrength(form.password).allPassed) ? undefined : handleSave}
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
            <option value="gerente">Gerente</option>
            <option value="diretor">Diretor</option>
          </select>
        </div>
        {formNeedsArea && (
          <div className="form-group">
            <label className="form-label">Área de atuação *</label>
            <select className="form-select" value={form.area}
              onChange={e => setForm(f => ({ ...f, area: e.target.value }))}>
              <option value="">Selecione a área</option>
              {AREA_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        )}
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>
          {editingUser
            ? 'Os grupos de permissão deste usuário são gerenciados na aba "Grupos de Permissão".'
            : 'O grupo de permissão padrão do cargo será atribuído automaticamente. Ajuste em "Grupos de Permissão" depois.'}
        </div>

      </Modal>

      {/* Create/Edit Group Modal */}
      <Modal open={groupModalOpen} onClose={() => setGroupModalOpen(false)}
        onSave={groupSaving ? undefined : handleGroupSave}
        title={editingGroup ? 'Editar Grupo' : 'Novo Grupo'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setGroupModalOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGroupSave} disabled={groupSaving}>
            {groupSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">Nome *</label>
          <input className="form-input" value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Engenheiro Elétrica Sênior" />
        </div>
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <input className="form-input" value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetModal} onClose={() => setResetModal(null)}
        onSave={!getPasswordStrength(newPassword).allPassed ? undefined : handleResetPassword}
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
