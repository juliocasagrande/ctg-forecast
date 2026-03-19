import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ctg-forecast-secret-change-in-prod';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
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

// Engenheiro só acessa projetos designados a ele
export async function requireProjectAccess(req, res, next) {
  const { role, id: userId } = req.user;
  if (role === 'admin' || role === 'gestor' || role === 'planejador') return next();
  const { pool } = await import('../db/schema.js');
  const projectId = req.params.projectId || req.params.id;
  const r = await pool.query(
    'SELECT 1 FROM project_assignments WHERE project_id=$1 AND user_id=$2',
    [projectId, userId]
  );
  if (!r.rows.length) return res.status(403).json({ error: 'Sem acesso a este projeto' });
  next();
}
