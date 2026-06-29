import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWorkbookFromBuffer, parseLegacyWorkbook } from '../utils/pmsExcelFormat.js';

const router = Router();
router.use(requireAuth);

function safeError(res, err) {
  console.error(`[PMS ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production')
    return res.status(500).json({ error: 'Erro interno do servidor' });
  res.status(500).json({ error: err.message });
}

const TYPES = ['POL', 'IM', 'GM', 'MM'];
const STATUSES = ['Em elaboração', 'Para aprovação', 'Publicado', 'Cancelado'];
const SUPERIOR_ROLES = ['gerente', 'coordenador', 'admin'];

const VALIDADE_EXPR = `
  CASE WHEN (date + INTERVAL '3 years') < CURRENT_DATE THEN 'Vencido'
       WHEN (date + INTERVAL '3 years') <= CURRENT_DATE + INTERVAL '30 days' THEN 'Alerta'
       ELSE 'Em dia' END
`;
const SELECT_COMPUTED = `
  (date + INTERVAL '3 years')::date                     AS expiry_date,
  ((date + INTERVAL '3 years')::date - CURRENT_DATE)     AS days_to_expire,
  ${VALIDADE_EXPR}                                       AS validade_status
`;

// pms_documents.area é texto livre (ex: "Engenharia Elétrica"), enquanto users.area
// é um slug fixo — comparamos por radical da palavra em português.
const AREA_ROOTS = {
  eletrica:       'el.tric',
  mecanica:       'mec.nic',
  confiabilidade: 'confiabilidade',
  modernizacao:   'moderniza',
  coordenacao:    'coordena',
};
function areaMatchesUser(docArea, userArea) {
  const root = AREA_ROOTS[String(userArea || '').toLowerCase()];
  if (!root) return false;
  return new RegExp(root, 'i').test(String(docArea || ''));
}

function canEdit(doc, userRole, userName) {
  if (SUPERIOR_ROLES.includes(userRole)) return true;
  if (doc.responsible && userName && doc.responsible.trim().toLowerCase() === userName.trim().toLowerCase()) return true;
  return false;
}

// ─── GET /  — lista todos os documentos PMS ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, plant, area } = req.query;
    let q = `
      SELECT d.*,
        u.name  AS created_by_name,
        u2.name AS updated_by_name,
        ${SELECT_COMPUTED}
      FROM pms_documents d
      LEFT JOIN users u  ON u.id  = d.created_by
      LEFT JOIN users u2 ON u2.id = d.updated_by
      WHERE 1=1
    `;
    const params = [];
    if (type)  { params.push(type);  q += ` AND d.type = $${params.length}`; }
    if (plant) { params.push(plant); q += ` AND d.plant = $${params.length}`; }
    if (area)  { params.push(area);  q += ` AND d.area = $${params.length}`; }
    q += ' ORDER BY d.type ASC, d.base_code ASC, d.revision ASC NULLS FIRST';
    res.json((await pool.query(q, params)).rows);
  } catch (err) { safeError(res, err); }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    // Considera apenas a revisão mais recente de cada base_code (documento "ativo")
    const latestCte = `
      WITH latest AS (
        SELECT DISTINCT ON (base_code) *, ${SELECT_COMPUTED}
        FROM pms_documents
        ORDER BY base_code, revision DESC NULLS LAST
      )
    `;
    const [byType, byStatus, byValidade, byPlant] = await Promise.all([
      pool.query(`${latestCte} SELECT type, COUNT(*) AS count FROM latest GROUP BY type ORDER BY count DESC`),
      pool.query(`${latestCte} SELECT status, COUNT(*) AS count FROM latest GROUP BY status ORDER BY count DESC`),
      pool.query(`${latestCte} SELECT validade_status, COUNT(*) AS count FROM latest GROUP BY validade_status ORDER BY count DESC`),
      pool.query(`${latestCte} SELECT plant, COUNT(*) AS count FROM latest WHERE plant IS NOT NULL GROUP BY plant ORDER BY count DESC`),
    ]);
    res.json({
      by_type: byType.rows,
      by_status: byStatus.rows,
      by_validade: byValidade.rows,
      by_plant: byPlant.rows,
    });
  } catch (err) { safeError(res, err); }
});

// ─── GET /alerts — documentos vencendo/vencidos (sino de alertas) ───────────
router.get('/alerts', async (req, res) => {
  try {
    const cfgRes = await pool.query(
      "SELECT key, value FROM system_settings WHERE key IN ('pms_alert_enabled','pms_alert_days','pms_alert_roles')"
    );
    const cfg = {};
    cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
    if (cfg.pms_alert_enabled === 'false') return res.json({ count: 0, docs: [] });

    const alertRoles = (cfg.pms_alert_roles || 'coordenador,gerente,admin').split(',').map(r => r.trim()).filter(Boolean);
    const role = req.user._managerAccessOverride ? req.user.role : (req.user._originalRole || req.user.role);
    const userName = req.user.name || '';
    const isPrivileged = alertRoles.includes(role);

    const r = await pool.query(`
      WITH latest AS (
        SELECT DISTINCT ON (base_code) *, ${SELECT_COMPUTED}
        FROM pms_documents
        ORDER BY base_code, revision DESC NULLS LAST
      )
      SELECT * FROM latest
      WHERE status != 'Cancelado' AND validade_status IN ('Alerta','Vencido')
      ORDER BY days_to_expire ASC
    `);

    const visible = r.rows.filter(d => {
      if (isPrivileged && role === 'coordenador') return areaMatchesUser(d.area, req.user.area);
      return isPrivileged || d.responsible.trim().toLowerCase() === userName.trim().toLowerCase();
    });

    const dismissedRes = await pool.query(
      `SELECT alert_key FROM alert_dismissals
       WHERE user_id=$1 AND alert_type='pms_expiring' AND dismissed_at >= date_trunc('month', CURRENT_DATE)`,
      [req.user.id]
    );
    const dismissed = new Set(dismissedRes.rows.map(r => r.alert_key));
    const docs = visible.filter(d => !dismissed.has(String(d.id)));

    res.json({ count: docs.length, docs });
  } catch (err) { safeError(res, err); }
});

// ─── POST /  — criar documento ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    type, code, category, plant, equipment_number, sub_item, area,
    title_pt, title_en, has_pt, has_en, responsible, date, status,
    document_link, notes,
  } = req.body;
  const userId = req.user.id;

  if (!type || !TYPES.includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
  if (!code || !area || !title_pt || !responsible || !date)
    return res.status(400).json({ error: 'Campos obrigatórios: código, área, título, responsável, data' });

  const base_code = code.replace(/-R\d+$/, '');

  try {
    const r = await pool.query(`
      INSERT INTO pms_documents
        (type, code, base_code, revision, category, plant, equipment_number, sub_item, area,
         title_pt, title_en, has_pt, has_en, responsible, date, status, document_link, notes,
         created_by, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19,NOW(),NOW())
      RETURNING *
    `, [type, code, base_code, null, category || null, plant || null, equipment_number || null,
        sub_item || null, area, title_pt, title_en || null, has_pt !== false, !!has_en,
        responsible, date, status || 'Em elaboração', document_link || null, notes || null, userId]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um documento com este código.' });
    safeError(res, err);
  }
});

// ─── POST /:id/revision — nova revisão (reinicia validade) ──────────────────
router.post('/:id/revision', async (req, res) => {
  const origId = parseInt(req.params.id);
  const { date, responsible } = req.body;
  const userId = req.user.id;

  if (!date) return res.status(400).json({ error: 'Data é obrigatória para nova revisão' });

  const client = await pool.connect();
  try {
    const orig = await client.query('SELECT * FROM pms_documents WHERE id=$1', [origId]);
    if (!orig.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
    const o = orig.rows[0];

    if (!canEdit(o, req.user.role, req.user.name))
      return res.status(403).json({ error: 'Sem permissão para criar revisão' });

    const maxRev = await client.query(
      'SELECT COALESCE(MAX(revision), -1) AS max FROM pms_documents WHERE base_code=$1',
      [o.base_code]
    );
    const nextRev = parseInt(maxRev.rows[0].max) + 1;
    const newCode = `${o.base_code}-R${nextRev}`;

    await client.query('BEGIN');
    const r = await client.query(`
      INSERT INTO pms_documents
        (type, code, base_code, revision, category, plant, equipment_number, sub_item, area,
         title_pt, title_en, has_pt, has_en, responsible, date, status, document_link, notes,
         created_by, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19,NOW(),NOW())
      RETURNING *
    `, [o.type, newCode, o.base_code, nextRev, o.category, o.plant, o.equipment_number, o.sub_item,
        o.area, o.title_pt, o.title_en, o.has_pt, o.has_en, responsible || o.responsible, date,
        'Em elaboração', null, null, userId]);
    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe uma revisão com este número.' });
    safeError(res, err);
  } finally { client.release(); }
});

// ─── PUT /:id  — editar documento ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    category, plant, equipment_number, sub_item, area, title_pt, title_en,
    has_pt, has_en, responsible, date, status, document_link, notes,
  } = req.body;
  const userId = req.user.id;

  try {
    const existing = await pool.query('SELECT * FROM pms_documents WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
    if (!canEdit(existing.rows[0], req.user.role, req.user.name))
      return res.status(403).json({ error: 'Sem permissão para editar este documento' });

    const r = await pool.query(`
      UPDATE pms_documents SET
        category=$1, plant=$2, equipment_number=$3, sub_item=$4, area=$5,
        title_pt=$6, title_en=$7, has_pt=$8, has_en=$9, responsible=$10,
        date=$11, status=$12, document_link=$13, notes=$14, updated_by=$15, updated_at=NOW()
      WHERE id=$16 RETURNING *
    `, [category || null, plant || null, equipment_number || null, sub_item || null, area,
        title_pt, title_en || null, has_pt !== false, !!has_en, responsible, date,
        status, document_link || null, notes || null, userId, id]);
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// ─── PATCH /:id/status — alterar só o status de fluxo ────────────────────────
router.patch('/:id/status', async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, document_link } = req.body;
  const userId = req.user.id;

  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  try {
    const existing = await pool.query('SELECT * FROM pms_documents WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Documento não encontrado' });
    if (!canEdit(existing.rows[0], req.user.role, req.user.name))
      return res.status(403).json({ error: 'Sem permissão' });

    const r = await pool.query(
      'UPDATE pms_documents SET status=$1, document_link=$2, updated_by=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [status, document_link || null, userId, id]
    );
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// ─── Excel import — mesmo modelo de referência usado pela engenharia ────────
// Workbook com 4 abas (POL/IM/GM/MM), layout idêntico ao arquivo legado e ao
// que a própria página exporta (ver backend/src/utils/pmsExcelFormat.js).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok = file.mimetype.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls');
    ok ? cb(null, true) : cb(new Error('Apenas arquivos Excel são aceitos.'));
  },
});

const IMPORT_PLACEHOLDER_RESPONSIBLE = 'A definir';

// POST /api/pms/import/preview — só faz o parse, não grava
router.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const wb = await loadWorkbookFromBuffer(req.file.buffer);
    const { rows, perSheet } = parseLegacyWorkbook(wb, IMPORT_PLACEHOLDER_RESPONSIBLE);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nenhum registro encontrado. Verifique se o arquivo possui as abas POL/IM/GM/MM no layout esperado.' });
    }
    res.json({ total: rows.length, perSheet, sample: rows.slice(0, 20) });
  } catch (err) { safeError(res, err); }
});

// POST /api/pms/import — grava (cria ou atualiza por código)
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
  const client = await pool.connect();
  const result = { created: 0, updated: 0, errors: 0 };
  try {
    const wb = await loadWorkbookFromBuffer(req.file.buffer);
    const { rows } = parseLegacyWorkbook(wb, IMPORT_PLACEHOLDER_RESPONSIBLE);
    await client.query('BEGIN');
    for (const row of rows) {
      try {
        if (!row.area || !row.title_pt || !row.date) { result.errors++; continue; }

        const existing = await client.query('SELECT id FROM pms_documents WHERE code=$1', [row.code]);
        if (existing.rows.length) {
          // Responsável não existe no arquivo de referência: nunca sobrescreve o já atribuído na UI.
          await client.query(`
            UPDATE pms_documents SET
              category=$1, plant=$2, equipment_number=$3, sub_item=$4, area=$5,
              title_pt=$6, title_en=$7, has_pt=$8, has_en=$9, date=$10, status=$11,
              updated_by=$12, updated_at=NOW()
            WHERE code=$13
          `, [row.category, row.plant, row.equipment_number, row.sub_item, row.area,
              row.title_pt, row.title_en, row.has_pt, row.has_en, row.date, row.status,
              req.user.id, row.code]);
          result.updated++;
        } else {
          await client.query(`
            INSERT INTO pms_documents
              (type, code, base_code, revision, category, plant, equipment_number, sub_item, area,
               title_pt, title_en, has_pt, has_en, responsible, date, status,
               created_by, updated_by, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,NOW(),NOW())
          `, [row.type, row.code, row.base_code, row.revision, row.category, row.plant, row.equipment_number,
              row.sub_item, row.area, row.title_pt, row.title_en, row.has_pt, row.has_en,
              row.responsible, row.date, row.status, req.user.id]);
          result.created++;
        }
      } catch (err) {
        console.error('Erro ao importar doc PMS:', row.code, err.message);
        result.errors++;
      }
    }
    await client.query('COMMIT');
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally { client.release(); }
});

export default router;
