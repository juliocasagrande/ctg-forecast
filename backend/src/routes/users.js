import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/schema.js';
import { requireAuth, requireRole, invalidateAuthCache } from '../middleware/auth.js';
import { validatePassword } from '../middleware/validation.js';
import { logAuthEvent, getClientIP } from '../middleware/audit.js';
import { PAGE_REGISTRY, PAGE_KEYS } from '../config/pages.js';
import { BUTTON_REGISTRY } from '../config/buttons.js';

const router = Router();
router.use(requireAuth);

function initials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Acesso de página é fail-closed por padrão (ver middleware/auth.js): sem linha em
// user_page_access, o usuário não vê/acessa nenhuma página. Para não travar quem
// acabou de ser criado numa sidebar vazia, concedemos 'editor' em todas as páginas
// no momento da criação/aprovação — igual ao comportamento implícito de antes desta
// mudança. O admin pode restringir depois pela matriz de Page Access.
async function grantDefaultPageAccess(userId) {
  await pool.query(
    `INSERT INTO user_page_access (user_id, page_key, access, updated_at)
     SELECT $1, key, 'editor', NOW() FROM unnest($2::text[]) AS key
     ON CONFLICT (user_id, page_key) DO NOTHING`,
    [userId, PAGE_KEYS]
  );
}

// Safe error helper
function safeError(res, err) {
  if (err.code === '23505') return res.status(400).json({ error: 'Email já cadastrado' });
  console.error('[USERS ERROR]', err);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}

// GET /api/users/for-delegation — any authenticated user can see basic user list
router.get('/for-delegation', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, email, role, area, avatar_initials FROM users WHERE active=true ORDER BY name`
    );
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// GET /api/users/pending — admin only
router.get('/pending', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, email, role, area, avatar_initials, created_at
       FROM users WHERE pending_approval = true ORDER BY created_at DESC`
    );
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/users/:id/approve — admin approves pending user
router.post('/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET pending_approval = false, active = true, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    await grantDefaultPageAccess(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// POST /api/users/:id/reject — admin rejects and deletes pending user
router.post('/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM users WHERE id = $1 AND pending_approval = true`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});


router.get('/', requireRole('admin', 'planejador'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.area, u.active, u.avatar_initials, u.created_at,
        COUNT(pa.project_id) AS project_count
      FROM users u
      LEFT JOIN project_assignments pa ON pa.user_id = u.id
      GROUP BY u.id
      ORDER BY u.role, u.name
    `);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// GET /api/users/engineers — lista para atribuição em projetos
// - admin, planejador: todos os usuários ativos
// - coordenador: apenas engenheiros da sua área
router.get('/engineers', requireAuth, async (req, res) => {
  try {
    const { role, area } = req.user;
    if (!['admin', 'planejador', 'coordenador'].includes(role))
      return res.status(403).json({ error: 'Acesso não autorizado' });

    if (role === 'coordenador') {
      // Coordenador vê só engenheiros da sua área (ou de todas, com acesso total)
      if (req.user._allAreasAccess) {
        const r = await pool.query(
          `SELECT id, name, email, area, avatar_initials FROM users
           WHERE role='engenheiro' AND active=true ORDER BY name`
        );
        return res.json(r.rows);
      }
      const r = await pool.query(
        `SELECT id, name, email, area, avatar_initials FROM users
         WHERE role='engenheiro' AND area=$1 AND active=true ORDER BY name`,
        [area]
      );
      return res.json(r.rows);
    }

    if (role === 'planejador') {
      // Planejador vê todos os usuários ativos (para nomear qualquer pessoa)
      const r = await pool.query(
        `SELECT id, name, email, role, area, avatar_initials FROM users
         WHERE active=true AND role NOT IN ('admin') ORDER BY name`
      );
      return res.json(r.rows);
    }

    // admin e: todos os engenheiros
    const r = await pool.query(
      `SELECT id, name, email, area, avatar_initials FROM users
       WHERE role='engenheiro' AND active=true ORDER BY name`
    );
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/users — admin creates user
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role, area } = req.body;
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Formato de email inválido' });
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });
    const hash = await bcrypt.hash(password, 12);
    const av = initials(name);
    const userRole = role || 'engenheiro';
    const userArea = ['engenheiro','coordenador'].includes(userRole) ? (area || null) : null;
    const r = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, area, avatar_initials)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, area, avatar_initials`,
      [name, email.toLowerCase(), hash, userRole, userArea, av]
    );
    await grantDefaultPageAccess(r.rows[0].id);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    safeError(res, err);
  }
});

// PUT /api/users/:id — admin edits any user; user edits own profile
router.put('/:id', async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const isSelf = req.user.id === targetId;
    const isAdmin = req.user.role === 'admin';
    if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Sem permissão' });

    const { name, email, role, area, active } = req.body;
    const av = name ? initials(name) : undefined;

    const fields = [], vals = [];
    if (name)  { fields.push(`name=$${fields.length+1}`);  vals.push(name); }
    if (email) { fields.push(`email=$${fields.length+1}`); vals.push(email.toLowerCase()); }
    if (av)    { fields.push(`avatar_initials=$${fields.length+1}`); vals.push(av); }
    if (isAdmin && role) {
      fields.push(`role=$${fields.length+1}`); vals.push(role);
      // Update area accordingly
      const newArea = ['engenheiro','coordenador'].includes(role) ? (area || null) : null;
      fields.push(`area=$${fields.length+1}`); vals.push(newArea);
    } else if (isAdmin && area !== undefined) {
      fields.push(`area=$${fields.length+1}`); vals.push(area || null);
    }
    if (isAdmin && active !== undefined) { fields.push(`active=$${fields.length+1}`); vals.push(active); }
    fields.push('updated_at=NOW()');

    vals.push(targetId);
    const r = await pool.query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING id, name, email, role, area, active, avatar_initials`,
      vals
    );
    invalidateAuthCache(targetId);
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email já cadastrado' });
    safeError(res, err);
  }
});

// DELETE /api/users/:id — admin deactivates (soft delete)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    invalidateAuthCache(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// POST /api/users/:id/reset-password — admin resets password
router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  try {
    const { new_password } = req.body;
    const pwCheck = validatePassword(new_password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);

    await logAuthEvent('admin_password_reset', {
      userId: parseInt(req.params.id),
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'],
      success: true,
      detail: `Reset por admin ${req.user.email}`,
    });

    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/users/page-access — admin only, retorna a matriz completa (todos os usuários x todas as páginas)
router.get('/page-access', requireRole('admin'), async (req, res) => {
  try {
    const [usersR, accessR] = await Promise.all([
      pool.query(`SELECT id, name, email, role, active FROM users ORDER BY role, name`),
      pool.query(`SELECT user_id, page_key, access FROM user_page_access`),
    ]);

    const overridesByUser = {};
    for (const row of accessR.rows) {
      (overridesByUser[row.user_id] ??= {})[row.page_key] = row.access;
    }

    const result = usersR.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      pages: Object.fromEntries(
        PAGE_REGISTRY.map(p => [p.key, overridesByUser[u.id]?.[p.key] || 'none'])
      ),
    }));

    res.json(result);
  } catch (err) { safeError(res, err); }
});

// GET /api/users/:id/page-access — admin only, retorna o catálogo mesclado com os overrides do usuário
router.get('/:id/page-access', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT page_key, access FROM user_page_access WHERE user_id=$1',
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

// PUT /api/users/:id/page-access — admin only, upsert das permissões de página do usuário
router.put('/:id/page-access', requireRole('admin'), async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const entries = Array.isArray(req.body?.pages) ? req.body.pages : [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { page_key, access } of entries) {
        if (!PAGE_KEYS.includes(page_key)) continue;
        if (!['none', 'viewer', 'editor'].includes(access)) continue;
        if (access === 'none') {
          // 'none' é o default (fail-closed) — remove o override para manter a tabela enxuta
          await client.query(
            'DELETE FROM user_page_access WHERE user_id=$1 AND page_key=$2',
            [targetId, page_key]
          );
        } else {
          await client.query(
            `INSERT INTO user_page_access (user_id, page_key, access, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, page_key) DO UPDATE SET access=EXCLUDED.access, updated_at=NOW()`,
            [targetId, page_key, access]
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

    invalidateAuthCache(targetId);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/users/button-access — admin only, retorna a matriz completa (todos os usuários x todos os botões)
router.get('/button-access', requireRole('admin'), async (req, res) => {
  try {
    const [usersR, accessR] = await Promise.all([
      pool.query(`SELECT id, name, email, role, active FROM users ORDER BY role, name`),
      pool.query(`SELECT user_id, page_key, button_key, enabled FROM user_button_access`),
    ]);

    const overridesByUser = {};
    for (const row of accessR.rows) {
      ((overridesByUser[row.user_id] ??= {})[row.page_key] ??= {})[row.button_key] = row.enabled;
    }

    const result = usersR.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      buttons: Object.fromEntries(
        Object.entries(BUTTON_REGISTRY).map(([pageKey, buttons]) => [
          pageKey,
          Object.fromEntries(buttons.map(b => [b.key, overridesByUser[u.id]?.[pageKey]?.[b.key] ?? true])),
        ])
      ),
    }));

    res.json(result);
  } catch (err) { safeError(res, err); }
});

// GET /api/users/:id/button-access — admin only, retorna o catálogo mesclado com os overrides do usuário
router.get('/:id/button-access', requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT page_key, button_key, enabled FROM user_button_access WHERE user_id=$1',
      [req.params.id]
    );
    const overrides = {};
    for (const row of r.rows) {
      (overrides[row.page_key] ??= {})[row.button_key] = row.enabled;
    }
    const pages = Object.entries(BUTTON_REGISTRY).map(([pageKey, buttons]) => ({
      page_key: pageKey,
      buttons: buttons.map(b => ({
        button_key: b.key,
        label: b.label,
        enabled: overrides[pageKey]?.[b.key] ?? true,
      })),
    }));
    res.json(pages);
  } catch (err) { safeError(res, err); }
});

// PUT /api/users/:id/button-access — admin only, upsert das permissões de botão do usuário
router.put('/:id/button-access', requireRole('admin'), async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const entries = Array.isArray(req.body?.buttons) ? req.body.buttons : [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { page_key, button_key, enabled } of entries) {
        const validButtons = BUTTON_REGISTRY[page_key];
        if (!validButtons || !validButtons.some(b => b.key === button_key)) continue;
        if (enabled === true) {
          // habilitado é o default — remove o override para manter a tabela enxuta
          await client.query(
            'DELETE FROM user_button_access WHERE user_id=$1 AND page_key=$2 AND button_key=$3',
            [targetId, page_key, button_key]
          );
        } else {
          await client.query(
            `INSERT INTO user_button_access (user_id, page_key, button_key, enabled, updated_by, updated_at)
             VALUES ($1, $2, $3, false, $4, NOW())
             ON CONFLICT (user_id, page_key, button_key) DO UPDATE SET enabled=false, updated_by=$4, updated_at=NOW()`,
            [targetId, page_key, button_key, req.user.id]
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

    invalidateAuthCache(targetId);
    res.json({ success: true });
  } catch (err) { safeError(res, err); }
});

export default router;
