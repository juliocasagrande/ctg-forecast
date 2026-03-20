import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET all settings — any authenticated user can read
router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT key, value FROM system_settings ORDER BY key');
    const obj = {};
    r.rows.forEach(row => { obj[row.key] = row.value; });
    res.json(obj);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update settings — planejador, gestor, admin only
router.put('/', requireRole('admin', 'gestor', 'planejador'), async (req, res) => {
  const { id: userId } = req.user;
  const settings = req.body; // { key: value, ... }
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(settings)) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_by, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (key) DO UPDATE
             SET value = $2, updated_by = $3, updated_at = NOW()`,
          [key, String(value), userId]
        );
      }
      await client.query('COMMIT');
      const r = await pool.query('SELECT key, value FROM system_settings ORDER BY key');
      const obj = {};
      r.rows.forEach(row => { obj[row.key] = row.value; });
      res.json(obj);
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
