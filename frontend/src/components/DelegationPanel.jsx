import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_COLORS = {
  active:  { bg: '#DCFCE7', color: '#166534', label: 'Ativa' },
  future:  { bg: '#DBEAFE', color: '#1E40AF', label: 'Programada' },
  expired: { bg: '#F3F4F6', color: '#6B7280', label: 'Encerrada' },
};

function getStatus(d) {
  const today = new Date().toISOString().split('T')[0];
  if (!d.active) return 'expired';
  if (d.start_date > today) return 'future';
  if (d.end_date < today) return 'expired';
  return 'active';
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

export default function DelegationPanel() {
  const { user } = useAuth();
  const [delegations, setDelegations] = useState([]);
  const [allUsers, setAllUsers]     = useState([]);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm] = useState({ delegate_id: '', start_date: '', end_date: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const fetchAll = useCallback(async () => {
    // Busca separada para que uma falha não bloqueie a outra
    api.get('/users/for-delegation')
      .then(r => setAllUsers((r.data || []).filter(u => u.id !== user?.id)))
      .catch(() => {});
    api.get('/delegations')
      .then(r => setDelegations(r.data || []))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    setError('');
    if (!form.delegate_id || !form.start_date || !form.end_date) {
      setError('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      await api.post('/delegations', form);
      setShowForm(false);
      setForm({ delegate_id: '', start_date: '', end_date: '', reason: '' });
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar delegação');
    } finally { setSaving(false); }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Revogar esta delegação?')) return;
    try {
      await api.delete(`/delegations/${id}`);
      await fetchAll();
    } catch {}
  };

  const myDelegations = delegations.filter(d => d.delegator_id === user?.id);
  const delegatedToMe = delegations.filter(d => d.delegate_id === user?.id);

  return (
    <div>
      {/* Delegations I created */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--ctg-navy)', margin: 0 }}>
          Minhas Delegações
        </h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancelar' : '+ Nova Delegação'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
            Delegue seus projetos e privilégios para outro usuário durante um período (ex.: férias).
            O usuário indicado receberá <strong>todos os seus acessos e permissões</strong> enquanto
            a delegação estiver ativa — incluindo projetos designados, role e área. Um aviso
            aparecerá no sino de alertas da pessoa indicada.
          </p>
          {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Delegar para</label>
              <select className="form-input" value={form.delegate_id} onChange={e => setForm(f => ({ ...f, delegate_id: e.target.value }))}>
                <option value="">Selecione o usuário...</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role}) — {u.email}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data início</label>
              <input className="form-input" type="date" value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Data fim</label>
              <input className="form-input" type="date" value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Motivo (opcional)</label>
              <input className="form-input" placeholder="Ex.: Férias, licença médica..."
                value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar Delegação'}
            </button>
          </div>
        </div>
      )}

      {myDelegations.length === 0 && !showForm && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Nenhuma delegação criada. Use o botão acima para delegar seus projetos durante ausências.
        </p>
      )}

      {myDelegations.map(d => {
        const st = getStatus(d);
        const s = STATUS_COLORS[st];
        return (
          <div key={d.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            borderLeft: `4px solid ${s.color}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                → {d.delegate_name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {fmtDate(d.start_date)} a {fmtDate(d.end_date)}
                {d.reason && ` — ${d.reason}`}
              </div>
            </div>
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: s.bg, color: s.color,
            }}>{s.label}</span>
            {st !== 'expired' && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', color: '#DC2626' }}
                onClick={() => handleRevoke(d.id)}>
                Revogar
              </button>
            )}
          </div>
        );
      })}

      {/* Delegations TO me */}
      {delegatedToMe.length > 0 && (
        <>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--ctg-navy)', margin: '20px 0 12px' }}>
            Acessos Delegados a Mim
          </h3>
          {delegatedToMe.map(d => {
            const st = getStatus(d);
            const s = STATUS_COLORS[st];
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8,
                background: st === 'active' ? '#F0F9FF' : 'var(--bg-card)',
                border: `1px solid ${st === 'active' ? '#BAE6FD' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                borderLeft: `4px solid ${s.color}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    ← De {d.delegator_name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {fmtDate(d.start_date)} a {fmtDate(d.end_date)}
                    {d.reason && ` — ${d.reason}`}
                  </div>
                  {st === 'active' && (
                    <div style={{ fontSize: '0.7rem', color: '#0C4A6E', marginTop: 4, background: '#E0F2FE', borderRadius: 4, padding: '2px 7px', display: 'inline-block', fontWeight: 600 }}>
                      ✓ Delegação ativa — você tem os privilégios de {d.delegator_role}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: s.bg, color: s.color,
                }}>{s.label}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
