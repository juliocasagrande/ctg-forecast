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

// ── requireAuth — valida JWT e revalida role/active contra o banco ────────────
// O role embedado no token é confiável para roteamento rápido, mas pode estar
// desatualizado se o admin alterou permissões enquanto o token ainda era válido.
// Aqui fazemos uma query leve para garantir que o usuário ainda está ativo
// e para puxar o role/area mais recentes do banco.
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

  // Revalida estado do usuário no banco — garante que desativações e
  // mudanças de role têm efeito imediato sem esperar expiração do token.
  try {
    const { pool } = await import('../db/schema.js');
    const r = await pool.query(
      'SELECT id, role, area, active FROM users WHERE id = $1',
      [decoded.id]
    );

    const user = r.rows[0];
    if (!user || !user.active) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Conta inativa ou não encontrada' });
    }

    // Mescla payload do token com dados frescos do banco
    req.user = {
      ...decoded,
      role: user.role,   // role sempre vem do banco
      area: user.area,   // area sempre vem do banco
    };
  } catch (dbErr) {
    // Se o banco estiver indisponível, usa os dados do token como fallback
    // para evitar que uma instabilidade derrube toda a autenticação.
    console.warn('[AUTH] Falha ao revalidar usuário no banco, usando token como fallback:', dbErr.message);
    req.user = decoded;
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

// Bloqueia gerente de qualquer escrita — use como middleware de rota
export function denyGerente(req, res, next) {
  if (req.user?.role === 'gerente') {
    return res.status(403).json({ error: 'Gerentes têm acesso somente leitura' });
  }
  next();
}

/**
 * Controle de acesso a projetos por role:
 * - admin, gestor (legado), planejador: acesso total
 * - coordenador: projetos com engenheiros da sua área
 * - gerente: acesso de leitura (escrita bloqueada via denyGerente na rota)
 * - engenheiro: só projetos designados a ele ou via delegação
 *
 * SEGURANÇA: projetos sem engenheiros designados ("órfãos") só são acessíveis
 * por admin/gestor/planejador — coordenadores não têm acesso automático a eles,
 * pois isso exporia projetos de outras áreas/usinas.
 */
export async function requireProjectAccess(req, res, next) {
  const { role, id: userId, area: userArea } = req.user;

  // Admin, gestor (legado), planejador, gerente: passam direto
  if (['admin', 'gestor', 'planejador', 'gerente'].includes(role)) return next();

  const { pool } = await import('../db/schema.js');
  const projectId = req.params.projectId || req.params.id;

  // Coordenador: acessa apenas projetos com engenheiros da sua área
  if (role === 'coordenador') {
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

  // Engenheiro: só projetos diretamente designados ou via delegação ativa
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
