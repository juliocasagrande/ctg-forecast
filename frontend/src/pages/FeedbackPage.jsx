import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';

const TYPES = [
  { id: 'suggestion', label: '💡 Sugestão de Melhoria', color: '#0EA5E9' },
  { id: 'bug',        label: '🐛 Reportar Problema',    color: '#DC2626' },
  { id: 'usability',  label: '🎯 Feedback de Usabilidade', color: '#7C3AED' },
  { id: 'other',      label: '💬 Outro',                 color: '#6B7280' },
];

export default function FeedbackPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState('suggestion');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) return toast('Preencha assunto e mensagem', 'error');
    setSending(true);
    try {
      await api.post('/feedback', {
        type,
        subject: subject.trim(),
        message: message.trim(),
        user_name: user?.name,
        user_email: user?.email,
        user_role: user?.role,
      });
      setSent(true);
      toast('Feedback enviado com sucesso!', 'success');
    } catch {
      toast('Erro ao enviar feedback. Tente novamente.', 'error');
    } finally { setSending(false); }
  };

  if (sent) {
    return (
      <div style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '48px 32px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
            <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--ctg-navy)', marginBottom: 8 }}>
              Feedback Enviado!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>
              Obrigado pela sua contribuição. Seu feedback será analisado pela equipe de desenvolvimento.
            </p>
            <button className="btn btn-primary" onClick={() => { setSent(false); setSubject(''); setMessage(''); }}>
              Enviar outro feedback
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {/* Info banner */}
      <div style={{
        padding: '14px 18px', borderRadius: 'var(--radius-md)',
        background: 'var(--budget-bg)', border: '1px solid var(--budget-border)',
        marginBottom: 20, fontSize: '0.85rem', color: 'var(--budget-text)', lineHeight: 1.6,
      }}>
        Sua opinião é importante para melhorar o CTG.Engenharia. Sugestões, problemas e feedbacks serão encaminhados para a equipe de desenvolvimento.
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Novo Feedback</span>
        </div>
        <div className="card-body">
          {/* Type selector */}
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {TYPES.map(t => (
                <button key={t.id} onClick={() => setType(t.id)} style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  border: `2px solid ${type === t.id ? t.color : 'var(--border)'}`,
                  background: type === t.id ? t.color + '12' : 'var(--bg-card)',
                  color: type === t.id ? t.color : 'var(--text-secondary)',
                  fontWeight: type === t.id ? 700 : 500,
                  fontSize: '0.82rem', fontFamily: 'var(--font-body)',
                  textAlign: 'left', transition: 'all 0.15s',
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div className="form-group">
            <label className="form-label">Assunto *</label>
            <input className="form-input" placeholder="Resumo breve do feedback"
              value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} />
          </div>

          {/* Message */}
          <div className="form-group">
            <label className="form-label">Descrição *</label>
            <textarea className="form-textarea" style={{ minHeight: 120 }}
              placeholder="Descreva em detalhes sua sugestão, problema ou feedback..."
              value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} />
            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {message.length}/2000
            </div>
          </div>

          {/* Sender info (read-only) */}
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-app)', fontSize: '0.78rem', color: 'var(--text-muted)',
            marginBottom: 16,
          }}>
            Enviado por: <strong style={{ color: 'var(--text-primary)' }}>{user?.name}</strong> ({user?.email})
          </div>

          <button className="btn btn-primary" onClick={handleSend}
            disabled={sending || !subject.trim() || !message.trim()}
            style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}>
            {sending ? 'Enviando...' : '📨 Enviar Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
