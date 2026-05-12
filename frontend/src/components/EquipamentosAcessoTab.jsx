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
function TableCard({ usina, tipoTabela, selectedIds, users, onChange, dirty }) {
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
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.09em', color: 'var(--ctg-blue)',
            background: '#EFF6FF', padding: '2px 7px', borderRadius: 5,
          }}>
            {usina}
          </span>
        </div>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ctg-navy)' }}>
          {tipoTabela}
        </div>
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
  const [combos, setCombos]           = useState([]); // [{ usina, tipo_tabela }]
  const [access, setAccess]           = useState({}); // key "usina|tipo_tabela" → [user_id]
  const [savedAccess, setSavedAccess] = useState({});
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [filterUsina, setFilterUsina] = useState('');

  const makeKey = (u, t) => `${u}|${t}`;

  useEffect(() => {
    Promise.all([
      api.get('/users/for-delegation'),
      api.get('/equipamentos'),
      api.get('/equipamentos/acesso'),
    ]).then(([uRes, eRes, aRes]) => {
      setUsers(uRes.data.filter(u => u.role !== 'admin'));

      // Derive unique (usina, tipo_tabela) combinations
      const seen = new Set();
      const c = [];
      for (const row of eRes.data) {
        const k = makeKey(row.usina, row.tipo_tabela);
        if (!seen.has(k)) { seen.add(k); c.push({ usina: row.usina, tipo_tabela: row.tipo_tabela }); }
      }
      c.sort((a, b) => a.usina.localeCompare(b.usina) || a.tipo_tabela.localeCompare(b.tipo_tabela));
      setCombos(c);

      // Build access map from API response { usina, tipo_tabela, user_ids }
      const map = {};
      for (const row of aRes.data) {
        map[makeKey(row.usina, row.tipo_tabela)] = (row.user_ids || []).map(Number);
      }
      setAccess(map);
      setSavedAccess(JSON.parse(JSON.stringify(map)));
    }).catch(() => {
      toast('Erro ao carregar dados', 'error');
    }).finally(() => setLoading(false));
  }, []);

  const setComboAccess = (usina, tipoTabela, userIds) => {
    setAccess(prev => ({ ...prev, [makeKey(usina, tipoTabela)]: userIds }));
  };

  const isDirty = (usina, tipoTabela) => {
    const key  = makeKey(usina, tipoTabela);
    const cur  = JSON.stringify((access[key] || []).slice().sort());
    const orig = JSON.stringify((savedAccess[key] || []).slice().sort());
    return cur !== orig;
  };

  const anyDirty = combos.some(({ usina, tipo_tabela }) => isDirty(usina, tipo_tabela));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = combos.map(({ usina, tipo_tabela }) => ({
        usina,
        tipo_tabela,
        user_ids: access[makeKey(usina, tipo_tabela)] || [],
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

  const handleDiscard = () => {
    setAccess(JSON.parse(JSON.stringify(savedAccess)));
  };

  const usinaOptions = useMemo(() => [...new Set(combos.map(c => c.usina))].sort(), [combos]);
  const filtered = useMemo(() =>
    filterUsina ? combos.filter(c => c.usina === filterUsina) : combos,
    [combos, filterUsina]
  );

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div className="spinner" />
    </div>
  );

  if (combos.length === 0) return (
    <div style={{
      textAlign: 'center', padding: 40, color: 'var(--text-muted)',
      background: 'var(--bg-app)', borderRadius: 12, border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum equipamento cadastrado</div>
      <div style={{ fontSize: '0.82rem' }}>
        Acesse <strong>Gestão de Equipamentos</strong> e importe os dados antes de configurar os acessos.
      </div>
    </div>
  );

  return (
    <div>
      {/* Header + actions */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--border)',
        padding: '16px 20px', marginBottom: 20,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ctg-navy)', margin: '0 0 4px' }}>
          Permissões de Edição de Equipamentos
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }}>
          O Mapa de Equipamentos é visível para todos os usuários. Aqui você define quem pode
          <strong> criar, editar e excluir</strong> registros de cada tabela na Gestão de Equipamentos.
          Quando <strong>nenhum usuário</strong> for selecionado, qualquer gestor pode editar.
          Ao adicionar usuários, somente eles (e administradores/planejadores) poderão editar essa tabela.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={filterUsina}
            onChange={e => setFilterUsina(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-strong)',
              background: 'var(--bg-app)', fontSize: '0.8rem', color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'var(--font-body)', minWidth: 150,
            }}
          >
            <option value="">Todas as usinas</option>
            {usinaOptions.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'tabela' : 'tabelas'}
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
      </div>

      {/* Grid of table cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12,
      }}>
        {filtered.map(({ usina, tipo_tabela }) => {
          const key = makeKey(usina, tipo_tabela);
          return (
            <TableCard
              key={key}
              usina={usina}
              tipoTabela={tipo_tabela}
              selectedIds={access[key] || []}
              users={users}
              onChange={(ids) => setComboAccess(usina, tipo_tabela, ids)}
              dirty={isDirty(usina, tipo_tabela)}
            />
          );
        })}
      </div>

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
