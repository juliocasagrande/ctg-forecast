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

  if (role === 'admin' || role === 'gestor' || role === 'planejador') {
    query = `
      SELECT DISTINCT ON (u.id)
             u.id, u.name, u.avatar_initials,
             COALESCE(vp.area, 'eletrica') AS area
      FROM users u
      LEFT JOIN vacation_periods vp ON vp.user_id = u.id
      WHERE u.active = true
        AND u.role IN ('engenheiro','gestor','planejador')
        ${area ? 'AND COALESCE(vp.area, \'eletrica\') = $1' : ''}
      ORDER BY u.id, vp.created_at DESC NULLS LAST
    `;
    params = area ? [area] : [];
  } else {
    query = `
      SELECT DISTINCT ON (u.id)
             u.id, u.name, u.avatar_initials,
             COALESCE(vp.area, 'eletrica') AS area
      FROM users u
      LEFT JOIN vacation_periods vp ON vp.user_id = u.id
      WHERE u.active = true
        AND u.role IN ('engenheiro','gestor','planejador')
        AND (
          u.id = $1
          OR COALESCE(vp.area, 'eletrica') IN (
            SELECT DISTINCT COALESCE(area, 'eletrica') FROM vacation_periods WHERE user_id = $1
          )
        )
      ORDER BY u.id, vp.created_at DESC NULLS LAST
    `;
    params = [userId];
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

  // Calcula dias corridos
  const start = new Date(start_date);
  const end   = new Date(end_date);
  const days  = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

  if (days <= 0) return res.status(400).json({ error: 'Data de fim deve ser após o início' });

  // Verifica conflito de período (mesmo usuário, mesmo número de período, mesmo ano)
  const conflict = await pool.query(
    `SELECT id FROM vacation_periods
     WHERE user_id = $1 AND year = $2 AND period_number = $3`,
    [user_id, year, period_number]
  );
  if (conflict.rows.length) {
    return res.status(409).json({ error: `Período ${period_number} já cadastrado para este ano` });
  }

  const { rows } = await pool.query(`
    INSERT INTO vacation_periods
      (user_id, area, period_number, start_date, end_date, days, adp_registered, year, notes, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [user_id, area, period_number, start_date, end_date, days, adp_registered ?? false, year, notes || null, requesterId]);

  res.status(201).json(rows[0]);
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
 * Remove período (gestor/admin: qualquer; engenheiro: só o próprio)
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
