import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validatePassword } from '../middleware/validation.js';
import { logAuthEvent, getClientIP } from '../middleware/audit.js';

const router = Router();
router.use(requireAuth);

function initials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Safe error helper
function safeError(res, err) {
  if (err.code === '23505') return res.status(400).json({ error: 'Email já cadastrado' });
  console.error('[USERS ERROR]', err);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  safeError(res, err);
}

// GET /api/users/pending — admin only
router.get('/pending', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, email, role, avatar_initials, created_at
       FROM users WHERE pending_approval = true ORDER BY created_at DESC`
    );
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/users/:id/approve — admin approves pending user
router.post('/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET pending_approval = false, active = true, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// POST /api/users/:id/reject — admin rejects and deletes pending user
router.post('/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM users WHERE id = $1 AND pending_approval = true`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});


router.get('/', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.active, u.avatar_initials, u.created_at,
        COUNT(pa.project_id) AS project_count
      FROM users u
      LEFT JOIN project_assignments pa ON pa.user_id = u.id
      GROUP BY u.id
      ORDER BY u.role, u.name
    `);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// GET /api/users/engineers — for gestor to assign
router.get('/engineers', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, name, email, avatar_initials FROM users WHERE role='engenheiro' AND active=true ORDER BY name"
    );
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/users — admin creates user
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Formato de email inválido' });
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });
    const hash = await bcrypt.hash(password, 12);
    const av = initials(name);
    const r = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, avatar_initials)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, avatar_initials`,
      [name, email.toLowerCase(), hash, role || 'engenheiro', av]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    safeError(res, err);
  }
});

// PUT /api/users/:id — admin edits any user; user edits own profile
router.put('/:id', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const isSelf = req.user.id === targetId;
    const isAdmin = req.user.role === 'admin';
    if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Sem permissão' });

    const { name, email, role, active } = req.body;
    const av = name ? initials(name) : undefined;

    const fields = [], vals = [];
    if (name)  { fields.push(`name=$${fields.length+1}`);  vals.push(name); }
    if (email) { fields.push(`email=$${fields.length+1}`); vals.push(email.toLowerCase()); }
    if (av)    { fields.push(`avatar_initials=$${fields.length+1}`); vals.push(av); }
    if (isAdmin && role)   { fields.push(`role=$${fields.length+1}`); vals.push(role); }
    if (isAdmin && active !== undefined) { fields.push(`active=$${fields.length+1}`); vals.push(active); }
    fields.push('updated_at=NOW()');

    vals.push(targetId);
    const r = await pool.query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING id, name, email, role, active, avatar_initials`,
      vals
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email já cadastrado' });
    safeError(res, err);
  }
});

// DELETE /api/users/:id — admin deactivates (soft delete)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// POST /api/users/:id/reset-password — admin resets password
router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  try {
    const { new_password } = req.body;
    const pwCheck = validatePassword(new_password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);

    await logAuthEvent('admin_password_reset', {
      userId: parseInt(req.params.id),
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      success: true,
      detail: `Reset por admin ${req.user.email}`,
    });

    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

export default router;
