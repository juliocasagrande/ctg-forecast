import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/schema.js';
import { signToken, requireAuth, setAuthCookie, clearAuthCookie } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/security.js';
import { logAuthEvent, getClientIP } from '../middleware/audit.js';
import { validatePassword } from '../middleware/validation.js';

const router = Router();

function initials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Safe error helper — never leaks err.message in production
function safeError(res, err) {
  if (err.code === '23505') return res.status(400).json({ error: 'Este e-mail já está cadastrado' });
  console.error('[AUTH ERROR]', err);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}

// ─── POST /api/auth/register — public self-registration (pending approval) ──
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Formato de email inválido' });
    if (!['gestor', 'engenheiro'].includes(role))
      return res.status(400).json({ error: 'Perfil inválido' });

    // Strong password validation
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });

    const hash = await bcrypt.hash(password, 12); // increased from 10 to 12 rounds
    const av = initials(name);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, avatar_initials, active, pending_approval)
       VALUES ($1, $2, $3, $4, $5, false, true)`,
      [name, email.toLowerCase(), hash, role, av]
    );

    await logAuthEvent('register', {
      email: email.toLowerCase(),
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.status(201).json({ message: 'Solicitação enviada! Aguarde a aprovação do administrador.' });
  } catch (err) {
    safeError(res, err);
  }
});

// ─── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'];

  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

    const r = await pool.query('SELECT * FROM users WHERE email=$1 AND active=true', [email.toLowerCase()]);
    const user = r.rows[0];

    if (!user) {
      await logAuthEvent('login_failed', { email: email.toLowerCase(), ip, userAgent: ua, success: false, detail: 'Usuário não encontrado' });
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (user.pending_approval) {
      await logAuthEvent('login_failed', { email: email.toLowerCase(), userId: user.id, ip, userAgent: ua, success: false, detail: 'Conta pendente de aprovação' });
      return res.status(403).json({ error: 'Sua conta está aguardando aprovação do administrador.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await logAuthEvent('login_failed', { email: email.toLowerCase(), userId: user.id, ip, userAgent: ua, success: false, detail: 'Senha incorreta' });
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const token = signToken({
      id: user.id, name: user.name, email: user.email, role: user.role,
    });

    // Set httpOnly cookie
    setAuthCookie(res, token);

    await logAuthEvent('login_success', { email: user.email, userId: user.id, ip, userAgent: ua, success: true });

    // Also return token in body for migration period (frontend may still use localStorage)
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_initials: user.avatar_initials }
    });
  } catch (err) {
    safeError(res, err);
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, email, role, avatar_initials, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    safeError(res, err);
  }
});

// ─── POST /api/auth/change-password ─────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    // Strong password validation
    const pwCheck = validatePassword(new_password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });

    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, r.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);

    await logAuthEvent('password_change', {
      email: req.user.email,
      userId: req.user.id,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.json({ success: true });
  } catch (err) {
    safeError(res, err);
  }
});

export default router;
