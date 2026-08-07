import { useEffect } from 'react';

const ESCALATION_CONFIG = {
  tracking: {
    rolesKey: 'tracking_alert_roles',
    daysKey: 'tracking_alert_role_days',
    intervalKey: 'tracking_alert_interval_days',
  },
  iac: {
    rolesKey: 'iac_alert_roles',
    daysKey: 'iac_alert_role_days',
    intervalKey: 'iac_alert_interval_days',
  },
  document: {
    rolesKey: 'doc_alert_roles',
    daysKey: 'doc_alert_role_days',
    intervalKey: 'doc_alert_interval_days',
  },
  drawing: {
    rolesKey: 'drawing_alert_roles',
    daysKey: 'drawing_alert_role_days',
    intervalKey: 'drawing_alert_interval_days',
  },
  pms: {
    rolesKey: 'pms_alert_roles',
    daysKey: 'pms_alert_role_days',
    intervalKey: 'pms_alert_days',
    direction: 'before',
  },
};

const ESCALATION_ROLES = [
  { role: 'coordenador', label: 'Coordenação' },
  { role: 'gerente', label: 'Gerência' },
];

function parseJson(value) {
  try { return JSON.parse(value || '{}'); }
  catch { return {}; }
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value, days) {
  const date = parseDate(value);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return date;
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('pt-BR') : 'data indisponível';
}

function daysFromToday(value) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function relativeDayLabel(value) {
  const days = daysFromToday(value);
  if (days === null) return 'sem prazo';
  if (days === 0) return 'hoje';
  if (days > 0) return `em ${days} ${days === 1 ? 'dia' : 'dias'}`;
  const elapsed = Math.abs(days);
  return `há ${elapsed} ${elapsed === 1 ? 'dia' : 'dias'}`;
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)[0] : ''}`.toUpperCase();
}

function groupByEngineer(items, personal) {
  const grouped = new Map();
  items.forEach(item => {
    const engineer = item.engineer?.trim() || (personal ? 'Você' : 'Responsável não informado');
    if (!grouped.has(engineer)) grouped.set(engineer, []);
    grouped.get(engineer).push(item);
  });
  return [...grouped.entries()]
    .map(([engineer, engineerItems]) => ({ engineer, items: engineerItems }))
    .sort((a, b) => a.engineer.localeCompare(b.engineer, 'pt-BR'));
}

function configuredDays(settings, type, role) {
  const config = ESCALATION_CONFIG[type];
  const roleDays = parseJson(settings?.[config.daysKey]);
  const roleValue = Number.parseInt(roleDays[role], 10);
  if (Number.isFinite(roleValue) && roleValue >= 0) return roleValue;
  const intervalValue = Number.parseInt(settings?.[config.intervalKey], 10);
  return Number.isFinite(intervalValue) && intervalValue >= 0 ? intervalValue : null;
}

function dueDateFor(settings, type, referenceDate) {
  if (type === 'pms') return parseDate(referenceDate);
  const days = configuredDays(settings, type, 'engenheiro');
  return days === null ? null : addDays(referenceDate, days);
}

function urgencyFor(value) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const daysRemaining = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return {
      bucket: 'overdue',
      label: `Vencido há ${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'}`,
      dueDate: date,
    };
  }
  if (daysRemaining < 2) {
    return {
      bucket: 'upcoming',
      label: daysRemaining === 0 ? 'Vence hoje' : 'Vence amanhã',
      dueDate: date,
    };
  }
  return null;
}

function urgentItems(items) {
  return items
    .map(item => ({ ...item, urgency: urgencyFor(item.dueDate) }))
    .filter(item => item.urgency)
    .sort((a, b) => a.urgency.dueDate - b.urgency.dueDate);
}

function escalationFor(settings, type, role, referenceDate) {
  const config = ESCALATION_CONFIG[type];
  const configuredRoles = settings?.[config.rolesKey];
  if (typeof configuredRoles !== 'string') return { role, state: 'unknown' };
  const enabledRoles = configuredRoles
    .split(',').map(item => item.trim()).filter(Boolean);
  if (!enabledRoles.includes(role)) return { role, state: 'disabled' };

  const days = configuredDays(settings, type, role);
  if (days === null) return { role, state: 'unknown' };

  const notifyDate = addDays(referenceDate, config.direction === 'before' ? -days : days);
  if (!notifyDate) return { role, state: 'unknown' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const comparisonDate = new Date(notifyDate);
  comparisonDate.setHours(0, 0, 0, 0);
  return {
    role,
    state: comparisonDate <= today ? 'informed' : 'scheduled',
    date: notifyDate,
  };
}

function scheduledEscalation(settings, type, referenceDate) {
  return ESCALATION_ROLES.map(({ role, label }) => ({
    ...escalationFor(settings, type, role, referenceDate),
    label,
  }));
}

function immediateEscalation() {
  return ESCALATION_ROLES.map(({ role, label }) => ({ role, label, state: 'informed', immediate: true }));
}

export function buildDailyAlertGroups({ alerts, staleProjects, staleIacs, workloadLate, pmsAlerts, settings }) {
  const groups = [
    {
      title: 'Acompanhamento de Projetos', path: '/lists/projects-tracking', color: '#EF4444',
      items: urgentItems(staleProjects.map(project => ({
          id: `tracking-${project.id}`,
          code: project.pp_contrato || `Projeto #${project.id}`,
          description: project.projeto || 'Projeto sem descrição',
          engineer: project.gestor,
          meta: project.area,
          dueDate: dueDateFor(settings, 'tracking', project.updated_at),
          escalation: scheduledEscalation(settings, 'tracking', project.updated_at),
        }))),
    },
    {
      title: 'IACs', path: '/lists/iacs', color: '#F97316',
      items: urgentItems(staleIacs.map(iac => ({
          id: `iac-${iac.id}`,
          code: iac.iac_code || `IAC #${iac.id}`,
          description: iac.project || 'IAC sem descrição',
          engineer: iac.team_leader,
          meta: iac.area,
          dueDate: dueDateFor(settings, 'iac', iac.updated_at),
          escalation: scheduledEscalation(settings, 'iac', iac.updated_at),
        }))),
    },
    {
      title: 'Controle de Carga', path: '/workload', color: '#DC2626',
      items: urgentItems(workloadLate.map(demand => ({
        id: `workload-${demand.id}`,
        code: `Demanda #${demand.id}`,
        description: demand.title || 'Demanda bloqueada',
        engineer: demand.user_name,
        meta: `${demand.load_percent || 0}% de carga`,
        dueDate: demand.due_date,
        escalation: immediateEscalation(),
      }))),
    },
    {
      title: 'Controle de Documentos', path: '/documents', color: '#F59E0B',
      items: urgentItems((alerts?.doc_unpublished?.docs || []).map(document => ({
        id: `document-${document.id}`,
        code: document.code || `Documento #${document.id}`,
        description: document.subject || 'Documento sem descrição',
        engineer: document.responsible,
        meta: document.status,
        dueDate: dueDateFor(settings, 'document', document.created_at),
        escalation: scheduledEscalation(settings, 'document', document.created_at),
      }))),
    },
    {
      title: 'Controle de Desenhos', path: '/drawings', color: '#0891B2',
      items: urgentItems((alerts?.drawing_unpublished?.drawings || []).map(drawing => ({
        id: `drawing-${drawing.id}`,
        code: drawing.code || `Desenho #${drawing.id}`,
        description: drawing.subject || 'Desenho sem descrição',
        engineer: drawing.responsible,
        meta: drawing.status,
        dueDate: dueDateFor(settings, 'drawing', drawing.created_at),
        escalation: scheduledEscalation(settings, 'drawing', drawing.created_at),
      }))),
    },
    {
      title: 'PMS — Documentos Técnicos', path: '/pms', color: '#B91C1C',
      items: urgentItems(pmsAlerts.map(document => ({
        id: `pms-${document.id}`,
        code: document.code || `PMS #${document.id}`,
        description: document.title_pt || 'Documento PMS sem descrição',
        engineer: document.responsible,
        meta: [document.area, document.status].filter(Boolean).join(' · '),
        dueDate: document.expiry_date,
        escalation: scheduledEscalation(settings, 'pms', document.expiry_date),
      }))),
    },
    {
      title: 'Controle de Férias', path: '/vacations', color: '#7C3AED', personal: true,
      items: urgentItems((alerts?.vacation_adp?.periods || []).map(period => ({
        id: `vacation-${period.id}`,
        code: `Férias · ${period.period_number}º período`,
        description: 'Registro no ADP pendente',
        engineer: 'Você',
        meta: `${period.days} dias corridos`,
        dueDate: period.start_date,
      }))),
    },
    {
      title: 'Meu Perfil', path: '/profile', color: '#0891B2', personal: true,
      items: urgentItems((alerts?.delegation_received?.delegations || []).map(delegation => ({
        id: `delegation-${delegation.id}`,
        code: `Delegação #${delegation.id}`,
        description: `Delegação recebida de ${delegation.delegator_name}`,
        engineer: 'Você',
        meta: delegation.reason || null,
        dueDate: delegation.end_date,
      }))),
    },
  ];

  return groups.filter(group => group.items.length > 0);
}

function EscalationBadge({ status, urgency }) {
  let timing;
  if (status.state === 'informed') {
    timing = status.immediate ? 'agora' : relativeDayLabel(status.date);
  } else if (status.state === 'scheduled') {
    timing = relativeDayLabel(status.date);
  } else if (status.state === 'disabled') {
    timing = 'desativado';
  } else {
    timing = 'sem prazo';
  }
  const exactDate = status.date ? formatDate(status.date) : null;
  const title = exactDate
    ? `${status.label}: ${status.state === 'informed' ? 'aviso disponível desde' : 'aviso previsto para'} ${exactDate}`
    : `${status.label}: ${timing}`;
  const severity = ['disabled', 'unknown'].includes(status.state)
    ? status.state
    : urgency === 'overdue' ? 'danger' : 'warning';
  return (
    <span className={`daily-alert-escalation ${severity}`} title={title}>
      <strong>{status.label}</strong>
      <span>{timing}</span>
    </span>
  );
}

export default function DailyAlertsModal({
  groups,
  onClose,
  onNavigate,
}) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const overdueTotal = groups.reduce((sum, group) => sum + group.items.filter(item => item.urgency.bucket === 'overdue').length, 0);
  const upcomingTotal = total - overdueTotal;

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="daily-alert-overlay" onMouseDown={onClose}>
      <section
        className="daily-alert-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-alert-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="daily-alert-header">
          <div className="daily-alert-header-icon" aria-hidden="true">!</div>
          <div>
            <h2 id="daily-alert-title">Pendências do dia</h2>
            <p>{overdueTotal} {overdueTotal === 1 ? 'vencida' : 'vencidas'} · {upcomingTotal} {upcomingTotal === 1 ? 'próxima a vencer' : 'próximas a vencer'}</p>
          </div>
          <button className="daily-alert-close" type="button" onClick={onClose} aria-label="Fechar resumo de pendências">×</button>
        </header>

        <div className="daily-alert-explanation">
          <strong>Escalonamento:</strong> vermelho indica pendência vencida; amarelo indica proximidade do vencimento. O sistema não confirma a leitura do aviso.
        </div>

        <div className="daily-alert-content">
          {groups.map(group => (
            <section className="daily-alert-group" key={group.path} style={{ '--daily-alert-color': group.color }}>
              <div className="daily-alert-group-header">
                <span className="daily-alert-group-dot" />
                <h3>{group.title}</h3>
                <span className="daily-alert-count">{group.items.length}</span>
                <button type="button" onClick={() => onNavigate(group.path)}>Abrir página</button>
              </div>
              <div className="daily-alert-items">
                {groupByEngineer(group.items, group.personal).map(engineerGroup => (
                  <section className="daily-alert-engineer-group" key={engineerGroup.engineer}>
                    <div className="daily-alert-engineer-header">
                      <span className="daily-alert-engineer-avatar" aria-hidden="true">{initialsFor(engineerGroup.engineer)}</span>
                      <div>
                        <span>{group.personal ? 'Destinatário' : 'Engenheiro'}</span>
                        <strong>{engineerGroup.engineer}</strong>
                      </div>
                      <b>{engineerGroup.items.length}</b>
                    </div>
                    {[
                      { key: 'overdue', label: 'Vencidos' },
                      { key: 'upcoming', label: 'Próximos a vencer' },
                    ].map(bucket => {
                      const items = engineerGroup.items.filter(item => item.urgency.bucket === bucket.key);
                      if (items.length === 0) return null;
                      return (
                        <div className={`daily-alert-bucket ${bucket.key}`} key={bucket.key}>
                          <div className="daily-alert-bucket-title">
                            <span>{bucket.label}</span>
                            <b>{items.length}</b>
                          </div>
                          {items.map(item => (
                            <article className="daily-alert-item" key={item.id}>
                              <div className="daily-alert-item-copy">
                                <strong>{item.code}</strong>
                                <span className="daily-alert-description">{item.description}</span>
                                {item.meta && <span className="daily-alert-meta">{item.meta}</span>}
                              </div>
                              <div className="daily-alert-status-panel">
                                <span className={`daily-alert-due ${item.urgency.bucket}`}>
                                  {item.urgency.label} · {formatDate(item.urgency.dueDate)}
                                </span>
                                {group.personal ? (
                                  <span className="daily-alert-personal">Aviso pessoal · sem escalonamento</span>
                                ) : (
                                  <div className="daily-alert-escalations">
                                    {item.escalation.map(status => (
                                      <EscalationBadge key={status.role} status={status} urgency={item.urgency.bucket} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="daily-alert-footer">
          <button type="button" onClick={onClose}>Entendi</button>
        </footer>
      </section>
    </div>
  );
}
