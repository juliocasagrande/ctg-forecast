import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../utils/api.js';

function getSuggestions(role) {
  const roleLower = (role || '').toLowerCase();
  if (['admin', 'planejador'].includes(roleLower)) {
    return [
      'Todos os projetos ativos',
      'Status geral dos projetos',
      'Como exportar relatórios?',
      'Gerenciar usuários',
      'Controle de IACs',
    ];
  }
  if (roleLower === 'coordenador') {
    return [
      'Projetos da minha equipe',
      'Desempenho dos engenheiros',
      'Relatórios da área',
      'Como delegar acesso?',
      'Status dos projetos',
    ];
  }
  // Engenheiro e outros
  return [
    'Meus projetos atribuídos',
    'Como atualizar meu forecast?',
    'Status do meu projeto',
    'Como usar o Forecast Wizard?',
    'Minhas férias',
  ];
}

const TYPING_DOTS = (
  <span style={{ display: 'inline-flex', gap: 3, padding: '0 4px' }}>
    {[0, 1, 2].map(i => (
      <span
        key={i}
        style={{
          width: 5, height: 5, borderRadius: '50%', background: '#94A3B8',
          animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }}
      />
    ))}
  </span>
);

export default function ChatBadge() {
  const { user } = useAuth();
  const SUGGESTIONS = getSuggestions(user?.role);
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: 'user', content: text, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.post('/chat', { messages: [...messages, userMsg] });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.content, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao processar mensagem. Tente novamente.';
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${msg}`, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleSuggestion = (q) => {
    setInput(q);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9000, fontFamily: 'var(--font-body)' }}>

      {/* ── Chat panel ─────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 68, right: 0,
          width: 600, maxHeight: 700,
          background: '#fff', borderRadius: 16,
          boxShadow: '0 12px 48px rgba(0,31,91,0.25)',
          border: '1px solid #E2E8F0',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'chatSlideUp 0.18s ease-out',
        }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #001F5B 0%, #0066B3 100%)',
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(255,255,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', flexShrink: 0,
              }} aria-label="Assistente IA">🤖</div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2 }}>CTG Assistente</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem' }}>Powered by Groq AI</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} title="Limpar conversa" style={{
                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
                  color: 'rgba(255,255,255,0.85)', fontSize: '0.68rem', cursor: 'pointer',
                  padding: '4px 8px', fontFamily: 'inherit',
                }}>Limpar</button>
              )}
              <button onClick={() => setOpen(false)} style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
                color: '#fff', width: 26, height: 26, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.85rem',
              }} aria-label="Fechar chat">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: '#94A3B8' }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>🤖</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B', marginBottom: 4 }}>Olá! Como posso ajudar?</div>
                <div style={{ fontSize: '0.72rem', lineHeight: 1.5, color: '#64748B', marginBottom: 16 }}>
                  Pergunte sobre projetos, IACs, documentos, forecast ou planejamento da CTG Brasil.
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {SUGGESTIONS.map(q => (
                    <button key={q} onClick={() => handleSuggestion(q)} style={{
                      padding: '6px 12px', borderRadius: 20, border: '1px solid #E2E8F0',
                      background: '#F8FAFC', color: '#475569', fontSize: '0.68rem',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.target.style.background = '#E2E8F0'; }}
                    onMouseLeave={e => { e.target.style.background = '#F8FAFC'; }}
                    >{q}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', width: m.role === 'user' ? 'auto' : '100%' }}>
                <div style={{
                  maxWidth: m.role === 'user' ? '85%' : '100%',
                  width: m.role === 'user' ? 'auto' : '100%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user' ? '#001F5B' : '#F1F5F9',
                  color: m.role === 'user' ? '#fff' : '#1E293B',
                  fontSize: '0.8rem', lineHeight: 1.6,
                  wordBreak: 'break-word',
                  overflowX: 'auto',
                }}>
                  {m.role === 'user' ? (
                    m.content
                  ) : (
                    <div style={{ width: '100%', overflowX: 'auto' }} className="markdown-content">
                      <Markdown>{m.content}</Markdown>
                    </div>
                  )}
                </div>
                {m.time && (
                  <div style={{
                    fontSize: '0.6rem', color: '#94A3B8', marginTop: 2,
                    paddingLeft: m.role === 'user' ? 0 : 4, paddingRight: m.role === 'user' ? 4 : 0,
                  }}>
                    {m.time}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
                  background: '#F1F5F9', display: 'flex', alignItems: 'center',
                }}>
                  {TYPING_DOTS}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Digite sua mensagem... (Enter para enviar)"
              rows={1}
              style={{
                flex: 1, border: '1.5px solid #E2E8F0', borderRadius: 10,
                padding: '8px 11px', fontSize: '0.8rem', fontFamily: 'inherit',
                color: '#1E293B', outline: 'none', resize: 'none',
                lineHeight: 1.45, maxHeight: 80, overflowY: 'auto',
                background: '#F8FAFC', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#001F5B'}
              onBlur={e => e.target.style.borderColor = '#E2E8F0'}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                background: (input.trim() && !loading) ? '#001F5B' : '#E2E8F0',
                color: (input.trim() && !loading) ? '#fff' : '#94A3B8',
                cursor: (input.trim() && !loading) ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', transition: 'all 0.15s',
              }}
              aria-label="Enviar mensagem"
            >↑</button>
          </div>
        </div>
      )}

      {/* ── Floating button ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="CTG Assistente"
        style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: open ? '#0066B3' : 'linear-gradient(135deg, #001F5B 0%, #0066B3 100%)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: open ? '1.1rem' : '1.4rem',
          boxShadow: '0 4px 18px rgba(0,31,91,0.35)',
          transition: 'all 0.2s',
        }}
        aria-label={open ? 'Fechar assistente' : 'Abrir assistente'}
      >
        {open ? '✕' : '🤖'}
      </button>

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40%           { opacity: 1; transform: scale(1); }
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
          margin: 8px 0 4px 0;
          line-height: 1.2;
        }
        .markdown-content h1 { font-size: 1rem; }
        .markdown-content h2 { font-size: 0.9rem; }
        .markdown-content h3 { font-size: 0.85rem; }
        .markdown-content p { margin: 4px 0; }
        .markdown-content ul, .markdown-content ol {
          margin: 4px 0;
          padding-left: 16px;
        }
        .markdown-content li { margin: 2px 0; }
        .markdown-content code {
          background: rgba(0, 0, 0, 0.08);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.75rem;
        }
        .markdown-content pre {
          background: #1E293B;
          color: #E2E8F0;
          padding: 8px 12px;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 0.75rem;
          line-height: 1.4;
          margin: 6px 0;
        }
        .markdown-content pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
         .markdown-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 6px 0;
          font-size: 0.75rem;
          overflow-x: auto;
        }
        .markdown-content {
          width: 100%;
          overflow-x: auto;
        }
        .markdown-content th, .markdown-content td {
          border: 1px solid #CBD5E1;
          padding: 4px 8px;
          text-align: left;
        }
        .markdown-content th {
          background: #F1F5F9;
          font-weight: 600;
        }
        .markdown-content a {
          color: #0066B3;
          text-decoration: none;
        }
        .markdown-content a:hover {
          text-decoration: underline;
        }
        .markdown-content blockquote {
          border-left: 3px solid #0066B3;
          padding-left: 8px;
          margin: 6px 0;
          color: #64748B;
        }
        .markdown-content strong {
          font-weight: 700;
          color: inherit;
        }
      `}</style>
    </div>
  );
}
