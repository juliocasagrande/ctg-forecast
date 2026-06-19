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

// Emails que recebem acesso equivalente a admin independente do role no banco
export const ADMIN_OVERRIDE_EMAILS = ['julio.casagrande@ctgbr.com.br'];

// Emails que mantêm seu cargo real (coordenador) mas recebem acesso de leitura/escrita
// a todas as áreas (não só a sua), nas visões gerais de dados (forecast, projetos, etc.)
export const MANAGER_ACCESS_OVERRIDE_EMAILS = ['lucas.vitti@ctgbr.com.br'];

export function getEmailAccessOverride(email = '') {
  const normalized = String(email).toLowerCase();
  if (ADMIN_OVERRIDE_EMAILS.includes(normalized)) return 'admin';
  if (MANAGER_ACCESS_OVERRIDE_EMAILS.includes(normalized)) return 'gerente';
  return null;
}

const ROLE_RANK = { engenheiro: 1, coordenador: 2, planejador: 3, gerente: 3, gestor: 4, admin: 5 };

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

// ── requireAuth ───────────────────────────────────────────────────────────────
// Valida JWT, revalida role/active contra o banco e aplica elevação de role
// quando existe delegação ativa para o usuário corrente.
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  try {
    const { pool } = await import('../db/schema.js');

    // 1. Revalida usuário no banco
    const userR = await pool.query(
      'SELECT id, role, area, active FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = userR.rows[0];
    if (!user || !user.active) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Conta inativa ou não encontrada' });
    }

    // 2. Verifica delegações ativas PARA este usuário e eleva o role se aplicável
    const delegR = await pool.query(`
      SELECT u.id AS delegator_id, u.role AS delegator_role, u.area AS delegator_area
      FROM access_delegations ad
      JOIN users u ON u.id = ad.delegator_id
      WHERE ad.delegate_id = $1
        AND ad.active = true
        AND CURRENT_DATE BETWEEN ad.start_date AND ad.end_date
    `, [decoded.id]);

    let effectiveRole = user.role;
    let effectiveArea = user.area;
    const delegatorIds = [];
    for (const d of delegR.rows) {
      delegatorIds.push(d.delegator_id);
      if ((ROLE_RANK[d.delegator_role] || 0) > (ROLE_RANK[effectiveRole] || 0)) {
        effectiveRole = d.delegator_role;
        effectiveArea = d.delegator_area;
      }
    }

    // 'admin' eleva o cargo de fato (acesso total). 'gerente' aqui NÃO substitui o
    // cargo real — apenas marca acesso a todas as áreas, mantendo o usuário como
    // coordenador (com seus poderes normais de edição/importação/exportação) e sua
    // área real (usada, por ex., para escopo de metas).
    const emailOverride = getEmailAccessOverride(decoded.email);
    if (emailOverride === 'admin') {
      effectiveRole = 'admin';
    }
    const allAreasAccess = emailOverride === 'gerente';

    req.user = {
      ...decoded,
      role: effectiveRole,
      area: effectiveArea,
      _originalRole: user.role,
      _accessOverride: emailOverride,
      _managerAccessOverride: allAreasAccess,
      _allAreasAccess: allAreasAccess,
      _delegatorIds: delegatorIds, // IDs dos delegadores — permite acesso aos projetos deles
    };
  } catch (dbErr) {
    console.error('[AUTH] Falha ao revalidar usuário no banco:', dbErr.message);
    clearAuthCookie(res);
    return res.status(503).json({ error: 'Não foi possível validar a sessão. Tente novamente.' });
  }

  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso não autorizado' });
    }
    next();
  };
}

/**
 * Controle de acesso a projetos por role:
 * - admin, planejador: acesso total
 * - coordenador: projetos com engenheiros da sua área
 * - gerente: acesso de leitura
 * - engenheiro: projetos designados a ele ou via delegação ativa
 * - usuário com delegação: acesso aos projetos dos delegadores também
 */
export async function requireProjectAccess(req, res, next) {
  const { role, id: userId, area: userArea, _delegatorIds = [] } = req.user;

  // Admin, planejador, gerente: acesso total
  if (['admin', 'planejador', 'gerente'].includes(role)) return next();

  const { pool } = await import('../db/schema.js');
  const projectId = req.params.projectId || req.params.id;

  // Se o usuário tem delegação ativa, verifica se o projeto pertence a algum delegador
  if (_delegatorIds.length > 0) {
    const dProj = await pool.query(
      `SELECT 1 FROM project_assignments WHERE project_id=$1 AND user_id = ANY($2)`,
      [projectId, _delegatorIds]
    );
    if (dProj.rows.length) return next();
  }

  // Coordenador: acessa projetos com engenheiros da sua área
  // (ou de qualquer área, se tiver acesso a todas as áreas)
  if (role === 'coordenador') {
    if (req.user._allAreasAccess) {
      // Special permission covers every project across all areas.
      return next();
    }
    const r = await pool.query(`
      SELECT 1 FROM project_assignments pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id = $1
        AND u.role = 'engenheiro'
        AND u.area = $2
      LIMIT 1
    `, [projectId, userArea]);
    if (r.rows.length) return next();
    return res.status(403).json({ error: 'Acesso não autorizado a este projeto' });
  }

  // Engenheiro: projetos diretamente designados
  const r = await pool.query(
    'SELECT 1 FROM project_assignments WHERE project_id=$1 AND user_id=$2',
    [projectId, userId]
  );
  if (r.rows.length) return next();

  return res.status(403).json({ error: 'Sem acesso a este projeto' });
}
