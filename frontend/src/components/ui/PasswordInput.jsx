import { useState } from 'react';

const RULES = [
  { id: 'length',    label: 'Mínimo 8 caracteres',    test: pw => pw.length >= 8 },
  { id: 'uppercase', label: 'Uma letra maiúscula',    test: pw => /[A-Z]/.test(pw) },
  { id: 'lowercase', label: 'Uma letra minúscula',    test: pw => /[a-z]/.test(pw) },
  { id: 'number',    label: 'Um número',              test: pw => /[0-9]/.test(pw) },
];

export function getPasswordStrength(pw) {
  if (!pw) return { score: 0, passed: 0, total: RULES.length, allPassed: false };
  const passed = RULES.filter(r => r.test(pw)).length;
  return { score: passed, passed, total: RULES.length, allPassed: passed === RULES.length };
}

export default function PasswordInput({ value, onChange, placeholder, label, autoFocus, confirm, confirmValue }) {
  const [showPw, setShowPw] = useState(false);
  const strength = getPasswordStrength(value);
  const started = value?.length > 0;

  // Strength bar color
  const barColor = strength.passed <= 1 ? '#DC2626'
    : strength.passed <= 2 ? '#F59E0B'
    : strength.passed <= 3 ? '#0EA5E9'
    : '#16A34A';

  const confirmMatch = confirm && confirmValue !== undefined
    ? value === confirmValue && value.length > 0
    : null;

  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          className="form-input"
          type={showPw ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'Digite sua senha'}
          autoFocus={autoFocus}
          autoComplete="new-password"
          style={{ paddingRight: 42 }}
        />
        <button
          type="button"
          onClick={() => setShowPw(v => !v)}
          tabIndex={-1}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 6px',
            fontFamily: 'var(--font-body)',
          }}
        >
          {showPw ? '🙈' : '👁'}
        </button>
      </div>

      {/* Strength bar */}
      {started && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            display: 'flex', gap: 3, marginBottom: 6,
          }}>
            {RULES.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i < strength.passed ? barColor : '#E2E8F0',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>

          {/* Rule checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {RULES.map(rule => {
              const ok = rule.test(value);
              return (
                <div key={rule.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: '0.72rem', fontWeight: 500,
                  color: ok ? '#16A34A' : '#94A3B8',
                  transition: 'color 0.2s',
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
                    background: ok ? '#DCFCE7' : '#F1F5F9',
                    color: ok ? '#16A34A' : '#CBD5E1',
                    border: `1px solid ${ok ? '#BBF7D0' : '#E2E8F0'}`,
                    transition: 'all 0.2s',
                  }}>
                    {ok ? '✓' : '○'}
                  </span>
                  {rule.label}
                </div>
              );
            })}
          </div>

          {/* Confirm match indicator */}
          {confirmMatch !== null && confirmValue?.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.72rem', fontWeight: 600, marginTop: 4,
              color: confirmMatch ? '#16A34A' : '#DC2626',
            }}>
              <span>{confirmMatch ? '✓' : '✕'}</span>
              {confirmMatch ? 'Senhas coincidem' : 'Senhas não coincidem'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
