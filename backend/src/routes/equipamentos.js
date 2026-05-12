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

// Check if user can edit records of a specific (usina, tipo_tabela).
// Bypass users always can. canManage users can if no restriction entry exists,
// or if they are listed in equipamentos_acesso for that combo.
async function canEditTable(user, usina, tipoTabela) {
  if (bypassesFilter(user)) return true;
  if (!canManage(user)) return false;
  const r = await pool.query(
    'SELECT user_id FROM equipamentos_acesso WHERE usina=$1 AND tipo_tabela=$2',
    [usina, tipoTabela]
  );
  if (r.rows.length === 0) return true; // no restrictions set → all managers can edit
  return r.rows.some(row => row.user_id === user.id);
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
    const r = await pool.query(`
      SELECT a.usina, a.tipo_tabela,
        array_agg(a.user_id ORDER BY a.user_id) AS user_ids
      FROM equipamentos_acesso a
      GROUP BY a.usina, a.tipo_tabela
      ORDER BY a.usina, a.tipo_tabela
    `);
    res.json(r.rows);
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
    for (const { usina, tipo_tabela } of assignments) {
      await client.query(
        'DELETE FROM equipamentos_acesso WHERE usina=$1 AND tipo_tabela=$2',
        [usina, tipo_tabela]
      );
    }
    for (const { usina, tipo_tabela, user_ids } of assignments) {
      for (const uid of (user_ids || [])) {
        if (!uid) continue;
        await client.query(
          `INSERT INTO equipamentos_acesso (usina, tipo_tabela, user_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [usina, tipo_tabela, uid]
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

/* ── POST import Excel ───────────────────────────────────────────────────── */
router.post('/import', upload.single('file'), async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Sem permissão' });
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

    // Check edit permission per unique usina in the file
    const usinas = [...new Set(rows.map(r => r.usina))];
    for (const usina of usinas) {
      if (!await canEditTable(req.user, usina, tipoTabela))
        return res.status(403).json({ error: `Sem permissão para editar a tabela "${tipoTabela}" em ${usina}` });
    }

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
    const r = await pool.query(`
      SELECT * FROM equipamentos_subestacao
      ORDER BY usina, tipo_tabela, equipamento, ug, tag
    `);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Equipamentos');
    ws.columns = [
      { header: 'Usina',              key: 'usina',             width: 22 },
      { header: 'Tabela',             key: 'tipo_tabela',       width: 18 },
      { header: 'Equipamento',        key: 'equipamento',       width: 30 },
      { header: 'UG',                 key: 'ug',                width: 20 },
      { header: 'TAG',                key: 'tag',               width: 20 },
      { header: 'Fabricante',         key: 'fabricante',        width: 20 },
      { header: 'Modelo',             key: 'modelo',            width: 20 },
      { header: 'Nº Série',           key: 'num_serie',         width: 22 },
      { header: 'Tem sobressalente?', key: 'tem_sobressalente', width: 18 },
      { header: 'Quantos?',           key: 'quantos',           width: 12 },
      { header: 'Ano',                key: 'ano',               width: 10 },
      { header: 'URL da Imagem',      key: 'url_imagem',        width: 40 },
    ];
    const hr = ws.getRow(1);
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF001F5B' } };
    r.rows.forEach(row => ws.addRow(row));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Equipamentos.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { safeError(res, err); }
});

export default router;
