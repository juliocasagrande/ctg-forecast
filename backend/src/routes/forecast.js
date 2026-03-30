import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole, requireProjectAccess, denyGerente } from '../middleware/auth.js';

const router = Router();

// Safe error helper
function safeError(res, err) {
  console.error(`[ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}
router.use(requireAuth);

// GET entries for a project
router.get('/project/:projectId', requireProjectAccess, async (req, res) => {
  try {
    const { year } = req.query;
    let q = `SELECT fe.*, u.name AS updated_by_name
      FROM forecast_entries fe
      LEFT JOIN users u ON u.id = fe.updated_by
      WHERE fe.project_id=$1`;
    const p = [req.params.projectId];
    if (year) { q += ' AND fe.year=$2'; p.push(parseInt(year)); }
    q += ' ORDER BY fe.category, fe.type, fe.year, fe.month';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { safeError(res, err); }
});

// Bulk upsert — role-based type restrictions + activity log
router.post('/project/:projectId/bulk', requireProjectAccess, async (req, res) => {
  const { projectId } = req.params;
  const { entries } = req.body;
  const { role, id: userId } = req.user;
  if (!Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ error: 'Nenhuma entrada fornecida' });
  const VALID_CATS = ['Viagens', 'Contratos', 'POs'];
  const VALID_TYPES = ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    const ENGENHEIRO_TYPES = ['Forecast', 'Actual'];
      if (role === 'gerente') return res.status(403).json({ error: 'Gerentes têm acesso somente leitura' });
    const PLANEJADOR_TYPES = ['Budget', 'Actual', 'Meta', 'Pool'];
    for (const e of entries) {
      if (role === 'engenheiro' && !ENGENHEIRO_TYPES.includes(e.type)) continue;
      if (role === 'coordenador' && !['Budget','Forecast','Actual','Meta','Pool'].includes(e.type)) continue;
      if (role === 'planejador'  && !PLANEJADOR_TYPES.includes(e.type)) continue;
      // gestor, coordenador e admin can edit all types
      if (!VALID_CATS.includes(e.category) || !VALID_TYPES.includes(e.type)) continue;
      const month = parseInt(e.month);
      const year = parseInt(e.year);
      if (!month || month < 1 || month > 12 || !year || year < 2020 || year > 2050) continue;
      const val = Math.max(0, parseFloat(e.value) || 0);
      const comment = e.comment ? String(e.comment).slice(0, 500) : null;
      const r = await client.query(`
        INSERT INTO forecast_entries (project_id, category, type, year, month, value, comment, updated_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (project_id, category, type, year, month)
        DO UPDATE SET value=EXCLUDED.value, comment=EXCLUDED.comment,
          updated_by=EXCLUDED.updated_by, updated_at=NOW()
        RETURNING *
      `, [projectId, e.category, e.type, year, month, val, comment, userId]);
      results.push(r.rows[0]);
    }
    await client.query('COMMIT');
    // Activity log
    await pool.query(
      `INSERT INTO project_activity_log (project_id, user_id, role, action, acted_at)
       VALUES ($1,$2,$3,'forecast_update',NOW())`,
      [projectId, userId, role]
    );
    res.json({ count: results.length });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally { client.release(); }
});

// Single upsert
router.put('/project/:projectId', requireProjectAccess, async (req, res) => {
  try {
    const { category, type, year, month, value, comment } = req.body;
    const { role, id: userId } = req.user;
    const ENGENHEIRO_TYPES = ['Forecast', 'Actual'];
      if (role === 'gerente') return res.status(403).json({ error: 'Gerentes têm acesso somente leitura' });
    const PLANEJADOR_TYPES = ['Budget', 'Actual', 'Meta', 'Pool'];
    const VALID_CATS = ['Viagens', 'Contratos', 'POs'];
    if (role === 'engenheiro' && !ENGENHEIRO_TYPES.includes(type))
      return res.status(403).json({ error: 'Engenheiros só podem editar Forecast e Realizado' });
    if (role === 'gerente') return res.status(403).json({ error: 'Gerentes têm acesso somente leitura' });
    if (role === 'planejador' && !PLANEJADOR_TYPES.includes(type))
      return res.status(403).json({ error: 'Planejadores só podem editar Budget, Realizado, Meta e Pool' });
    // gestor, coordenador e admin can edit all types
    if (!VALID_CATS.includes(category))
      return res.status(400).json({ error: 'Categoria inválida' });
    const m = parseInt(month), y = parseInt(year);
    if (!m || m < 1 || m > 12) return res.status(400).json({ error: 'Mês inválido' });
    if (!y || y < 2020 || y > 2050) return res.status(400).json({ error: 'Ano inválido' });
    const val = Math.max(0, parseFloat(value) || 0);
    const cmt = comment ? String(comment).slice(0, 500) : null;

    const r = await pool.query(`
      INSERT INTO forecast_entries (project_id, category, type, year, month, value, comment, updated_by, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (project_id, category, type, year, month)
      DO UPDATE SET value=EXCLUDED.value, comment=EXCLUDED.comment,
        updated_by=EXCLUDED.updated_by, updated_at=NOW()
      RETURNING *
    `, [req.params.projectId, category, type, y, m, val, cmt, userId]);
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// Monthly summary (for dashboard charts)
router.get('/project/:projectId/summary', requireProjectAccess, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT year, month, type, SUM(value) AS total
      FROM forecast_entries WHERE project_id=$1
      GROUP BY year, month, type ORDER BY year, month, type
    `, [req.params.projectId]);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// Batch unread message counts — single query instead of N per-project requests
router.get('/unread-counts', async (req, res) => {
  try {
    const userId = req.user.id;
    const r = await pool.query(`
      SELECT m.project_id, COUNT(*) AS unread
      FROM messages m
      WHERE m.user_id != $1
        AND NOT EXISTS (
          SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $1
        )
      GROUP BY m.project_id
    `, [userId]);
    const map = {};
    r.rows.forEach(row => { map[row.project_id] = parseInt(row.unread); });
    res.json(map);
  } catch (err) { safeError(res, err); }
});

// Batch monthly summary for ALL projects the user can access (Dashboard charts)
router.get('/summaries', async (req, res) => {
  try {
    const { yearStart, yearEnd } = req.query;
    const currentYear = new Date().getFullYear();
    const yrStart = parseInt(yearStart || currentYear);
    const yrEnd   = parseInt(yearEnd   || currentYear);
    const { role, id: userId } = req.user;
    const isEng = role === 'engenheiro'; // gerente vê tudo
    const joinClause = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id=fe.project_id AND pa.user_id=$3`
      : '';
    const params = isEng ? [yrStart, yrEnd, userId] : [yrStart, yrEnd];
    const r = await pool.query(`
      SELECT fe.project_id, fe.year, fe.month, fe.type, SUM(fe.value) AS total
      FROM forecast_entries fe ${joinClause}
      WHERE fe.year BETWEEN $1 AND $2
      GROUP BY fe.project_id, fe.year, fe.month, fe.type
      ORDER BY fe.project_id, fe.year, fe.month, fe.type
    `, params);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// Dashboard — all projects (filtered by role), supports year range
router.get('/dashboard', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = req.query;
    const currentYear = new Date().getFullYear();
    const yrStart = parseInt(yearStart || year || currentYear);
    const yrEnd   = parseInt(yearEnd   || year || currentYear);
    const { role, id: userId, area: userArea } = req.user;
    const isEng  = role === 'engenheiro';
    const isCoord = role === 'coordenador';
    const joinClause = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id=p.id AND pa.user_id=$3`
      : isCoord
        ? `INNER JOIN project_assignments pa ON pa.project_id=p.id
           INNER JOIN users pu ON pu.id=pa.user_id AND pu.role='engenheiro' AND pu.area=$3`
        : '';
    const params = (isEng || isCoord) ? [yrStart, yrEnd, isEng ? userId : (userArea || '')] : [yrStart, yrEnd];

    // Combine forecast_entries + year_consolidated via UNION ALL
    // year_consolidated ALWAYS takes precedence when it exists
    // Rule: Actual consolidated adds to Budget AND Actual; Forecast consolidated adds to Forecast
    const r = await pool.query(`
      SELECT p.id, p.code, p.name, p.si_value, p.pool_value, p.plants,
        COALESCE(SUM(CASE WHEN combined.type='Budget'   THEN combined.value ELSE 0 END),0)
          + COALESCE(SUM(CASE WHEN combined.source='consolidated' AND combined.type='Actual' THEN combined.value ELSE 0 END),0) AS budget,
        COALESCE(SUM(CASE WHEN combined.type='Forecast' THEN combined.value ELSE 0 END),0) AS forecast,
        COALESCE(SUM(CASE WHEN combined.type='Actual'   THEN combined.value ELSE 0 END),0) AS actual,
        COALESCE(SUM(CASE WHEN combined.type='Meta'     THEN combined.value ELSE 0 END),0) AS meta,
        COALESCE(SUM(CASE WHEN combined.type='Pool'     THEN combined.value ELSE 0 END),0) AS pool,
        MAX(combined.updated_at) AS last_forecast_update,
        eng_agg.engineers, eng_agg.engineer_initials
      FROM projects p ${joinClause}
      LEFT JOIN (
        SELECT fe.project_id, fe.type, fe.value, fe.updated_at, 'entries' AS source
        FROM forecast_entries fe
        WHERE fe.year BETWEEN $1 AND $2
          AND NOT EXISTS (
            SELECT 1 FROM year_consolidated yc2
            WHERE yc2.project_id = fe.project_id
              AND yc2.year = fe.year
              AND (yc2.type = fe.type OR (yc2.type = 'Actual' AND yc2.category = 'Total' AND fe.type = 'Actual'))
              AND yc2.value > 0
          )
        UNION ALL
        SELECT yc.project_id, yc.type, yc.value, yc.consolidated_at AS updated_at, 'consolidated' AS source
        FROM year_consolidated yc
        WHERE yc.year BETWEEN $1 AND $2 AND yc.value > 0
      ) combined ON combined.project_id = p.id
      LEFT JOIN (
        SELECT pa.project_id,
          STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) AS engineers,
          STRING_AGG(DISTINCT u.avatar_initials, ', ' ORDER BY u.avatar_initials) AS engineer_initials
        FROM project_assignments pa
        JOIN users u ON u.id = pa.user_id AND u.role = 'engenheiro'
        GROUP BY pa.project_id
      ) eng_agg ON eng_agg.project_id = p.id
      GROUP BY p.id, eng_agg.engineers, eng_agg.engineer_initials
      ORDER BY p.code
    `, params);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// Notes
router.get('/project/:projectId/notes', requireProjectAccess, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT pn.*, u.name AS user_name, u.avatar_initials
      FROM project_notes pn LEFT JOIN users u ON u.id=pn.user_id
      WHERE pn.project_id=$1 ORDER BY pn.note_date DESC, pn.created_at DESC
    `, [req.params.projectId]);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

router.post('/project/:projectId/notes', requireProjectAccess, async (req, res) => {
  try {
    const { note_date, content } = req.body;
    const r = await pool.query(
      'INSERT INTO project_notes (project_id, user_id, note_date, content) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.projectId, req.user.id, note_date, content]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});



// ── Consolidated Actual ──────────────────────────────────────────────────────
router.get('/project/:projectId/actual-consolidated', requireProjectAccess, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM actual_consolidated WHERE project_id=$1', [req.params.projectId]);
    res.json(r.rows[0] || { value: 0, comment: '' });
  } catch (err) { safeError(res, err); }
});

router.post('/project/:projectId/actual-consolidated', requireProjectAccess, async (req, res) => {
  const { role, id: userId } = req.user;
  if (!['gestor','coordenador','planejador','admin'].includes(role))
    return res.status(403).json({ error: 'Sem permissão' });
  try {
    const { value, comment } = req.body;
    const r = await pool.query(`
      INSERT INTO actual_consolidated (project_id, value, comment, updated_by, updated_at)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (project_id) DO UPDATE
        SET value=$2, comment=$3, updated_by=$4, updated_at=NOW()
      RETURNING *
    `, [req.params.projectId, value||0, comment||'', userId]);
    await pool.query(
      `INSERT INTO project_activity_log (project_id,user_id,role,action,acted_at) VALUES ($1,$2,$3,'actual_consolidated',NOW())`,
      [req.params.projectId, userId, role]
    );
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// ── Check-in ─────────────────────────────────────────────────────────────────
router.post('/project/:projectId/checkin', requireProjectAccess, async (req, res) => {
  const { id: userId, role } = req.user;
  try {
    const r = await pool.query(
      `INSERT INTO project_checkins (project_id,user_id,checked_at) VALUES ($1,$2,NOW()) RETURNING *`,
      [req.params.projectId, userId]
    );
    await pool.query(
      `INSERT INTO project_activity_log (project_id,user_id,role,action,acted_at) VALUES ($1,$2,$3,'checkin',NOW())`,
      [req.params.projectId, userId, role]
    );
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// ── Activity log — last update per role ──────────────────────────────────────
router.get('/project/:projectId/activity', requireProjectAccess, async (req, res) => {
  try {
    const pid = req.params.projectId;
    const forecastR = await pool.query(`
      SELECT u.role, u.name AS user_name, MAX(fe.updated_at) AS last_at
      FROM forecast_entries fe INNER JOIN users u ON u.id=fe.updated_by
      WHERE fe.project_id=$1 GROUP BY u.role, u.name ORDER BY last_at DESC
    `, [pid]);
    const checkinR = await pool.query(`
      SELECT DISTINCT ON (u.role) u.role, u.name AS user_name, pc.checked_at AS last_at, 'checkin' AS action
      FROM project_checkins pc INNER JOIN users u ON u.id=pc.user_id
      WHERE pc.project_id=$1 ORDER BY u.role, pc.checked_at DESC
    `, [pid]);
    const consolidatedR = await pool.query(`
      SELECT u.role, u.name AS user_name, ac.updated_at AS last_at, 'actual_consolidated' AS action
      FROM actual_consolidated ac INNER JOIN users u ON u.id=ac.updated_by
      WHERE ac.project_id=$1
    `, [pid]);
    res.json({ forecast: forecastR.rows, checkins: checkinR.rows, consolidated: consolidatedR.rows });
  } catch (err) { safeError(res, err); }
});

// ── Notes CRUD ────────────────────────────────────────────────────────────────
router.put('/notes/:noteId', async (req, res) => {
  const { id: userId, role } = req.user;
  try {
    const noteR = await pool.query('SELECT * FROM project_notes WHERE id=$1', [req.params.noteId]);
    if (!noteR.rows.length) return res.status(404).json({ error: 'Nota não encontrada' });
    const note = noteR.rows[0];
    if (note.user_id !== userId && !['gestor','planejador','admin'].includes(role))
      return res.status(403).json({ error: 'Sem permissão' });
    const r = await pool.query(
      `UPDATE project_notes SET content=$1, note_date=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [req.body.content, req.body.note_date || note.note_date, req.params.noteId]
    );
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

router.delete('/notes/:noteId', async (req, res) => {
  const { id: userId, role } = req.user;
  try {
    const noteR = await pool.query('SELECT * FROM project_notes WHERE id=$1', [req.params.noteId]);
    if (!noteR.rows.length) return res.status(404).json({ error: 'Nota não encontrada' });
    const note = noteR.rows[0];
    if (note.user_id !== userId && !['gestor','planejador','admin'].includes(role))
      return res.status(403).json({ error: 'Sem permissão' });
    await pool.query('DELETE FROM project_notes WHERE id=$1', [req.params.noteId]);
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/forecast/alerts — consolidated alerts for current user
router.get('/alerts', async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const isManager = ['gestor','planejador','admin'].includes(role);

    // Load configurable thresholds
    const cfgRes = await pool.query(
      "SELECT key, value FROM system_settings WHERE key IN ('alert_stale_days','actual_deadline_business_day')"
    );
    const cfg = {};
    cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
    const staleDays = parseInt(cfg.alert_stale_days || '30');
    const deadlineBizDay = parseInt(cfg.actual_deadline_business_day || '6');
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleDays);

    // Helper: get the Nth business day of a given year/month
    function getNthBusinessDay(year, month, n) {
      let count = 0;
      for (let d = 1; d <= 31; d++) {
        const date = new Date(year, month - 1, d);
        if (date.getMonth() !== month - 1) break;
        const dow = date.getDay();
        if (dow !== 0 && dow !== 6) count++;
        if (count === n) return date;
      }
      return null;
    }

    const deadlineDate = getNthBusinessDay(currentYear, currentMonth, deadlineBizDay);
    const isPastDeadline = deadlineDate && now >= deadlineDate;

    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear  = currentMonth === 1 ? currentYear - 1 : currentYear;

    // Load user's dismissed alerts
    const dismissedRes = await pool.query(
      'SELECT alert_type, alert_key FROM alert_dismissals WHERE user_id=$1',
      [userId]
    );
    const dismissed = new Set(dismissedRes.rows.map(r => `${r.alert_type}|${r.alert_key}`));
    const isDismissed = (type, key) => dismissed.has(`${type}|${key}`);

    const isEng = role === 'engenheiro'; // gerente vê tudo
    const projJoin = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id = p.id AND pa.user_id = $2`
      : '';
    const projParams = isEng ? [currentYear, userId] : [currentYear];

    // 1. Unread messages per project
    const unreadRes = await pool.query(`
      SELECT m.project_id, COUNT(*) AS unread_count
      FROM messages m
      ${isEng
        ? `INNER JOIN project_assignments pa ON pa.project_id = m.project_id AND pa.user_id = $1`
        : `INNER JOIN projects p ON p.id = m.project_id`}
      WHERE m.user_id != $1
        AND NOT EXISTS (
          SELECT 1 FROM message_reads mr
          WHERE mr.message_id = m.id AND mr.user_id = $1
        )
      GROUP BY m.project_id
    `, [userId]);

    // 2. Projects with zero Forecast entries for current year
    const emptyForecastRes = await pool.query(`
      SELECT p.id, p.code, p.name
      FROM projects p ${projJoin}
      WHERE NOT EXISTS (
        SELECT 1 FROM forecast_entries fe
        WHERE fe.project_id = p.id
          AND fe.type = 'Forecast'
          AND fe.year = $1
          AND fe.value > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM project_checkins pc
        WHERE pc.project_id = p.id
          AND pc.checked_at >= date_trunc('month', CURRENT_DATE)
      )
      ORDER BY p.code
    `, projParams);

    // 3. Projects with no Forecast update in last N days
    const staleParams = isEng ? [currentYear, staleDate.toISOString(), userId] : [currentYear, staleDate.toISOString()];
    const staleJoin = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id = p.id AND pa.user_id = $3`
      : '';
    const staleRes = await pool.query(`
      SELECT p.id, p.code, p.name,
        MAX(fe.updated_at) AS last_update
      FROM projects p ${staleJoin}
      INNER JOIN forecast_entries fe ON fe.project_id = p.id
        AND fe.type = 'Forecast'
        AND fe.year = $1
        AND fe.value > 0
      WHERE NOT EXISTS (
        SELECT 1 FROM project_checkins pc
        WHERE pc.project_id = p.id
          AND pc.checked_at >= date_trunc('month', CURRENT_DATE)
      )
      GROUP BY p.id
      HAVING MAX(fe.updated_at) < $2
      ORDER BY last_update ASC
    `, staleParams);

    // 4. Projects with missing Actual for previous month (only if past deadline)
    let pendingActualRows = [];
    if (isPastDeadline) {
      if (isManager) {
        // For managers: get pending actual grouped by engineer
        const paRes = await pool.query(`
          SELECT p.id AS project_id, p.code, p.name,
                 u.id AS engineer_id, u.name AS engineer_name, u.avatar_initials
          FROM projects p
          INNER JOIN project_assignments pa2 ON pa2.project_id = p.id
          INNER JOIN users u ON u.id = pa2.user_id AND u.role = 'engenheiro'
          WHERE NOT EXISTS (
            SELECT 1 FROM forecast_entries fe
            WHERE fe.project_id = p.id
              AND fe.type = 'Actual'
              AND fe.year = $1
              AND fe.month = $2
              AND fe.value > 0
          )
          AND NOT EXISTS (
            SELECT 1 FROM project_checkins pc
            WHERE pc.project_id = p.id
              AND pc.checked_at >= date_trunc('month', CURRENT_DATE)
          )
          ORDER BY u.name, p.code
        `, [prevYear, prevMonth]);
        pendingActualRows = paRes.rows;
      } else {
        // For engineers: same as before
        const paJoin = `INNER JOIN project_assignments pa ON pa.project_id = p.id AND pa.user_id = $3`;
        const paRes = await pool.query(`
          SELECT p.id, p.code, p.name
          FROM projects p ${paJoin}
          WHERE NOT EXISTS (
            SELECT 1 FROM forecast_entries fe
            WHERE fe.project_id = p.id
              AND fe.type = 'Actual'
              AND fe.year = $1
              AND fe.month = $2
              AND fe.value > 0
          )
          AND NOT EXISTS (
            SELECT 1 FROM project_checkins pc
            WHERE pc.project_id = p.id
              AND pc.checked_at >= date_trunc('month', CURRENT_DATE)
          )
          ORDER BY p.code
        `, [prevYear, prevMonth, userId]);
        pendingActualRows = paRes.rows.map(r => ({ ...r, project_id: r.id }));
      }
    }

    // Apply dismiss filters
    const unreadMap = {};
    unreadRes.rows.forEach(r => {
      if (!isDismissed('unread', String(r.project_id)))
        unreadMap[r.project_id] = parseInt(r.unread_count);
    });
    const totalUnread = Object.values(unreadMap).reduce((s, v) => s + v, 0);

    const emptyForecast = emptyForecastRes.rows.filter(p => !isDismissed('empty_forecast', String(p.id)));
    const staleForecast = staleRes.rows.filter(p => !isDismissed('stale_forecast', String(p.id)));

    // Build pending actual response
    let pendingActualResponse;
    if (isManager && isPastDeadline) {
      // Group by engineer for managers, apply dismiss
      const byEngineer = {};
      for (const row of pendingActualRows) {
        const key = `${row.project_id}|${row.engineer_id}`;
        if (isDismissed('pending_actual', key)) continue;
        if (!byEngineer[row.engineer_id]) {
          byEngineer[row.engineer_id] = {
            engineer_id: row.engineer_id,
            engineer_name: row.engineer_name,
            avatar_initials: row.avatar_initials,
            projects: [],
          };
        }
        byEngineer[row.engineer_id].projects.push({
          id: row.project_id,
          code: row.code,
          name: row.name,
        });
      }
      const groups = Object.values(byEngineer);
      const totalPending = groups.reduce((s, g) => s + g.projects.length, 0);
      pendingActualResponse = {
        count: totalPending,
        by_engineer: groups,
        projects: groups.flatMap(g => g.projects), // flat list for backward compat
      };
    } else {
      const filtered = pendingActualRows.filter(p => !isDismissed('pending_actual', String(p.project_id || p.id)));
      pendingActualResponse = {
        count: filtered.length,
        projects: filtered.map(r => ({ id: r.project_id || r.id, code: r.code, name: r.name })),
      };
    }

    const MONTHS_PT = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    res.json({
      total: totalUnread + emptyForecast.length + staleForecast.length + pendingActualResponse.count,
      unread_messages: {
        count: totalUnread,
        by_project: unreadMap,
      },
      empty_forecast: {
        count: emptyForecast.length,
        projects: emptyForecast,
      },
      stale_forecast: {
        count: staleForecast.length,
        projects: staleForecast.map(r => ({
          ...r,
          days_ago: Math.floor((Date.now() - new Date(r.last_update)) / 86400000),
        })),
      },
      pending_actual: {
        ...pendingActualResponse,
        month_label: MONTHS_PT[prevMonth],
        month: prevMonth,
        year: prevYear,
        deadline_business_day: deadlineBizDay,
        is_past_deadline: isPastDeadline,
      },
    });
  } catch (err) { safeError(res, err); }
});

// ── Dismiss an alert ─────────────────────────────────────────────────────────
router.post('/alerts/dismiss', async (req, res) => {
  try {
    const { alert_type, alert_key } = req.body;
    if (!alert_type || !alert_key) return res.status(400).json({ error: 'alert_type e alert_key obrigatórios' });
    await pool.query(`
      INSERT INTO alert_dismissals (user_id, alert_type, alert_key)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, alert_type, alert_key) DO NOTHING
    `, [req.user.id, alert_type, String(alert_key)]);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// ── Polo Consolidado — aggregated by polo → plant → project ──────────────────
router.get('/polo-summary', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = req.query;
    const currentYear = new Date().getFullYear();
    const yrStart = parseInt(yearStart || year || currentYear);
    const yrEnd   = parseInt(yearEnd   || year || currentYear);
    const { role, id: userId, area: userArea } = req.user;

    // polo-summary: engenheiro vê só seus projetos, coordenador vê projetos da sua área
    // gerente/gestor/admin/planejador: vê tudo (sem filtro de join)
    const isEng   = role === 'engenheiro';
    const isCoord = role === 'coordenador';

    // $3 = filter value (userId for eng, userArea for coord); $4 = userId for pa_mine
    const joinClause = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id=p.id AND pa.user_id=$3`
      : isCoord
        ? `INNER JOIN project_assignments pa ON pa.project_id=p.id
           INNER JOIN users pu ON pu.id=pa.user_id AND pu.role='engenheiro' AND pu.area=$3`
        : '';
    const filterVal = isEng ? userId : (isCoord ? (userArea || '') : null);
    const params = filterVal !== null ? [yrStart, yrEnd, filterVal, userId] : [yrStart, yrEnd, userId];
    const mineParam = filterVal !== null ? '$4' : '$3';

    // Main aggregation — budget/forecast/actual/pool totals
    const r = await pool.query(`
      SELECT
        p.id, p.code, p.name, p.plants,
        COALESCE(SUM(CASE WHEN combined.type='Budget' THEN combined.value ELSE 0 END),0)
          + COALESCE(SUM(CASE WHEN combined.source='consolidated' AND combined.type='Actual' THEN combined.value ELSE 0 END),0) AS budget,
        COALESCE(SUM(CASE WHEN combined.type='Forecast' THEN combined.value ELSE 0 END),0) AS forecast,
        COALESCE(SUM(CASE WHEN combined.type='Actual'   THEN combined.value ELSE 0 END),0) AS actual,
        COALESCE(SUM(CASE WHEN combined.type='Pool'     THEN combined.value ELSE 0 END),0) AS pool,
        eng_agg.engineers,
        (pa_mine.user_id IS NOT NULL) AS is_mine
      FROM projects p
      ${joinClause}
      LEFT JOIN (
        SELECT fe.project_id, fe.type, fe.value, 'entries' AS source FROM forecast_entries fe
        WHERE fe.year BETWEEN $1 AND $2
          AND NOT EXISTS (
            SELECT 1 FROM year_consolidated yc2
            WHERE yc2.project_id = fe.project_id
              AND yc2.year = fe.year
              AND (yc2.type = fe.type OR (yc2.type = 'Actual' AND yc2.category = 'Total' AND fe.type = 'Actual'))
              AND yc2.value > 0
          )
        UNION ALL
        SELECT yc.project_id, yc.type, yc.value, 'consolidated' AS source FROM year_consolidated yc
        WHERE yc.year BETWEEN $1 AND $2 AND yc.value > 0
      ) combined ON combined.project_id = p.id
      LEFT JOIN (
        SELECT pa2.project_id, STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) AS engineers
        FROM project_assignments pa2
        JOIN users u ON u.id = pa2.user_id AND u.role = 'engenheiro'
        GROUP BY pa2.project_id
      ) eng_agg ON eng_agg.project_id = p.id
      LEFT JOIN project_assignments pa_mine ON pa_mine.project_id = p.id AND pa_mine.user_id = ${mineParam}
      GROUP BY p.id, p.code, p.name, p.plants, eng_agg.engineers, pa_mine.user_id
      ORDER BY p.code
    `, params);

    // Calculate act_forecast per project using monthly data
    // Logic: for each month, use Actual if > 0, else use Forecast
    const monthlyRes = await pool.query(`
      SELECT project_id, year, month, type, SUM(value) AS total
      FROM forecast_entries
      WHERE year BETWEEN $1 AND $2 AND type IN ('Actual','Forecast')
      GROUP BY project_id, year, month, type
    `, [yrStart, yrEnd]);

    // Also get consolidated totals per project (for years without monthly breakdown)
    const consRes = await pool.query(`
      SELECT project_id, type, SUM(value) AS total
      FROM year_consolidated
      WHERE year BETWEEN $1 AND $2 AND value > 0 AND type IN ('Actual','Forecast')
      GROUP BY project_id, type
    `, [yrStart, yrEnd]);

    // Build monthly lookup: { projectId: { "year-month": { Actual, Forecast } } }
    const monthlyLookup = {};
    for (const row of monthlyRes.rows) {
      const pid = row.project_id;
      const key = `${row.year}-${row.month}`;
      if (!monthlyLookup[pid]) monthlyLookup[pid] = {};
      if (!monthlyLookup[pid][key]) monthlyLookup[pid][key] = {};
      monthlyLookup[pid][key][row.type] = parseFloat(row.total) || 0;
    }

    // Build consolidated lookup: { projectId: { Actual, Forecast } }
    const consLookup = {};
    for (const row of consRes.rows) {
      if (!consLookup[row.project_id]) consLookup[row.project_id] = {};
      consLookup[row.project_id][row.type] = (consLookup[row.project_id][row.type] || 0) + (parseFloat(row.total) || 0);
    }

    // Calculate act_forecast for each project
    const projects = r.rows.map(p => {
      let actForecast = 0;
      const months = monthlyLookup[p.id] || {};
      const monthKeys = Object.keys(months);

      if (monthKeys.length > 0) {
        // Has monthly data — per-month logic
        for (const key of monthKeys) {
          const actual = months[key].Actual || 0;
          const forecast = months[key].Forecast || 0;
          actForecast += actual > 0 ? actual : forecast;
        }
        // Add any months that only have Forecast but no entry at all for Actual
        // (already handled above since both types share same keys)
      }

      // Add consolidated values for years that don't have monthly data
      const cons = consLookup[p.id] || {};
      const monthlyActualTotal = monthKeys.reduce((s, k) => s + (months[k].Actual || 0), 0);
      const monthlyForecastTotal = monthKeys.reduce((s, k) => s + (months[k].Forecast || 0), 0);
      const projActual = parseFloat(p.actual) || 0;
      const projForecast = parseFloat(p.forecast) || 0;

      // If project totals are larger than monthly sums, the difference is from consolidated
      const consActualDiff = projActual - monthlyActualTotal;
      const consForecastDiff = projForecast - monthlyForecastTotal;
      if (consActualDiff > 0) actForecast += consActualDiff;
      else if (consForecastDiff > 0 && consActualDiff <= 0) actForecast += consForecastDiff;

      return { ...p, act_forecast: actForecast };
    });

    res.json(projects);
  } catch (err) { safeError(res, err); }
});

// ── Year Consolidated: GET for a project ─────────────────────────────────────
router.get('/project/:projectId/year-consolidated', requireProjectAccess, async (req, res) => {
  try {
    const { year } = req.query;
    let q = 'SELECT * FROM year_consolidated WHERE project_id=$1';
    const p = [req.params.projectId];
    if (year) { q += ' AND year=$2'; p.push(parseInt(year)); }
    q += ' ORDER BY year, category, type';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { safeError(res, err); }
});

// ── Year Consolidated: Upsert single value ───────────────────────────────────
router.post('/project/:projectId/year-consolidated', requireProjectAccess, async (req, res) => {
  const { role, id: userId } = req.user;
  const { year, category, type, value, comment } = req.body;
  // Engenheiros can only save Forecast and Actual consolidated
  const ENGENHEIRO_CONS_TYPES = ['Forecast', 'Actual'];
  if (role === 'engenheiro' && !ENGENHEIRO_CONS_TYPES.includes(type))
    return res.status(403).json({ error: 'Engenheiros só podem editar Forecast e Realizado consolidado' });
  if (!['gestor', 'planejador', 'admin', 'engenheiro'].includes(role))
    return res.status(403).json({ error: 'Sem permissão para editar valores consolidados' });
  try {
    const r = await pool.query(`
      INSERT INTO year_consolidated (project_id, year, category, type, value, comment, consolidated_by, consolidated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (project_id, year, category, type)
      DO UPDATE SET value=EXCLUDED.value, comment=EXCLUDED.comment,
        consolidated_by=EXCLUDED.consolidated_by, consolidated_at=NOW()
      RETURNING *
    `, [req.params.projectId, year, category, type, parseFloat(value)||0, comment||null, userId]);
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// ── Year Consolidated: Bulk upsert ───────────────────────────────────────────
router.post('/project/:projectId/year-consolidated/bulk', requireProjectAccess, async (req, res) => {
  const { role, id: userId } = req.user;
  // Engenheiros can only save Forecast and Actual consolidated
  const ENGENHEIRO_CONS_TYPES = ['Forecast', 'Actual'];
  if (!['gestor', 'planejador', 'admin', 'engenheiro'].includes(role))
    return res.status(403).json({ error: 'Sem permissão para editar valores consolidados' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { entries } = req.body;
    for (const e of entries) {
      // Skip types the engenheiro can't edit
      if (role === 'engenheiro' && !ENGENHEIRO_CONS_TYPES.includes(e.type)) continue;
      await client.query(`
        INSERT INTO year_consolidated (project_id, year, category, type, value, comment, consolidated_by, consolidated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
        ON CONFLICT (project_id, year, category, type)
        DO UPDATE SET value=EXCLUDED.value, comment=EXCLUDED.comment,
          consolidated_by=EXCLUDED.consolidated_by, consolidated_at=NOW()
      `, [req.params.projectId, e.year, e.category, e.type, parseFloat(e.value)||0, e.comment||null, userId]);
    }
    await client.query('COMMIT');
    res.json({ count: entries.length });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally { client.release(); }
});

// ── Close Year: auto-consolidate monthly entries into year_consolidated ───────
router.post('/close-year', requireRole('gestor', 'planejador', 'admin'), async (req, res) => {
  const { year } = req.body;
  const { id: userId } = req.user;
  if (!year) return res.status(400).json({ error: 'Ano obrigatório' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Sum all monthly entries by project+category+type for the given year
    const sumRes = await client.query(`
      SELECT project_id, category, type, SUM(value) AS total
      FROM forecast_entries
      WHERE year = $1
      GROUP BY project_id, category, type
    `, [year]);

    let count = 0;
    for (const row of sumRes.rows) {
      await client.query(`
        INSERT INTO year_consolidated (project_id, year, category, type, value, comment, consolidated_by, consolidated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (project_id, year, category, type)
        DO UPDATE SET value = EXCLUDED.value, comment = EXCLUDED.comment,
          consolidated_by = EXCLUDED.consolidated_by, consolidated_at = NOW()
      `, [row.project_id, year, row.category, row.type, parseFloat(row.total)||0,
          `Consolidado automaticamente em ${new Date().toLocaleDateString('pt-BR')}`, userId]);
      count++;
    }

    // Optionally delete monthly entries for the closed year (keep data clean)
    // await client.query('DELETE FROM forecast_entries WHERE year = $1', [year]);

    await client.query('COMMIT');
    res.json({ success: true, consolidated: count, year });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally { client.release(); }
});

// ── Get consolidated summaries for all projects (for Dashboard) ──────────────
router.get('/year-consolidated-summaries', async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const isEng = role === 'engenheiro'; // gerente vê tudo
    const joinClause = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id=yc.project_id AND pa.user_id=$1`
      : '';
    const params = isEng ? [userId] : [];
    const r = await pool.query(`
      SELECT yc.project_id, yc.year, yc.category, yc.type, yc.value
      FROM year_consolidated yc ${joinClause}
      ORDER BY yc.project_id, yc.year, yc.category, yc.type
    `, params);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

export default router;