import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole, requireProjectAccess } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET entries for a project
router.get('/project/:projectId', requireProjectAccess, async (req, res) => {
  try {
    const { year } = req.query;
    let q = 'SELECT * FROM forecast_entries WHERE project_id=$1';
    const p = [req.params.projectId];
    if (year) { q += ' AND year=$2'; p.push(parseInt(year)); }
    q += ' ORDER BY category, type, year, month';
    res.json((await pool.query(q, p)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk upsert — engenheiro can only update Forecast; gestor/admin can update all
router.post('/project/:projectId/bulk', requireProjectAccess, async (req, res) => {
  const { projectId } = req.params;
  const { entries } = req.body;
  const { role, id: userId } = req.user;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const e of entries) {
      // Role-based type restrictions
      if (role === 'engenheiro' && e.type !== 'Forecast') continue;
      if (role === 'planejador' && e.type !== 'Budget') continue;
      const r = await client.query(`
        INSERT INTO forecast_entries (project_id, category, type, year, month, value, comment, updated_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (project_id, category, type, year, month)
        DO UPDATE SET value=EXCLUDED.value, comment=EXCLUDED.comment,
          updated_by=EXCLUDED.updated_by, updated_at=NOW()
        RETURNING *
      `, [projectId, e.category, e.type, e.year, e.month, e.value||0, e.comment||null, userId]);
      results.push(r.rows[0]);
    }
    await client.query('COMMIT');
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
    if (role === 'engenheiro' && type !== 'Forecast')
      return res.status(403).json({ error: 'Engenheiros só podem editar Forecast' });
    if (role === 'planejador' && type !== 'Budget')
      return res.status(403).json({ error: 'Planejadores só podem editar Budget' });

    const r = await pool.query(`
      INSERT INTO forecast_entries (project_id, category, type, year, month, value, comment, updated_by, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (project_id, category, type, year, month)
      DO UPDATE SET value=EXCLUDED.value, comment=EXCLUDED.comment,
        updated_by=EXCLUDED.updated_by, updated_at=NOW()
      RETURNING *
    `, [req.params.projectId, category, type, year, month, value||0, comment||null, userId]);
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

// Dashboard — all projects (filtered by role), supports year range
router.get('/dashboard', async (req, res) => {
  try {
    const { year, yearStart, yearEnd } = req.query;
    const currentYear = new Date().getFullYear();
    const yrStart = parseInt(yearStart || year || currentYear);
    const yrEnd   = parseInt(yearEnd   || year || currentYear);
    const { role, id: userId } = req.user;
    const joinClause = role === 'engenheiro'
      ? `INNER JOIN project_assignments pa ON pa.project_id=p.id AND pa.user_id=${userId}`
      : '';
    const r = await pool.query(`
      SELECT p.id, p.code, p.name, p.si_value, p.pool_value, p.plants,
        COALESCE(SUM(CASE WHEN fe.type='Budget'   THEN fe.value ELSE 0 END),0) AS budget,
        COALESCE(SUM(CASE WHEN fe.type='Forecast' THEN fe.value ELSE 0 END),0) AS forecast,
        COALESCE(SUM(CASE WHEN fe.type='Actual'   THEN fe.value ELSE 0 END),0) AS actual
      FROM projects p ${joinClause}
      LEFT JOIN forecast_entries fe
        ON fe.project_id=p.id AND fe.year BETWEEN $1 AND $2
      GROUP BY p.id ORDER BY p.code
    `, [yrStart, yrEnd]);
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

router.delete('/notes/:noteId', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    await pool.query('DELETE FROM project_notes WHERE id=$1', [req.params.noteId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;

// GET /api/forecast/alerts — consolidated alerts for current user
router.get('/alerts', async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const currentYear = new Date().getFullYear();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Which projects does this user have access to?
    const projFilter = role === 'engenheiro'
      ? `INNER JOIN project_assignments pa ON pa.project_id = p.id AND pa.user_id = ${userId}`
      : '';

    // 1. Unread messages per project
    const unreadRes = await pool.query(`
      SELECT m.project_id, COUNT(*) AS unread_count
      FROM messages m
      ${role === 'engenheiro'
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
      FROM projects p ${projFilter}
      WHERE NOT EXISTS (
        SELECT 1 FROM forecast_entries fe
        WHERE fe.project_id = p.id
          AND fe.type = 'Forecast'
          AND fe.year = $1
          AND fe.value > 0
      )
      ORDER BY p.code
    `, [currentYear]);

    // 3. Projects with no Forecast update in last 30 days
    const staleRes = await pool.query(`
      SELECT p.id, p.code, p.name,
        MAX(fe.updated_at) AS last_update
      FROM projects p ${projFilter}
      INNER JOIN forecast_entries fe ON fe.project_id = p.id
        AND fe.type = 'Forecast'
        AND fe.year = $1
        AND fe.value > 0
      GROUP BY p.id
      HAVING MAX(fe.updated_at) < $2
      ORDER BY last_update ASC
    `, [currentYear, thirtyDaysAgo.toISOString()]);

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
