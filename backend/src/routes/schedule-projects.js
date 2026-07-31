import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function safeError(res, err) {
  console.error(`[SCHEDULE ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  res.status(500).json({ error: err.message });
}

function normalizeProject(body = {}) {
  return {
    client_uid: String(body.id || body.client_uid || `project-${Date.now()}`),
    name: body.name || 'Novo cronograma',
    plant: body.plant || '',
    description: body.description || '',
    active_revision_uid: body.activeRevisionId || body.active_revision_uid || 'rev-0',
    revisions: Array.isArray(body.revisions) ? body.revisions : [],
  };
}

function normalizeTask(task = {}, index = 0) {
  return {
    client_uid: String(task.id || task.client_uid || `task-${Date.now()}-${index}`),
    wbs: task.wbs || '',
    name: task.name || 'Nova tarefa',
    type: task.type || 'task',
    start_date: task.start || task.start_date || null,
    end_date: task.end || task.end_date || null,
    progress: Math.max(0, Math.min(100, parseInt(task.progress, 10) || 0)),
    predecessor_uid: task.predecessorId || task.predecessor_uid || '',
    dependency_type: task.dependencyType || task.dependency_type || 'FS',
    notes: task.notes || '',
    actual_date: task.actualDate || task.actual_date || null,
    value: Number(task.value) || 0,
    actual_start_date: task.actualStart || task.actual_start_date || null,
    actual_end_date: task.actualEnd || task.actual_end_date || null,
    sort_order: index,
  };
}

function normalizeRevision(revision = {}, index = 0) {
  return {
    client_uid: String(revision.id || revision.client_uid || `rev-${index}`),
    label: revision.label || `Rev. ${index}`,
    description: revision.description || '',
    settings: revision.settings && typeof revision.settings === 'object' ? revision.settings : {},
    sort_order: index,
    tasks: Array.isArray(revision.tasks) ? revision.tasks : [],
  };
}

function dateOut(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isValidShareRole(role) {
  return role === 'viewer' || role === 'editor';
}

// Resolves a client-side project uid to its DB id + the current user's access level.
// Returns null when the user has no access at all (not owner, not shared with them).
async function resolveAccess(client, userId, clientUid) {
  const { rows } = await client.query(`
    SELECT p.id AS project_id, p.user_id AS owner_id,
      CASE WHEN p.user_id = $1 THEN 'owner' ELSE s.role END AS role
    FROM schedule_projects p
    LEFT JOIN schedule_project_shares s ON s.project_id = p.id AND s.user_id = $1
    WHERE p.client_uid = $2 AND (p.user_id = $1 OR s.user_id = $1)
  `, [userId, clientUid]);
  return rows[0] || null;
}

async function readProjectsForUser(userId) {
  const { rows } = await pool.query(`
    SELECT
      p.id AS project_db_id, p.client_uid AS project_uid, p.name, p.plant, p.description,
      p.active_revision_uid, p.user_id AS owner_id, p.created_at, p.updated_at,
      u.name AS owner_name,
      CASE WHEN p.user_id = $1 THEN 'owner' ELSE s.role END AS access_role,
      r.id AS revision_db_id, r.client_uid AS revision_uid, r.label, r.description AS revision_description,
      r.settings AS revision_settings, r.sort_order AS revision_order,
      t.client_uid AS task_uid, t.wbs, t.name AS task_name, t.type, t.start_date, t.end_date,
      t.progress, t.predecessor_uid, t.dependency_type, t.notes, t.actual_date, t.value,
      t.actual_start_date, t.actual_end_date, t.sort_order AS task_order
    FROM schedule_projects p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN schedule_project_shares s ON s.project_id = p.id AND s.user_id = $1
    LEFT JOIN schedule_revisions r ON r.project_id = p.id
    LEFT JOIN schedule_tasks t ON t.revision_id = r.id
    WHERE p.user_id = $1 OR s.user_id = $1
    ORDER BY p.updated_at DESC, p.id, r.sort_order, t.sort_order
  `, [userId]);

  const projectMap = new Map();
  for (const row of rows) {
    if (!projectMap.has(row.project_db_id)) {
      projectMap.set(row.project_db_id, {
        dbId: row.project_db_id,
        id: row.project_uid,
        name: row.name,
        plant: row.plant || '',
        description: row.description || '',
        activeRevisionId: row.active_revision_uid || 'rev-0',
        access: row.access_role || 'viewer',
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        revisions: [],
        _revisionMap: new Map(),
      });
    }

    const project = projectMap.get(row.project_db_id);
    if (row.revision_db_id && !project._revisionMap.has(row.revision_db_id)) {
      const revision = {
        dbId: row.revision_db_id,
        id: row.revision_uid,
        label: row.label,
        description: row.revision_description || '',
        settings: row.revision_settings && typeof row.revision_settings === 'object' ? row.revision_settings : {},
        tasks: [],
      };
      project._revisionMap.set(row.revision_db_id, revision);
      project.revisions.push(revision);
    }

    if (row.revision_db_id && row.task_uid) {
      const revision = project._revisionMap.get(row.revision_db_id);
      revision.tasks.push({
        id: row.task_uid,
        wbs: row.wbs || '',
        name: row.task_name || '',
        type: row.type || 'task',
        start: dateOut(row.start_date),
        end: dateOut(row.end_date),
        progress: parseInt(row.progress, 10) || 0,
        predecessorId: row.predecessor_uid || '',
        dependencyType: row.dependency_type || 'FS',
        notes: row.notes || '',
        actualDate: dateOut(row.actual_date),
        value: parseFloat(row.value) || 0,
        actualStart: dateOut(row.actual_start_date),
        actualEnd: dateOut(row.actual_end_date),
      });
    }
  }

  return [...projectMap.values()].map(project => {
    delete project._revisionMap;
    return project;
  });
}

// Persists a project payload. On create (targetProjectId absent) it upserts the caller's own
// project keyed by (user_id, client_uid). On update (targetProjectId present — owner or editor
// saving) it updates that exact row in place, regardless of who owns it, so an editor's save
// never forks a second copy of the project under their own user_id.
async function replaceProjectPayload(client, userId, payload, targetProjectId = null) {
  const project = normalizeProject(payload);
  let projectId = targetProjectId;

  if (projectId) {
    await client.query(`
      UPDATE schedule_projects SET
        name = $1, plant = $2, description = $3, active_revision_uid = $4, updated_at = NOW()
      WHERE id = $5
    `, [project.name, project.plant, project.description, project.active_revision_uid, projectId]);
  } else {
    const projectResult = await client.query(`
      INSERT INTO schedule_projects (user_id, client_uid, name, plant, description, active_revision_uid)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id, client_uid) DO UPDATE SET
        name = EXCLUDED.name,
        plant = EXCLUDED.plant,
        description = EXCLUDED.description,
        active_revision_uid = EXCLUDED.active_revision_uid,
        updated_at = NOW()
      RETURNING id
    `, [userId, project.client_uid, project.name, project.plant, project.description, project.active_revision_uid]);
    projectId = projectResult.rows[0].id;
  }

  await client.query('DELETE FROM schedule_revisions WHERE project_id=$1', [projectId]);

  for (let revIndex = 0; revIndex < project.revisions.length; revIndex += 1) {
    const revision = normalizeRevision(project.revisions[revIndex], revIndex);
    const revisionResult = await client.query(`
      INSERT INTO schedule_revisions (project_id, client_uid, label, description, settings, sort_order)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6)
      RETURNING id
    `, [projectId, revision.client_uid, revision.label, revision.description, JSON.stringify(revision.settings), revision.sort_order]);
    const revisionId = revisionResult.rows[0].id;

    for (let taskIndex = 0; taskIndex < revision.tasks.length; taskIndex += 1) {
      const task = normalizeTask(revision.tasks[taskIndex], taskIndex);
      await client.query(`
        INSERT INTO schedule_tasks (
          revision_id, client_uid, wbs, name, type, start_date, end_date, progress,
          predecessor_uid, dependency_type, notes, actual_date, value,
          actual_start_date, actual_end_date, sort_order
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      `, [
        revisionId, task.client_uid, task.wbs, task.name, task.type, task.start_date,
        task.end_date, task.progress, task.predecessor_uid, task.dependency_type,
        task.notes, task.actual_date, task.value, task.actual_start_date, task.actual_end_date,
        task.sort_order,
      ]);
    }
  }

  return projectId;
}

router.get('/', async (req, res) => {
  try {
    res.json(await readProjectsForUser(req.user.id));
  } catch (err) {
    safeError(res, err);
  }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceProjectPayload(client, req.user.id, req.body);
    await client.query('COMMIT');
    res.status(201).json(await readProjectsForUser(req.user.id));
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

router.put('/:clientUid', async (req, res) => {
  if (String(req.params.clientUid) !== String(req.body?.id || req.body?.client_uid || '')) {
    return res.status(400).json({ error: 'Identificador do cronograma não confere' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await resolveAccess(client, req.user.id, req.params.clientUid);
    if (access) {
      if (access.role === 'viewer') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Sem permissão de edição neste cronograma' });
      }
      await replaceProjectPayload(client, access.owner_id, req.body, access.project_id);
    } else {
      // No project with this client_uid is visible to this user. If it truly doesn't exist
      // anywhere yet, this is a brand-new project being saved for the first time — create it
      // under the caller. If it exists under someone else who hasn't shared it, refuse.
      const { rows: existing } = await client.query(
        'SELECT id FROM schedule_projects WHERE client_uid=$1 LIMIT 1',
        [req.params.clientUid],
      );
      if (existing.length) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Sem permissão de edição neste cronograma' });
      }
      await replaceProjectPayload(client, req.user.id, req.body);
    }
    await client.query('COMMIT');
    res.json(await readProjectsForUser(req.user.id));
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

router.delete('/:clientUid', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM schedule_projects WHERE user_id=$1 AND client_uid=$2',
      [req.user.id, req.params.clientUid],
    );
    if (rows[0]?.id) {
      await client.query('DELETE FROM schedule_revisions WHERE project_id=$1', [rows[0].id]);
      await client.query('DELETE FROM schedule_projects WHERE id=$1', [rows[0].id]);
    }
    await client.query('COMMIT');
    res.json(await readProjectsForUser(req.user.id));
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

// ── Sharing (owner-only management of viewer/editor access) ────────────────────

router.get('/:clientUid/shares', async (req, res) => {
  try {
    const { rows: projectRows } = await pool.query(
      'SELECT id FROM schedule_projects WHERE user_id=$1 AND client_uid=$2',
      [req.user.id, req.params.clientUid],
    );
    if (!projectRows[0]) return res.status(404).json({ error: 'Cronograma não encontrado' });

    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_initials, s.role
      FROM schedule_project_shares s
      JOIN users u ON u.id = s.user_id
      WHERE s.project_id = $1
      ORDER BY u.name
    `, [projectRows[0].id]);
    res.json(rows);
  } catch (err) {
    safeError(res, err);
  }
});

router.post('/:clientUid/shares', async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!userId || !isValidShareRole(role)) {
      return res.status(400).json({ error: 'Usuário e papel (viewer/editor) são obrigatórios' });
    }
    if (Number(userId) === req.user.id) {
      return res.status(400).json({ error: 'Você já é o dono deste cronograma' });
    }

    const { rows: projectRows } = await pool.query(
      'SELECT id FROM schedule_projects WHERE user_id=$1 AND client_uid=$2',
      [req.user.id, req.params.clientUid],
    );
    if (!projectRows[0]) return res.status(404).json({ error: 'Cronograma não encontrado' });

    await pool.query(`
      INSERT INTO schedule_project_shares (project_id, user_id, role, shared_by)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `, [projectRows[0].id, userId, role, req.user.id]);

    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_initials, s.role
      FROM schedule_project_shares s
      JOIN users u ON u.id = s.user_id
      WHERE s.project_id = $1
      ORDER BY u.name
    `, [projectRows[0].id]);
    res.status(201).json(rows);
  } catch (err) {
    safeError(res, err);
  }
});

router.delete('/:clientUid/shares/:userId', async (req, res) => {
  try {
    const { rows: projectRows } = await pool.query(
      'SELECT id FROM schedule_projects WHERE user_id=$1 AND client_uid=$2',
      [req.user.id, req.params.clientUid],
    );
    if (!projectRows[0]) return res.status(404).json({ error: 'Cronograma não encontrado' });

    await pool.query(
      'DELETE FROM schedule_project_shares WHERE project_id=$1 AND user_id=$2',
      [projectRows[0].id, req.params.userId],
    );
    res.json({ success: true });
  } catch (err) {
    safeError(res, err);
  }
});

export default router;
