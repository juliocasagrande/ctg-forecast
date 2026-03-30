import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Verifica atualizações a cada 60 segundos enquanto o app estiver aberto
      if (r) setInterval(() => r.update(), 60_000);
    },
  });

  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: 'var(--ctg-navy)',
      color: '#fff',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      minWidth: 340,
      maxWidth: '90vw',
      border: '1px solid rgba(0,174,239,0.3)',
      animation: 'pwa-slide-up 0.3s ease',
    }}>
      {/* Ícone */}
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: 'rgba(0,174,239,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
          <path d="M10 2a8 8 0 100 16A8 8 0 0010 2z" stroke="#00AEEF" strokeWidth="1.5"/>
          <path d="M10 6v4l2.5 2.5" stroke="#00AEEF" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M13.5 3.5l1 2.5-2.5 1" stroke="#00AEEF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 2 }}>
          Nova versão disponível
        </div>
        <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
          CTG.Engenharia foi atualizado. Recarregue para aplicar.
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 7, color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', padding: '5px 10px', fontSize: '0.72rem',
          }}
        >
          Depois
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: '#00AEEF',
            border: 'none', borderRadius: 7,
            color: '#fff', cursor: 'pointer',
            padding: '5px 14px', fontSize: '0.72rem', fontWeight: 700,
          }}
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
