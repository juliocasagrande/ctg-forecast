import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Tipo não permitido. Use JPEG, PNG, GIF ou WebP.'));
  },
});

function canEditMeta(req, ownerId, ownerRole = '', ownerArea = '') {
  const { role, id: requesterId, area: requesterArea } = req.user;
  if (role === 'engenheiro') return ownerId === requesterId;
  if (role === 'coordenador') return ownerId === requesterId || (ownerRole === 'engenheiro' && ownerArea === (requesterArea || 'eletrica'));
  return ['admin', 'gestor', 'planejador', 'gerente'].includes(role);
}

function canEditGeneralMeta(req, assignedArea = '') {
  const { role, area } = req.user;
  if (role === 'coordenador') return (area || 'eletrica') === (assignedArea || 'eletrica');
  return ['admin', 'gestor', 'planejador'].includes(role);
}

function buildVisibilityWhere(req, baseParamCount = 1, tableAlias = 'm', userAlias = 'u') {
  const { id, area } = req.user;
  const role = req.user._originalRole || req.user.role;
  if (['admin', 'gestor', 'planejador', 'gerente'].includes(role)) {
    return { sql: '', params: [] };
  }
  if (role === 'coordenador') {
    return {
      sql: ` AND ((${tableAlias}.user_id = $${baseParamCount + 1}) OR (${userAlias}.role = 'engenheiro' AND COALESCE(${userAlias}.area,'eletrica') = $${baseParamCount + 2}) OR (${tableAlias}.is_general = true AND COALESCE(${tableAlias}.assigned_area, ${tableAlias}.area) = $${baseParamCount + 2}))`,
      params: [id, area || 'eletrica'],
    };
  }
  return {
    sql: ` AND (${tableAlias}.user_id = $${baseParamCount + 1} OR (${tableAlias}.is_general = true AND COALESCE(${tableAlias}.assigned_area, ${tableAlias}.area) = $${baseParamCount + 2} AND (${tableAlias}.assigned_user_ids IS NULL OR $${baseParamCount + 1} = ANY(${tableAlias}.assigned_user_ids))))`,
    params: [id, area || 'eletrica'],
  };
}

function normalizeStatus(status) {
  if (status === 'Nao iniciado') return 'N\u00e3o iniciado';
  return status === 'Conclu\u00edda' ? 'Concluida' : (status || 'Em andamento');
}

function normalizeEvidenceLayout(layout) {
  const allowed = new Set(['single', 'grid-2x2', 'two-columns', 'main-left', 'main-right', 'two-rows']);
  return allowed.has(layout) ? layout : 'grid-2x2';
}

function evidenceSlotCount(layout) {
  return {
    single: 1,
    'grid-2x2': 4,
    'two-columns': 2,
    'main-left': 3,
    'main-right': 3,
    'two-rows': 2,
  }[normalizeEvidenceLayout(layout)] || 4;
}

function normalizeEvidenceFit(fit) {
  return fit === 'cover' ? 'cover' : 'contain';
}

function imageList(row) {
  return Array.isArray(row.evidence_images)
    ? [...row.evidence_images]
    : (row.evidence_image ? [row.evidence_image] : []);
}

function fitList(row) {
  return Array.isArray(row.evidence_fits) ? [...row.evidence_fits] : [];
}

function normalizeAssignedWeights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, val]) => [String(parseInt(key, 10)), Number(val)])
      .filter(([key, val]) => key !== 'NaN' && Number.isFinite(val) && val >= 0),
  );
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

router.get('/', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const area = req.query.area || null;
  const areaParamIndex = area ? 2 : 1;
  const visibility = buildVisibilityWhere(req, areaParamIndex);
  const { rows } = await pool.query(`
    SELECT m.id, m.user_id, COALESCE(u.name, 'Meta geral') AS user_name, u.avatar_initials,
           m.area, m.year, m.meta_number, m.description,
           m.kpi, m.detailed, m.weight, m.target_80, m.target_100, m.target_120,
           m.target_value, m.achieved_value, m.unit, m.status,
           m.evidence_image, m.evidence_images, m.evidence_fits, m.evidence_layout,
           m.is_general, m.assigned_area, m.assigned_user_ids, m.assigned_weights,
           m.evidence_link, m.notes, m.created_at, m.updated_at
    FROM metas m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.year = $1 AND COALESCE(u.active, true) = true
    ${area ? 'AND m.area = $2' : ''}
    ${visibility.sql}
    ORDER BY u.name, m.meta_number
  `, area ? [year, area, ...visibility.params] : [year, ...visibility.params]);
  res.json(rows);
});

router.get('/members', async (req, res) => {
  const area = req.query.area || null;
  const role = req.user._originalRole || req.user.role;
  const { id: requesterId } = req.user;

  let query, params;
  if (role === 'admin' || role === 'planejador' || role === 'gerente') {
    query = `SELECT u.id, u.name, u.avatar_initials, u.role, COALESCE(u.area,'eletrica') AS area
              FROM users u WHERE u.active = true AND u.role IN ('engenheiro','coordenador','gerente','planejador')
              ${area ? "AND COALESCE(u.area,'eletrica') = $1" : ''} ORDER BY u.name`;
    params = area ? [area] : [];
  } else if (role === 'coordenador') {
    const userArea = req.user.area || 'eletrica';
    query = `SELECT u.id, u.name, u.avatar_initials, u.role, COALESCE(u.area,'eletrica') AS area
              FROM users u WHERE u.active = true
              AND ((u.role = 'engenheiro' AND COALESCE(u.area,'eletrica') = $1) OR u.id = $2)
              ORDER BY u.name`;
    params = [userArea, requesterId];
  } else {
    query = `SELECT u.id, u.name, u.avatar_initials, u.role, COALESCE(u.area,'eletrica') AS area
              FROM users u WHERE u.active = true AND u.id = $1
              ORDER BY u.name`;
    params = [requesterId];
  }
  const { rows } = await pool.query(query, params);
  rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { role, id: requesterId } = req.user;
  const {
    user_id, area, year, meta_number, description, kpi, detailed, weight,
    target_80, target_100, target_120, target_value, achieved_value, unit,
    status, notes, evidence_link, evidence_layout, is_general, assigned_area,
    assigned_user_ids, assigned_weights,
  } = req.body;
  const general = is_general === true || is_general === 'true';
  const targetArea = general
    ? (req.user.role === 'coordenador' ? (req.user.area || 'eletrica') : (assigned_area || area || 'eletrica'))
    : area;

  if (general && !canEditGeneralMeta(req, targetArea))
    return res.status(403).json({ error: 'Sem permissao para criar meta geral nesta area' });

  if (!general && role === 'engenheiro' && user_id !== requesterId)
    return res.status(403).json({ error: 'Sem permissao para criar meta de outro usuario' });

  if (!general && role === 'coordenador' && user_id !== requesterId) {
    const target = await pool.query("SELECT role, COALESCE(area,'eletrica') AS area FROM users WHERE id=$1", [user_id]);
    if (!target.rows[0] || target.rows[0].role !== 'engenheiro' || target.rows[0].area !== (req.user.area || 'eletrica'))
      return res.status(403).json({ error: 'Coordenadores so podem alterar metas proprias ou de engenheiros da propria area' });
  }

  const conflict = general
    ? await pool.query('SELECT id FROM metas WHERE is_general=true AND COALESCE(assigned_area, area)=$1 AND year=$2 AND meta_number=$3', [targetArea, year, meta_number])
    : await pool.query('SELECT id FROM metas WHERE user_id=$1 AND year=$2 AND meta_number=$3 AND COALESCE(is_general,false)=false', [user_id, year, meta_number]);
  if (conflict.rows.length)
    return res.status(409).json({ error: `Meta ${meta_number} ja cadastrada para este ano` });

  const userIds = general && Array.isArray(assigned_user_ids) && assigned_user_ids.length > 0
    ? assigned_user_ids.map(Number).filter(Boolean)
    : null;
  const weightMap = general ? normalizeAssignedWeights(assigned_weights) : {};

  const { rows } = await pool.query(`
    INSERT INTO metas (
      user_id, area, year, meta_number, description, kpi, detailed, weight,
      target_80, target_100, target_120, target_value, achieved_value, unit,
      status, notes, evidence_link, evidence_layout, is_general, assigned_area, assigned_user_ids, assigned_weights, created_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23) RETURNING *`,
    [
      general ? null : user_id, targetArea, year, meta_number, description, kpi || null, detailed || null,
      weight === '' || weight == null ? null : weight, target_80 || null,
      target_100 || null, target_120 || null, target_value || 0, achieved_value || 0,
      unit || '', normalizeStatus(status), notes || null, evidence_link || null,
      normalizeEvidenceLayout(evidence_layout), general, general ? targetArea : null, userIds,
      JSON.stringify(weightMap), requesterId,
    ]);
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { role, id: requesterId } = req.user;
  const { id } = req.params;
  const existing = await pool.query(`
    SELECT m.user_id, m.is_general, m.area, m.year, m.meta_number, COALESCE(m.assigned_area, m.area) AS assigned_area,
           u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM metas m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.id=$1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Meta nao encontrada' });
  const existingMeta = existing.rows[0];
  if (existingMeta.is_general
    ? !canEditGeneralMeta(req, existingMeta.assigned_area)
    : !canEditMeta(req, existingMeta.user_id, existingMeta.owner_role, existingMeta.owner_area))
    return res.status(403).json({ error: 'Sem permissao' });

  const {
    user_id, area, year, meta_number, description, kpi, detailed, weight, target_80,
    target_100, target_120, target_value, achieved_value, unit, status, notes,
    evidence_link, evidence_layout, is_general, assigned_area, assigned_user_ids, assigned_weights,
  } = req.body;
  const targetGeneral = normalizeBoolean(is_general, existingMeta.is_general);
  const targetArea = targetGeneral
    ? (req.user.role === 'coordenador' ? (req.user.area || 'eletrica') : (assigned_area || area || existingMeta.assigned_area || 'eletrica'))
    : area;
  const targetUserId = targetGeneral ? null : (user_id || existingMeta.user_id || requesterId);

  if (targetGeneral && !canEditGeneralMeta(req, targetArea))
    return res.status(403).json({ error: 'Sem permissao para transformar esta meta em coletiva nesta area' });

  if (!targetGeneral) {
    const target = await pool.query("SELECT role, COALESCE(area,'eletrica') AS area FROM users WHERE id=$1", [targetUserId]);
    if (!target.rows[0])
      return res.status(400).json({ error: 'Colaborador da meta nao encontrado' });
    if (!canEditMeta(req, targetUserId, target.rows[0].role, target.rows[0].area))
      return res.status(403).json({ error: 'Sem permissao para transformar esta meta em individual para este colaborador' });
  }

  const conflict = targetGeneral
    ? await pool.query('SELECT id FROM metas WHERE id<>$1 AND is_general=true AND COALESCE(assigned_area, area)=$2 AND year=$3 AND meta_number=$4', [id, targetArea, year, meta_number])
    : await pool.query('SELECT id FROM metas WHERE id<>$1 AND user_id=$2 AND year=$3 AND meta_number=$4 AND COALESCE(is_general,false)=false', [id, targetUserId, year, meta_number]);
  if (conflict.rows.length)
    return res.status(409).json({ error: `Meta ${meta_number} ja cadastrada para este ano` });

  const userIds = targetGeneral && Array.isArray(assigned_user_ids) && assigned_user_ids.length > 0
    ? assigned_user_ids.map(Number).filter(Boolean)
    : null;
  const weightMap = targetGeneral ? normalizeAssignedWeights(assigned_weights) : {};
  const { rows } = await pool.query(`
    UPDATE metas SET user_id=$1, area=$2, year=$3, meta_number=$4, description=$5, kpi=$6,
           detailed=$7, weight=$8, target_80=$9, target_100=$10, target_120=$11,
           target_value=$12, achieved_value=$13, unit=$14, status=$15, notes=$16,
           evidence_link=$17, evidence_layout=$18, is_general=$19, assigned_area=$20,
           assigned_user_ids=$21, assigned_weights=$22::jsonb, updated_at=NOW() WHERE id=$23 RETURNING *`,
    [
      targetUserId, targetGeneral ? targetArea : area, year, meta_number, description, kpi || null, detailed || null,
      weight === '' || weight == null ? null : weight, target_80 || null,
      target_100 || null, target_120 || null, target_value || 0, achieved_value || 0,
      unit || '', normalizeStatus(status), notes || null, evidence_link || null,
      normalizeEvidenceLayout(evidence_layout), targetGeneral, targetGeneral ? targetArea : null,
      userIds, JSON.stringify(weightMap), id,
    ]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { role, id: requesterId } = req.user;
  const { id } = req.params;
  const existing = await pool.query(`
    SELECT m.user_id, m.is_general, COALESCE(m.assigned_area, m.area) AS assigned_area,
           u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM metas m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.id=$1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Meta nao encontrada' });
  if (existing.rows[0].is_general
    ? !canEditGeneralMeta(req, existing.rows[0].assigned_area)
    : !canEditMeta(req, existing.rows[0].user_id, existing.rows[0].owner_role, existing.rows[0].owner_area))
    return res.status(403).json({ error: 'Sem permissao' });
  await pool.query('DELETE FROM metas WHERE id=$1', [id]);
  res.json({ ok: true });
});

router.post('/:id/evidence', upload.array('evidence', 4), async (req, res) => {
  const { role, id: requesterId } = req.user;
  const { id } = req.params;
  const existing = await pool.query(`
    SELECT m.user_id, m.is_general, COALESCE(m.assigned_area, m.area) AS assigned_area,
           u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM metas m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.id=$1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Meta nao encontrada' });
  if (existing.rows[0].is_general
    ? !canEditGeneralMeta(req, existing.rows[0].assigned_area)
    : !canEditMeta(req, existing.rows[0].user_id, existing.rows[0].owner_role, existing.rows[0].owner_area))
    return res.status(403).json({ error: 'Sem permissao' });

  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  if (files.length > 4) return res.status(400).json({ error: 'Envie no maximo 4 imagens por meta' });
  const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
  for (const file of files) {
    if (!allowed.includes(file.mimetype))
      return res.status(400).json({ error: 'Tipo nao permitido. Use JPEG, PNG, GIF ou WebP' });
    if (file.size > 5*1024*1024)
      return res.status(400).json({ error: 'Cada imagem deve ter no maximo 5MB' });
  }

  const images = files.map(file => {
    const base64 = file.buffer.toString('base64');
    return `data:${file.mimetype};base64,${base64}`;
  });
  const { rows } = await pool.query(
    'UPDATE metas SET evidence_image=$1, evidence_images=$2::jsonb, updated_at=NOW() WHERE id=$3 RETURNING evidence_image, evidence_images',
    [images[0], JSON.stringify(images), id],
  );
  res.json({ ok: true, evidence_image: rows[0].evidence_image, evidence_images: rows[0].evidence_images });
});

router.post('/:id/evidence-slot', upload.single('evidence'), async (req, res) => {
  const { id } = req.params;
  const slot = Math.max(0, Math.min(3, parseInt(req.body?.slot, 10) || 0));
  const layout = normalizeEvidenceLayout(req.body?.layout);
  const fit = normalizeEvidenceFit(req.body?.fit);
  const existing = await pool.query(`
    SELECT m.user_id, m.is_general, COALESCE(m.assigned_area, m.area) AS assigned_area,
           m.evidence_image, m.evidence_images, m.evidence_fits, m.evidence_layout,
           u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM metas m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.id=$1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Meta nao encontrada' });
  if (existing.rows[0].is_general
    ? !canEditGeneralMeta(req, existing.rows[0].assigned_area)
    : !canEditMeta(req, existing.rows[0].user_id, existing.rows[0].owner_role, existing.rows[0].owner_area))
    return res.status(403).json({ error: 'Sem permissao' });
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
  if (!allowed.includes(req.file.mimetype))
    return res.status(400).json({ error: 'Tipo nao permitido. Use JPEG, PNG, GIF ou WebP' });
  if (req.file.size > 5*1024*1024)
    return res.status(400).json({ error: 'Cada imagem deve ter no maximo 5MB' });

  const maxSlots = evidenceSlotCount(layout);
  if (slot >= maxSlots) return res.status(400).json({ error: 'Slot nao existe para o layout selecionado' });

  const images = imageList(existing.rows[0]);
  const fits = fitList(existing.rows[0]);
  const base64 = req.file.buffer.toString('base64');
  images[slot] = `data:${req.file.mimetype};base64,${base64}`;
  fits[slot] = fit;
  const nextImages = images.slice(0, maxSlots);
  const nextFits = fits.slice(0, maxSlots).map(normalizeEvidenceFit);
  const { rows } = await pool.query(
    `UPDATE metas SET evidence_image=$1, evidence_images=$2::jsonb, evidence_fits=$3::jsonb,
       evidence_layout=$4, updated_at=NOW() WHERE id=$5
     RETURNING evidence_image, evidence_images, evidence_fits, evidence_layout`,
    [nextImages.find(Boolean) || null, JSON.stringify(nextImages), JSON.stringify(nextFits), layout, id],
  );
  res.json({ ok: true, ...rows[0] });
});

router.delete('/:id/evidence-slot/:slot', async (req, res) => {
  const { id, slot } = req.params;
  const slotIndex = Math.max(0, Math.min(3, parseInt(slot, 10) || 0));
  const layout = normalizeEvidenceLayout(req.query?.layout);
  const existing = await pool.query(`
    SELECT m.user_id, m.is_general, COALESCE(m.assigned_area, m.area) AS assigned_area,
           m.evidence_image, m.evidence_images, m.evidence_fits, m.evidence_layout,
           u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM metas m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.id=$1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Meta nao encontrada' });
  if (existing.rows[0].is_general
    ? !canEditGeneralMeta(req, existing.rows[0].assigned_area)
    : !canEditMeta(req, existing.rows[0].user_id, existing.rows[0].owner_role, existing.rows[0].owner_area))
    return res.status(403).json({ error: 'Sem permissao' });

  const maxSlots = evidenceSlotCount(layout || existing.rows[0].evidence_layout);
  if (slotIndex >= maxSlots) return res.status(400).json({ error: 'Slot nao existe para o layout selecionado' });

  const images = imageList(existing.rows[0]);
  const fits = fitList(existing.rows[0]);
  images[slotIndex] = null;
  fits[slotIndex] = 'contain';
  const nextImages = images.slice(0, maxSlots);
  const nextFits = fits.slice(0, maxSlots).map(normalizeEvidenceFit);
  const { rows } = await pool.query(
    `UPDATE metas SET evidence_image=$1, evidence_images=$2::jsonb, evidence_fits=$3::jsonb,
       evidence_layout=$4, updated_at=NOW() WHERE id=$5
     RETURNING evidence_image, evidence_images, evidence_fits, evidence_layout`,
    [nextImages.find(Boolean) || null, JSON.stringify(nextImages), JSON.stringify(nextFits), layout, id],
  );
  res.json({ ok: true, ...rows[0] });
});

router.put('/:id/evidence-slot/:slot/fit', async (req, res) => {
  const { id, slot } = req.params;
  const slotIndex = Math.max(0, Math.min(3, parseInt(slot, 10) || 0));
  const layout = normalizeEvidenceLayout(req.body?.layout);
  const fit = normalizeEvidenceFit(req.body?.fit);
  const existing = await pool.query(`
    SELECT m.user_id, m.is_general, COALESCE(m.assigned_area, m.area) AS assigned_area,
           m.evidence_image, m.evidence_images, m.evidence_fits, m.evidence_layout,
           u.role AS owner_role, COALESCE(u.area,'eletrica') AS owner_area
    FROM metas m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.id=$1
  `, [id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Meta nao encontrada' });
  if (existing.rows[0].is_general
    ? !canEditGeneralMeta(req, existing.rows[0].assigned_area)
    : !canEditMeta(req, existing.rows[0].user_id, existing.rows[0].owner_role, existing.rows[0].owner_area))
    return res.status(403).json({ error: 'Sem permissao' });

  const maxSlots = evidenceSlotCount(layout);
  if (slotIndex >= maxSlots) return res.status(400).json({ error: 'Slot nao existe para o layout selecionado' });

  const images = imageList(existing.rows[0]).slice(0, maxSlots);
  const fits = fitList(existing.rows[0]).slice(0, maxSlots);
  fits[slotIndex] = fit;
  const nextFits = fits.map(normalizeEvidenceFit);
  const { rows } = await pool.query(
    `UPDATE metas SET evidence_fits=$1::jsonb, evidence_layout=$2, updated_at=NOW()
     WHERE id=$3 RETURNING evidence_image, evidence_images, evidence_fits, evidence_layout`,
    [JSON.stringify(nextFits), layout, id],
  );
  res.json({ ok: true, ...rows[0], evidence_images: images });
});

export default router;
