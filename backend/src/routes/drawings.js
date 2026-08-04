import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.use(requirePageAccess('drawings'));

function safeError(res, err) {
  console.error(`[DRAWINGS ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production')
    return res.status(500).json({ error: 'Erro interno do servidor' });
  res.status(500).json({ error: err.message });
}

const SUPERIOR_ROLES = ['gestor', 'planejador', 'coordenador', 'admin'];

// Verifica se o usuário é autor do desenho
async function isDrawingAuthor(drawingId, userId) {
  const r = await pool.query(
    'SELECT 1 FROM drawing_authors WHERE drawing_id=$1 AND user_id=$2',
    [drawingId, userId]
  );
  return r.rows.length > 0;
}

// Verifica se o usuário é o solicitante do desenho (por nome)
async function isResponsible(drawingId, userName) {
  if (!userName) return false;
  const r = await pool.query(
    'SELECT 1 FROM drawings WHERE id=$1 AND LOWER(responsible)=LOWER($2)',
    [drawingId, userName]
  );
  return r.rows.length > 0;
}

// Verifica se o usuário tem delegação ativa do solicitante do desenho
async function hasActiveDelegationForDrawing(drawingId, userId) {
  const r = await pool.query(`
    SELECT 1 FROM access_delegations d
    JOIN users u ON u.id = d.delegator_id
    JOIN drawings dr ON LOWER(dr.responsible) = LOWER(u.name)
    WHERE d.delegate_id = $1
      AND d.active = true
      AND CURRENT_DATE BETWEEN d.start_date AND d.end_date
      AND dr.id = $2
  `, [userId, drawingId]);
  return r.rows.length > 0;
}

// Verifica se pode editar (autor, solicitante, delegação ativa ou superior)
async function canEdit(drawingId, userId, role, userName) {
  if (SUPERIOR_ROLES.includes(role)) return true;
  if (await isDrawingAuthor(drawingId, userId)) return true;
  if (await isResponsible(drawingId, userName)) return true;
  if (await hasActiveDelegationForDrawing(drawingId, userId)) return true;
  return false;
}

// Helper: buscar autores de um desenho
async function getAuthors(drawingId) {
  const r = await pool.query(
    `SELECT u.id, u.name, u.email FROM drawing_authors da
     JOIN users u ON u.id = da.user_id
     WHERE da.drawing_id = $1 ORDER BY da.added_at ASC`,
    [drawingId]
  );
  return r.rows;
}

// Helper: coerção de tipos numéricos
function parseNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

// Helper: normaliza plant (array ou string única) para array de usinas ou null
function normalizePlants(val) {
  if (Array.isArray(val)) {
    const arr = val.map(v => String(v).trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return null;
}

// ─── GET /  — lista todos os desenhos com autores ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { year } = req.query;
    let q = `
      SELECT d.*,
        u.name  AS created_by_name,
        u2.name AS updated_by_name,
        COALESCE(
          json_agg(json_build_object('id', ua.id, 'name', ua.name, 'email', ua.email))
          FILTER (WHERE ua.id IS NOT NULL), '[]'
        ) AS authors
      FROM drawings d
      LEFT JOIN users u   ON u.id   = d.created_by
      LEFT JOIN users u2  ON u2.id  = d.updated_by
      LEFT JOIN drawing_authors da ON da.drawing_id = d.id
      LEFT JOIN users ua ON ua.id = da.user_id
    `;
    const params = [];
    if (year) { q += ' WHERE d.year = $1'; params.push(parseInt(year)); }
    q += ' GROUP BY d.id, u.name, u2.name ORDER BY d.year ASC, d.sequence_number ASC, d.base_code ASC NULLS LAST, d.revision ASC NULLS FIRST';
    res.json((await pool.query(q, params)).rows);
  } catch (err) { safeError(res, err); }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { year } = req.query;
    const params = year ? [parseInt(year)] : [];
    const yearFilter = year ? 'WHERE year = $1' : '';

    const [byType, byStatus, pubNoLink] = await Promise.all([
      pool.query(`SELECT type, COUNT(*) AS count FROM drawings ${yearFilter} GROUP BY type ORDER BY count DESC`, params),
      pool.query(`SELECT status, COUNT(*) AS count FROM drawings ${yearFilter} GROUP BY status ORDER BY count DESC`, params),
      pool.query(`SELECT COUNT(*) AS count FROM drawings ${yearFilter ? yearFilter + ' AND' : 'WHERE'} status = 'Publicado' AND (document_link IS NULL OR document_link = '')`, year ? [parseInt(year)] : []),
    ]);

    res.json({
      by_type: byType.rows,
      by_status: byStatus.rows,
      published_without_link: parseInt(pubNoLink.rows[0]?.count || 0),
    });
  } catch (err) { safeError(res, err); }
});

// ─── GET /next-sequence ───────────────────────────────────────────────────────
router.get('/next-sequence', async (req, res) => {
  try {
    const y = parseInt(req.query.year) || new Date().getFullYear() % 100;
    const r = await pool.query(
      'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM drawings WHERE year = $1', [y]
    );
    res.json({ next: r.rows[0].next });
  } catch (err) { safeError(res, err); }
});

// ─── POST /  — criar desenho ───────────────────────────────────────────────────
router.post('/', requirePageAccess('drawings', { write: true }), async (req, res) => {
  const { type, area, plant, responsible, date, subject, status, document_link, notes, author_ids } = req.body;
  const sequence_number = parseNum(req.body.sequence_number);
  const year            = parseNum(req.body.year);
  const revision        = parseNum(req.body.revision);
  const userId = req.user.id;

  if (!type || !area || !sequence_number || !year || !responsible || !date || !subject || !status)
    return res.status(400).json({ error: 'Campos obrigatórios: tipo, área, número, ano, solicitante, data, assunto, status' });

  const seq  = String(sequence_number).padStart(4, '0');
  const yy   = String(year).padStart(2, '0');
  let code   = `${type}-${area}-${seq}-${yy}`;
  if (revision !== null) code += `-R${revision}`;
  const base_code = `${type}-${area}-${seq}-${yy}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`
      INSERT INTO drawings
        (type, area, sequence_number, year, revision, plant, responsible, date, subject, status,
         document_link, notes, code, base_code, created_by, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,NOW(),NOW())
      RETURNING *
    `, [type, area, sequence_number, year, revision, normalizePlants(plant), responsible, date, subject, status,
        document_link||null, notes||null, code, base_code, userId]);

    const drawingId = r.rows[0].id;

    // Inserir autores: sempre inclui o criador + lista enviada
    const rawIds = Array.isArray(author_ids) ? author_ids.map(Number).filter(Boolean) : [];
    const allAuthorIds = [...new Set([userId, ...rawIds])];
    for (const aid of allAuthorIds) {
      await client.query(
        'INSERT INTO drawing_authors (drawing_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [drawingId, aid, userId]
      );
    }

    await client.query('COMMIT');
    const authors = await getAuthors(drawingId);
    res.status(201).json({ ...r.rows[0], authors });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um desenho com este código.' });
    safeError(res, err);
  } finally { client.release(); }
});

// ─── POST /:id/revision — nova revisão ────────────────────────────────────────
router.post('/:id/revision', requirePageAccess('drawings', { write: true }), async (req, res) => {
  const origId = parseInt(req.params.id);
  const { date, responsible } = req.body;
  const userId = req.user.id;

  if (!date) return res.status(400).json({ error: 'Data é obrigatória para nova revisão' });

  const client = await pool.connect();
  try {
    // Buscar desenho original
    const orig = await client.query('SELECT * FROM drawings WHERE id=$1', [origId]);
    if (!orig.rows.length) return res.status(404).json({ error: 'Desenho não encontrado' });
    const o = orig.rows[0];

    // Verificar permissão
    if (!(await canEdit(origId, userId, req.user.role, req.user.name)))
      return res.status(403).json({ error: 'Sem permissão para criar revisão' });

    // Calcular próxima revisão
    const maxRev = await client.query(
      'SELECT COALESCE(MAX(revision), -1) AS max FROM drawings WHERE base_code=$1',
      [o.base_code]
    );
    const nextRev = parseInt(maxRev.rows[0].max) + 1;

    const newCode = `${o.base_code}-R${nextRev}`;
    await client.query('BEGIN');

    const r = await client.query(`
      INSERT INTO drawings
        (type, area, sequence_number, year, revision, plant, responsible, date, subject, status,
         document_link, notes, code, base_code, created_by, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,NOW(),NOW())
      RETURNING *
    `, [o.type, o.area, o.sequence_number, o.year, nextRev, o.plant,
        responsible || o.responsible, date, o.subject, 'Em elaboração',
        null, null, newCode, o.base_code, userId]);

    const newId = r.rows[0].id;

    // Copiar autores do original + adicionar criador
    const origAuthors = await client.query(
      'SELECT user_id FROM drawing_authors WHERE drawing_id=$1', [origId]
    );
    const authorSet = new Set([userId, ...origAuthors.rows.map(a => a.user_id)]);
    for (const aid of authorSet) {
      await client.query(
        'INSERT INTO drawing_authors (drawing_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [newId, aid, userId]
      );
    }

    await client.query('COMMIT');
    const authors = await getAuthors(newId);
    res.status(201).json({ ...r.rows[0], authors });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe uma revisão com este número.' });
    safeError(res, err);
  } finally { client.release(); }
});

// ─── PUT /:id  — editar desenho ────────────────────────────────────────────────
router.put('/:id', requirePageAccess('drawings', { write: true }), async (req, res) => {
  const id = parseInt(req.params.id);
  const { plant, responsible, date, subject, status, document_link, notes, author_ids } = req.body;
  const userId = req.user.id;

  if (!(await canEdit(id, userId, req.user.role, req.user.name)))
    return res.status(403).json({ error: 'Sem permissão para editar este desenho' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`
      UPDATE drawings SET
        plant=$1, responsible=$2, date=$3, subject=$4, status=$5,
        document_link=$6, notes=$7, updated_by=$8, updated_at=NOW()
      WHERE id=$9 RETURNING *
    `, [normalizePlants(plant), responsible, date, subject, status,
        document_link||null, notes||null, userId, id]);

    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Desenho não encontrado' }); }

    // Atualizar autores se enviado
    if (Array.isArray(author_ids)) {
      await client.query('DELETE FROM drawing_authors WHERE drawing_id=$1', [id]);
      const allIds = [...new Set([userId, ...author_ids.map(Number).filter(Boolean)])];
      for (const aid of allIds) {
        await client.query(
          'INSERT INTO drawing_authors (drawing_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, aid, userId]
        );
      }
    }

    await client.query('COMMIT');
    const authors = await getAuthors(id);
    res.json({ ...r.rows[0], authors });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally { client.release(); }
});

// ─── PATCH /:id/status — alterar só o status ─────────────────────────────────
router.patch('/:id/status', requirePageAccess('drawings', { write: true }), async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, document_link } = req.body;
  const userId = req.user.id;

  const validStatuses = ['Em elaboração', 'Para aprovação', 'Publicado', 'Cancelado'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Status inválido' });

  if (!(await canEdit(id, userId, req.user.role, req.user.name)))
    return res.status(403).json({ error: 'Sem permissão' });

  try {
    const r = await pool.query(
      'UPDATE drawings SET status=$1, document_link=$2, updated_by=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [status, document_link || null, userId, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Desenho não encontrado' });
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// ─── POST /import-bulk  — importação em massa via .docx ────────────────────
router.post('/import-bulk', requirePageAccess('drawings', { write: true }), async (req, res) => {
  const { documents } = req.body;
  if (!Array.isArray(documents) || documents.length === 0)
    return res.status(400).json({ error: 'Nenhum desenho enviado' });

  const client = await pool.connect();
  const result = { created: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    await client.query('BEGIN');
    for (const doc of documents) {
      try {
        const existing = await client.query(
          'SELECT id FROM drawings WHERE code = $1',
          [doc.code]
        );
        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE drawings SET
              plant = COALESCE($1, plant),
              responsible = COALESCE($2, responsible),
              date = COALESCE($3, date),
              subject = COALESCE($4, subject),
              status = COALESCE($5, status),
              updated_by = $6,
              updated_at = NOW()
             WHERE code = $7`,
            [normalizePlants(doc.plant), doc.responsible || null, doc.date || null, doc.subject || null, doc.status || null, req.user.id, doc.code]
          );
          result.updated++;
        } else {
          const baseCode = doc.base_code || doc.code.replace(/-R\d+$/, '');
          await client.query(
            `INSERT INTO drawings
              (type, area, sequence_number, year, revision, code, base_code, plant, responsible, date, subject, status, created_by, updated_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,NOW(),NOW())`,
            [doc.type, doc.area, doc.sequence_number, doc.year, doc.revision ?? null, doc.code, baseCode,
             normalizePlants(doc.plant), doc.responsible || null, doc.date || null, doc.subject || null,
             doc.status || 'Em elaboração', req.user.id]
          );
          result.created++;
        }
      } catch (err) {
        console.error('Erro ao importar desenho:', doc.code, err.message);
        result.errors++;
      }
    }
    await client.query('COMMIT');
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

export default router;
