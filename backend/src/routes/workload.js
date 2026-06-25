import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const STATUS_VALUES = ['planejada', 'em_andamento', 'bloqueada', 'concluida'];
const PRIORITY_VALUES = ['baixa', 'media', 'alta'];

function effectiveRole(req) {
  return req.user._managerAccessOverride ? req.user.role : (req.user._originalRole || req.user.role);
}

// Engenheiro: somente as prÃ³prias demandas.
// Coordenador: as prÃ³prias + as de engenheiros ativos da sua Ã¡rea.
// admin/gestor/planejador/gerente: acesso total (segue o padrÃ£o do sistema).
function canManageDemand(req, ownerId, ownerRole = '', ownerArea = '') {
  const { role, id: requesterId, area: requesterArea } = req.user;
  if (role === 'engenheiro') return Number(ownerId) === Number(requesterId);
  if (role === 'coordenador') {
    return Number(ownerId) === Number(requesterId)
      || (ownerRole === 'engenheiro' && ownerArea === (requesterArea || 'eletrica'));
  }
  return ['admin', 'gestor', 'planejador', 'gerente'].includes(role);
}

function buildVisibilityWhere(req, baseParamCount = 0, tableAlias = 'w', userAlias = 'u') {
  const { id, area } = req.user;
  const role = effectiveRole(req);
  if (['admin', 'gestor', 'planejador', 'gerente'].includes(role)) {
    return { sql: '', params: [] };
  }
  if (role === 'coordenador') {
    return {
      sql: ` AND (${tableAlias}.user_id = $${baseParamCount + 1} OR (${userAlias}.role = 'engenheiro' AND COALESCE(${userAlias}.area,'eletrica') = $${baseParamCount + 2}))`,
      params: [id, area || 'eletrica'],
    };
  }
  return {
    sql: ` AND ${tableAlias}.user_id = $${baseParamCount + 1}`,
    params: [id],
  };
}

function normalizeDueDate(due_date) {
  if (!due_date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return undefined; // sentinel: invÃ¡lido
  return due_date;
}

router.get('/', async (req, res) => {
  const visibility = buildVisibilityWhere(req, 0);
  const { rows } = await pool.query(`
    SELECT w.id, w.user_id, u.name AS user_name, u.avatar_initials, u.role AS user_role,
           COALESCE(u.area,'eletrica') AS user_area,
           w.title, w.description, w.status, w.priority, w.load_percent, w.start_date, w.due_date,
           w.created_by, w.created_at, w.updated_at
    FROM workload_demands w
    JOIN users u ON u.id = w.user_id
    WHERE COALESCE(u.active, true) = true
    ${visibility.sql}
    ORDER BY u.name, w.created_at DESC
  `, visibility.params);
  res.json(rows);
});

router.get('/members', async (req, res) => {
  const role = effectiveRole(req);
  const { id: requesterId } = req.user;

  let query, params;
  if (['admin', 'gestor', 'planejador', 'gerente'].includes(role)) {
    query = `SELECT u.id, u.name, u.avatar_initials, u.role, COALESCE(u.area,'eletrica') AS area
              FROM users u WHERE u.active = true AND u.role IN ('engenheiro','coordenador','gerente','planejador')
              ORDER BY u.name`;
    params = [];
  } else if (role === 'coordenador') {
    const userArea = req.user.area || 'eletrica';
    query = `SELECT u.id, u.name, u.avatar_initials, u.role, COALESCE(u.area,'eletrica') AS area
              FROM users u WHERE u.active = true
              AND ((u.role = 'engenheiro' AND COALESCE(u.area,'eletrica') = $1) OR u.id = $2)
              ORDER BY u.name`;
    params = [userArea, requesterId];
  } else {
    query = `SELECT u.id, u.name, u.avatar_initials, u.role, COALESCE(u.area,'eletrica') AS area
              FROM users u WHERE u.active = true AND u.id = $1
              ORDER BY u.name`;
    params = [requesterId];
  }
  const { rows } = await pool.query(query, params);
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  res.json(rows);
});

router.get('/alerts/late', async (req, res) => {
  const visibility = buildVisibilityWhere(req, 0);
  const dismissedRes = await pool.query(
    `SELECT alert_key FROM alert_dismissals
     WHERE user_id=$1 AND alert_type='workload_late' AND dismissed_at >= date_trunc('month', CURRENT_DATE)`,
    [req.user.id]
  );
  const dismissed = new Set(dismissedRes.rows.map(row => String(row.alert_key)));
  const { rows } = await pool.query(`
    SELECT w.id, w.user_id, u.name AS user_name, u.avatar_initials, u.role AS user_role,
           COALESCE(u.area,'eletrica') AS user_area,
           w.title, w.description, w.status, w.priority, w.load_percent, w.start_date, w.due_date,
           w.created_by, w.created_at, w.updated_at
    FROM workload_demands w
    JOIN users u ON u.id = w.user_id
    WHERE COALESCE(u.active, true) = true
      AND w.status = 'bloqueada'
    ${visibility.sql}
    ORDER BY COALESCE(w.due_date, w.created_at::date) ASC, u.name, w.title
  `, visibility.params);
  const demands = rows.filter(row => !dismissed.has(String(row.id)));
  res.json({ count: demands.length, demands });
});
router.post('/', async (req, res) => {
  const { role, id: requesterId } = req.user;
  const { user_id, title, description, status, priority, load_percent, start_date, due_date } = req.body;

  const targetUserId = user_id != null ? Number(user_id) : requesterId;
  if (!Number.isInteger(targetUserId)) return res.status(400).json({ error: 'Colaborador invÃ¡lido' });

  if (role === 'engenheiro' && targetUserId !== requesterId)
    return res.status(403).json({ error: 'Sem permissÃ£o para criar demanda de outro usuÃ¡rio' });

  if (targetUserId !== requesterId) {
    const target = await pool.query("SELECT role, COALESCE(area,'eletrica') AS area FROM users WHERE id=$1 AND active=true", [targetUserId]);
    if (!target.rows.length) return res.status(400).json({ error: 'Colaborador nÃ£o encontrado' });
    if (!canManageDemand(req, targetUserId, target.rows[0].role, target.rows[0].area))
      return res.status(403).json({ error: 'Sem permissÃ£o para criar demanda para este usuÃ¡rio' });
  }

  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Informe o tÃ­tulo da demanda' });
  if (status && !STATUS_VALUES.includes(status)) return res.status(400).json({ error: 'Status invÃ¡lido' });
  if (priority && !PRIORITY_VALUES.includes(priority)) return res.status(400).json({ error: 'Prioridade invÃ¡lida' });

  const load = load_percent != null ? Number(load_percent) : 0;
  if (!Number.isFinite(load) || load < 0 || load > 100)
    return res.status(400).json({ error: 'Carga estimada deve estar entre 0 e 100' });

  const startDate = normalizeDueDate(start_date);
  const dueDate = normalizeDueDate(due_date);
  if (startDate === undefined || dueDate === undefined) return res.status(400).json({ error: 'Formato de data invÃ¡lido (use YYYY-MM-DD)' });
  if (startDate && dueDate && startDate > dueDate) return res.status(400).json({ error: 'O inÃ­cio deve ser anterior ao fim' });

  const { rows } = await pool.query(`
    INSERT INTO workload_demands (user_id, title, description, status, priority, load_percent, start_date, due_date, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    targetUserId, String(title).trim().slice(0, 200), description ? String(description).slice(0, 4000) : null,
    status || 'planejada', priority || 'media', Math.round(load), startDate, dueDate, requesterId,
  ]);
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { role } = req.user;
  const { id } = req.params;
  const existing = await pool.query(`
    SELECT w.user_id, u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM workload_demands w
    LEFT JOIN users u ON u.id = w.user_id
    WHERE w.id = $1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  const current = existing.rows[0];
  if (!canManageDemand(req, current.user_id, current.owner_role, current.owner_area))
    return res.status(403).json({ error: 'Sem permissÃ£o' });

  const { user_id, title, description, status, priority, load_percent, start_date, due_date } = req.body;
  const targetUserId = user_id != null ? Number(user_id) : current.user_id;
  if (!Number.isInteger(targetUserId)) return res.status(400).json({ error: 'Colaborador invÃ¡lido' });

  if (targetUserId !== current.user_id) {
    if (role === 'engenheiro') return res.status(403).json({ error: 'Sem permissÃ£o para reatribuir esta demanda' });
    const target = await pool.query("SELECT role, COALESCE(area,'eletrica') AS area FROM users WHERE id=$1 AND active=true", [targetUserId]);
    if (!target.rows.length) return res.status(400).json({ error: 'Colaborador nÃ£o encontrado' });
    if (!canManageDemand(req, targetUserId, target.rows[0].role, target.rows[0].area))
      return res.status(403).json({ error: 'Sem permissÃ£o para atribuir a este usuÃ¡rio' });
  }

  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Informe o tÃ­tulo da demanda' });
  if (status && !STATUS_VALUES.includes(status)) return res.status(400).json({ error: 'Status invÃ¡lido' });
  if (priority && !PRIORITY_VALUES.includes(priority)) return res.status(400).json({ error: 'Prioridade invÃ¡lida' });

  const load = load_percent != null ? Number(load_percent) : 0;
  if (!Number.isFinite(load) || load < 0 || load > 100)
    return res.status(400).json({ error: 'Carga estimada deve estar entre 0 e 100' });

  const startDate = normalizeDueDate(start_date);
  const dueDate = normalizeDueDate(due_date);
  if (startDate === undefined || dueDate === undefined) return res.status(400).json({ error: 'Formato de data invÃ¡lido (use YYYY-MM-DD)' });
  if (startDate && dueDate && startDate > dueDate) return res.status(400).json({ error: 'O inÃ­cio deve ser anterior ao fim' });

  const { rows } = await pool.query(`
    UPDATE workload_demands SET user_id=$1, title=$2, description=$3, status=$4, priority=$5,
      load_percent=$6, start_date=$7, due_date=$8, updated_at=NOW()
    WHERE id=$9 RETURNING *
  `, [
    targetUserId, String(title).trim().slice(0, 200), description ? String(description).slice(0, 4000) : null,
    status || 'planejada', priority || 'media', Math.round(load), startDate, dueDate, id,
  ]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await pool.query(`
    SELECT w.user_id, u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM workload_demands w
    LEFT JOIN users u ON u.id = w.user_id
    WHERE w.id = $1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  if (!canManageDemand(req, existing.rows[0].user_id, existing.rows[0].owner_role, existing.rows[0].owner_area))
    return res.status(403).json({ error: 'Sem permissÃ£o' });
  await pool.query('DELETE FROM workload_demands WHERE id=$1', [id]);
  res.json({ ok: true });
});

export default router;

