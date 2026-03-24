import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ctg-forecast-secret-change-in-prod';
const IS_PROD = process.env.NODE_ENV === 'production';

// Cookie configuration
const COOKIE_OPTIONS = {
  httpOnly: true,       // not accessible via JS (mitigates XSS)
  secure: IS_PROD,      // HTTPS only in production
  sameSite: IS_PROD ? 'strict' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Sets the JWT as an httpOnly cookie on the response
 */
export function setAuthCookie(res, token) {
  res.cookie('ctg_token', token, COOKIE_OPTIONS);
}

/**
 * Clears the auth cookie
 */
export function clearAuthCookie(res) {
  res.clearCookie('ctg_token', { path: '/' });
}

/**
 * Extracts token from httpOnly cookie (primary) or Authorization header (fallback).
 * Dual-mode allows a smooth migration period from localStorage to cookies.
 */
function extractToken(req) {
  // 1. httpOnly cookie (preferred)
  if (req.cookies?.ctg_token) return req.cookies.ctg_token;
  // 2. Authorization header (legacy / API clients)
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    clearAuthCookie(res);
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso não autorizado' });
    }
    next();
  };
}

// Engenheiro só acessa projetos designados a ele — ou via delegação ativa
export async function requireProjectAccess(req, res, next) {
  const { role, id: userId } = req.user;
  if (role === 'admin' || role === 'gestor' || role === 'planejador') return next();
  const { pool } = await import('../db/schema.js');
  const projectId = req.params.projectId || req.params.id;

  // 1. Direct assignment
  const r = await pool.query(
    'SELECT 1 FROM project_assignments WHERE project_id=$1 AND user_id=$2',
    [projectId, userId]
  );
  if (r.rows.length) return next();

  // 2. Access via active delegation (someone delegated their projects to me)
  const d = await pool.query(`
    SELECT 1 FROM access_delegations ad
    JOIN project_assignments pa ON pa.user_id = ad.delegator_id AND pa.project_id = $1
    WHERE ad.delegate_id = $2
      AND ad.active = true
      AND CURRENT_DATE BETWEEN ad.start_date AND ad.end_date
  `, [projectId, userId]);
  if (d.rows.length) return next();

  return res.status(403).json({ error: 'Sem acesso a este projeto' });
}
