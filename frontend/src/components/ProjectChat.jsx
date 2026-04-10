import { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';

function Avatar({ name, initials, role, size = 32 }) {
  const colors = { admin: '#001F5B', coordenador: '#0070B8', engenheiro: '#166534' };
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: colors[role] || '#888',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff',
      flexShrink: 0, userSelect: 'none'
    }}>
      {initials || name?.slice(0, 2).toUpperCase()}
    </div>
  );
}

function roleBadge(role) {
  const map = { admin: ['Admin', '#001F5B'], coordenador: ['Coord.', '#0070B8'], engenheiro: ['Eng.', '#166534'] };
  const [label, color] = map[role] || ['', '#888'];
  return <span style={{ fontSize: '0.62rem', background: color + '18', color, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{label}</span>;
}

export default function ProjectChat({ projectId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const { user } = useAuth();

  const fetchMessages = async (silent = false) => {
    try {
      const r = await api.get(`/projects/${projectId}/messages`);
      setMessages(r.data);
      if (!silent) setLoading(false);
    } catch { if (!silent) setLoading(false); }
  };

  useEffect(() => {
    fetchMessages();
    let interval = setInterval(() => fetchMessages(true), 10000);

    // Pause polling when tab is hidden (saves battery/bandwidth on mobile)
    const handleVisibility = () => {
      clearInterval(interval);
      if (!document.hidden) {
        fetchMessages(true);
        interval = setInterval(() => fetchMessages(true), 10000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const r = await api.post(`/projects/${projectId}/messages`, { content: text });
      setMessages(prev => [...prev, r.data]);
      setText('');
    } catch { } finally { setSending(false); }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString())
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Group consecutive messages by same user
  const grouped = messages.reduce((acc, msg, i) => {
    const prev = messages[i - 1];
    const sameUser = prev && prev.user_id === msg.user_id &&
      (new Date(msg.created_at) - new Date(prev.created_at)) < 120000;
    if (sameUser) { acc[acc.length - 1].push(msg); }
    else { acc.push([msg]); }
    return acc;
  }, []);

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="icon" style={{fontSize:'1.2rem',fontWeight:700,color:'var(--text-muted)'}}>—</div>
            <h3>Sem mensagens ainda</h3>
            <p>Inicie a conversa com sua equipe.</p>
          </div>
        ) : (
          grouped.map((group, gi) => {
            const first = group[0];
            const isMine = first.user_id === user?.id;
            return (
              <div key={gi} className={`chat-group ${isMine ? 'mine' : 'theirs'}`}>
                {!isMine && (
                  <div className="chat-group-header">
                    <Avatar name={first.user_name} initials={first.avatar_initials} role={first.user_role} size={28} />
                    <span className="chat-username">{first.user_name}</span>
                    {roleBadge(first.user_role)}
                  </div>
                )}
                <div className="chat-bubbles">
                  {group.map((msg, mi) => (
                    <div key={msg.id} className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
                      <span className="chat-text">{msg.content}</span>
                      {mi === group.length - 1 && (
                        <span className="chat-time">{formatTime(msg.created_at)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          className="chat-input"
          type="text"
          placeholder="Digite uma mensagem..."
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={sending}
          maxLength={1000}
        />
        <button type="submit" className="chat-send-btn" disabled={!text.trim() || sending}>
          {sending ? '...' : '↑'}
        </button>
      </form>
    </div>
  );
}
