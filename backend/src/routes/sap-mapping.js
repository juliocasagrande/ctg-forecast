/**
 * GET  /api/settings/sap-mapping     — lista mapeamentos
 * PUT  /api/settings/sap-mapping     — salva lista completa
 * GET  /api/settings/sap-keywords    — lista palavras-chave por categoria
 * PUT  /api/settings/sap-keywords    — salva palavras-chave por categoria
 */
import express from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Permite acesso se o usuario tem um dos roles OU tem o email especificado
function requireRoleOrEmail(emails, ...roles) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Nao autenticado' });
    if (roles.includes(user.role)) return next();
    if (emails.includes(user.email)) return next();
    return res.status(403).json({ error: 'Acesso nao autorizado' });
  };
}

const ALLOWED_EMAILS = ['julio.casagrande@ctgbr.com.br'];

const router = express.Router();
router.use(requireAuth);

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_MAPPING = [
  { descr: 'LICENÇA DE USO E ATUALIZAÇÃO E MANUTENÇÃ', category: 'Contratos' },
  { descr: 'MATERIAL DE USO E CONSUMO',                category: 'Contratos' },
  { descr: 'GASTOS COM VIAGENS - ALIMENTAÇÃO',         category: 'Viagens'   },
  { descr: 'TAXI, PEDAGIO E ESTACIONAMENTO',           category: 'Viagens'   },
  { descr: 'GASTOS COM VIAGENS - PASSAGENS - NACIONA', category: 'Viagens'   },
  { descr: 'GASTOS COM VIAGENS - HOSPEDAGENS - NACIO', category: 'Viagens'   },
  { descr: 'GASTOS COM VIAGENS - ALUGUEL DE VEÍCULOS', category: 'Viagens'   },
  { descr: 'SALARIO BASE',                             category: 'Desconsiderar' },
  { descr: 'HORA EXTRA',                               category: 'Desconsiderar' },
  { descr: 'INSS SOBRE SALARIOS',                      category: 'Desconsiderar' },
  { descr: 'FGTS SOBRE SALARIOS',                      category: 'Desconsiderar' },
];

// Ensure the table exists
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sap_cost_mapping (
      id         SERIAL PRIMARY KEY,
      descr      TEXT NOT NULL UNIQUE,
      category   TEXT NOT NULL CHECK (category IN ('Contratos','Viagens','Desconsiderar')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Seed defaults if empty
  const { rows } = await pool.query('SELECT COUNT(*) FROM sap_cost_mapping');
  if (parseInt(rows[0].count) === 0) {
    for (const m of DEFAULT_MAPPING) {
      await pool.query(
        'INSERT INTO sap_cost_mapping (descr, category) VALUES ($1, $2) ON CONFLICT (descr) DO NOTHING',
        [m.descr, m.category]
      );
    }
  }
}

// GET /api/settings/sap-mapping
router.get('/sap-mapping', async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query('SELECT id, descr, category FROM sap_cost_mapping ORDER BY category, descr');
    res.json(rows);
  } catch (err) {
    console.error('[sap-mapping GET]', err);
    res.status(500).json({ error: 'Erro ao buscar mapeamentos.' });
  }
});

// PUT /api/settings/sap-mapping  — replace all rows
router.put('/sap-mapping', requireRoleOrEmail(ALLOWED_EMAILS, 'admin', 'gestor', 'planejador'), async (req, res) => {
  const { mapping } = req.body;
  if (!Array.isArray(mapping)) return res.status(400).json({ error: 'Campo "mapping" deve ser um array.' });

  try {
    await ensureTable();
    await pool.query('BEGIN');
    await pool.query('DELETE FROM sap_cost_mapping');
    for (const m of mapping) {
      if (!m.descr || !m.category) continue;
      await pool.query(
        'INSERT INTO sap_cost_mapping (descr, category) VALUES ($1, $2)',
        [String(m.descr).trim(), String(m.category).trim()]
      );
    }
    await pool.query('COMMIT');
    const { rows } = await pool.query('SELECT id, descr, category FROM sap_cost_mapping ORDER BY category, descr');
    res.json(rows);
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[sap-mapping PUT]', err);
    res.status(500).json({ error: 'Erro ao salvar mapeamentos.' });
  }
});

// ── Defaults para palavras-chave ──────────────────────────────────────────────
const DEFAULT_KEYWORDS = {
  Dispensado: ['salario', 'hora extra', 'inss', 'fgts'],
  Viagens:    ['viage', 'taxi', 'pedagio', 'estacionamento'],
};

async function ensureKeywordsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sap_keyword_rules (
      id         SERIAL PRIMARY KEY,
      category   TEXT NOT NULL UNIQUE CHECK (category IN ('Dispensado','Viagens')),
      keywords   JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Seed defaults if empty
  const { rows } = await pool.query('SELECT COUNT(*) FROM sap_keyword_rules');
  if (parseInt(rows[0].count) === 0) {
    for (const [cat, kws] of Object.entries(DEFAULT_KEYWORDS)) {
      await pool.query(
        'INSERT INTO sap_keyword_rules (category, keywords) VALUES ($1, $2) ON CONFLICT (category) DO NOTHING',
        [cat, JSON.stringify(kws)]
      );
    }
  }
}

// GET /api/settings/sap-keywords
router.get('/sap-keywords', async (req, res) => {
  try {
    await ensureKeywordsTable();
    const { rows } = await pool.query('SELECT category, keywords FROM sap_keyword_rules ORDER BY category');
    // Return as { Dispensado: [...], Viagens: [...] }
    const result = { ...DEFAULT_KEYWORDS };
    rows.forEach(r => { result[r.category] = r.keywords; });
    res.json(result);
  } catch (err) {
    console.error('[sap-keywords GET]', err);
    res.status(500).json({ error: 'Erro ao buscar palavras-chave.' });
  }
});

// PUT /api/settings/sap-keywords
router.put('/sap-keywords', requireRoleOrEmail(ALLOWED_EMAILS, 'admin', 'gestor', 'planejador'), async (req, res) => {
  const { keywords } = req.body; // { Dispensado: [...], Viagens: [...] }
  if (!keywords || typeof keywords !== 'object') {
    return res.status(400).json({ error: 'Campo "keywords" deve ser um objeto { Dispensado: [], Viagens: [] }.' });
  }
  try {
    await ensureKeywordsTable();
    await pool.query('BEGIN');
    for (const [cat, kws] of Object.entries(keywords)) {
      if (!['Dispensado', 'Viagens'].includes(cat)) continue;
      const arr = Array.isArray(kws) ? kws.map(k => String(k).trim().toLowerCase()).filter(Boolean) : [];
      await pool.query(
        `INSERT INTO sap_keyword_rules (category, keywords, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (category) DO UPDATE SET keywords = $2, updated_at = NOW()`,
        [cat, JSON.stringify(arr)]
      );
    }
    await pool.query('COMMIT');
    const { rows } = await pool.query('SELECT category, keywords FROM sap_keyword_rules ORDER BY category');
    const result = { ...DEFAULT_KEYWORDS };
    rows.forEach(r => { result[r.category] = r.keywords; });
    res.json(result);
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[sap-keywords PUT]', err);
    res.status(500).json({ error: 'Erro ao salvar palavras-chave.' });
  }
});


export default router;