import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db/schema.js';
import { signToken, requireAuth, setAuthCookie, clearAuthCookie } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/security.js';
import { logAuthEvent, getClientIP } from '../middleware/audit.js';
import { validatePassword } from '../middleware/validation.js';
import { enviarEmail } from '../utils/mailer.js';

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
    const { name, email, password, role, area } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Formato de email inválido' });

    const validRoles = ['coordenador', 'engenheiro', 'gerente'];
    if (!validRoles.includes(role))
      return res.status(400).json({ error: 'Perfil inválido' });

    // Engenheiros e coordenadores precisam de área; gerentes não
    const needsArea = ['engenheiro', 'coordenador'].includes(role);
    const validAreas = ['eletrica', 'mecanica', 'confiabilidade', 'modernizacao'];
    if (needsArea && !validAreas.includes(area))
      return res.status(400).json({ error: 'Selecione a área de atuação' });

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });

    const hash = await bcrypt.hash(password, 12);
    const av = initials(name);
    const userArea = needsArea ? area : null;

    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, area, avatar_initials, active, pending_approval)
       VALUES ($1, $2, $3, $4, $5, $6, false, true)`,
      [name, email.toLowerCase(), hash, role, userArea, av]
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
      id: user.id, name: user.name, email: user.email, role: user.role, area: user.area,
    });

    setAuthCookie(res, token);

    await logAuthEvent('login_success', { email: user.email, userId: user.id, ip, userAgent: ua, success: true });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, area: user.area, avatar_initials: user.avatar_initials, must_change_password: user.must_change_password || false }
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
      'SELECT id, name, email, role, area, avatar_initials, created_at, must_change_password FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });

    const dbUser = r.rows[0];
    // Retorna o effective role calculado pelo requireAuth (pode estar elevado por delegação)
    // mas mantém os dados pessoais (nome, email, initials) do banco
    res.json({
      ...dbUser,
      role:           req.user.role,           // effective role (elevado se há delegação)
      area:           req.user.area,           // effective area
      _originalRole:  dbUser.role,             // role real para exibição no perfil
      _hasDelegation: req.user._delegatorIds?.length > 0,
      must_change_password: dbUser.must_change_password || false,
    });
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
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW(), must_change_password=false WHERE id=$2', [hash, req.user.id]);

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

// ─── POST /api/auth/forgot-password ────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });

    const userR = await pool.query('SELECT id, name, email FROM users WHERE email=$1 AND active=true', [email.toLowerCase()]);
    const user = userR.rows[0];

    // Sempre retorna sucesso para evitar enumeração de emails
    if (!user) {
      return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.' });
    }

    // Gera token aleatório
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Salva token no banco (remove tokens antigos primeiro)
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [user.id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    // Monta link de redefinição
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    // Envia e-mail
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #001F5B;">Redefinição de Senha</h2>
        <p>Olá, <strong>${user.name}</strong>,</p>
        <p>Você solicitou a redefinição de senha da sua conta no CTG.Engenharia.</p>
        <p>Clique no botão abaixo para criar uma nova senha (válido por 1 hora):</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #0070B8; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Redefinir Senha
          </a>
        </p>
        <p>Ou copie e cole este link no navegador:</p>
        <p style="color: #666; word-break: break-all;">${resetLink}</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
        <p style="font-size: 0.85rem; color: #999;">Se você não solicitou esta redefinição, ignore este e-mail. Sua senha permanecerá inalterada.</p>
        <p style="font-size: 0.85rem; color: #999;">CTG Brasil — Engenharia</p>
      </div>
    `;

    try {
      await enviarEmail({
        destinatarios: [user.email],
        assunto: 'CTG.Engenharia — Redefinição de Senha',
        mensagemHtml: html,
      });
    } catch (emailErr) {
      console.error('Erro ao enviar e-mail de redefinição:', emailErr);
      // Não expõe erro de e-mail para o cliente
    }

    await logAuthEvent('forgot_password', {
      email: user.email,
      userId: user.id,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.' });
  } catch (err) {
    safeError(res, err);
  }
});

// ─── POST /api/auth/reset-password ─────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const client = await pool.connect();
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
    }

    // Valida nova senha
    const pwCheck = validatePassword(new_password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });

    await client.query('BEGIN');

    // Busca token válido
    const tokenR = await client.query(
      'SELECT * FROM password_reset_tokens WHERE token=$1 AND used=false AND expires_at > NOW() FOR UPDATE',
      [token]
    );

    if (!tokenR.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const resetToken = tokenR.rows[0];

    // Gera hash da nova senha
    const hash = await bcrypt.hash(new_password, 12);

    // Atualiza senha do usuário e marca token como usado
    await client.query('UPDATE users SET password_hash=$1, updated_at=NOW(), must_change_password=false WHERE id=$2', [hash, resetToken.user_id]);
    await client.query('UPDATE password_reset_tokens SET used=true WHERE id=$1', [resetToken.id]);
    await client.query('COMMIT');

    await logAuthEvent('password_reset', {
      userId: resetToken.user_id,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      success: true,
    });

    res.json({ success: true, message: 'Senha redefinida com sucesso! Faça login com sua nova senha.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    safeError(res, err);
  } finally {
    client.release();
  }
});

export default router;
