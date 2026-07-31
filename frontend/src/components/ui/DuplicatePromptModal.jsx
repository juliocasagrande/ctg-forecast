import { useState } from 'react';
import useModalHotkeys from '../../hooks/useModalHotkeys.js';

const inputStyle = {
  padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 6,
  fontSize: '0.85rem', color: '#1E293B', background: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

export default function DuplicatePromptModal({ title, codeLabel, placeholder, initialCode, onCancel, onConfirm, submitting }) {
  const [code, setCode] = useState(initialCode || '');

  const confirm = () => {
    const value = code.trim();
    if (!value || submitting) return;
    onConfirm(value);
  };
  useModalHotkeys(true, onCancel, confirm);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420, width: '92vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{
          background: 'linear-gradient(135deg, #001F5B 0%, #0b5cab 100%)',
          padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span className="modal-title" style={{ fontSize: '1.1rem' }}>📄 {title}</span>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem', padding: '4px',
          }}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 24px' }}>
          <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
            Todas as demais informações serão copiadas. Informe apenas o novo código.
          </p>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {codeLabel}
            </label>
            <input
              autoFocus
              onFocus={e => e.target.select()}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>
        </div>
        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', background: '#FAFAFA' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirm} disabled={submitting || !code.trim()} style={{
            opacity: (submitting || !code.trim()) ? 0.6 : 1,
            cursor: (submitting || !code.trim()) ? 'not-allowed' : 'pointer',
          }}>
            {submitting ? 'Duplicando...' : 'Duplicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
