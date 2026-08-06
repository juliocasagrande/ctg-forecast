import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole, invalidateAuthCache } from '../middleware/auth.js';
import { PAGE_REGISTRY, PAGE_KEYS } from '../config/pages.js';
import { BUTTON_REGISTRY } from '../config/buttons.js';

const router = Router();
router.use(requireAuth);

function safeError(res, err) {
  if (err.code === '23505') return res.status(400).json({ error: 'Já existe um grupo com esse nome' });
  console.error('[PERMISSION GROUPS ERROR]', err);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}

// GET /api/permission-groups — admin only, lista todos os grupos com contagem de membros
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT g.id, g.name, g.description, g.default_for_role,
        COUNT(upg.user_id)::int AS member_count
      FROM permission_groups g
      LEFT JOIN user_permission_groups upg ON upg.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/permission-groups — admin only, cria grupo vazio (tudo 'none' até configurar)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = await pool.query(
      `INSERT INTO permission_groups (name, description) VALUES ($1, $2) RETURNING *`,
      [name.trim(), description?.trim() || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// PUT /api/permission-groups/:id — admin only, renomeia/atualiza descrição
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = await pool.query(
      `UPDATE permission_groups SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [name.trim(), description?.trim() || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Grupo não encontrado' });
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// DELETE /api/permission-groups/:id — admin only. Remove as associações com os
// membros (ON DELETE CASCADE em user_permission_groups); quem não tiver outro
// grupo fica sem acesso (fail-closed) até ser reatribuído.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM permission_groups WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Grupo não encontrado' });
    invalidateAuthCache(); // afeta todos os membros do grupo — limpa tudo por segurança
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/permission-groups/:id/members — admin only, lista os usuários do grupo
router.get('/:id/members', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.area, u.active
      FROM user_permission_groups upg
      JOIN users u ON u.id = upg.user_id
      WHERE upg.group_id = $1
      ORDER BY u.role, u.name
    `, [req.params.id]);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// PUT /api/permission-groups/:id/members — admin only, substitui o conjunto de
// membros do grupo pelo enviado ({ user_ids: [...] }).
router.put('/:id/members', requireRole('admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids.map(Number).filter(Number.isInteger) : [];

    const client = await pool.connect();
    let removedUserIds = [];
    try {
      await client.query('BEGIN');
      const removed = await client.query(
        `DELETE FROM user_permission_groups WHERE group_id=$1 AND NOT (user_id = ANY($2::int[])) RETURNING user_id`,
        [groupId, userIds]
      );
      removedUserIds = removed.rows.map(r => r.user_id);
      if (userIds.length) {
        await client.query(`
          INSERT INTO user_permission_groups (user_id, group_id)
          SELECT id, $2 FROM users WHERE id = ANY($1::int[])
          ON CONFLICT DO NOTHING
        `, [userIds, groupId]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Invalida especificamente quem entrou/saiu — mais preciso que limpar tudo.
    for (const uid of [...userIds, ...removedUserIds]) invalidateAuthCache(uid);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/permission-groups/:id/page-access — matriz de páginas do grupo
router.get('/:id/page-access', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT page_key, access FROM group_page_access WHERE group_id=$1',
      [req.params.id]
    );
    const overrides = Object.fromEntries(r.rows.map(row => [row.page_key, row.access]));
    const pages = PAGE_REGISTRY.map(p => ({
      page_key: p.key,
      label: p.label,
      access: overrides[p.key] || 'none',
    }));
    res.json(pages);
  } catch (err) { safeError(res, err); }
});

// PUT /api/permission-groups/:id/page-access — admin only, upsert do padrão do grupo
router.put('/:id/page-access', requireRole('admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const entries = Array.isArray(req.body?.pages) ? req.body.pages : [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { page_key, access } of entries) {
        if (!PAGE_KEYS.includes(page_key)) continue;
        if (!['none', 'viewer', 'editor'].includes(access)) continue;
        if (access === 'none') {
          // 'none' é o default do grupo — remove a linha para manter a tabela enxuta
          await client.query(
            'DELETE FROM group_page_access WHERE group_id=$1 AND page_key=$2',
            [groupId, page_key]
          );
        } else {
          await client.query(
            `INSERT INTO group_page_access (group_id, page_key, access, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (group_id, page_key) DO UPDATE SET access=EXCLUDED.access, updated_at=NOW()`,
            [groupId, page_key, access]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    invalidateAuthCache(); // afeta todos os membros do grupo
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/permission-groups/:id/button-access — matriz de botões do grupo
router.get('/:id/button-access', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT page_key, button_key FROM group_button_access WHERE group_id=$1',
      [req.params.id]
    );
    const disabled = new Set(r.rows.map(row => `${row.page_key}:${row.button_key}`));
    const pages = Object.entries(BUTTON_REGISTRY).map(([pageKey, buttons]) => ({
      page_key: pageKey,
      buttons: buttons.map(b => ({
        button_key: b.key,
        label: b.label,
        enabled: !disabled.has(`${pageKey}:${b.key}`),
      })),
    }));
    res.json(pages);
  } catch (err) { safeError(res, err); }
});

// PUT /api/permission-groups/:id/button-access — admin only, upsert do padrão do grupo
router.put('/:id/button-access', requireRole('admin'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const entries = Array.isArray(req.body?.buttons) ? req.body.buttons : [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { page_key, button_key, enabled } of entries) {
        const validButtons = BUTTON_REGISTRY[page_key];
        if (!validButtons || !validButtons.some(b => b.key === button_key)) continue;
        if (enabled === true) {
          // habilitado é o default do grupo — remove a linha
          await client.query(
            'DELETE FROM group_button_access WHERE group_id=$1 AND page_key=$2 AND button_key=$3',
            [groupId, page_key, button_key]
          );
        } else {
          await client.query(
            `INSERT INTO group_button_access (group_id, page_key, button_key, enabled, updated_at)
             VALUES ($1, $2, $3, false, NOW())
             ON CONFLICT (group_id, page_key, button_key) DO UPDATE SET enabled=false, updated_at=NOW()`,
            [groupId, page_key, button_key]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    invalidateAuthCache();
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

export default router;
