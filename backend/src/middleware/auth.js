import jwt from 'jsonwebtoken';

const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? null : 'ctg-forecast-dev-only-secret');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'strict' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie('ctg_token', token, COOKIE_OPTIONS);
}

export function clearAuthCookie(res) {
  res.clearCookie('ctg_token', { path: '/' });
}

function extractToken(req) {
  if (req.cookies?.ctg_token) return req.cookies.ctg_token;
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

// Bloqueia gerente de qualquer escrita
export function denyGerente(req, res, next) {
  if (req.user?.role === 'gerente') {
    return res.status(403).json({ error: 'Gerentes têm acesso somente leitura' });
  }
  next();
}

/**
 * Controle de acesso a projetos por role:
 * - admin, gestor (legado), planejador: acesso total
 * - coordenador: projetos da sua área ou projetos sem área definida
 * - gerente: acesso de leitura (verificado no route handler)
 * - engenheiro: só projetos designados a ele ou via delegação
 */
export async function requireProjectAccess(req, res, next) {
  const { role, id: userId, area: userArea } = req.user;

  // Admin, gestor (legado), planejador, gerente: passam direto (gerente bloqueado na escrita)
  if (['admin', 'gestor', 'planejador', 'gerente'].includes(role)) return next();

  const { pool } = await import('../db/schema.js');
  const projectId = req.params.projectId || req.params.id;

  // Coordenador: acessa projetos da sua área
  if (role === 'coordenador') {
    // Verifica se o projeto pertence à área do coordenador (via engenheiros do projeto)
    const r = await pool.query(`
      SELECT 1 FROM project_assignments pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id = $1 AND (u.area = $2 OR $2 IS NULL)
      LIMIT 1
    `, [projectId, userArea]);
    if (r.rows.length) return next();

    // Ou se o projeto não tem engenheiros designados (projeto geral)
    const noEng = await pool.query(
      'SELECT 1 FROM project_assignments WHERE project_id=$1 LIMIT 1',
      [projectId]
    );
    if (!noEng.rows.length) return next();

    return res.status(403).json({ error: 'Acesso não autorizado a este projeto' });
  }

  // Engenheiro: só projetos diretamente designados ou via delegação
  const r = await pool.query(
    'SELECT 1 FROM project_assignments WHERE project_id=$1 AND user_id=$2',
    [projectId, userId]
  );
  if (r.rows.length) return next();

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
