/**
 * PWAUpdatePrompt - Componente de notificação de atualização do PWA/Web
 * 
 * Funcionamento:
 * - Detecta quando há uma nova versão do service worker disponível
 * - Exibe card estilizado com countdown de 30 segundos para auto-update
 * - Permite ao usuário atualizar imediatamente ou dispensar temporariamente
 * - Funciona tanto no navegador (web) quanto no modo PWA instalado
 * - Verifica atualizações a cada 60 segundos automaticamente
 * 
 * Configuração relacionada:
 * - vite.config.js: registerType 'prompt' permite controle manual
 * - workbox.skipWaiting: false (espera interação do usuário)
 * - workbox.clientsClaim: false (não toma controle imediatamente)
 */

import { useEffect, useState, useCallback } from 'react';
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

  const [countdown, setCountdown] = useState(30);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Auto-atualiza após 30 segundos mesmo sem interação do usuário
  useEffect(() => {
    if (!needRefresh) {
      setCountdown(30);
      return;
    }
    
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleUpdate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [needRefresh]);

  const handleUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      await updateServiceWorker(true);
      // Mostra feedback visual antes de recarregar
      setShowSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      setIsUpdating(false);
    }
  }, [updateServiceWorker]);

  const handleDismiss = () => {
    // Usuário optou por não atualizar agora, mas será notificado novamente
    setCountdown(0);
  };

  if (!needRefresh) return null;

  return (
    <>
      {/* Toast de sucesso (aparece brevemente antes do reload) */}
      {showSuccess && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10001,
          background: '#166534',
          color: '#fff',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          animation: 'pwa-slide-down 0.3s ease',
        }}>
          <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
            <circle cx="10" cy="10" r="8" stroke="#fff" strokeWidth="1.5"/>
            <path d="M6 10l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>Atualizando...</span>
        </div>
      )}

      {/* Card de notificação de atualização */}
      <div className="pwa-update-card" style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'var(--bg-card)',
        borderRadius: 16,
        boxShadow: '0 12px 40px rgba(0,31,91,0.25), 0 4px 12px rgba(0,0,0,0.1)',
        padding: 0,
        minWidth: 380,
        maxWidth: '92vw',
        border: '1.5px solid var(--ctg-blue)',
        animation: 'pwa-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        overflow: 'hidden',
      }}>
        {/* Barra superior com gradiente */}
        <div style={{
          height: 4,
          background: 'linear-gradient(90deg, var(--ctg-navy), var(--ctg-blue), var(--ctg-accent))',
        }} />

        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Ícone com animação de pulse */}
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--ctg-navy), var(--ctg-blue))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,112,184,0.3)',
              animation: 'pwa-pulse 2s ease-in-out infinite',
            }}>
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <path d="M12 4V2M12 22v-2M6.34 6.34L4.93 4.93M19.07 19.07l-1.41-1.41M4 12H2M22 12h-2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" 
                  stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2"/>
              </svg>
            </div>

            {/* Texto */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontWeight: 700, 
                fontSize: '0.9rem', 
                color: 'var(--ctg-navy)',
                marginBottom: 4,
                fontFamily: 'var(--font-display)',
              }}>
                Nova versão disponível
              </div>
              <div style={{ 
                fontSize: '0.78rem', 
                color: 'var(--text-secondary)', 
                lineHeight: 1.5,
              }}>
                Uma atualização do sistema foi detectada. 
                {isUpdating ? (
                  <span style={{ color: 'var(--ctg-blue)', fontWeight: 600 }}>
                    {' '}Atualizando...
                  </span>
                ) : (
                  <>
                    {' '}Atualização automática em{' '}
                    <span style={{ 
                      fontWeight: 700, 
                      color: countdown <= 10 ? '#DC2626' : 'var(--ctg-blue)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {countdown}s
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Botão de fechar */}
            <button
              onClick={handleDismiss}
              disabled={isUpdating}
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isUpdating ? 'not-allowed' : 'pointer',
                opacity: isUpdating ? 0.4 : 1,
                transition: 'all 0.15s ease',
                color: 'var(--text-muted)',
                fontSize: '1rem',
                flexShrink: 0,
              }}
              title="Lembrar depois"
            >
              ×
            </button>
          </div>

          {/* Ações */}
          <div style={{ 
            display: 'flex', 
            gap: 10, 
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              style={{
                flex: 1,
                background: isUpdating 
                  ? 'var(--text-muted)' 
                  : 'linear-gradient(135deg, var(--ctg-navy), var(--ctg-blue))',
                border: 'none', 
                borderRadius: 10,
                color: '#fff', 
                cursor: isUpdating ? 'not-allowed' : 'pointer',
                padding: '10px 16px', 
                fontSize: '0.82rem', 
                fontWeight: 700,
                fontFamily: 'var(--font-body)',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(0,112,184,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isUpdating ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none"/>
                    <path d="M14 8a6 6 0 00-6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"/>
                  </svg>
                  Atualizando...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
                    <path d="M10 3v4l2.5-2.5M10 17v-4l-2.5 2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14.5 6.5L17 10l-2.5 3.5M5.5 13.5L3 10l2.5-3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Atualizar agora
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
