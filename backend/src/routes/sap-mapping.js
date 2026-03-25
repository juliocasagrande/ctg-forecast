/**
 * GET  /api/settings/sap-mapping     — lista mapeamentos
 * PUT  /api/settings/sap-mapping     — salva lista completa
 */
import express from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

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
router.put('/sap-mapping', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
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

export default router;
