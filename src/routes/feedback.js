import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function safeError(res, err) {
  console.error(`[ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}

router.use(requireAuth);

// The developer email that receives all feedback
const DEVELOPER_EMAIL = 'julio.casagrande@ctgbr.com.br';

// POST /api/feedback — save feedback
router.post('/', async (req, res) => {
  try {
    const { type, subject, message, user_name, user_email, user_role } = req.body;
    if (!subject?.trim() || !message?.trim())
      return res.status(400).json({ error: 'Assunto e mensagem são obrigatórios' });
    if (message.length > 2000)
      return res.status(400).json({ error: 'Mensagem muito longa (máx. 2000 caracteres)' });

    const r = await pool.query(`
      INSERT INTO feedback (user_id, type, subject, message, user_name, user_email, user_role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.id, type || 'suggestion', subject.trim(), message.trim(),
        user_name || req.user.name, user_email || req.user.email, user_role || req.user.role]);

    res.status(201).json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// GET /api/feedback — developer inbox (only for DEVELOPER_EMAIL)
router.get('/', async (req, res) => {
  if (req.user.email !== DEVELOPER_EMAIL && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Sem permissão' });
  try {
    const r = await pool.query(
      'SELECT * FROM feedback ORDER BY created_at DESC LIMIT 200'
    );
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// GET /api/feedback/stats — unread count for badge
router.get('/stats', async (req, res) => {
  if (req.user.email !== DEVELOPER_EMAIL && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Sem permissão' });
  try {
    const r = await pool.query(
      "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'new') AS unread FROM feedback"
    );
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// PUT /api/feedback/:id/status — mark as read/resolved/archived
router.put('/:id/status', async (req, res) => {
  if (req.user.email !== DEVELOPER_EMAIL && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Sem permissão' });
  try {
    const { status } = req.body;
    if (!['new', 'read', 'in_progress', 'resolved', 'archived'].includes(status))
      return res.status(400).json({ error: 'Status inválido' });
    const r = await pool.query(
      'UPDATE feedback SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Feedback não encontrado' });
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// DELETE /api/feedback/:id — delete feedback
router.delete('/:id', async (req, res) => {
  if (req.user.email !== DEVELOPER_EMAIL && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Sem permissão' });
  try {
    await pool.query('DELETE FROM feedback WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

export default router;
