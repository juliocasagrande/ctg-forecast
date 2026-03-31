import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { useRole } from '../../context/AuthContext.jsx';

const POLL_INTERVAL = 60_000;

function timeAgo(daysAgo) {
  if (daysAgo < 1) return 'hoje';
  if (daysAgo === 1) return 'ontem';
  return `há ${daysAgo} dias`;
}

export default function AlertBell() {
  const [alerts, setAlerts] = useState(null);
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(new Set());
  const ref = useRef(null);
  const navigate = useNavigate();
  const { isGestor, isPlanejador, isAdmin } = useRole();
  const isManager = isGestor || isPlanejador || isAdmin;

  const fetchAlerts = useCallback(async () => {
    try {
      const [alertsR, delegR] = await Promise.all([
        api.get('/forecast/alerts'),
        api.get('/delegations/notifications'),
      ]);
      const data = alertsR.data;
      // Inject delegation_received into alerts object
      const delegations = (delegR.data || []);
      data.delegation_received = {
        count: delegations.length,
        delegations,
      };
      data.total = (data.total || 0) + delegations.length;
      setAlerts(data);
      if ('setAppBadge' in navigator) {
        const count = data?.total ?? 0;
        if (count > 0) navigator.setAppBadge(count).catch(() => {});
        else navigator.clearAppBadge().catch(() => {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAlerts();
    const t = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchAlerts]);

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

  const dismiss = async (alertType, alertKey) => {
    const dKey = `${alertType}|${alertKey}`;
    setDismissing(prev => new Set([...prev, dKey]));
    try {
      await api.post('/forecast/alerts/dismiss', { alert_type: alertType, alert_key: String(alertKey) });
      await fetchAlerts();
    } catch {}
    setDismissing(prev => { const n = new Set(prev); n.delete(dKey); return n; });
  };

  const isDismissing = (type, key) => dismissing.has(`${type}|${key}`);

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
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 01-2-2h4a2 2 0 01-2 2z"/>
        </svg>
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#DC2626', color: '#fff',
            fontSize: '0.58rem', fontWeight: 700,
            borderRadius: 10, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '1.5px solid var(--bg-card)',
          }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="alert-bell-dropdown" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 370, background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)', zIndex: 300, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 16px', background: 'var(--ctg-navy)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>Alertas</span>
            {total > 0 && (
              <span style={{
                background: '#DC2626', color: '#fff',
                fontSize: '0.65rem', fontWeight: 700,
                borderRadius: 10, padding: '1px 7px',
              }}>{total}</span>
            )}
          </div>

          <div style={{ maxHeight: 450, overflowY: 'auto' }}>
            {total === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 8, color: '#15803D' }}>✓</div>
                Tudo em dia. Nenhum alerta no momento.
              </div>
            ) : (
              <>
                {/* Unread messages */}
                {alerts.unread_messages.count > 0 && (
                  <Section icon={<MsgIcon />} title="Mensagens não lidas" count={alerts.unread_messages.count} color="#0070B8">
                    {Object.entries(alerts.unread_messages.by_project).map(([pid, count]) => (
                      <AlertRow
                        key={pid}
                        onClick={() => goTo(pid)}
                        label={`${count} mensagem${count > 1 ? 's' : ''} não lida${count > 1 ? 's' : ''}`}
                        sub={`Projeto #${pid}`}
                        accent="#0070B8"
                        onDismiss={() => dismiss('unread', pid)}
                        dismissing={isDismissing('unread', pid)}
                      />
                    ))}
                  </Section>
                )}

                {/* Empty forecast */}
                {alerts.empty_forecast.count > 0 && (
                  <Section icon={<EditIcon />} title="Forecast não preenchido" count={alerts.empty_forecast.count} color="#B45309">
                    {alerts.empty_forecast.projects.map(p => (
                      <AlertRow
                        key={p.id}
                        onClick={() => goTo(p.id)}
                        label={p.name}
                        sub={`${p.code} — sem valores em ${new Date().getFullYear()}`}
                        accent="#B45309"
                        onDismiss={() => dismiss('empty_forecast', p.id)}
                        dismissing={isDismissing('empty_forecast', p.id)}
                      />
                    ))}
                  </Section>
                )}

                {/* Stale forecast */}
                {alerts.stale_forecast.count > 0 && (
                  <Section icon={<ClockIcon />} title="Sem atualização recente" count={alerts.stale_forecast.count} color="#6B7280">
                    {alerts.stale_forecast.projects.map(p => (
                      <AlertRow
                        key={p.id}
                        onClick={() => goTo(p.id)}
                        label={p.name}
                        sub={`${p.code} — última atualização ${timeAgo(p.days_ago)}`}
                        accent="#6B7280"
                        onDismiss={() => dismiss('stale_forecast', p.id)}
                        dismissing={isDismissing('stale_forecast', p.id)}
                      />
                    ))}
                  </Section>
                )}

                {/* Pending actual */}
                {alerts.pending_actual?.count > 0 && (
                  <Section
                    icon={<WarningIcon />}
                    title={`Realizado de ${alerts.pending_actual.month_label} pendente`}
                    count={alerts.pending_actual.count}
                    color="#DC2626"
                  >
                    {/* Manager view: grouped by engineer */}
                    {isManager && alerts.pending_actual.by_engineer?.length > 0 ? (
                      alerts.pending_actual.by_engineer.map(eng => (
                        <div key={eng.engineer_id}>
                          {/* Engineer header */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 16px 5px 20px', background: '#FEF2F2',
                            borderBottom: '1px solid #FECACA',
                          }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%', background: '#1E40AF',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.5rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                            }}>{eng.avatar_initials || '?'}</div>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#991B1B', flex: 1 }}>
                              {eng.engineer_name}
                            </span>
                            <span style={{
                              fontSize: '0.6rem', fontWeight: 700,
                              background: '#FCA5A5', color: '#7F1D1D',
                              borderRadius: 8, padding: '0px 5px',
                            }}>{eng.projects.length}</span>
                          </div>
                          {eng.projects.map(p => (
                            <AlertRow
                              key={`${eng.engineer_id}-${p.id}`}
                              onClick={() => goTo(p.id)}
                              label={p.name}
                              sub={`${p.code} — preencha o realizado de ${alerts.pending_actual.month_label}/${alerts.pending_actual.year}`}
                              accent="#DC2626"
                              onDismiss={() => dismiss('pending_actual', `${p.id}|${eng.engineer_id}`)}
                              dismissing={isDismissing('pending_actual', `${p.id}|${eng.engineer_id}`)}
                              indent
                            />
                          ))}
                        </div>
                      ))
                    ) : (
                      /* Engineer view: flat list */
                      alerts.pending_actual.projects.map(p => (
                        <AlertRow
                          key={p.id}
                          onClick={() => goTo(p.id)}
                          label={p.name}
                          sub={`${p.code} — preencha o realizado de ${alerts.pending_actual.month_label}/${alerts.pending_actual.year}`}
                          accent="#DC2626"
                          onDismiss={() => dismiss('pending_actual', p.id)}
                          dismissing={isDismissing('pending_actual', p.id)}
                        />
                      ))
                    )}
                  </Section>
                )}

                {/* Férias sem ADP */}
                {alerts.vacation_adp?.count > 0 && (
                  <Section icon={<VacIcon />} title="Férias sem registro ADP" count={alerts.vacation_adp.count} color="#7C3AED">
                    {alerts.vacation_adp.periods.map(v => (
                      <AlertRow
                        key={v.id}
                        onClick={() => { navigate('/vacations'); setOpen(false); }}
                        label={`${v.period_number}º período — ${v.days_until === 0 ? 'começa hoje' : `em ${v.days_until} dia${v.days_until !== 1 ? 's' : ''}`}`}
                        sub={`${v.days} dias corridos — registre no ADP antes que as férias sejam perdidas`}
                        accent="#7C3AED"
                        onDismiss={() => dismiss('vacation_adp', v.id)}
                        dismissing={isDismissing('vacation_adp', v.id)}
                      />
                    ))}
                  </Section>
                )}

                {/* Delegações recebidas ativas */}
                {alerts.delegation_received?.count > 0 && (
                  <Section icon={<DelegIcon />} title="Delegações recebidas" count={alerts.delegation_received.count} color="#0891B2">
                    {alerts.delegation_received.delegations.map(d => (
                      <AlertRow
                        key={d.id}
                        onClick={() => { navigate('/profile'); setOpen(false); }}
                        label={`Delegação de ${d.delegator_name}`}
                        sub={`${d.delegator_role} · até ${new Date(d.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}${d.reason ? ` — ${d.reason}` : ''}`}
                        accent="#0891B2"
                        onDismiss={() => dismiss('delegation_received', d.id)}
                        dismissing={isDismissing('delegation_received', d.id)}
                      />
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <button
              onClick={fetchAlerts}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.72rem', color: 'var(--ctg-blue)', fontWeight: 600,
                fontFamily: 'var(--font-body)',
              }}
            >Atualizar</button>
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
        padding: '8px 16px 6px', background: '#F8FAFC',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ color, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>{title}</span>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          background: color + '20', color,
          borderRadius: 10, padding: '1px 6px',
        }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function AlertRow({ onClick, label, sub, accent, onDismiss, dismissing, indent }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 0,
        background: hov ? '#F0F4FA' : 'transparent',
        borderLeft: `3px solid ${hov ? accent : 'transparent'}`,
        transition: 'all 0.12s',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <button
        onClick={onClick}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          flex: 1, padding: `9px 8px 9px ${indent ? '32px' : '20px'}`,
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-body)', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {label}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {sub}
        </span>
      </button>
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          disabled={dismissing}
          title="Marcar como lido"
          style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '1.5px solid var(--border-strong)',
            background: dismissing ? '#E5E7EB' : 'transparent',
            cursor: dismissing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginRight: 10,
            color: 'var(--text-muted)', fontSize: '0.7rem',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!dismissing) { e.currentTarget.style.background = '#DCFCE7'; e.currentTarget.style.borderColor = '#16A34A'; e.currentTarget.style.color = '#16A34A'; }}}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >✓</button>
      )}
    </div>
  );
}

// Mini SVG icons
const MsgIcon     = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/></svg>;
const EditIcon    = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>;
const ClockIcon   = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>;
const WarningIcon = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>;
const VacIcon     = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>;
const DelegIcon   = () => <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>;