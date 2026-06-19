import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/* ────────────────────────────────────────────────
 * GET /api/vacations?year=2026&area=eletrica
 * Retorna todos os períodos do ano, agrupados por área
 * ──────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const area = req.query.area || null;

  const { rows } = await pool.query(`
    SELECT
      vp.id,
      vp.user_id,
      u.name     AS user_name,
      u.avatar_initials,
      vp.area,
      vp.period_number,
      vp.start_date,
      vp.end_date,
      vp.days,
      vp.adp_registered,
      vp.year,
      vp.notes,
      vp.created_at,
      vp.updated_at
    FROM vacation_periods vp
    JOIN users u ON u.id = vp.user_id
    WHERE vp.year = $1
      AND u.active = true
      ${area ? 'AND vp.area = $2' : ''}
    ORDER BY u.name, vp.period_number
  `, area ? [year, area] : [year]);

  res.json(rows);
});

/* ────────────────────────────────────────────────
 * GET /api/vacations/members?area=eletrica
 * Lista membros com área (para o seletor de pessoa)
 * Gestor/admin vê todos; engenheiro vê só seu grupo
 * ──────────────────────────────────────────────── */
router.get('/members', async (req, res) => {
  const area = req.query.area || null;
  const { role, id: userId } = req.user;

  let query, params;

  if (role === 'admin' || role === 'planejador' || role === 'gerente') {
    // Admin/Gestor/Planejador/Gerente: vê todos os colaboradores
    query = `
      SELECT u.id, u.name, u.avatar_initials, u.role,
             COALESCE(u.area, 'eletrica') AS area
      FROM users u
      WHERE u.active = true
        AND u.role IN ('engenheiro','coordenador','gerente','planejador')
        ${area ? "AND COALESCE(u.area, 'eletrica') = $1" : ''}
      ORDER BY u.name
    `;
    params = area ? [area] : [];
  } else if (role === 'coordenador') {
    // Coordenador: engenheiros da sua área + todos coordenadores e gerentes
    const userArea = req.user.area || 'eletrica';
    query = `
      SELECT u.id, u.name, u.avatar_initials, u.role,
             COALESCE(u.area, 'eletrica') AS area
      FROM users u
      WHERE u.active = true
        AND (
          (u.role = 'engenheiro' AND COALESCE(u.area, 'eletrica') = $1)
          OR u.role IN ('coordenador', 'gerente')
        )
      ORDER BY u.name
    `;
    params = [userArea];
  } else {
    // Engenheiro: todos da sua mesma área + coordenadores
    const engArea = req.user.area || 'eletrica';
    query = `
      SELECT u.id, u.name, u.avatar_initials, u.role,
             COALESCE(u.area, 'eletrica') AS area
      FROM users u
      WHERE u.active = true
        AND (
          (u.role = 'engenheiro' AND COALESCE(u.area, 'eletrica') = $1)
          OR (u.role = 'coordenador' AND COALESCE(u.area, 'eletrica') = $1)
        )
      ORDER BY u.name
    `;
    params = [engArea];
  }

  const { rows } = await pool.query(query, params);
  // Ordena por nome no app
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  res.json(rows);
});

/* ────────────────────────────────────────────────
 * POST /api/vacations
 * Cria novo período de férias
 * ──────────────────────────────────────────────── */
router.post('/', async (req, res) => {
  const { role, id: requesterId } = req.user;
  const { user_id, area, period_number, start_date, end_date, adp_registered, year, notes } = req.body;

  // Engenheiro só pode criar para si mesmo
  if (role === 'engenheiro' && user_id !== requesterId) {
    return res.status(403).json({ error: 'Sem permissão para criar férias de outro usuário' });
  }

  // Coordenador não pode criar/editar férias de gerentes/diretores
  if (role === 'coordenador') {
    const targetUser = await pool.query('SELECT role FROM users WHERE id=$1', [user_id]);
    if (targetUser.rows.length && ['gerente', 'admin'].includes(targetUser.rows[0].role)) {
      return res.status(403).json({ error: 'Coordenadores não podem alterar férias de gerentes ou diretores' });
    }
  }

  // Validate date formats
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(start_date) || !dateRegex.test(end_date))
    return res.status(400).json({ error: 'Formato de data inválido (use YYYY-MM-DD)' });

  // Calcula dias corridos
  const start = new Date(start_date + 'T12:00:00');
  const end   = new Date(end_date + 'T12:00:00');
  const days  = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

  if (days <= 0) return res.status(400).json({ error: 'Data de fim deve ser após o início' });
  if (days > 365) return res.status(400).json({ error: 'Período não pode exceder 365 dias' });

  // Verifica conflito de período (mesmo usuário, mesmo número de período, mesmo ano)
  const conflict = await pool.query(
    `SELECT id FROM vacation_periods
     WHERE user_id = $1 AND year = $2 AND period_number = $3`,
    [user_id, year, period_number]
  );
  if (conflict.rows.length) {
    return res.status(409).json({ error: `Período ${period_number} já cadastrado para este ano` });
  }

  // Verifica sobreposição com colegas da mesma área/grupo e notifica
  // Determina grupo do usuário solicitante
  const userInfo = await pool.query('SELECT role, area FROM users WHERE id=$1', [user_id]);
  const uRole = userInfo.rows[0]?.role || 'engenheiro';
  const uArea = userInfo.rows[0]?.area || 'eletrica';

  let overlapQuery;
  let overlapParams;
  if (['gerente', 'coordenador'].includes(uRole)) {
    // Gerentes/coordenadores: verificar sobreposição com outros gerentes/coordenadores
    overlapQuery = `
      SELECT vp.user_id, u.name AS user_name
      FROM vacation_periods vp
      JOIN users u ON u.id = vp.user_id
      WHERE vp.user_id != $1
        AND u.role IN ('gerente', 'coordenador')
        AND vp.year = $2
        AND vp.start_date <= $3
        AND vp.end_date >= $4
    `;
    overlapParams = [user_id, year, end_date, start_date];
  } else {
    // Engenheiros: verificar sobreposição com colegas da mesma área
    overlapQuery = `
      SELECT vp.user_id, u.name AS user_name
      FROM vacation_periods vp
      JOIN users u ON u.id = vp.user_id
      WHERE vp.user_id != $1
        AND u.role = 'engenheiro'
        AND COALESCE(u.area, 'eletrica') = $2
        AND vp.year = $3
        AND vp.start_date <= $4
        AND vp.end_date >= $5
    `;
    overlapParams = [user_id, uArea, year, end_date, start_date];
  }
  const overlapRes = await pool.query(overlapQuery, overlapParams);
  const overlappingColleagues = overlapRes.rows;

  const { rows } = await pool.query(`
    INSERT INTO vacation_periods
      (user_id, area, period_number, start_date, end_date, days, adp_registered, year, notes, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [user_id, area, period_number, start_date, end_date, days, adp_registered ?? false, year, notes ? String(notes).slice(0, 1000) : null, requesterId]);

  const newPeriod = rows[0];

  // Se houver sobreposição, criar notificação para os colegas afetados
  if (overlappingColleagues.length > 0) {
    const requesterInfo = await pool.query('SELECT name FROM users WHERE id=$1', [user_id]);
    const requesterName = requesterInfo.rows[0]?.name || 'Colega';
    for (const colleague of overlappingColleagues) {
      try {
        await pool.query(`
          INSERT INTO messages (project_id, user_id, content, created_at)
          SELECT NULL, $1, $2, NOW()
          WHERE EXISTS (SELECT 1 FROM users WHERE id=$1)
        `, [colleague.user_id, `⚠️ Conflito de férias: ${requesterName} marcou férias no mesmo período que você (${start_date} a ${end_date}).`]);
      } catch (_) {}
    }
  }

  res.status(201).json({
    ...newPeriod,
    overlap_warning: overlappingColleagues.length > 0
      ? `Atenção: ${overlappingColleagues.map(c => c.user_name).join(', ')} também ${overlappingColleagues.length === 1 ? 'tem' : 'têm'} férias neste período.`
      : null,
    overlapping_colleagues: overlappingColleagues,
  });
});

/* ────────────────────────────────────────────────
 * PUT /api/vacations/:id
 * Atualiza período existente
 * ──────────────────────────────────────────────── */
router.put('/:id', async (req, res) => {
  const { role, id: requesterId } = req.user;
  const { id } = req.params;

  // Busca o registro para verificar ownership
  const existing = await pool.query('SELECT user_id FROM vacation_periods WHERE id = $1', [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Período não encontrado' });

  const owner = existing.rows[0].user_id;
  if (role === 'engenheiro' && owner !== requesterId) {
    return res.status(403).json({ error: 'Sem permissão para editar férias de outro usuário' });
  }

  const { area, period_number, start_date, end_date, adp_registered, year, notes } = req.body;

  const start = new Date(start_date);
  const end   = new Date(end_date);
  const days  = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

  if (days <= 0) return res.status(400).json({ error: 'Data de fim deve ser após o início' });

  const { rows } = await pool.query(`
    UPDATE vacation_periods
    SET area = $1, period_number = $2, start_date = $3, end_date = $4,
        days = $5, adp_registered = $6, year = $7, notes = $8,
        updated_at = NOW()
    WHERE id = $9
    RETURNING *
  `, [area, period_number, start_date, end_date, days, adp_registered ?? false, year, notes || null, id]);

  res.json(rows[0]);
});

/* ────────────────────────────────────────────────
 * DELETE /api/vacations/:id
 * Remove período (admin: qualquer; engenheiro: só o próprio)
 * ──────────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  const { role, id: requesterId } = req.user;
  const { id } = req.params;

  const existing = await pool.query('SELECT user_id FROM vacation_periods WHERE id = $1', [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Período não encontrado' });

  const owner = existing.rows[0].user_id;
  if (role === 'engenheiro' && owner !== requesterId) {
    return res.status(403).json({ error: 'Sem permissão' });
  }

  await pool.query('DELETE FROM vacation_periods WHERE id = $1', [id]);
  res.json({ ok: true });
});

export default router;
