import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const NOTIFY_EMAIL = 'julio.casagrande@ctgbr.com.br';

// POST /api/feedback — save feedback and optionally notify
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/feedback — admin/planejador can list all feedback
router.get('/', async (req, res) => {
  const { role } = req.user;
  if (!['admin', 'planejador'].includes(role))
    return res.status(403).json({ error: 'Sem permissão' });
  try {
    const r = await pool.query(
      'SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100'
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
