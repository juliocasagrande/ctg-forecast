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

async function readProjectsForUser(userId) {
  const { rows } = await pool.query(`
    SELECT
      p.id AS project_db_id, p.client_uid AS project_uid, p.name, p.plant, p.description,
      p.active_revision_uid, p.created_at, p.updated_at,
      r.id AS revision_db_id, r.client_uid AS revision_uid, r.label, r.description AS revision_description,
      r.settings AS revision_settings, r.sort_order AS revision_order,
      t.client_uid AS task_uid, t.wbs, t.name AS task_name, t.type, t.start_date, t.end_date,
      t.progress, t.predecessor_uid, t.dependency_type, t.notes, t.sort_order AS task_order
    FROM schedule_projects p
    LEFT JOIN schedule_revisions r ON r.project_id = p.id
    LEFT JOIN schedule_tasks t ON t.revision_id = r.id
    WHERE p.user_id = $1
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
      });
    }
  }

  return [...projectMap.values()].map(project => {
    delete project._revisionMap;
    return project;
  });
}

async function replaceProjectPayload(client, userId, payload) {
  const project = normalizeProject(payload);
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
  const projectId = projectResult.rows[0].id;

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
          predecessor_uid, dependency_type, notes, sort_order
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [
        revisionId, task.client_uid, task.wbs, task.name, task.type, task.start_date,
        task.end_date, task.progress, task.predecessor_uid, task.dependency_type,
        task.notes, task.sort_order,
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
    await replaceProjectPayload(client, req.user.id, req.body);
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

export default router;
