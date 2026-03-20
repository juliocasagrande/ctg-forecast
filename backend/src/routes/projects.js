import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole, requireProjectAccess } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/projects — filtered by role
router.get('/', async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    let query, params = [];
    if (role === 'admin' || role === 'gestor' || role === 'planejador') {
      query = `
        SELECT p.*,
          COALESCE(SUM(CASE WHEN fe.type='Budget' THEN fe.value ELSE 0 END),0) AS total_budget,
          COALESCE(SUM(CASE WHEN fe.type='Forecast' THEN fe.value ELSE 0 END),0) AS total_forecast,
          COALESCE(SUM(CASE WHEN fe.type='Actual' THEN fe.value ELSE 0 END),0) AS total_actual,
          (SELECT COUNT(*) FROM project_assignments pa WHERE pa.project_id = p.id) AS engineer_count,
          (SELECT COUNT(*) FROM messages m WHERE m.project_id = p.id) AS message_count
        FROM projects p
        LEFT JOIN forecast_entries fe ON fe.project_id = p.id
        GROUP BY p.id ORDER BY p.code`;
    } else {
      query = `
        SELECT p.*,
          COALESCE(SUM(CASE WHEN fe.type='Budget' THEN fe.value ELSE 0 END),0) AS total_budget,
          COALESCE(SUM(CASE WHEN fe.type='Forecast' THEN fe.value ELSE 0 END),0) AS total_forecast,
          COALESCE(SUM(CASE WHEN fe.type='Actual' THEN fe.value ELSE 0 END),0) AS total_actual,
          (SELECT COUNT(*) FROM messages m WHERE m.project_id = p.id) AS message_count
        FROM projects p
        INNER JOIN project_assignments pa ON pa.project_id = p.id AND pa.user_id = $1
        LEFT JOIN forecast_entries fe ON fe.project_id = p.id
        GROUP BY p.id ORDER BY p.code`;
      params = [userId];
    }

    const r = await pool.query(query, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/projects/:id
router.get('/:id', requireProjectAccess, async (req, res) => {
  try {
    const proj = await pool.query('SELECT * FROM projects WHERE id=$1', [req.params.id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Não encontrado' });

    const [entries, notes, assignments] = await Promise.all([
      pool.query('SELECT * FROM forecast_entries WHERE project_id=$1 ORDER BY year,month', [req.params.id]),
      pool.query(`SELECT pn.*, u.name AS user_name, u.avatar_initials
        FROM project_notes pn LEFT JOIN users u ON u.id=pn.user_id
        WHERE pn.project_id=$1 ORDER BY pn.note_date DESC`, [req.params.id]),
      pool.query(`SELECT u.id, u.name, u.email, u.avatar_initials
        FROM project_assignments pa JOIN users u ON u.id=pa.user_id
        WHERE pa.project_id=$1`, [req.params.id])
    ]);

    res.json({ ...proj.rows[0], entries: entries.rows, notes: notes.rows, engineers: assignments.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects — gestor/admin only
router.post('/', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
  try {
    const { code, name, description, si_value, pool_value, plants, engineer_ids } = req.body;
    const r = await pool.query(
      `INSERT INTO projects (code, name, description, si_value, pool_value, plants, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code, name, description, si_value||0, pool_value||0, plants||[], req.user.id]
    );
    const project = r.rows[0];
    // Assign engineers if provided
    if (engineer_ids?.length) {
      for (const uid of engineer_ids) {
        await pool.query(
          'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [project.id, uid, req.user.id]
        );
      }
    }
    res.status(201).json(project);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Código já existe' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id — gestor/admin
router.put('/:id', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
  try {
    const { code, name, description, si_value, pool_value, plants, engineer_ids } = req.body;
    const r = await pool.query(
      `UPDATE projects SET code=$1,name=$2,description=$3,si_value=$4,pool_value=$5,plants=$6,updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [code, name, description, si_value||0, pool_value||0, plants||[], req.params.id]
    );
    // Sync engineers if provided
    if (engineer_ids !== undefined) {
      await pool.query('DELETE FROM project_assignments WHERE project_id=$1', [req.params.id]);
      for (const uid of engineer_ids) {
        await pool.query(
          'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [req.params.id, uid, req.user.id]
        );
      }
    }
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/projects/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ASSIGNMENTS ---

// GET /api/projects/:id/engineers
router.get('/:id/engineers', requireProjectAccess, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_initials, pa.assigned_at
      FROM project_assignments pa JOIN users u ON u.id=pa.user_id
      WHERE pa.project_id=$1`, [req.params.id]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects/:id/engineers — assign engineer
router.post('/:id/engineers', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
  try {
    const { user_id } = req.body;
    await pool.query(
      'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [req.params.id, user_id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/projects/:id/engineers/:userId — remove assignment
router.delete('/:id/engineers/:userId', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM project_assignments WHERE project_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
