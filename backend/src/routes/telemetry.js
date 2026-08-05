import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSessionId(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function safePath(value) {
  if (typeof value !== 'string') return null;
  const path = value.split('?')[0]
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .slice(0, 240);
  return path.startsWith('/') ? path : null;
}

router.use(requireAuth);

router.post('/sessions/start', async (req, res) => {
  const { session_id: sessionId } = req.body || {};
  if (!validSessionId(sessionId)) return res.status(400).json({ error: 'Sessão inválida' });

  try {
    await pool.query(
      `INSERT INTO app_sessions (session_key, user_id, last_page)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_key) DO UPDATE
         SET last_seen_at = NOW(), last_page = EXCLUDED.last_page
       WHERE app_sessions.user_id = EXCLUDED.user_id`,
      [sessionId, req.user.id, safePath(req.body.page_path)]
    );
    res.status(204).end();
  } catch (err) {
    console.error('[TELEMETRY] Falha ao iniciar sessão:', err.message);
    res.status(500).json({ error: 'Falha ao registrar sessão' });
  }
});

router.post('/sessions/heartbeat', async (req, res) => {
  const { session_id: sessionId } = req.body || {};
  const activeSeconds = Math.max(0, Math.min(Number(req.body?.active_seconds) || 0, 86_400));
  if (!validSessionId(sessionId)) return res.status(400).json({ error: 'Sessão inválida' });

  try {
    await pool.query(
      `UPDATE app_sessions
          SET last_seen_at = NOW(), active_seconds = GREATEST(active_seconds, $1),
              last_page = COALESCE($2, last_page)
        WHERE session_key = $3 AND user_id = $4`,
      [Math.round(activeSeconds), safePath(req.body.page_path), sessionId, req.user.id]
    );
    res.status(204).end();
  } catch (err) {
    console.error('[TELEMETRY] Falha no heartbeat:', err.message);
    res.status(500).json({ error: 'Falha ao atualizar sessão' });
  }
});

router.post('/page-views', async (req, res) => {
  const { session_id: sessionId } = req.body || {};
  const pagePath = safePath(req.body?.page_path);
  if (!validSessionId(sessionId) || !pagePath) {
    return res.status(400).json({ error: 'Evento de página inválido' });
  }

  try {
    const result = await pool.query(
      `WITH owned_session AS (
         UPDATE app_sessions
            SET last_seen_at = NOW(), last_page = $1, page_views = page_views + 1
          WHERE session_key = $2 AND user_id = $3
          RETURNING session_key
       )
       INSERT INTO app_page_views (session_key, user_id, page_path)
       SELECT session_key, $3, $1 FROM owned_session`,
      [pagePath, sessionId, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Sessão não encontrada' });
    res.status(204).end();
  } catch (err) {
    console.error('[TELEMETRY] Falha ao registrar página:', err.message);
    res.status(500).json({ error: 'Falha ao registrar página' });
  }
});

router.post('/client-errors', async (req, res) => {
  const sessionId = req.body?.session_id;
  const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 500) : 'Erro sem mensagem';
  const source = ['javascript', 'promise', 'render', 'network'].includes(req.body?.source)
    ? req.body.source
    : 'javascript';

  try {
    await pool.query(
      `INSERT INTO app_client_errors (user_id, session_key, page_path, source, message)
       VALUES ($1, $2::uuid, $3, $4, $5)`,
      [req.user.id, validSessionId(sessionId) ? sessionId : null, safePath(req.body?.page_path), source, message]
    );
    res.status(204).end();
  } catch (err) {
    console.error('[TELEMETRY] Falha ao registrar erro do cliente:', err.message);
    res.status(500).json({ error: 'Falha ao registrar erro' });
  }
});

router.get('/overview', requireRole('admin'), async (req, res) => {
  const requestedDays = Number.parseInt(req.query.days, 10);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;

  try {
    const params = [days];
    const [summaryR, dailyR, pagesR, operationsR, usersR, errorsR] = await Promise.all([
      pool.query(`
        WITH s AS (
          SELECT COUNT(*)::int sessions,
                 COUNT(DISTINCT user_id)::int active_users,
                 COALESCE(AVG(active_seconds), 0)::numeric avg_session_seconds
            FROM app_sessions
           WHERE started_at >= NOW() - make_interval(days => $1)
        ), a AS (
          SELECT COUNT(*)::int requests,
                 COUNT(*) FILTER (WHERE operation='read')::int reads,
                 COUNT(*) FILTER (WHERE operation='write')::int writes,
                 COUNT(*) FILTER (WHERE method='POST' AND success)::int creations,
                 COUNT(*) FILTER (WHERE method IN ('PUT','PATCH') AND success)::int updates,
                 COUNT(*) FILTER (WHERE status_code >= 400)::int errors,
                 COUNT(*) FILTER (WHERE operation='read' AND status_code >= 400)::int read_errors,
                 COUNT(*) FILTER (WHERE operation='write' AND status_code >= 400)::int write_errors,
                 COUNT(*) FILTER (WHERE status_code >= 500)::int server_errors,
                 COALESCE(AVG(duration_ms), 0)::numeric avg_response_ms
            FROM app_api_events
           WHERE created_at >= NOW() - make_interval(days => $1)
        ), p AS (
          SELECT COUNT(*)::int page_views FROM app_page_views
           WHERE created_at >= NOW() - make_interval(days => $1)
        ), c AS (
          SELECT COUNT(*)::int client_errors FROM app_client_errors
           WHERE created_at >= NOW() - make_interval(days => $1)
        )
        SELECT s.*, a.*, p.page_views, c.client_errors,
               CASE WHEN a.requests = 0 THEN 100
                    ELSE ROUND((a.requests - a.errors) * 100.0 / a.requests, 2) END success_rate
          FROM s CROSS JOIN a CROSS JOIN p CROSS JOIN c`, params),
      pool.query(`
        WITH dates AS (
          SELECT generate_series(
            CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day'
          )::date AS day
        ), sessions AS (
          SELECT (started_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
                 COUNT(*)::int sessions, COUNT(DISTINCT user_id)::int users
            FROM app_sessions
           WHERE started_at >= NOW() - make_interval(days => $1)
           GROUP BY 1
        ), views AS (
          SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, COUNT(*)::int views
            FROM app_page_views
           WHERE created_at >= NOW() - make_interval(days => $1)
           GROUP BY 1
        ), api AS (
          SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
                 COUNT(*) FILTER (WHERE operation='write' AND success)::int writes,
                 COUNT(*) FILTER (WHERE status_code >= 400)::int errors
            FROM app_api_events
           WHERE created_at >= NOW() - make_interval(days => $1)
           GROUP BY 1
        )
        SELECT d.day, COALESCE(s.sessions,0) sessions, COALESCE(s.users,0) users,
               COALESCE(v.views,0) views, COALESCE(a.writes,0) writes,
               COALESCE(a.errors,0) errors
          FROM dates d LEFT JOIN sessions s ON s.day = d.day
          LEFT JOIN views v ON v.day = d.day LEFT JOIN api a ON a.day = d.day
         ORDER BY d.day`, params),
      pool.query(`
        SELECT page_path, COUNT(*)::int views, COUNT(DISTINCT user_id)::int users
          FROM app_page_views WHERE created_at >= NOW() - make_interval(days => $1)
         GROUP BY page_path ORDER BY views DESC LIMIT 10`, params),
      pool.query(`
        SELECT COALESCE(page_path, endpoint) page_path,
               COUNT(*) FILTER (WHERE method='POST' AND success)::int creations,
               COUNT(*) FILTER (WHERE method IN ('PUT','PATCH') AND success)::int updates,
               COUNT(*) FILTER (WHERE method='DELETE' AND success)::int deletions,
               COUNT(*) FILTER (WHERE status_code >= 400)::int errors
          FROM app_api_events
         WHERE created_at >= NOW() - make_interval(days => $1) AND operation='write'
         GROUP BY COALESCE(page_path, endpoint) ORDER BY (COUNT(*) FILTER (WHERE success)) DESC LIMIT 12`, params),
      pool.query(`
        WITH session_totals AS (
          SELECT user_id, COUNT(*)::int sessions, COALESCE(SUM(active_seconds),0)::int active_seconds
            FROM app_sessions WHERE started_at >= NOW() - make_interval(days => $1) GROUP BY user_id
        ), view_totals AS (
          SELECT user_id, COUNT(*)::int page_views FROM app_page_views
           WHERE created_at >= NOW() - make_interval(days => $1) GROUP BY user_id
        )
        SELECT u.id, u.name, u.role, COALESCE(s.sessions,0) sessions,
               COALESCE(s.active_seconds,0) active_seconds, COALESCE(v.page_views,0) page_views
          FROM users u LEFT JOIN session_totals s ON s.user_id=u.id
          LEFT JOIN view_totals v ON v.user_id=u.id
         WHERE u.active=true AND (s.user_id IS NOT NULL OR v.user_id IS NOT NULL)
         ORDER BY active_seconds DESC, page_views DESC LIMIT 12`, params),
      pool.query(`
        SELECT * FROM (
          SELECT ae.created_at, u.name user_name, ae.page_path, ae.endpoint,
                 ae.operation source, ae.status_code, NULL::text message
            FROM app_api_events ae LEFT JOIN users u ON u.id=ae.user_id
           WHERE ae.created_at >= NOW() - make_interval(days => $1) AND ae.status_code >= 400
          UNION ALL
          SELECT ce.created_at, u.name user_name, ce.page_path, NULL endpoint,
                 ce.source, NULL::smallint status_code, ce.message
            FROM app_client_errors ce LEFT JOIN users u ON u.id=ce.user_id
           WHERE ce.created_at >= NOW() - make_interval(days => $1)
        ) errors ORDER BY created_at DESC LIMIT 30`, params),
    ]);

    res.json({
      days,
      generated_at: new Date().toISOString(),
      summary: summaryR.rows[0],
      daily: dailyR.rows,
      pages: pagesR.rows,
      operations: operationsR.rows,
      users: usersR.rows,
      errors: errorsR.rows,
    });
  } catch (err) {
    console.error('[TELEMETRY] Falha ao consultar painel:', err.message);
    res.status(500).json({ error: 'Falha ao carregar métricas da aplicação' });
  }
});

export default router;
