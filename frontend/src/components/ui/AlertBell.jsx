import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';

const POLL_INTERVAL = 60_000; // 1 minute

function timeAgo(daysAgo) {
  if (daysAgo < 1) return 'hoje';
  if (daysAgo === 1) return 'ontem';
  return `há ${daysAgo} dias`;
}

export default function AlertBell() {
  const [alerts, setAlerts] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await api.get('/forecast/alerts');
      setAlerts(r.data);

      // Sync PWA app badge (icon notification count)
      if ('setAppBadge' in navigator) {
        const count = r.data?.total ?? 0;
        if (count > 0) {
          navigator.setAppBadge(count).catch(() => {});
        } else {
          navigator.clearAppBadge().catch(() => {});
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAlerts();
    const t = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchAlerts]);

  // Close on outside click
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const total = alerts?.total ?? 0;

  const goTo = (projectId) => {
    navigate(`/projects/${projectId}`);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Alertas"
        style={{
          position: 'relative',
          width: 34, height: 34,
          borderRadius: '50%',
          border: `1.5px solid ${total > 0 ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
          background: total > 0 ? 'var(--budget-bg)' : 'var(--bg-card)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          color: total > 0 ? 'var(--ctg-navy)' : 'var(--text-muted)',
        }}
      >
        {/* Bell SVG */}
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 01-2-2h4a2 2 0 01-2 2z"/>
        </svg>

        {/* Badge */}
        {total > 0 && (
          <span style={{
            position: 'absolute',
            top: -4, right: -4,
            background: '#DC2626',
            color: '#fff',
            fontSize: '0.58rem',
            fontWeight: 700,
            borderRadius: 10,
            minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
            border: '1.5px solid var(--bg-card)',
          }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="alert-bell-dropdown" style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 340,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 300,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 16px',
            background: 'var(--ctg-navy)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>
              Alertas
            </span>
            {total > 0 && (
              <span style={{
                background: '#DC2626', color: '#fff',
                fontSize: '0.65rem', fontWeight: 700,
                borderRadius: 10, padding: '1px 7px',
              }}>
                {total}
              </span>
            )}
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {total === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 8, color: '#15803D' }}>✓</div>
                Tudo em dia. Nenhum alerta no momento.
              </div>
            ) : (
              <>
                {/* Unread messages */}
                {alerts.unread_messages.count > 0 && (
                  <Section
                    icon={<MsgIcon />}
                    title="Mensagens não lidas"
                    count={alerts.unread_messages.count}
                    color="#0070B8"
                  >
                    {Object.entries(alerts.unread_messages.by_project).map(([pid, count]) => (
                      <AlertRow
                        key={pid}
                        onClick={() => goTo(pid)}
                        label={`${count} mensagem${count > 1 ? 's' : ''} não lida${count > 1 ? 's' : ''}`}
                        sub={`Projeto #${pid}`}
                        accent="#0070B8"
                      />
                    ))}
                  </Section>
                )}

                {/* Empty forecast */}
                {alerts.empty_forecast.count > 0 && (
                  <Section
                    icon={<EditIcon />}
                    title="Forecast não preenchido"
                    count={alerts.empty_forecast.count}
                    color="#B45309"
                  >
                    {alerts.empty_forecast.projects.map(p => (
                      <AlertRow
                        key={p.id}
                        onClick={() => goTo(p.id)}
                        label={p.name}
                        sub={`${p.code} — sem valores em ${new Date().getFullYear()}`}
                        accent="#B45309"
                      />
                    ))}
                  </Section>
                )}

                {/* Stale forecast */}
                {alerts.stale_forecast.count > 0 && (
                  <Section
                    icon={<ClockIcon />}
                    title="Sem atualização recente"
                    count={alerts.stale_forecast.count}
                    color="#6B7280"
                  >
                    {alerts.stale_forecast.projects.map(p => (
                      <AlertRow
                        key={p.id}
                        onClick={() => goTo(p.id)}
                        label={p.name}
                        sub={`${p.code} — última atualização ${timeAgo(p.days_ago)}`}
                        accent="#6B7280"
                      />
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <button
              onClick={fetchAlerts}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.72rem', color: 'var(--ctg-blue)', fontWeight: 600,
                fontFamily: 'var(--font-body)',
              }}
            >
              Atualizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ icon, title, count, color, children }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px 6px',
        background: '#F8FAFC',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ color, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>
          {title}
        </span>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          background: color + '20', color,
          borderRadius: 10, padding: '1px 6px',
        }}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function AlertRow({ onClick, label, sub, accent }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        width: '100%', padding: '9px 16px 9px 20px',
        background: hov ? '#F0F4FA' : 'transparent',
        border: 'none', cursor: 'pointer',
        borderLeft: `3px solid ${hov ? accent : 'transparent'}`,
        transition: 'all 0.12s',
        fontFamily: 'var(--font-body)',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
        {label}
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
        {sub}
      </span>
    </button>
  );
}

// Mini SVG icons
const MsgIcon  = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/></svg>;
const EditIcon = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>;
const ClockIcon= () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>;
