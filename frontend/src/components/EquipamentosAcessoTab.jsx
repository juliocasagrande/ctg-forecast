import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';

const ROLE_LABEL = {
  admin:        'Admin',
  coordenador:  'Coordenador',
  engenheiro:   'Engenheiro',
  planejador:   'Planejador',
  gerente:      'Gerente',
};
const ROLE_COLOR = {
  admin:        { bg: '#FEE2E2', text: '#DC2626' },
  coordenador:  { bg: '#EDE9FE', text: '#6D28D9' },
  engenheiro:   { bg: '#EFF6FF', text: '#1D4ED8' },
  planejador:   { bg: '#D1FAE5', text: '#065F46' },
  gerente:      { bg: '#FEF3C7', text: '#92400E' },
};

const AREA_LABEL = {
  eletrica:       'Elétrica',
  mecanica:       'Mecânica',
  confiabilidade: 'Confiabilidade',
  modernizacao:   'Modernização',
  coordenacao:    'Coordenação',
};

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

/* ── UserPill ────────────────────────────────────────────────────────────── */
function UserPill({ user, onRemove }) {
  const rc = ROLE_COLOR[user.role] || { bg: '#F1F5F9', text: '#475569' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 5px', borderRadius: 20,
      background: rc.bg, color: rc.text,
      fontSize: '0.75rem', fontWeight: 600, lineHeight: 1,
      border: `1px solid ${rc.text}33`,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: rc.text + '22', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: '0.58rem', fontWeight: 800, flexShrink: 0,
      }}>
        {initials(user.name)}
      </span>
      {user.name.split(' ').slice(0, 2).join(' ')}
      <button
        onClick={() => onRemove(user.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: rc.text, opacity: 0.6, padding: 0, lineHeight: 1,
          display: 'inline-flex', alignItems: 'center',
          fontSize: '0.82rem', marginLeft: 1,
        }}
        title="Remover"
      >
        ×
      </button>
    </span>
  );
}

/* ── UserDropdown ────────────────────────────────────────────────────────── */
function UserDropdown({ users, selectedIds, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const available = useMemo(() => {
    const base = users.filter(u => !selectedIds.includes(u.id) && u.role !== 'admin');
    if (!q.trim()) return base;
    const lq = q.toLowerCase();
    return base.filter(u =>
      u.name.toLowerCase().includes(lq) ||
      u.email.toLowerCase().includes(lq) ||
      (AREA_LABEL[u.area] || '').toLowerCase().includes(lq)
    );
  }, [users, selectedIds, q]);

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      minWidth: 280, maxWidth: 360,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por nome ou área..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border-strong)',
            background: 'var(--bg-app)', fontSize: '0.8rem',
            color: 'var(--text-primary)', outline: 'none',
            fontFamily: 'var(--font-body)',
          }}
        />
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {available.length === 0 ? (
          <div style={{ padding: '16px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Nenhum usuário disponível
          </div>
        ) : (
          available.map(u => {
            const rc = ROLE_COLOR[u.role] || { bg: '#F1F5F9', text: '#475569' };
            return (
              <button
                key={u.id}
                onClick={() => { onAdd(u.id); setQ(''); }}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--budget-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: rc.bg, color: rc.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
                  border: `1px solid ${rc.text}33`,
                }}>
                  {initials(u.name)}
                </span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.name}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {ROLE_LABEL[u.role] || u.role}
                    {u.area ? ` · ${AREA_LABEL[u.area] || u.area}` : ''}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '5px', borderRadius: 6, border: 'none',
            background: 'var(--bg-app)', cursor: 'pointer',
            fontSize: '0.75rem', color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

/* ── TableCard ───────────────────────────────────────────────────────────── */
function TableCard({ tipoTabela, selectedIds, users, onChange, dirty, isPre, hasData, onDelete, deleting }) {
  const [dropOpen, setDropOpen] = useState(false);
  const selectedUsers = users.filter(u => selectedIds.includes(u.id));

  const addUser = (uid) => onChange([...selectedIds, uid]);
  const removeUser = (uid) => onChange(selectedIds.filter(id => id !== uid));

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1.5px solid ${dirty ? '#FCD34D' : 'var(--border)'}`,
      borderRadius: 10,
      padding: '14px 16px',
      boxShadow: dirty ? '0 0 0 3px #FEF3C733' : '0 1px 3px rgba(0,0,0,0.05)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          {isPre && !hasData && (
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#92400E',
              background: '#FEF3C7', border: '1px solid #FDE68A',
              padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginBottom: 4,
            }}>
              Pré-configurada
            </span>
          )}
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ctg-navy)' }}>
            {tipoTabela}
          </div>
        </div>
        {isPre && !hasData && (
          <button
            onClick={() => onDelete(tipoTabela)}
            disabled={deleting}
            title="Remover tabela pré-configurada"
            style={{
              background: 'none', border: 'none', cursor: deleting ? 'default' : 'pointer',
              color: '#DC2626', opacity: deleting ? 0.4 : 0.7, padding: '2px 4px',
              fontSize: '1rem', lineHeight: 1, flexShrink: 0,
            }}
            onMouseEnter={e => { if (!deleting) e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={e => { if (!deleting) e.currentTarget.style.opacity = '0.7'; }}
          >
            🗑
          </button>
        )}
      </div>

      {/* Restriction notice */}
      <div style={{
        fontSize: '0.7rem', color: selectedIds.length === 0 ? '#16A34A' : 'var(--text-muted)',
        background: selectedIds.length === 0 ? '#F0FDF4' : 'var(--bg-app)',
        border: `1px solid ${selectedIds.length === 0 ? '#BBF7D0' : 'var(--border)'}`,
        borderRadius: 6, padding: '5px 9px', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 5,
        transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: '0.8rem' }}>{selectedIds.length === 0 ? '🌐' : '🔒'}</span>
        {selectedIds.length === 0
          ? 'Visível para todos os usuários'
          : `Restrito a ${selectedIds.length} usuário${selectedIds.length > 1 ? 's' : ''} selecionado${selectedIds.length > 1 ? 's' : ''}`}
      </div>

      {/* Selected users pills */}
      {selectedUsers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {selectedUsers.map(u => (
            <UserPill key={u.id} user={u} onRemove={removeUser} />
          ))}
        </div>
      )}

      {/* Add user button */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setDropOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7,
            border: '1.5px dashed var(--border-strong)',
            background: 'transparent', cursor: 'pointer',
            fontSize: '0.75rem', color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ctg-blue)'; e.currentTarget.style.color = 'var(--ctg-blue)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          Adicionar pessoa
        </button>
        {dropOpen && (
          <UserDropdown
            users={users}
            selectedIds={selectedIds}
            onAdd={(uid) => { addUser(uid); }}
            onClose={() => setDropOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function EquipamentosAcessoTab() {
  const { toast } = useToast();
  const [users, setUsers]             = useState([]);
  const [tables, setTables]           = useState([]); // [{ tipo_tabela, is_pre_configured, has_data }]
  const [access, setAccess]           = useState({}); // key = tipo_tabela → [user_id]
  const [savedAccess, setSavedAccess] = useState({});
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [newTabela, setNewTabela]     = useState('');
  const [creating, setCreating]       = useState(false);
  const [deleting, setDeleting]       = useState(null); // tipo_tabela being deleted

  const loadData = () => {
    return Promise.all([
      api.get('/users/for-delegation'),
      api.get('/equipamentos/acesso'),
    ]).then(([uRes, aRes]) => {
      setUsers(uRes.data.filter(u => u.role !== 'admin'));
      setTables(aRes.data);
      const map = {};
      for (const row of aRes.data) map[row.tipo_tabela] = row.user_ids || [];
      setAccess(map);
      setSavedAccess(JSON.parse(JSON.stringify(map)));
    });
  };

  useEffect(() => {
    loadData().catch(() => toast('Erro ao carregar dados', 'error')).finally(() => setLoading(false));
  }, []);

  const setTableAccess = (tipoTabela, userIds) => {
    setAccess(prev => ({ ...prev, [tipoTabela]: userIds }));
  };

  const isDirty = (tipoTabela) => {
    const cur  = JSON.stringify((access[tipoTabela] || []).slice().sort());
    const orig = JSON.stringify((savedAccess[tipoTabela] || []).slice().sort());
    return cur !== orig;
  };

  const anyDirty = tables.some(({ tipo_tabela }) => isDirty(tipo_tabela));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = tables.map(({ tipo_tabela }) => ({
        tipo_tabela,
        user_ids: access[tipo_tabela] || [],
      }));
      await api.put('/equipamentos/acesso', payload);
      setSavedAccess(JSON.parse(JSON.stringify(access)));
      toast('Acessos salvos com sucesso!', 'success');
    } catch {
      toast('Erro ao salvar acessos', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => setAccess(JSON.parse(JSON.stringify(savedAccess)));

  const handleCreateTabela = async () => {
    if (!newTabela.trim()) return;
    setCreating(true);
    try {
      await api.post('/equipamentos/tabelas-pre', { tipo_tabela: newTabela.trim() });
      setNewTabela('');
      await loadData();
      toast('Tabela criada com sucesso!', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao criar tabela', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTabela = async (tipo_tabela) => {
    setDeleting(tipo_tabela);
    try {
      await api.delete('/equipamentos/tabelas-pre', { data: { tipo_tabela } });
      await loadData();
      toast('Tabela removida.', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao remover tabela', 'error');
    } finally {
      setDeleting(null);
    }
  };

  const tabelaOptions = useMemo(() => tables.map(t => t.tipo_tabela).sort(), [tables]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div className="spinner" />
    </div>
  );

  const inpStyle = {
    padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border-strong)',
    background: 'var(--bg-app)', fontSize: '0.82rem', color: 'var(--text-primary)',
    outline: 'none', fontFamily: 'var(--font-body)',
  };

  return (
    <div>
      {/* ── Nova Tabela ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)',
        padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ctg-navy)', margin: '0 0 6px' }}>
          Nova Tabela
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Crie tabelas antecipadamente para configurar acessos antes de importar os dados.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Nome da Tabela</div>
            <input
              list="tabela-pre-list"
              value={newTabela}
              onChange={e => setNewTabela(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTabela()}
              placeholder="Ex: Subestação, Proteção de Barras..."
              style={{ ...inpStyle, width: '100%', boxSizing: 'border-box' }}
            />
            <datalist id="tabela-pre-list">
              {tabelaOptions.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
          <button
            onClick={handleCreateTabela}
            disabled={creating || !newTabela.trim()}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              background: !newTabela.trim() ? 'var(--border-strong)' : 'linear-gradient(135deg,#001F5B,#0b5cab)',
              color: !newTabela.trim() ? 'var(--text-muted)' : '#fff',
              fontWeight: 700, fontSize: '0.82rem', cursor: !newTabela.trim() ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
            }}
          >
            {creating ? 'Criando...' : '+ Criar Tabela'}
          </button>
        </div>
      </div>

      {/* Header + filter + save */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--border)',
        padding: '16px 20px', marginBottom: 20,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ctg-navy)', margin: '0 0 4px' }}>
          Permissões de Edição por Tabela
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
          O Mapa de Equipamentos é visível para todos os usuários. Aqui você define quem pode
          <strong> criar, editar e excluir</strong> registros de cada tabela na Gestão de Equipamentos.
          Quando <strong>nenhum usuário</strong> for selecionado, qualquer gestor pode editar.
          Ao adicionar usuários, somente eles (e administradores/planejadores) poderão editar essa tabela.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {tables.length} {tables.length === 1 ? 'tabela' : 'tabelas'}
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {anyDirty && (
              <button onClick={handleDiscard} className="btn btn-secondary btn-sm">
                Descartar
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !anyDirty}
              className="btn btn-sm"
              style={{
                background: anyDirty
                  ? 'linear-gradient(135deg, #001F5B, #0b5cab)'
                  : 'var(--border-strong)',
                color: anyDirty ? '#fff' : 'var(--text-muted)',
                border: 'none', cursor: anyDirty ? 'pointer' : 'default',
                padding: '7px 18px', borderRadius: 8, fontWeight: 700,
                fontSize: '0.8rem', fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Salvando...' : '💾 Salvar alterações'}
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap',
        fontSize: '0.73rem', color: 'var(--text-muted)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 4, padding: '1px 6px', color: '#16A34A', fontWeight: 600 }}>🌐 Sem restrição</span>
          qualquer gestor pode editar
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 4, padding: '1px 6px', color: '#475569', fontWeight: 600 }}>🔒 Restrito</span>
          apenas usuários selecionados podem editar
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, padding: '1px 6px', color: '#92400E', fontWeight: 600 }}>● Modificado</span>
          aguardando salvamento
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 4, padding: '1px 6px', color: '#92400E', fontWeight: 600 }}>Pré-configurada</span>
          tabela sem dados — pode ser removida com 🗑
        </span>
      </div>

      {/* Grid of table cards */}
      {tables.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          color: 'var(--text-muted)', fontSize: '0.85rem',
          background: 'var(--bg-card)', borderRadius: 12, border: '1px dashed var(--border-strong)',
        }}>
          Nenhuma tabela cadastrada. Crie uma tabela pré-configurada acima ou importe dados.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {tables.map(({ tipo_tabela, is_pre_configured, has_data }) => (
            <TableCard
              key={tipo_tabela}
              tipoTabela={tipo_tabela}
              selectedIds={access[tipo_tabela] || []}
              users={users}
              onChange={(ids) => setTableAccess(tipo_tabela, ids)}
              dirty={isDirty(tipo_tabela)}
              isPre={is_pre_configured}
              hasData={has_data}
              onDelete={handleDeleteTabela}
              deleting={deleting === tipo_tabela}
            />
          ))}
        </div>
      )}

      {/* Sticky save bar */}
      {anyDirty && (
        <div style={{
          position: 'sticky', bottom: 16, zIndex: 50,
          background: 'var(--ctg-navy)',
          borderRadius: 12, padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(0,31,91,0.30)',
          marginTop: 20,
        }}>
          <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)' }}>
            Você tem alterações não salvas
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDiscard} style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)',
              background: 'transparent', color: 'rgba(255,255,255,0.75)', cursor: 'pointer',
              fontSize: '0.8rem', fontFamily: 'var(--font-body)',
            }}>
              Descartar
            </button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none',
              background: '#00AEEF', color: '#fff', fontWeight: 700,
              cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-body)',
            }}>
              {saving ? 'Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
