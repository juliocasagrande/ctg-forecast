import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function safeError(res, err) {
  console.error(`[ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}

// GET /api/delegations — list my delegations (as delegator) and delegations TO me (as delegate)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const r = await pool.query(`
      SELECT d.*,
        dor.name AS delegator_name, dor.email AS delegator_email, dor.role AS delegator_role, dor.avatar_initials AS delegator_initials,
        dee.name AS delegate_name, dee.email AS delegate_email, dee.role AS delegate_role, dee.avatar_initials AS delegate_initials
      FROM access_delegations d
      JOIN users dor ON dor.id = d.delegator_id
      JOIN users dee ON dee.id = d.delegate_id
      WHERE (d.delegator_id = $1 OR d.delegate_id = $1)
        AND d.active = true
      ORDER BY d.start_date DESC
    `, [userId]);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// GET /api/delegations/active — get currently active delegations TO me (for middleware)
router.get('/active-to-me', async (req, res) => {
  try {
    const userId = req.user.id;
    const r = await pool.query(`
      SELECT d.*, u.name AS delegator_name, u.role AS delegator_role
      FROM access_delegations d
      JOIN users u ON u.id = d.delegator_id
      WHERE d.delegate_id = $1
        AND d.active = true
        AND CURRENT_DATE BETWEEN d.start_date AND d.end_date
    `, [userId]);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// GET /api/delegations/delegated-projects — projects I have access to via delegation
router.get('/delegated-projects', async (req, res) => {
  try {
    const userId = req.user.id;
    // Find active delegations to me, then find projects of those delegators
    const r = await pool.query(`
      SELECT DISTINCT p.id, p.code, p.name, p.plants, u.name AS delegator_name,
        d.start_date, d.end_date
      FROM access_delegations d
      JOIN users u ON u.id = d.delegator_id
      JOIN project_assignments pa ON pa.user_id = d.delegator_id
      JOIN projects p ON p.id = pa.project_id
      WHERE d.delegate_id = $1
        AND d.active = true
        AND CURRENT_DATE BETWEEN d.start_date AND d.end_date
      ORDER BY p.code
    `, [userId]);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/delegations — create a new delegation
router.post('/', async (req, res) => {
  try {
    const { delegate_id, start_date, end_date, reason } = req.body;
    const delegatorId = req.user.id;

    if (!delegate_id || !start_date || !end_date)
      return res.status(400).json({ error: 'Delegado, data início e data fim são obrigatórios' });
    if (parseInt(delegate_id) === delegatorId)
      return res.status(400).json({ error: 'Não é possível delegar acesso a si mesmo' });
    if (new Date(end_date) < new Date(start_date))
      return res.status(400).json({ error: 'Data fim deve ser posterior à data início' });

    // Check delegate exists and is active
    const userR = await pool.query('SELECT id, name FROM users WHERE id=$1 AND active=true', [delegate_id]);
    if (!userR.rows.length)
      return res.status(404).json({ error: 'Usuário delegado não encontrado' });

    const safeReason = reason ? String(reason).slice(0, 500) : null;

    const r = await pool.query(`
      INSERT INTO access_delegations (delegator_id, delegate_id, start_date, end_date, active, reason)
      VALUES ($1, $2, $3, $4, true, $5)
      RETURNING *
    `, [delegatorId, delegate_id, start_date, end_date, safeReason]);

    res.status(201).json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// GET /api/delegations/notifications — delegations received by me (for AlertBell)
router.get('/notifications', async (req, res) => {
  try {
    const userId = req.user.id;
    const r = await pool.query(`
      SELECT d.id, d.start_date, d.end_date, d.reason, d.active,
        u.name AS delegator_name, u.role AS delegator_role, u.avatar_initials AS delegator_initials
      FROM access_delegations d
      JOIN users u ON u.id = d.delegator_id
      WHERE d.delegate_id = $1
        AND d.active = true
        AND d.end_date >= CURRENT_DATE
      ORDER BY d.start_date ASC
    `, [userId]);
    const dismissedRes = await pool.query(
      `SELECT alert_key FROM alert_dismissals
       WHERE user_id=$1 AND alert_type='delegation_received' AND dismissed_at >= date_trunc('month', CURRENT_DATE)`,
      [userId]
    );
    const dismissed = new Set(dismissedRes.rows.map(row => String(row.alert_key)));
    res.json(r.rows.filter(row => !dismissed.has(String(row.id))));
  } catch (err) { safeError(res, err); }
});

// DELETE /api/delegations/:id — revoke a delegation (delegator OR delegate can revoke)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const r = await pool.query(
      'UPDATE access_delegations SET active = false WHERE id = $1 AND (delegator_id = $2 OR delegate_id = $2) RETURNING *',
      [req.params.id, userId]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: 'Delegação não encontrada ou sem permissão' });
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

export default router;
