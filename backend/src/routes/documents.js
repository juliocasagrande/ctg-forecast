import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function safeError(res, err) {
  console.error(`[DOCS ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production')
    return res.status(500).json({ error: 'Erro interno do servidor' });
  res.status(500).json({ error: err.message });
}

// GET all documents (optionally filter by year)
router.get('/', async (req, res) => {
  try {
    const { year } = req.query;
    let q = `
      SELECT d.*, u.name AS created_by_name, u2.name AS updated_by_name
      FROM documents d
      LEFT JOIN users u  ON u.id  = d.created_by
      LEFT JOIN users u2 ON u2.id = d.updated_by
    `;
    const params = [];
    if (year) { q += ' WHERE d.year = $1'; params.push(parseInt(year)); }
    q += ' ORDER BY d.sequence_number ASC';
    res.json((await pool.query(q, params)).rows);
  } catch (err) { safeError(res, err); }
});

// GET stats summary
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

// GET next sequence number
router.get('/next-sequence', async (req, res) => {
  try {
    const { year } = req.query;
    const y = parseInt(year) || new Date().getFullYear() % 100;
    const r = await pool.query(
      'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM documents WHERE year = $1',
      [y]
    );
    res.json({ next: r.rows[0].next });
  } catch (err) { safeError(res, err); }
});

// POST create document
router.post('/', async (req, res) => {
  const { type, area, plant, responsible, date, subject, status, document_link, notes } = req.body;
  const sequence_number = req.body.sequence_number !== undefined && req.body.sequence_number !== '' ? parseInt(req.body.sequence_number) : null;
  const year     = req.body.year     !== undefined && req.body.year     !== '' ? parseInt(req.body.year)     : null;
  const revision = req.body.revision !== undefined && req.body.revision !== '' ? parseInt(req.body.revision) : null;
  const userId = req.user.id;

  if (!type || !area || !sequence_number || !year || !responsible || !date || !subject || !status)
    return res.status(400).json({ error: 'Campos obrigatórios: tipo, área, número, ano, responsável, data, assunto, status' });

  // Build the document code: TYPE-AREA-SEQ-YY[-R#]
  const seq = String(sequence_number).padStart(3, '0');
  const yy  = String(year).padStart(2, '0');
  let code  = `${type}-${area}-${seq}-${yy}`;
  if (revision !== null) code += `-R${revision}`;

  try {
    const r = await pool.query(`
      INSERT INTO documents
        (type, area, sequence_number, year, revision, plant, responsible, date, subject, status, document_link, notes, code, created_by, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,NOW(),NOW())
      RETURNING *
    `, [type, area, sequence_number, year, revision, plant || null, responsible, date, subject, status, document_link || null, notes || null, code, userId]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um documento com este código.' });
    safeError(res, err);
  }
});

// PUT update document — owner or superior role
const SUPERIOR_ROLES = ['gestor', 'planejador', 'coordenador', 'admin'];

router.put('/:id', async (req, res) => {
  const { type, area, plant, responsible, date, subject, status, document_link, notes } = req.body;
  const sequence_number = req.body.sequence_number !== undefined && req.body.sequence_number !== '' ? parseInt(req.body.sequence_number) : null;
  const year     = req.body.year     !== undefined && req.body.year     !== '' ? parseInt(req.body.year)     : null;
  const revision = req.body.revision !== undefined && req.body.revision !== '' ? parseInt(req.body.revision) : null;
  const { id: userId, role } = req.user;
  const id = parseInt(req.params.id);

  try {
    // Check ownership unless superior role
    if (!SUPERIOR_ROLES.includes(role)) {
      const own = await pool.query('SELECT created_by FROM documents WHERE id=$1', [id]);
      if (!own.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
      if (own.rows[0].created_by !== userId)
        return res.status(403).json({ error: 'Você só pode editar seus próprios documentos' });
    }

    const seq = String(sequence_number).padStart(3, '0');
    const yy  = String(year).padStart(2, '0');
    let code  = `${type}-${area}-${seq}-${yy}`;
    if (revision !== null) code += `-R${revision}`;

    const r = await pool.query(`
      UPDATE documents SET
        type=$1, area=$2, sequence_number=$3, year=$4, revision=$5,
        plant=$6, responsible=$7, date=$8, subject=$9, status=$10,
        document_link=$11, notes=$12, code=$13, updated_by=$14, updated_at=NOW()
      WHERE id=$15 RETURNING *
    `, [type, area, sequence_number, year, revision, plant || null, responsible, date, subject, status, document_link || null, notes || null, code, userId, id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um documento com este código.' });
    safeError(res, err);
  }
});

// DELETE document — owner or superior role
router.delete('/:id', async (req, res) => {
  const { id: userId, role } = req.user;
  const id = parseInt(req.params.id);
  try {
    if (!SUPERIOR_ROLES.includes(role)) {
      const own = await pool.query('SELECT created_by FROM documents WHERE id=$1', [id]);
      if (!own.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
      if (own.rows[0].created_by !== userId)
        return res.status(403).json({ error: 'Você só pode excluir seus próprios documentos' });
    }
    const r = await pool.query('DELETE FROM documents WHERE id=$1 RETURNING id', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

export default router;
