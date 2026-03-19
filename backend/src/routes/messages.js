import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireProjectAccess } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET /api/projects/:projectId/messages
router.get('/', requireProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const r = await pool.query(`
      SELECT m.id, m.content, m.created_at,
        u.id AS user_id, u.name AS user_name, u.role AS user_role, u.avatar_initials,
        EXISTS(
          SELECT 1 FROM message_reads mr WHERE mr.message_id=m.id AND mr.user_id=$2
        ) AS is_read
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.project_id = $1
      ORDER BY m.created_at ASC
    `, [projectId, req.user.id]);

    // Mark all as read for this user
    if (r.rows.length) {
      await pool.query(`
        INSERT INTO message_reads (message_id, user_id)
        SELECT m.id, $2 FROM messages m
        WHERE m.project_id = $1
        ON CONFLICT DO NOTHING
      `, [projectId, req.user.id]);
    }

    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects/:projectId/messages
router.post('/', requireProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Mensagem vazia' });

    const r = await pool.query(`
      INSERT INTO messages (project_id, user_id, content) VALUES ($1,$2,$3)
      RETURNING id, content, created_at
    `, [projectId, req.user.id, content.trim()]);

    // Auto mark as read for sender
    await pool.query(
      'INSERT INTO message_reads (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [r.rows[0].id, req.user.id]
    );

    res.status(201).json({
      ...r.rows[0],
      user_id: req.user.id,
      user_name: req.user.name,
      user_role: req.user.role,
      avatar_initials: req.user.name.split(' ').slice(0,2).map(w=>w[0].toUpperCase()).join(''),
      is_read: true
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET unread count per project for current user
router.get('/unread-count', async (req, res) => {
  try {
    const { projectId } = req.params;
    const r = await pool.query(`
      SELECT COUNT(*) AS unread
      FROM messages m
      WHERE m.project_id = $1
        AND m.user_id != $2
        AND NOT EXISTS (
          SELECT 1 FROM message_reads mr WHERE mr.message_id=m.id AND mr.user_id=$2
        )
    `, [projectId, req.user.id]);
    res.json({ unread: parseInt(r.rows[0].unread) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
