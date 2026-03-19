import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/schema.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

function initials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// POST /api/auth/register — public self-registration (pending approval)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    if (!['gestor', 'engenheiro'].includes(role))
      return res.status(400).json({ error: 'Perfil inválido' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });

    const hash = await bcrypt.hash(password, 10);
    const av = initials(name);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, avatar_initials, active, pending_approval)
       VALUES ($1, $2, $3, $4, $5, false, true)`,
      [name, email.toLowerCase(), hash, role, av]
    );
    res.status(201).json({ message: 'Solicitação enviada! Aguarde a aprovação do administrador.' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Este e-mail já está cadastrado' });
    res.status(500).json({ error: err.message });
  }
});


router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

    const r = await pool.query('SELECT * FROM users WHERE email=$1 AND active=true', [email.toLowerCase()]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });
    if (user.pending_approval) return res.status(403).json({ error: 'Sua conta está aguardando aprovação do administrador.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });

    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_initials: user.avatar_initials }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, email, role, avatar_initials, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'Nova senha deve ter ao menos 6 caracteres' });

    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, r.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
