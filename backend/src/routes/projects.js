import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole, requireProjectAccess } from '../middleware/auth.js';

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

// GET /api/projects — filtered by role
router.get('/', async (req, res) => {
  try {
    const { role, id: userId, area: userArea } = req.user;
    // Engenheiro: só projetos designados.
    // Coordenador: projetos com pelo menos um engenheiro da sua área.
    // Todos os outros (incluindo gerente): vê tudo.
    const isEng   = role === 'engenheiro';
    const isCoord = role === 'coordenador';
    const engJoin = isEng
      ? `INNER JOIN project_assignments pa_self ON pa_self.project_id = p.id AND pa_self.user_id = $1`
      : isCoord
        ? `INNER JOIN project_assignments pa_coord ON pa_coord.project_id = p.id
           INNER JOIN users u_coord ON u_coord.id = pa_coord.user_id AND u_coord.role = 'engenheiro' AND u_coord.area = $1`
        : '';
    const params = isEng ? [userId] : isCoord ? [userArea || ''] : [];

    const query = `
      SELECT p.*,
        COALESCE(SUM(CASE WHEN combined.type='Budget' THEN combined.value ELSE 0 END),0)
          + COALESCE(SUM(CASE WHEN combined.source='consolidated' AND combined.type='Actual' THEN combined.value ELSE 0 END),0) AS total_budget,
        COALESCE(SUM(CASE WHEN combined.type='Forecast' THEN combined.value ELSE 0 END),0) AS total_forecast,
        COALESCE(SUM(CASE WHEN combined.type='Actual'   THEN combined.value ELSE 0 END),0) AS total_actual,
        COALESCE(pa_agg.engineer_count, 0) AS engineer_count,
        COALESCE(msg_agg.message_count, 0) AS message_count,
        eng_agg.engineer_names,
        eng_agg.engineer_initials
      FROM projects p
      ${engJoin}
      LEFT JOIN (
        SELECT fe.project_id, fe.type, fe.value, 'entries' AS source
        FROM forecast_entries fe
        WHERE NOT EXISTS (
          SELECT 1 FROM year_consolidated yc2
          WHERE yc2.project_id = fe.project_id
            AND yc2.year = fe.year
            AND (yc2.type = fe.type OR (yc2.type = 'Actual' AND yc2.category = 'Total' AND fe.type = 'Actual'))
            AND yc2.value > 0
        )
        UNION ALL
        SELECT yc.project_id, yc.type, yc.value, 'consolidated' AS source
        FROM year_consolidated yc
        WHERE yc.value > 0
      ) combined ON combined.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(DISTINCT user_id) AS engineer_count
        FROM project_assignments GROUP BY project_id
      ) pa_agg ON pa_agg.project_id = p.id
      LEFT JOIN (
        SELECT pa2.project_id,
          STRING_AGG(DISTINCT u2.name, ', ' ORDER BY u2.name) AS engineer_names,
          STRING_AGG(DISTINCT u2.avatar_initials, ', ' ORDER BY u2.avatar_initials) AS engineer_initials
        FROM project_assignments pa2
        JOIN users u2 ON u2.id = pa2.user_id AND u2.role = 'engenheiro'
        GROUP BY pa2.project_id
      ) eng_agg ON eng_agg.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS message_count
        FROM messages GROUP BY project_id
      ) msg_agg ON msg_agg.project_id = p.id
      GROUP BY p.id, pa_agg.engineer_count, msg_agg.message_count, eng_agg.engineer_names, eng_agg.engineer_initials
      ORDER BY p.code`;

    const r = await pool.query(query, params);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
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
  } catch (err) { safeError(res, err); }
});

// POST /api/projects — gestor/admin only
router.post('/', requireRole('admin', 'gestor', 'coordenador', 'planejador'), async (req, res) => {
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
    safeError(res, err);
  }
});

// PUT /api/projects/:id — gestor/admin
router.put('/:id', requireRole('admin', 'gestor', 'coordenador', 'planejador'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { code, name, description, si_value, pool_value, plants, engineer_ids } = req.body;
    const r = await client.query(
      `UPDATE projects SET code=$1,name=$2,description=$3,si_value=$4,pool_value=$5,plants=$6,updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [code, name, description, si_value||0, pool_value||0, plants||[], req.params.id]
    );
    // Sync engineers if provided
    if (engineer_ids !== undefined) {
      await client.query('DELETE FROM project_assignments WHERE project_id=$1', [req.params.id]);
      for (const uid of engineer_ids) {
        await client.query(
          'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [req.params.id, uid, req.user.id]
        );
      }
    }
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally { client.release(); }
});

// DELETE /api/projects/:id — gestor/planejador/admin, requires project name confirmation
router.delete('/:id', requireRole('admin', 'gestor', 'coordenador', 'planejador'), async (req, res) => {
  try {
    const { confirmName } = req.body || {};
    // Fetch project to validate name
    const proj = await pool.query('SELECT id, name FROM projects WHERE id=$1', [req.params.id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Projeto não encontrado' });

    const project = proj.rows[0];
    if (!confirmName || confirmName.trim() !== project.name.trim()) {
      return res.status(400).json({ error: 'Nome do projeto não confere. Digite o nome exato para confirmar a exclusão.' });
    }

    // CASCADE will delete all related data (entries, assignments, notes, messages, etc.)
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ success: true, deleted: project.name });
  } catch (err) { safeError(res, err); }
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
  } catch (err) { safeError(res, err); }
});

// POST /api/projects/:id/engineers — assign engineer
router.post('/:id/engineers', requireRole('admin', 'gestor', 'coordenador', 'planejador'), async (req, res) => {
  try {
    const { user_id } = req.body;
    await pool.query(
      'INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [req.params.id, user_id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// DELETE /api/projects/:id/engineers/:userId — remove assignment
router.delete('/:id/engineers/:userId', requireRole('admin', 'gestor', 'coordenador', 'planejador'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM project_assignments WHERE project_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

export default router;