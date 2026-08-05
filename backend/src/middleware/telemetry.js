import { pool } from '../db/schema.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

/**
 * Registra o resultado de cada chamada autenticada sem capturar corpo, query string
 * ou resposta. A gravação acontece depois do envio da resposta e nunca bloqueia o fluxo.
 */
export function apiTelemetry(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/telemetry')) return next();

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    if (!req.user?.id) return;

    const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
    const method = req.method.toUpperCase();
    const operation = method === 'GET' ? 'read' : WRITE_METHODS.has(method) ? 'write' : 'other';

    pool.query(
      `INSERT INTO app_api_events
         (user_id, session_key, page_path, endpoint, method, operation, status_code, duration_ms, success)
       VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8, $9)`,
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
      ]
    ).catch(err => console.error('[TELEMETRY] Falha ao registrar operação:', err.message));
  });

  next();
}

