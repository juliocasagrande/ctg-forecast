import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import ExcelJS from 'exceljs';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage() });

function safeError(res, err) {
  console.error(`[EQUIPAMENTOS ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production')
    return res.status(500).json({ error: 'Erro interno do servidor' });
  res.status(500).json({ error: err.message });
}

function canManage(user) {
  return ['admin', 'coordenador', 'planejador', 'gestor'].includes(user?.role) ||
    user?.email === 'julio.casagrande@ctgbr.com.br';
}

function bypassesFilter(user) {
  return ['admin', 'planejador'].includes(user?.role) ||
    user?.email === 'julio.casagrande@ctgbr.com.br';
}

// Normalize short usina names to full standard names
const USINA_NORMALIZE = {
  'Capivara':     'UHE Capivara',
  'Garibaldi':    'UHE Garibaldi',
  'Ilha Solteira':'UHE Ilha Solteira',
  'Rosana':       'UHE Rosana',
  'Salto':        'UHE Salto',
  'Taquaruçu':    'UHE Taquaruçu',
  'Chavantes':    'UHE Chavantes',
  'Jupiá':        'UHE Jupiá',
  'Jurumirim':    'UHE Jurumirim',
  'Salto Grande': 'UHE Salto Grande',
  'Canoas I':     'UHE Canoas 1',
  'Canoas 1':     'UHE Canoas 1',
  'Canoas II':    'UHE Canoas 2',
  'Canoas 2':     'UHE Canoas 2',
  'Palmeiras':    'PCH Palmeiras',
  'Retiro':       'PCH Retiro',
};

function normalizeUsina(name) {
  const t = String(name || '').trim();
  return USINA_NORMALIZE[t] || t;
}

// Check if user can edit records of a specific tipo_tabela.
// Bypass users always can. If table has restrictions, user must be explicitly listed.
// If no restrictions exist, only canManage-role users can edit.
async function canEditTable(user, _usina, tipoTabela) {
  if (bypassesFilter(user)) return true;
  const r = await pool.query(
    'SELECT user_id FROM equipamentos_acesso WHERE tipo_tabela=$1',
    [tipoTabela]
  );
  if (r.rows.length === 0) return canManage(user); // no restrictions → role-based
  return r.rows.some(row => row.user_id === user.id); // explicit access wins
}

/* ── GET all — visible to every authenticated user ───────────────────────── */
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM equipamentos_subestacao
      ORDER BY usina, tipo_tabela, equipamento, ug, tag
    `);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

/* ── GET /acesso ─────────────────────────────────────────────────────────── */
router.get('/acesso', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  try {
    // All known tables: from equipment data + pre-configured + existing access entries
    const tablesR = await pool.query(`
      SELECT DISTINCT tipo_tabela FROM (
        SELECT tipo_tabela FROM equipamentos_subestacao
        UNION
        SELECT tipo_tabela FROM equipamentos_tabelas_pre
        UNION
        SELECT tipo_tabela FROM equipamentos_acesso
      ) src
      ORDER BY tipo_tabela
    `);
    const accessR = await pool.query(`
      SELECT tipo_tabela, array_agg(user_id ORDER BY user_id) AS user_ids
      FROM equipamentos_acesso
      GROUP BY tipo_tabela
    `);
    const preR = await pool.query(`SELECT tipo_tabela FROM equipamentos_tabelas_pre`);
    const dataR = await pool.query(`SELECT DISTINCT tipo_tabela FROM equipamentos_subestacao`);

    const accessMap = {};
    for (const row of accessR.rows) accessMap[row.tipo_tabela] = row.user_ids;
    const preSet  = new Set(preR.rows.map(r => r.tipo_tabela));
    const dataSet = new Set(dataR.rows.map(r => r.tipo_tabela));

    const result = tablesR.rows.map(({ tipo_tabela }) => ({
      tipo_tabela,
      user_ids:         accessMap[tipo_tabela] || [],
      is_pre_configured: preSet.has(tipo_tabela),
      has_data:          dataSet.has(tipo_tabela),
    }));
    res.json(result);
  } catch (err) { safeError(res, err); }
});

/* ── POST /tabelas-pre — criar tabela pré-configurada ────────────────────── */
router.post('/tabelas-pre', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  const tipo_tabela = String(req.body.tipo_tabela || '').trim();
  if (!tipo_tabela) return res.status(400).json({ error: 'Nome da tabela é obrigatório' });
  try {
    await pool.query(
      `INSERT INTO equipamentos_tabelas_pre (tipo_tabela, created_by)
       VALUES ($1, $2) ON CONFLICT (tipo_tabela) DO NOTHING`,
      [tipo_tabela, req.user.id]
    );
    res.status(201).json({ ok: true, tipo_tabela });
  } catch (err) { safeError(res, err); }
});

/* ── DELETE /tabelas-pre — remover tabela pré-configurada ────────────────── */
router.delete('/tabelas-pre', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  const tipo_tabela = String(req.body.tipo_tabela || '').trim();
  if (!tipo_tabela) return res.status(400).json({ error: 'tipo_tabela é obrigatório' });
  try {
    const hasData = await pool.query(
      'SELECT 1 FROM equipamentos_subestacao WHERE tipo_tabela=$1 LIMIT 1',
      [tipo_tabela]
    );
    if (hasData.rows.length) return res.status(409).json({ error: 'Tabela já possui dados importados. Exclua os dados antes de remover a configuração.' });
    await pool.query('DELETE FROM equipamentos_tabelas_pre WHERE tipo_tabela=$1', [tipo_tabela]);
    await pool.query('DELETE FROM equipamentos_acesso WHERE tipo_tabela=$1', [tipo_tabela]);
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

/* ── PUT /acesso ─────────────────────────────────────────────────────────── */
router.put('/acesso', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  const assignments = req.body;
  if (!Array.isArray(assignments)) return res.status(400).json({ error: 'Formato inválido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { tipo_tabela } of assignments) {
      await client.query('DELETE FROM equipamentos_acesso WHERE tipo_tabela=$1', [tipo_tabela]);
    }
    for (const { tipo_tabela, user_ids } of assignments) {
      for (const uid of (user_ids || [])) {
        if (!uid) continue;
        await client.query(
          `INSERT INTO equipamentos_acesso (tipo_tabela, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [tipo_tabela, uid]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

/* ── DELETE /tabela — cascade delete all records of a tipo_tabela ────────── */
// Only bypass users (admin, planejador, julio) may use this.
router.delete('/tabela', async (req, res) => {
  if (!bypassesFilter(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  const tipo_tabela = String(req.body.tipo_tabela || '').trim();
  if (!tipo_tabela) return res.status(400).json({ error: 'tipo_tabela é obrigatório' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM equipamentos_acesso WHERE tipo_tabela=$1', [tipo_tabela]);
    const r = await client.query(
      'DELETE FROM equipamentos_subestacao WHERE tipo_tabela=$1 RETURNING id',
      [tipo_tabela]
    );
    await client.query('COMMIT');
    res.json({ ok: true, deleted: r.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

/* ── POST create ─────────────────────────────────────────────────────────── */
router.post('/', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  const { tipo_tabela, equipamento, ug, tag, fabricante, modelo, num_serie,
    tem_sobressalente, quantos, ano, url_imagem } = req.body;
  const usina = normalizeUsina(req.body.usina);
  try {
    if (!await canEditTable(req.user, usina, tipo_tabela || 'Geral'))
      return res.status(403).json({ error: 'Sem permissão para editar esta tabela' });
    const r = await pool.query(`
      INSERT INTO equipamentos_subestacao
        (usina, tipo_tabela, equipamento, ug, tag, fabricante, modelo, num_serie,
         tem_sobressalente, quantos, ano, url_imagem, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [usina, tipo_tabela || 'Geral', equipamento, ug, tag, fabricante, modelo,
        num_serie, tem_sobressalente || 'Não', quantos || 0, ano || null,
        url_imagem || null, req.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

/* ── PUT update ──────────────────────────────────────────────────────────── */
router.put('/:id', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  const { tipo_tabela, equipamento, ug, tag, fabricante, modelo, num_serie,
    tem_sobressalente, quantos, ano, url_imagem } = req.body;
  const usina = normalizeUsina(req.body.usina);
  try {
    // Fetch current record to check edit permission on original table
    const existing = await pool.query(
      'SELECT usina, tipo_tabela FROM equipamentos_subestacao WHERE id=$1',
      [req.params.id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    if (!await canEditTable(req.user, existing.rows[0].usina, existing.rows[0].tipo_tabela))
      return res.status(403).json({ error: 'Sem permissão para editar esta tabela' });

    const r = await pool.query(`
      UPDATE equipamentos_subestacao SET
        usina=$1, tipo_tabela=$2, equipamento=$3, ug=$4, tag=$5,
        fabricante=$6, modelo=$7, num_serie=$8, tem_sobressalente=$9,
        quantos=$10, ano=$11, url_imagem=$12, updated_at=NOW()
      WHERE id=$13 RETURNING *
    `, [usina, tipo_tabela || 'Geral', equipamento, ug, tag, fabricante, modelo,
        num_serie, tem_sobressalente || 'Não', quantos || 0, ano || null,
        url_imagem || null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

/* ── DELETE single record ────────────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
  try {
    const existing = await pool.query(
      'SELECT usina, tipo_tabela FROM equipamentos_subestacao WHERE id=$1',
      [req.params.id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    if (!await canEditTable(req.user, existing.rows[0].usina, existing.rows[0].tipo_tabela))
      return res.status(403).json({ error: 'Sem permissão para editar esta tabela' });
    await pool.query('DELETE FROM equipamentos_subestacao WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

/* ── GET /my-tabelas — tabelas que o usuário logado pode editar ──────────── */
router.get('/my-tabelas', async (req, res) => {
  try {
    if (bypassesFilter(req.user)) {
      const r = await pool.query(`
        SELECT DISTINCT tipo_tabela FROM (
          SELECT tipo_tabela FROM equipamentos_subestacao
          UNION SELECT tipo_tabela FROM equipamentos_tabelas_pre
        ) src ORDER BY tipo_tabela
      `);
      return res.json(r.rows.map(r => r.tipo_tabela));
    }
    if (canManage(req.user)) {
      // Tables with restrictions AND user is listed, plus unrestricted tables
      const restrictedR = await pool.query(
        'SELECT DISTINCT tipo_tabela FROM equipamentos_acesso'
      );
      const allowedR = await pool.query(
        'SELECT DISTINCT tipo_tabela FROM equipamentos_acesso WHERE user_id=$1',
        [req.user.id]
      );
      const restrictedSet = new Set(restrictedR.rows.map(r => r.tipo_tabela));
      const allowedSet    = new Set(allowedR.rows.map(r => r.tipo_tabela));
      const allR = await pool.query(`
        SELECT DISTINCT tipo_tabela FROM (
          SELECT tipo_tabela FROM equipamentos_subestacao
          UNION SELECT tipo_tabela FROM equipamentos_tabelas_pre
        ) src ORDER BY tipo_tabela
      `);
      const result = allR.rows.map(r => r.tipo_tabela)
        .filter(t => !restrictedSet.has(t) || allowedSet.has(t));
      return res.json(result);
    }
    // Regular users: only explicitly assigned tables
    const r = await pool.query(
      'SELECT DISTINCT tipo_tabela FROM equipamentos_acesso WHERE user_id=$1 ORDER BY tipo_tabela',
      [req.user.id]
    );
    res.json(r.rows.map(r => r.tipo_tabela));
  } catch (err) { safeError(res, err); }
});

/* ── POST import Excel ───────────────────────────────────────────────────── */
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const tipoTabela = String(req.body.tipo_tabela || '').trim();
  if (!tipoTabela) return res.status(400).json({ error: 'Informe o nome da tabela (tipo_tabela)' });

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'Planilha vazia' });

    const headers = {};
    ws.getRow(1).eachCell((cell, col) => {
      const h = String(cell.value || '').trim().toLowerCase()
        .replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
      headers[h] = col;
    });

    const COL = {
      usina:   headers['usina'],
      equip:   headers['equipamento'],
      ug:      headers['ug'],
      tag:     headers['tag'],
      fab:     headers['fabricante'],
      modelo:  headers['modelo'],
      serie:   headers['n_srie'] || headers['numero_serie'] || headers['num_serie'] || headers['n_serie'],
      sobress: headers['tem_sobressalente'],
      quantos: headers['quantos'],
      ano:     headers['ano'],
      url:     headers['url_da_imagem'] || headers['url_imagem'],
    };

    const rows = [];
    ws.eachRow((row, ri) => {
      if (ri === 1) return;
      const get = (col) => col ? String(row.getCell(col).value ?? '').trim() : '';
      const usina = normalizeUsina(get(COL.usina));
      const equip = get(COL.equip);
      const ug    = get(COL.ug);
      const tag   = get(COL.tag);
      if (!usina || !equip || !ug || !tag) return;

      rows.push({
        usina, tipo_tabela: tipoTabela, equipamento: equip, ug, tag,
        fabricante:        get(COL.fab)    || null,
        modelo:            get(COL.modelo) || null,
        num_serie:         get(COL.serie)  || null,
        tem_sobressalente: get(COL.sobress) || 'Não',
        quantos:           parseInt(get(COL.quantos)) || 0,
        ano:               parseInt(get(COL.ano))     || null,
        url_imagem:        get(COL.url)    || null,
      });
    });

    if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha válida encontrada' });

    // Check edit permission for this tipo_tabela
    if (!await canEditTable(req.user, null, tipoTabela))
      return res.status(403).json({ error: `Sem permissão para editar a tabela "${tipoTabela}"` });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (req.body.replace === 'true') {
        await client.query(
          'DELETE FROM equipamentos_subestacao WHERE tipo_tabela=$1',
          [tipoTabela]
        );
      }
      let inserted = 0;
      for (const r of rows) {
        await client.query(`
          INSERT INTO equipamentos_subestacao
            (usina, tipo_tabela, equipamento, ug, tag, fabricante, modelo,
             num_serie, tem_sobressalente, quantos, ano, url_imagem, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [r.usina, r.tipo_tabela, r.equipamento, r.ug, r.tag,
            r.fabricante, r.modelo, r.num_serie, r.tem_sobressalente,
            r.quantos, r.ano, r.url_imagem, req.user.id]);
        inserted++;
      }
      await client.query('COMMIT');
      res.json({ ok: true, inserted });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { safeError(res, err); }
});

/* ── GET export Excel ────────────────────────────────────────────────────── */
router.get('/export', async (req, res) => {
  try {
    const tabelasParam = req.query['tabelas[]'] || req.query.tabelas;
    let tabelas = Array.isArray(tabelasParam) ? tabelasParam : tabelasParam ? [tabelasParam] : [];
    tabelas = tabelas.map(t => String(t).trim()).filter(Boolean);

    let query = 'SELECT * FROM equipamentos_subestacao';
    const params = [];
    if (tabelas.length) { query += ' WHERE tipo_tabela = ANY($1)'; params.push(tabelas); }
    query += ' ORDER BY tipo_tabela, usina, equipamento, ug, tag';

    const r = await pool.query(query, params);

    const COLS = [
      { header: 'Usina',              key: 'usina',             width: 24 },
      { header: 'Equipamento',        key: 'equipamento',       width: 34 },
      { header: 'UG',                 key: 'ug',                width: 14 },
      { header: 'TAG',                key: 'tag',               width: 16 },
      { header: 'Fabricante',         key: 'fabricante',        width: 22 },
      { header: 'Modelo',             key: 'modelo',            width: 22 },
      { header: 'Nº Série',           key: 'num_serie',         width: 24 },
      { header: 'Tem sobressalente?', key: 'tem_sobressalente', width: 20 },
      { header: 'Quantos?',           key: 'quantos',           width: 12 },
      { header: 'Ano',                key: 'ano',               width: 10 },
      { header: 'URL da Imagem',      key: 'url_imagem',        width: 40 },
    ];
    const NAVY       = 'FF001F5B';
    const WHITE      = 'FFFFFFFF';
    const ALT_BLUE   = 'FFE8F0FE';
    const BORDER_CLR = 'FFCCCCCC';
    const lastCol    = String.fromCharCode(64 + COLS.length);

    const buildSheet = (ws, rows) => {
      ws.columns = COLS;
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      const hr = ws.getRow(1);
      hr.height = 26;
      COLS.forEach((_, i) => {
        const cell = hr.getCell(i + 1);
        cell.font      = { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border    = { top: { style: 'thin', color: { argb: NAVY } }, left: { style: 'thin', color: { argb: NAVY } }, bottom: { style: 'thin', color: { argb: NAVY } }, right: { style: 'thin', color: { argb: NAVY } } };
      });
      ws.autoFilter = { from: 'A1', to: `${lastCol}1` };

      rows.forEach((row, idx) => {
        const dr  = ws.addRow(COLS.map(c => row[c.key] ?? ''));
        const alt = idx % 2 === 1;
        dr.height = 18;
        COLS.forEach((_, i) => {
          const cell = dr.getCell(i + 1);
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? ALT_BLUE : WHITE } };
          cell.font      = { size: 9, name: 'Calibri' };
          cell.alignment = { vertical: 'middle' };
          cell.border    = { top: { style: 'hair', color: { argb: BORDER_CLR } }, left: { style: 'hair', color: { argb: BORDER_CLR } }, bottom: { style: 'hair', color: { argb: BORDER_CLR } }, right: { style: 'hair', color: { argb: BORDER_CLR } } };
        });
      });
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CTG Brasil';
    wb.created = new Date();

    const grouped = new Map();
    for (const row of r.rows) {
      if (!grouped.has(row.tipo_tabela)) grouped.set(row.tipo_tabela, []);
      grouped.get(row.tipo_tabela).push(row);
    }

    if (grouped.size === 0) {
      buildSheet(wb.addWorksheet('Equipamentos'), []);
    } else {
      for (const [tipoTabela, rows] of grouped) {
        buildSheet(wb.addWorksheet(tipoTabela.slice(0, 31)), rows);
      }
    }

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Equipamentos_${date}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { safeError(res, err); }
});

export default router;
