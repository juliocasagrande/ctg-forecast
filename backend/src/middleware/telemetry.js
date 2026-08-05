import { pool } from '../db/schema.js';
import { buildAutomaticAudit, prepareAutomaticAudit } from '../utils/automaticAudit.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let nextAuditCleanupAt = 0;

function normalizeEndpoint(path = '') {
  return path
    .split('?')[0]
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .slice(0, 240);
}

function safeHeader(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : null;
}

function safeChangeDetails(value) {
  if (!Array.isArray(value)) return null;
  const details = value.slice(0, 50).map(item => ({
    field: safeHeader(item?.field, 80),
    label: safeHeader(item?.label, 120),
    old_value: safeAuditValue(item?.old_value),
    new_value: safeAuditValue(item?.new_value),
  })).filter(item => item.field && item.label);
  return details.length ? JSON.stringify(details) : null;
}

function safeAuditValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.slice(0, 2000);
  try { return JSON.stringify(value).slice(0, 2000); }
  catch { return '[valor não serializável]'; }
}

function describeExplicitChange(method, change) {
  const record = change.recordLabel || 'registro';
  const changes = Array.isArray(change.changes) ? change.changes : [];
  if (method === 'POST') return { actionLabel: 'Criação', description: 'Criou ' + record };
  if (method === 'DELETE') return { actionLabel: 'Exclusão', description: 'Excluiu ' + record };
  if (changes.length === 1) {
    return { actionLabel: 'Alteração', description: 'Alterou o campo ' + changes[0].label + ' em ' + record };
  }
  return {
    actionLabel: 'Alteração',
    description: 'Alterou ' + changes.length + (changes.length === 1 ? ' campo em ' : ' campos em ') + record,
  };
}

function cleanupExpiredAuditDetails() {
  const now = Date.now();
  if (now < nextAuditCleanupAt) return;
  nextAuditCleanupAt = now + 60 * 60 * 1000;
  const sql = 'UPDATE app_api_events '
    + 'SET actor_name=NULL, actor_role=NULL, record_label=NULL, change_details=NULL, '
    + 'action_label=NULL, change_description=NULL, audit_visible=false '
    + 'WHERE created_at < NOW() - make_interval(days => 30) AND audit_visible=true';
  pool.query(sql).catch(err => {
    nextAuditCleanupAt = Math.min(nextAuditCleanupAt, Date.now() + 60_000);
    console.error('[TELEMETRY] Falha ao aplicar retenção da auditoria:', err.message);
  });
}

/**
 * Registra o resultado de cada chamada autenticada sem capturar o corpo inteiro, query
 * string ou resposta. Rotas podem fornecer campos funcionais permitidos para auditoria.
 * A gravação acontece depois do envio da resposta e nunca bloqueia o fluxo.
 */
export async function apiTelemetry(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/telemetry')) return next();

  const startedAt = process.hrtime.bigint();
  let automaticContext = { auditable: false };
  try {
    automaticContext = await prepareAutomaticAudit(req, pool);
  } catch (err) {
    console.error('[TELEMETRY] Falha ao preparar auditoria automática:', err.message);
    automaticContext = { auditable: WRITE_METHODS.has(req.method), entity: 'registro' };
  }

  let responseBody = null;
  const sendJson = res.json.bind(res);
  res.json = body => {
    responseBody = body;
    return sendJson(body);
  };

  res.on('finish', () => {
    if (!req.user?.id) return;

    const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
    const method = req.method.toUpperCase();
    const operation = method === 'GET' ? 'read' : WRITE_METHODS.has(method) ? 'write' : 'other';
    let telemetryChange = res.locals.telemetryChange || {};
    if (res.locals.telemetryChange) {
      telemetryChange = { ...describeExplicitChange(method, telemetryChange), ...telemetryChange };
    } else {
      try {
        telemetryChange = buildAutomaticAudit(req, automaticContext, responseBody) || {};
      } catch (err) {
        console.error('[TELEMETRY] Falha ao montar auditoria automática:', err.message);
        telemetryChange = {};
      }
    }

    pool.query(
      `INSERT INTO app_api_events
         (user_id, session_key, page_path, endpoint, method, operation, status_code, duration_ms, success,
          actor_name, actor_role, record_label, change_details, action_label, change_description, audit_visible)
       VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
               $14, $15, $16)`,
      [
        req.user.id,
        safeHeader(req.headers['x-session-id'], 36) || '',
        safeHeader(req.headers['x-app-page'], 240),
        normalizeEndpoint(req.originalUrl),
        method,
        operation,
        res.statusCode,
        Math.max(0, durationMs),
        res.statusCode < 400,
        safeHeader(req.user.name, 240),
        safeHeader(req.user.role, 30),
        safeHeader(telemetryChange.recordLabel, 240),
        safeChangeDetails(telemetryChange.changes),
        safeHeader(telemetryChange.actionLabel, 40),
        safeHeader(telemetryChange.description, 500),
        telemetryChange.excludeFromChangeLog !== true,
      ]
    ).then(cleanupExpiredAuditDetails)
      .catch(err => console.error('[TELEMETRY] Falha ao registrar operação:', err.message));
  });

  next();
}
