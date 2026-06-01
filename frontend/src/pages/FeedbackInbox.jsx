import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';

const STATUS_MAP = {
  new:         { label: 'Novo',        color: '#0EA5E9', bg: '#F0F9FF' },
  read:        { label: 'Lido',        color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Em andamento',color: '#F59E0B', bg: '#FFFBEB' },
  resolved:    { label: 'Resolvido',   color: '#16A34A', bg: '#F0FDF4' },
  archived:    { label: 'Arquivado',   color: '#9CA3AF', bg: '#F9FAFB' },
};

const TYPE_MAP = {
  suggestion: { label: 'Sugestão', icon: '💡' },
  bug:        { label: 'Bug',      icon: '🐛' },
  question:   { label: 'Dúvida',   icon: '❓' },
  other:      { label: 'Outro',    icon: '📝' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

export default function FeedbackInbox() {
  const { confirm } = useToast();
  const [items, setItems]       = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState('all'); // all, new, read, in_progress, resolved, archived
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState({ total: 0, unread: 0 });

  const fetchAll = useCallback(async () => {
    try {
      const [feedRes, statsRes] = await Promise.all([
        api.get('/feedback'),
        api.get('/feedback/stats'),
      ]);
      setItems(feedRes.data);
      setStats(statsRes.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const updateStatus = async (id, status) => {
    try {
      const r = await api.put(`/feedback/${id}/status`, { status });
      setItems(prev => prev.map(i => i.id === id ? r.data : i));
      if (selected?.id === id) setSelected(r.data);
      // Update stats
      const sRes = await api.get('/feedback/stats');
      setStats(sRes.data);
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!await confirm({
      title: 'Excluir feedback',
      message: 'Excluir este feedback permanentemente?',
      confirmLabel: 'Excluir',
    })) return;
    try {
      await api.delete(`/feedback/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      if (selected?.id === id) setSelected(null);
      const sRes = await api.get('/feedback/stats');
      setStats(sRes.data);
    } catch { /* ignore */ }
  };

  const handleSelect = (item) => {
    setSelected(item);
    if (item.status === 'new') updateStatus(item.id, 'read');
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  if (loading) return <div className="loading-spinner"><div className="spinner"/></div>;

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)', background: 'var(--bg-app)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* ── Sidebar: message list ── */}
      <div style={{ width: 360, minWidth: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--ctg-navy)', margin: 0 }}>
              Caixa de Feedback
            </h2>
            {parseInt(stats.unread) > 0 && (
              <span style={{
                background: 'var(--ctg-blue)', color: '#fff', borderRadius: 20,
                padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700
              }}>
                {stats.unread} novo{parseInt(stats.unread) !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'new', label: 'Novos' },
              { id: 'read', label: 'Lidos' },
              { id: 'in_progress', label: 'Em andamento' },
              { id: 'resolved', label: 'Resolvidos' },
              { id: 'archived', label: 'Arquivados' },
            ].map(f => (
              <button key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '3px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                  background: filter === f.id ? 'var(--ctg-blue)' : 'transparent',
                  color: filter === f.id ? '#fff' : 'var(--text-secondary)',
                  fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Nenhum feedback {filter !== 'all' ? 'neste filtro' : 'recebido'}
            </div>
          )}
          {filtered.map(item => {
            const isSelected = selected?.id === item.id;
            const isNew = item.status === 'new';
            const type = TYPE_MAP[item.type] || TYPE_MAP.other;
            return (
              <div key={item.id}
                onClick={() => handleSelect(item)}
                style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: isSelected ? 'var(--ctg-light)' : isNew ? '#FAFBFF' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--ctg-blue)' : '3px solid transparent',
                  transition: 'all 0.1s',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                  <span style={{
                    fontSize: '0.8rem', fontWeight: isNew ? 700 : 500, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220,
                  }}>
                    {type.icon} {item.subject}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
                    {timeAgo(item.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.user_name} — {item.message.slice(0, 80)}{item.message.length > 80 ? '...' : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                    background: STATUS_MAP[item.status]?.bg, color: STATUS_MAP[item.status]?.color,
                  }}>
                    {STATUS_MAP[item.status]?.label}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                    {item.user_role}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Detail pane ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Selecione um feedback para visualizar
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {(TYPE_MAP[selected.type] || TYPE_MAP.other).icon}{' '}
                    {(TYPE_MAP[selected.type] || TYPE_MAP.other).label} de{' '}
                    <strong>{selected.user_name}</strong> ({selected.user_email})
                    {' · '}{selected.user_role}
                    {' · '}{new Date(selected.created_at).toLocaleString('pt-BR')}
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--ctg-navy)', margin: 0 }}>
                    {selected.subject}
                  </h2>
                </div>
                <button onClick={() => handleDelete(selected.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#DC2626', padding: '4px 8px' }}>
                  🗑 Excluir
                </button>
              </div>

              {/* Status actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {Object.entries(STATUS_MAP).map(([key, val]) => (
                  <button key={key}
                    onClick={() => updateStatus(selected.id, key)}
                    style={{
                      padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                      border: selected.status === key ? `2px solid ${val.color}` : '1px solid var(--border)',
                      background: selected.status === key ? val.bg : 'transparent',
                      color: selected.status === key ? val.color : 'var(--text-secondary)',
                      fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                    {val.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message body */}
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
              <div style={{
                background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                padding: '20px 24px', fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
              }}>
                {selected.message}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
