import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function safeError(res, err) {
  console.error(`[DOCS ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production')
    return res.status(500).json({ error: 'Erro interno do servidor' });
  res.status(500).json({ error: err.message });
}

const SUPERIOR_ROLES = ['planejador', 'coordenador', 'admin'];

// Verifica se o usuário é autor do documento
async function isDocAuthor(docId, userId) {
  const r = await pool.query(
    'SELECT 1 FROM document_authors WHERE document_id=$1 AND user_id=$2',
    [docId, userId]
  );
  return r.rows.length > 0;
}

// Verifica se pode editar (autor ou superior)
async function canEdit(docId, userId, role) {
  if (SUPERIOR_ROLES.includes(role)) return true;
  return isDocAuthor(docId, userId);
}

// Helper: buscar autores de um documento
async function getAuthors(docId) {
  const r = await pool.query(
    `SELECT u.id, u.name, u.email FROM document_authors da
     JOIN users u ON u.id = da.user_id
     WHERE da.document_id = $1 ORDER BY da.added_at ASC`,
    [docId]
  );
  return r.rows;
}

// Helper: coerção de tipos numéricos
function parseNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

// ─── GET /  — lista todos os documentos com autores ──────────────────────────
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
      FROM documents d
      LEFT JOIN users u   ON u.id   = d.created_by
      LEFT JOIN users u2  ON u2.id  = d.updated_by
      LEFT JOIN document_authors da ON da.document_id = d.id
      LEFT JOIN users ua ON ua.id = da.user_id
    `;
    const params = [];
    if (year) { q += ' WHERE d.year = $1'; params.push(parseInt(year)); }
    q += ' GROUP BY d.id, u.name, u2.name ORDER BY d.base_code ASC NULLS LAST, d.sequence_number ASC, d.revision ASC NULLS FIRST';
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
      pool.query(`SELECT type, COUNT(*) AS count FROM documents ${yearFilter} GROUP BY type ORDER BY count DESC`, params),
      pool.query(`SELECT status, COUNT(*) AS count FROM documents ${yearFilter} GROUP BY status ORDER BY count DESC`, params),
      pool.query(`SELECT COUNT(*) AS count FROM documents ${yearFilter ? yearFilter + ' AND' : 'WHERE'} status = 'Publicado' AND (document_link IS NULL OR document_link = '')`, year ? [parseInt(year)] : []),
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
      'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM documents WHERE year = $1', [y]
    );
    res.json({ next: r.rows[0].next });
  } catch (err) { safeError(res, err); }
});

// ─── POST /  — criar documento ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { type, area, plant, responsible, date, subject, status, document_link, notes, author_ids } = req.body;
  const sequence_number = parseNum(req.body.sequence_number);
  const year            = parseNum(req.body.year);
  const revision        = parseNum(req.body.revision);
  const userId = req.user.id;

  if (!type || !area || !sequence_number || !year || !responsible || !date || !subject || !status)
    return res.status(400).json({ error: 'Campos obrigatórios: tipo, área, número, ano, responsável, data, título, status' });

  const seq  = String(sequence_number).padStart(3, '0');
  const yy   = String(year).padStart(2, '0');
  let code   = `${type}-${area}-${seq}-${yy}`;
  if (revision !== null) code += `-R${revision}`;
  const base_code = `${type}-${area}-${seq}-${yy}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`
      INSERT INTO documents
        (type, area, sequence_number, year, revision, plant, responsible, date, subject, status,
         document_link, notes, code, base_code, created_by, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,NOW(),NOW())
      RETURNING *
    `, [type, area, sequence_number, year, revision, plant||null, responsible, date, subject, status,
        document_link||null, notes||null, code, base_code, userId]);

    const docId = r.rows[0].id;

    // Inserir autores: sempre inclui o criador + lista enviada
    const rawIds = Array.isArray(author_ids) ? author_ids.map(Number).filter(Boolean) : [];
    const allAuthorIds = [...new Set([userId, ...rawIds])];
    for (const aid of allAuthorIds) {
      await client.query(
        'INSERT INTO document_authors (document_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [docId, aid, userId]
      );
    }

    await client.query('COMMIT');
    const authors = await getAuthors(docId);
    res.status(201).json({ ...r.rows[0], authors });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um documento com este código.' });
    safeError(res, err);
  } finally { client.release(); }
});

// ─── POST /:id/revision — nova revisão ────────────────────────────────────────
router.post('/:id/revision', async (req, res) => {
  const origId = parseInt(req.params.id);
  const { date, responsible } = req.body;
  const userId = req.user.id;

  if (!date) return res.status(400).json({ error: 'Data é obrigatória para nova revisão' });

  const client = await pool.connect();
  try {
    // Buscar documento original
    const orig = await client.query('SELECT * FROM documents WHERE id=$1', [origId]);
    if (!orig.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
    const o = orig.rows[0];

    // Verificar permissão
    if (!(await canEdit(origId, userId, req.user.role)))
      return res.status(403).json({ error: 'Sem permissão para criar revisão' });

    // Calcular próxima revisão
    const maxRev = await client.query(
      'SELECT COALESCE(MAX(revision), -1) AS max FROM documents WHERE base_code=$1',
      [o.base_code]
    );
    const nextRev = parseInt(maxRev.rows[0].max) + 1;

    const newCode = `${o.base_code}-R${nextRev}`;
    await client.query('BEGIN');

    const r = await client.query(`
      INSERT INTO documents
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
      'SELECT user_id FROM document_authors WHERE document_id=$1', [origId]
    );
    const authorSet = new Set([userId, ...origAuthors.rows.map(a => a.user_id)]);
    for (const aid of authorSet) {
      await client.query(
        'INSERT INTO document_authors (document_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
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

// ─── PUT /:id  — editar documento ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { plant, responsible, date, subject, status, document_link, notes, author_ids } = req.body;
  const userId = req.user.id;

  if (!(await canEdit(id, userId, req.user.role)))
    return res.status(403).json({ error: 'Sem permissão para editar este documento' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`
      UPDATE documents SET
        plant=$1, responsible=$2, date=$3, subject=$4, status=$5,
        document_link=$6, notes=$7, updated_by=$8, updated_at=NOW()
      WHERE id=$9 RETURNING *
    `, [plant||null, responsible, date, subject, status,
        document_link||null, notes||null, userId, id]);

    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Documento não encontrado' }); }

    // Atualizar autores se enviado
    if (Array.isArray(author_ids)) {
      await client.query('DELETE FROM document_authors WHERE document_id=$1', [id]);
      const allIds = [...new Set([userId, ...author_ids.map(Number).filter(Boolean)])];
      for (const aid of allIds) {
        await client.query(
          'INSERT INTO document_authors (document_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
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
router.patch('/:id/status', async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, document_link } = req.body;
  const userId = req.user.id;

  const validStatuses = ['Em elaboração', 'Para aprovação', 'Publicado', 'Cancelado'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Status inválido' });

  if (!(await canEdit(id, userId, req.user.role)))
    return res.status(403).json({ error: 'Sem permissão' });

  try {
    const r = await pool.query(
      'UPDATE documents SET status=$1, document_link=$2, updated_by=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [status, document_link || null, userId, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

export default router;
