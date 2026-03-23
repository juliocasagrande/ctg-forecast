import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole, requireProjectAccess } from '../middleware/auth.js';

const router = Router();
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    const PLANEJADOR_TYPES = ['Budget', 'Actual', 'Meta', 'Pool'];
    for (const e of entries) {
      if (role === 'engenheiro'  && !ENGENHEIRO_TYPES.includes(e.type)) continue;
      if (role === 'planejador'  && !PLANEJADOR_TYPES.includes(e.type)) continue;
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
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Single upsert
router.put('/project/:projectId', requireProjectAccess, async (req, res) => {
  try {
    const { category, type, year, month, value, comment } = req.body;
    const { role, id: userId } = req.user;
    const ENGENHEIRO_TYPES = ['Forecast', 'Actual'];
    const PLANEJADOR_TYPES = ['Budget', 'Actual', 'Meta', 'Pool'];
    const VALID_CATS = ['Viagens', 'Contratos', 'POs'];
    if (role === 'engenheiro' && !ENGENHEIRO_TYPES.includes(type))
      return res.status(403).json({ error: 'Engenheiros só podem editar Forecast e Realizado' });
    if (role === 'planejador' && !PLANEJADOR_TYPES.includes(type))
      return res.status(403).json({ error: 'Planejadores só podem editar Budget, Realizado, Meta e Pool' });
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Batch monthly summary for ALL projects the user can access (Dashboard charts)
router.get('/summaries', async (req, res) => {
  try {
    const { yearStart, yearEnd } = req.query;
    const currentYear = new Date().getFullYear();
    const yrStart = parseInt(yearStart || currentYear);
    const yrEnd   = parseInt(yearEnd   || currentYear);
    const { role, id: userId } = req.user;
    const isEng = role === 'engenheiro';
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dashboard — all projects (filtered by role), supports year range
router.get('/dashboard', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = req.query;
    const currentYear = new Date().getFullYear();
    const yrStart = parseInt(yearStart || year || currentYear);
    const yrEnd   = parseInt(yearEnd   || year || currentYear);
    const { role, id: userId } = req.user;
    const isEng = role === 'engenheiro';
    const joinClause = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id=p.id AND pa.user_id=$3`
      : '';
    const params = isEng ? [yrStart, yrEnd, userId] : [yrStart, yrEnd];
    const r = await pool.query(`
      SELECT p.id, p.code, p.name, p.si_value, p.pool_value, p.plants,
        COALESCE(SUM(CASE WHEN fe.type='Budget'   THEN fe.value ELSE 0 END),0) AS budget,
        COALESCE(SUM(CASE WHEN fe.type='Forecast' THEN fe.value ELSE 0 END),0) AS forecast,
        COALESCE(SUM(CASE WHEN fe.type='Actual'   THEN fe.value ELSE 0 END),0) AS actual,
        COALESCE(SUM(CASE WHEN fe.type='Meta'     THEN fe.value ELSE 0 END),0) AS meta,
        COALESCE(SUM(CASE WHEN fe.type='Pool'     THEN fe.value ELSE 0 END),0) AS pool,
        MAX(fe.updated_at) AS last_forecast_update
      FROM projects p ${joinClause}
      LEFT JOIN forecast_entries fe
        ON fe.project_id=p.id AND fe.year BETWEEN $1 AND $2
      GROUP BY p.id ORDER BY p.code
    `, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/project/:projectId/notes', requireProjectAccess, async (req, res) => {
  try {
    const { note_date, content } = req.body;
    const r = await pool.query(
      'INSERT INTO project_notes (project_id, user_id, note_date, content) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.projectId, req.user.id, note_date, content]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});



// ── Consolidated Actual ──────────────────────────────────────────────────────
router.get('/project/:projectId/actual-consolidated', requireProjectAccess, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM actual_consolidated WHERE project_id=$1', [req.params.projectId]);
    res.json(r.rows[0] || { value: 0, comment: '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/project/:projectId/actual-consolidated', requireProjectAccess, async (req, res) => {
  const { role, id: userId } = req.user;
  if (!['gestor','planejador','admin'].includes(role))
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/forecast/alerts — consolidated alerts for current user
router.get('/alerts', async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const currentYear = new Date().getFullYear();
    // Load configurable threshold
    const cfgRes = await pool.query(
      "SELECT value FROM system_settings WHERE key='alert_stale_days'"
    );
    const staleDays = parseInt(cfgRes.rows[0]?.value || '30');
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleDays);

    // Which projects does this user have access to?
    const isEng = role === 'engenheiro';
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
      GROUP BY p.id
      HAVING MAX(fe.updated_at) < $2
      ORDER BY last_update ASC
    `, staleParams);

    const unreadMap = {};
    unreadRes.rows.forEach(r => { unreadMap[r.project_id] = parseInt(r.unread_count); });

    const totalUnread = Object.values(unreadMap).reduce((s, v) => s + v, 0);

    res.json({
      total: totalUnread + emptyForecastRes.rows.length + staleRes.rows.length,
      unread_messages: {
        count: totalUnread,
        by_project: unreadMap,
      },
      empty_forecast: {
        count: emptyForecastRes.rows.length,
        projects: emptyForecastRes.rows,
      },
      stale_forecast: {
        count: staleRes.rows.length,
        projects: staleRes.rows.map(r => ({
          ...r,
          days_ago: Math.floor((Date.now() - new Date(r.last_update)) / 86400000),
        })),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Polo Consolidado — aggregated by polo → plant → project ──────────────────
router.get('/polo-summary', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = req.query;
    const currentYear = new Date().getFullYear();
    const yrStart = parseInt(yearStart || year || currentYear);
    const yrEnd   = parseInt(yearEnd   || year || currentYear);
    const { role, id: userId } = req.user;

    const isEng = role === 'engenheiro';
    const joinClause = isEng
      ? `INNER JOIN project_assignments pa ON pa.project_id=p.id AND pa.user_id=$3`
      : '';
    const params = [yrStart, yrEnd, userId];

    const r = await pool.query(`
      SELECT
        p.id, p.code, p.name, p.plants,
        COALESCE(fe_agg.budget, 0)   AS budget,
        COALESCE(fe_agg.forecast, 0) AS forecast,
        COALESCE(fe_agg.actual, 0)   AS actual,
        COALESCE(fe_agg.pool, 0)     AS pool,
        eng_agg.engineers,
        (pa_mine.user_id IS NOT NULL) AS is_mine
      FROM projects p
      ${joinClause}
      LEFT JOIN (
        SELECT project_id,
          SUM(CASE WHEN type='Budget'   AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS budget,
          SUM(CASE WHEN type='Forecast' AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS forecast,
          SUM(CASE WHEN type='Actual'   AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS actual,
          SUM(CASE WHEN type='Pool'     AND year BETWEEN $1 AND $2 THEN value ELSE 0 END) AS pool
        FROM forecast_entries GROUP BY project_id
      ) fe_agg ON fe_agg.project_id = p.id
      LEFT JOIN (
        SELECT pa2.project_id, STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name) AS engineers
        FROM project_assignments pa2
        JOIN users u ON u.id = pa2.user_id AND u.role = 'engenheiro'
        GROUP BY pa2.project_id
      ) eng_agg ON eng_agg.project_id = p.id
      LEFT JOIN project_assignments pa_mine ON pa_mine.project_id = p.id AND pa_mine.user_id = $3
      ORDER BY p.code
    `, params);

    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Year Consolidated: Upsert single value ───────────────────────────────────
router.post('/project/:projectId/year-consolidated', requireProjectAccess, async (req, res) => {
  const { role, id: userId } = req.user;
  if (!['planejador', 'admin'].includes(role))
    return res.status(403).json({ error: 'Apenas planejadores podem editar valores consolidados' });
  try {
    const { year, category, type, value, comment } = req.body;
    const r = await pool.query(`
      INSERT INTO year_consolidated (project_id, year, category, type, value, comment, consolidated_by, consolidated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (project_id, year, category, type)
      DO UPDATE SET value=EXCLUDED.value, comment=EXCLUDED.comment,
        consolidated_by=EXCLUDED.consolidated_by, consolidated_at=NOW()
      RETURNING *
    `, [req.params.projectId, year, category, type, parseFloat(value)||0, comment||null, userId]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Year Consolidated: Bulk upsert ───────────────────────────────────────────
router.post('/project/:projectId/year-consolidated/bulk', requireProjectAccess, async (req, res) => {
  const { role, id: userId } = req.user;
  if (!['planejador', 'admin'].includes(role))
    return res.status(403).json({ error: 'Apenas planejadores podem editar valores consolidados' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { entries } = req.body;
    for (const e of entries) {
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
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Close Year: auto-consolidate monthly entries into year_consolidated ───────
router.post('/close-year', requireRole('planejador', 'admin'), async (req, res) => {
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
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ── Get consolidated summaries for all projects (for Dashboard) ──────────────
router.get('/year-consolidated-summaries', async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const isEng = role === 'engenheiro';
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
