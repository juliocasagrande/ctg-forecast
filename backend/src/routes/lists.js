import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import ExcelJS from 'exceljs';

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage() });

function safeError(res, err) {
  console.error(`[LISTS ERROR] ${err.message}`);
  if (process.env.NODE_ENV === 'production')
    return res.status(500).json({ error: 'Erro interno do servidor' });
  res.status(500).json({ error: err.message });
}

/* ══════════════════════════════════════════════════════
 * IACs
 * ══════════════════════════════════════════════════════ */

// GET /api/lists/iacs
router.get('/iacs', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM lists_iacs
      ORDER BY
        CASE status_current
          WHEN '0 - Not started yet'       THEN 0
          WHEN '1 - IA and PDs'            THEN 1
          WHEN '2 - Invitation letter'     THEN 2
          WHEN '3 - Proposal received'     THEN 3
          WHEN '4 - Clarification'         THEN 4
          WHEN '5 - Negotiation'           THEN 5
          WHEN '6 - ER/DM Review/Approval' THEN 6
          WHEN '8 - Draft Contract'        THEN 8
          WHEN '9 - Contract signed'       THEN 9
          WHEN '91 - Hired 2025'           THEN 91
          WHEN '10 - Cancelad'             THEN 100
          ELSE 99
        END,
        area ASC,
        iac_code ASC
    `);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/lists/iacs
router.post('/iacs', async (req, res) => {
  try {
    const {
      iac_code, type_line, area,
      qty_pp_line_26_priority, qty_pp_line_26_no_priority,
      opening_date, when_open, project,
      comments, requester, team_leader, team_leader_user_id, chinese_work_staff,
      status_current, apresentado_work_team,
      organizer, supervisor, evaluation_team,
      priority, validity, continuidade,
    } = req.body;

    const r = await pool.query(`
      INSERT INTO lists_iacs (
        iac_code, type_line, area,
        qty_pp_line_26_priority, qty_pp_line_26_no_priority,
        opening_date, when_open, project,
        comments, requester, team_leader, team_leader_user_id, chinese_work_staff,
        status_current, apresentado_work_team,
        organizer, supervisor, evaluation_team,
        priority, validity, continuidade
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      ) RETURNING *
    `, [
      iac_code || null, type_line || 'New', area || 'Elétrica',
      qty_pp_line_26_priority || null, qty_pp_line_26_no_priority || null,
      opening_date || null, when_open || null, project || null,
      comments || null, requester || null, team_leader || null, team_leader_user_id || null, chinese_work_staff || null,
      status_current || '0 - Not started yet', apresentado_work_team || 'Não',
      organizer || null, supervisor || null, evaluation_team || null,
      priority || 'Non Priority', validity || 'Dez/2027', continuidade || 'Sim',
    ]);
    res.status(201).json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// PUT /api/lists/iacs/:id
router.put('/iacs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      iac_code, type_line, area,
      qty_pp_line_26_priority, qty_pp_line_26_no_priority,
      opening_date, when_open, project,
      comments, requester, team_leader, team_leader_user_id, chinese_work_staff,
      status_current, apresentado_work_team,
      organizer, supervisor, evaluation_team,
      priority, validity, continuidade,
    } = req.body;

    const r = await pool.query(`
      UPDATE lists_iacs SET
        iac_code=$1, type_line=$2, area=$3,
        qty_pp_line_26_priority=$4, qty_pp_line_26_no_priority=$5,
        opening_date=$6, when_open=$7, project=$8,
        comments=$9, requester=$10, team_leader=$11, team_leader_user_id=$12, chinese_work_staff=$13,
        status_current=$14, apresentado_work_team=$15,
        organizer=$16, supervisor=$17, evaluation_team=$18,
        priority=$19, validity=$20, continuidade=$21,
        updated_at=NOW()
      WHERE id=$22
      RETURNING *
    `, [
      iac_code || null, type_line || 'New', area || 'Elétrica',
      qty_pp_line_26_priority || null, qty_pp_line_26_no_priority || null,
      opening_date || null, when_open || null, project || null,
      comments || null, requester || null, team_leader || null, team_leader_user_id || null, chinese_work_staff || null,
      status_current || '0 - Not started yet', apresentado_work_team || 'Não',
      organizer || null, supervisor || null, evaluation_team || null,
      priority || 'Non Priority', validity || 'Dez/2027', continuidade || 'Sim',
      id,
    ]);

    if (!r.rows.length) return res.status(404).json({ error: 'IAC não encontrado' });
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// DELETE /api/lists/iacs/:id
router.delete('/iacs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lists_iacs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

// POST /api/lists/iacs/:id/viewed — record that user viewed this IAC
router.post('/iacs/:id/viewed', async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    await pool.query(`
      INSERT INTO lists_iacs_last_viewed (iac_id, user_id, viewed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (iac_id, user_id)
      DO UPDATE SET viewed_at = NOW()
    `, [id, user.id]);
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/lists/iacs/:id/viewed-by-me — get last viewed timestamp for current user
router.get('/iacs/:id/viewed-by-me', async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const r = await pool.query(
      'SELECT viewed_at FROM lists_iacs_last_viewed WHERE iac_id=$1 AND user_id=$2',
      [id, user.id]
    );
    res.json(r.rows[0] || null);
  } catch (err) { safeError(res, err); }
});

// GET /api/lists/iacs/:id/alert-info — get last edited date for AlertBell
router.get('/iacs/:id/alert-info', async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      'SELECT updated_at, requester FROM lists_iacs WHERE id=$1',
      [id]
    );
    res.json(r.rows[0] || null);
  } catch (err) { safeError(res, err); }
});

/* ══════════════════════════════════════════════════════
 * PROJECTS TRACKING
 * ══════════════════════════════════════════════════════ */

// GET /api/lists/projects-tracking
router.get('/projects-tracking', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT * FROM lists_projects_tracking
      ORDER BY
        area ASC,
        CASE status
          WHEN 'Em andamento'           THEN 0
          WHEN 'Em fase de encerramento' THEN 1
          WHEN 'Encerrado'              THEN 2
          WHEN 'Paralisado'             THEN 3
          ELSE 99
        END,
        pp_contrato ASC
    `);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/lists/projects-tracking
router.post('/projects-tracking', async (req, res) => {
  try {
    const {
      area, uhe, pp_contrato, projeto_atividade, projeto,
      status, gestor, gestor_user_id, resumo, empresa, vencimento, vencimento_txt,
      cronograma, aditivos, reajustes,
      valor_contrato, realizado_contrato, saldo_contrato,
      valor_si, realizado_si, saldo_si,
      fornecedor, natureza, aditivo_em_andamento,
    } = req.body;

    const r = await pool.query(`
      INSERT INTO lists_projects_tracking (
        area, uhe, pp_contrato, projeto_atividade, projeto,
        status, gestor, gestor_user_id, resumo, empresa, vencimento, vencimento_txt,
        cronograma, aditivos, reajustes,
        valor_contrato, realizado_contrato, saldo_contrato,
        valor_si, realizado_si, saldo_si,
        fornecedor, natureza, aditivo_em_andamento
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24
      ) RETURNING *
    `, [
      area || 'Elétrica', uhe || 'Geral', pp_contrato || null,
      projeto_atividade || null, projeto || null,
      status || 'Em andamento', gestor || null, gestor_user_id || null, resumo || null,
      empresa || null,
      vencimento || null, vencimento_txt || null,
      cronograma || null, aditivos || null, reajustes || null,
      valor_contrato || null, realizado_contrato || null, saldo_contrato || null,
      valor_si || null, realizado_si || null, saldo_si || null,
      fornecedor || null, natureza || 'OPEX', aditivo_em_andamento || 'NÃO',
    ]);
    res.status(201).json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// PUT /api/lists/projects-tracking/:id
router.put('/projects-tracking/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      area, uhe, pp_contrato, projeto_atividade, projeto,
      status, gestor, gestor_user_id, resumo, empresa, vencimento, vencimento_txt,
      cronograma, aditivos, reajustes,
      valor_contrato, realizado_contrato, saldo_contrato,
      valor_si, realizado_si, saldo_si,
      fornecedor, natureza, aditivo_em_andamento,
    } = req.body;

    const r = await pool.query(`
      UPDATE lists_projects_tracking SET
        area=$1, uhe=$2, pp_contrato=$3, projeto_atividade=$4, projeto=$5,
        status=$6, gestor=$7, gestor_user_id=$8, resumo=$9, empresa=$10,
        vencimento=$11, vencimento_txt=$12,
        cronograma=$13, aditivos=$14, reajustes=$15,
        valor_contrato=$16, realizado_contrato=$17, saldo_contrato=$18,
        valor_si=$19, realizado_si=$20, saldo_si=$21,
        fornecedor=$22, natureza=$23, aditivo_em_andamento=$24,
        updated_at=NOW()
      WHERE id=$25
      RETURNING *
    `, [
      area || 'Elétrica', uhe || 'Geral', pp_contrato || null,
      projeto_atividade || null, projeto || null,
      status || 'Em andamento', gestor || null, gestor_user_id || null, resumo || null,
      empresa || null,
      vencimento || null, vencimento_txt || null,
      cronograma || null, aditivos || null, reajustes || null,
      valor_contrato || null, realizado_contrato || null, saldo_contrato || null,
      valor_si || null, realizado_si || null, saldo_si || null,
      fornecedor || null, natureza || 'OPEX', aditivo_em_andamento || 'NÃO',
      id,
    ]);

    if (!r.rows.length) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(r.rows[0]);
  } catch (err) { safeError(res, err); }
});

// DELETE /api/lists/projects-tracking/clear — remove ALL records (admin only)
router.delete('/projects-tracking/clear', async (req, res) => {
  try {
    const { user } = req;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem limpar a tabela' });
    }
    const result = await pool.query('DELETE FROM lists_projects_tracking');
    res.json({ ok: true, deleted: result.rowCount });
  } catch (err) { safeError(res, err); }
});

// DELETE /api/lists/projects-tracking/:id
router.delete('/projects-tracking/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lists_projects_tracking WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

// POST /api/lists/projects-tracking/:id/viewed — record that user viewed this project
router.post('/projects-tracking/:id/viewed', async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    await pool.query(`
      INSERT INTO lists_pt_last_viewed (tracking_id, user_id, viewed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (tracking_id, user_id)
      DO UPDATE SET viewed_at = NOW()
    `, [id, user.id]);
    res.json({ ok: true });
  } catch (err) { safeError(res, err); }
});

// GET /api/lists/projects-tracking/:id/viewed-by-me — get last viewed timestamp for current user
router.get('/projects-tracking/:id/viewed-by-me', async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const r = await pool.query(
      'SELECT viewed_at FROM lists_pt_last_viewed WHERE tracking_id=$1 AND user_id=$2',
      [id, user.id]
    );
    res.json(r.rows[0] || null);
  } catch (err) { safeError(res, err); }
});

// GET /api/lists/projects-tracking/:id/alert-info — get last edited date for AlertBell
router.get('/projects-tracking/:id/alert-info', async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      'SELECT updated_at, gestor FROM lists_projects_tracking WHERE id=$1',
      [id]
    );
    res.json(r.rows[0] || null);
  } catch (err) { safeError(res, err); }
});

// GET /api/lists/projects-tracking/stale-projects — projects not updated in X days (for AlertBell)
router.get('/projects-tracking/stale-projects', async (req, res) => {
  try {
    const { user } = req;
    // Get alert interval from settings
    const settings = await pool.query("SELECT key, value FROM system_settings WHERE key IN ('tracking_alert_interval_days', 'tracking_alert_enabled', 'tracking_alert_roles')");
    const settingsMap = {};
    settings.rows.forEach(r => { settingsMap[r.key] = r.value; });

    if (settingsMap['tracking_alert_enabled'] !== 'true') {
      return res.json([]);
    }

    const intervalDays = parseInt(settingsMap['tracking_alert_interval_days']) || 30;
    const allowedRoles = (settingsMap['tracking_alert_roles'] || 'gerente,coordenador,engenheiro').split(',').map(r => r.trim());

    // Check if user's role is in the allowed roles
    if (!allowedRoles.includes(user.role)) {
      return res.json([]);
    }

    let query, params;

    // For engenheiro, only show their own projects
    if (user.role === 'engenheiro') {
      query = `
        SELECT id, pp_contrato, projeto, area, gestor, updated_at
        FROM lists_projects_tracking
        WHERE updated_at < NOW() - ($1::text || ' days')::interval
          AND (gestor_user_id = $2 OR (gestor_user_id IS NULL AND LOWER(gestor) LIKE '%' || LOWER($3) || '%'))
        ORDER BY updated_at ASC
      `;
      params = [String(intervalDays), user.id, user.name];
    } else if (user.role === 'coordenador') {
      // Coordenadores see only projects from their area
      query = `
        SELECT id, pp_contrato, projeto, area, gestor, updated_at
        FROM lists_projects_tracking
        WHERE updated_at < NOW() - ($1::text || ' days')::interval
          AND area = $2
        ORDER BY updated_at ASC
      `;
      params = [String(intervalDays), user.area || ''];
    } else {
      // Gerentes see all areas
      query = `
        SELECT id, pp_contrato, projeto, area, gestor, updated_at
        FROM lists_projects_tracking
        WHERE updated_at < NOW() - ($1::text || ' days')::interval
        ORDER BY updated_at ASC
      `;
      params = [String(intervalDays)];
    }

    const r = await pool.query(query, params);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// GET /api/lists/iacs/stale-iacs — IACs not updated in X days (for AlertBell)
router.get('/iacs/stale-iacs', async (req, res) => {
  try {
    const { user } = req;
    // Get alert interval from settings
    const settings = await pool.query("SELECT key, value FROM system_settings WHERE key IN ('iac_alert_interval_days', 'iac_alert_enabled', 'iac_alert_roles')");
    const settingsMap = {};
    settings.rows.forEach(r => { settingsMap[r.key] = r.value; });

    if (settingsMap['iac_alert_enabled'] !== 'true') {
      return res.json([]);
    }

    const intervalDays = parseInt(settingsMap['iac_alert_interval_days']) || 14;
    const allowedRoles = (settingsMap['iac_alert_roles'] || 'gerente,coordenador,engenheiro').split(',').map(r => r.trim());

    // Check if user's role is in the allowed roles
    if (!allowedRoles.includes(user.role)) {
      return res.json([]);
    }

    let query, params;

    // For engenheiro, only show IACs where they are the team_leader
    if (user.role === 'engenheiro') {
      query = `
        SELECT id, iac_code, project, area, team_leader, updated_at
        FROM lists_iacs
        WHERE updated_at < NOW() - ($1::text || ' days')::interval
          AND (team_leader_user_id = $2 OR (team_leader_user_id IS NULL AND LOWER(team_leader) LIKE '%' || LOWER($3) || '%'))
        ORDER BY updated_at ASC
      `;
      params = [String(intervalDays), user.id, user.name];
    } else if (user.role === 'coordenador') {
      // Coordenadores see only IACs from their area
      query = `
        SELECT id, iac_code, project, area, team_leader, updated_at
        FROM lists_iacs
        WHERE updated_at < NOW() - ($1::text || ' days')::interval
          AND area = $2
        ORDER BY updated_at ASC
      `;
      params = [String(intervalDays), user.area || ''];
    } else {
      // Gerentes see all areas
      query = `
        SELECT id, iac_code, project, area, team_leader, updated_at
        FROM lists_iacs
        WHERE updated_at < NOW() - ($1::text || ' days')::interval
        ORDER BY updated_at ASC
      `;
      params = [String(intervalDays)];
    }

    const r = await pool.query(query, params);
    res.json(r.rows);
  } catch (err) { safeError(res, err); }
});

// POST /api/lists/projects-tracking/import
router.post('/projects-tracking/import', upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const usersResult = await pool.query('SELECT id, name FROM users WHERE active = true');
    const userNameMap = buildUserNameMap(usersResult.rows);

    await client.query('BEGIN');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const ws = workbook.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'Planilha vazia' });

    const headers = [];
    ws.getRow(1).eachCell(c => headers.push((c.value || '').toString().trim().toLowerCase()));

    const findCol = (keys) => {
      for (const k of keys) {
        const idx = headers.findIndex(h => h.includes(k.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const colMap = {
      area: findCol(['área', 'area']),
      uhe: findCol(['uhe', 'usina']),
      pp_contrato: findCol(['pp', 'contrato', 'pp/contrato']),
      projeto_atividade: findCol(['projeto/atividade', 'atividade', 'descrição']),
      projeto: findCol(['projeto', 'nome']),
      status: findCol(['status']),
      gestor: findCol(['gestor', 'responsável']),
      resumo: findCol(['resumo', 'observação', 'obs']),
      empresa: findCol(['empresa']),
      vencimento: findCol(['vencimento', 'data']),
      cronograma: findCol(['cronograma']),
      aditivos: findCol(['aditivos']),
      reajustes: findCol(['reajustes']),
      valor_contrato: findCol(['valor contrato', 'val. contrato', 'valor']),
      realizado_contrato: findCol(['realizado contrato', 'realizado']),
      saldo_contrato: findCol(['saldo contrato', 'saldo']),
      valor_si: findCol(['valor si']),
      realizado_si: findCol(['realizado si']),
      saldo_si: findCol(['saldo si']),
      fornecedor: findCol(['fornecedor']),
      natureza: findCol(['natureza']),
      aditivo_em_andamento: findCol(['aditivo em and', 'aditivo']),
    };

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => {
        if (colIdx < 0) return null;
        const cell = row.getCell(colIdx + 1);
        // Return Date objects directly so parseDate can handle them
        if (cell.value instanceof Date) return cell.value;
        return (cell.value || '').toString().trim();
      };

      const pp = getCell(colMap.pp_contrato);
      if (!pp) { skipped++; continue; }

      const parseVal = (v) => {
        if (v === null || v === undefined) return null;
        // If already a number, return rounded to 2 decimal places (ExcelJS returns numeric cells as JS numbers)
        if (typeof v === 'number') return Math.round(v * 100) / 100;
        // String parsing for Brazilian format: "2.903.969,35"
        const s = String(v).replace(/[^\d.,]/g, '');
        // If no comma, it might be a plain number string like "2903969.35"
        if (!s.includes(',')) {
          const n = parseFloat(s);
          return isNaN(n) ? null : Math.round(n * 100) / 100;
        }
        // Has comma → Brazilian format: remove thousand-separator dots, then swap comma→dot
        const normalized = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(normalized);
        return isNaN(n) ? null : Math.round(n * 100) / 100;
      };

      const parseDate = (v) => {
        if (!v) return null;
        if (v instanceof Date) {
          if (isNaN(v.getTime())) return null;
          return v.toISOString().slice(0, 10);
        }
        const s = String(v).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // Brazilian format: DD/MM/YYYY or DD-MM-YYYY
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
          const day = String(m[1]).padStart(2, '0');
          const month = String(m[2]).padStart(2, '0');
          return `${m[3]}-${month}-${day}`;
        }
        // DD/MM/YY format
        const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
        if (m2) {
          const day = String(m2[1]).padStart(2, '0');
          const month = String(m2[2]).padStart(2, '0');
          const year = `20${m2[3]}`;
          return `${year}-${month}-${day}`;
        }
        return null;
      };

      const truncate = (v, max) => {
        if (!v) return null;
        const s = String(v);
        return s.length > max ? s.slice(0, max) : s;
      };

      const projetoAtividade = getCell(colMap.projeto_atividade);
      // Generate unique_key: pp_contrato + first 40 chars of projeto_atividade
      // This allows multiple processes with the same pp_contrato (temporary codes)
      const uniqueKey = pp + '|' + (projetoAtividade ? projetoAtividade.substring(0, 40) : '');

      const gestorRaw = getCell(colMap.gestor) || '';
      const gestorUserId = resolveUserId(gestorRaw, userNameMap);
      const gestorName = resolveUserName(gestorRaw, userNameMap, usersResult.rows) || truncate(gestorRaw, 120);

      const data = {
        area: truncate(getCell(colMap.area) || 'Elétrica', 30),
        uhe: truncate(getCell(colMap.uhe) || 'Geral', 60),
        pp_contrato: truncate(pp, 30),
        projeto_atividade: projetoAtividade,
        projeto: truncate(getCell(colMap.projeto), 200),
        status: truncate(getCell(colMap.status) || 'Em andamento', 50),
        gestor: gestorName,
        gestor_user_id: gestorUserId,
        resumo: getCell(colMap.resumo),
        empresa: getCell(colMap.empresa),
        vencimento: parseDate(getCell(colMap.vencimento)),
        cronograma: getCell(colMap.cronograma),
        aditivos: getCell(colMap.aditivos),
        reajustes: getCell(colMap.reajustes),
        valor_contrato: parseVal(getCell(colMap.valor_contrato)),
        realizado_contrato: parseVal(getCell(colMap.realizado_contrato)),
        saldo_contrato: parseVal(getCell(colMap.saldo_contrato)),
        valor_si: parseVal(getCell(colMap.valor_si)),
        realizado_si: parseVal(getCell(colMap.realizado_si)),
        saldo_si: parseVal(getCell(colMap.saldo_si)),
        fornecedor: truncate(getCell(colMap.fornecedor), 200),
        natureza: truncate(getCell(colMap.natureza) || 'OPEX', 30),
        aditivo_em_andamento: truncate(getCell(colMap.aditivo_em_andamento) || 'NÃO', 10),
        unique_key: uniqueKey.substring(0, 100),
      };

      // Upsert: INSERT with ON CONFLICT on unique_key (not pp_contrato)
      const r = await client.query(`
        INSERT INTO lists_projects_tracking (
          area, uhe, pp_contrato, projeto_atividade, projeto, status, gestor, gestor_user_id, resumo, empresa,
          vencimento, cronograma, aditivos, reajustes, valor_contrato, realizado_contrato, saldo_contrato,
          valor_si, realizado_si, saldo_si, fornecedor, natureza, aditivo_em_andamento, unique_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        ON CONFLICT (unique_key) DO UPDATE SET
          area=EXCLUDED.area, uhe=EXCLUDED.uhe, projeto_atividade=EXCLUDED.projeto_atividade,
          projeto=EXCLUDED.projeto, status=EXCLUDED.status, gestor=EXCLUDED.gestor,
          gestor_user_id=EXCLUDED.gestor_user_id,
          resumo=EXCLUDED.resumo, empresa=EXCLUDED.empresa, vencimento=EXCLUDED.vencimento,
          cronograma=EXCLUDED.cronograma, aditivos=EXCLUDED.aditivos, reajustes=EXCLUDED.reajustes,
          valor_contrato=EXCLUDED.valor_contrato, realizado_contrato=EXCLUDED.realizado_contrato,
          saldo_contrato=EXCLUDED.saldo_contrato, valor_si=EXCLUDED.valor_si,
          realizado_si=EXCLUDED.realizado_si, saldo_si=EXCLUDED.saldo_si,
          fornecedor=EXCLUDED.fornecedor, natureza=EXCLUDED.natureza,
          aditivo_em_andamento=EXCLUDED.aditivo_em_andamento, updated_at=NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        data.area, data.uhe, data.pp_contrato, data.projeto_atividade, data.projeto, data.status, data.gestor, data.gestor_user_id,
        data.resumo, data.empresa, data.vencimento, data.cronograma, data.aditivos, data.reajustes,
        data.valor_contrato, data.realizado_contrato, data.saldo_contrato,
        data.valor_si, data.realizado_si, data.saldo_si, data.fornecedor, data.natureza,
        data.aditivo_em_andamento, data.unique_key,
      ]);
      if (r.rows[0].inserted) inserted++; else updated++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, inserted, updated, skipped });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

/* ══════════════════════════════════════════════════════
 * IACs Import
 * ══════════════════════════════════════════════════════ */

// POST /api/lists/iacs/import
function normalizeName(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Maps normalized spreadsheet names → normalized system user names (where they differ)
const PERSON_ALIASES = {
  'fabricio issao niiyama':       'fabricio niiyama',
  'juliano nicolielo torres':     'juliano torres',
  'rodrigo hernandes alves':      'rodrigo hernandes',
  'leonardo seiji watanabe':      'leonardo watanabe',
  'helio henrique dias':          'helio dias',
  'yuri moura santos':            'yuri moura',
  'ricardo passalacqua':          'ricardo passalaqua',
  'maurilio faria morais':        'maurilio faria',
  'julio lima casagrande':        'julio casagrande',
  'leonardo lino leoncini':       'leonardo leoncini',
  'jean rafael mendes':           'jean mendes',
  'marcos hiroshi kadota':        'marcos kadota',
  'victor henrique pedraci':      'victor pedraci',
  'hallyson izidoro dos santos':  'hallyson izidoro',
  'itamar rodrigo barros':        'itamar barros',
  'marcel chuma cerbantes':       'marcel cerbantes',
  'roberto cabral lara':          'roberto lara',
  'everton nascimento da silva':  'everton nascimento',
  'tadayuki juliano takamiya':    'juliano takamiya',
  'alexsson procopio dos santos': 'alexsson santos',
};

function buildUserNameMap(users) {
  const map = {};
  for (const u of users) map[normalizeName(u.name)] = u.id;
  return map;
}

function resolveUserId(spreadsheetName, userNameMap) {
  const norm = normalizeName(spreadsheetName);
  if (!norm) return null;
  if (userNameMap[norm] != null) return userNameMap[norm];
  const alias = PERSON_ALIASES[norm];
  if (alias && userNameMap[alias] != null) return userNameMap[alias];
  return null;
}

function resolveUserName(spreadsheetName, userNameMap, users) {
  const userId = resolveUserId(spreadsheetName, userNameMap);
  if (!userId) return null;
  return users.find(u => u.id === userId)?.name || null;
}

router.post('/iacs/import', upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const usersResult = await pool.query('SELECT id, name FROM users WHERE active = true');
    const userNameMap = buildUserNameMap(usersResult.rows);

    await client.query('BEGIN');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const ws = workbook.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'Planilha vazia' });

    const headers = [];
    ws.getRow(1).eachCell(c => headers.push((c.value || '').toString().trim()));
    const headersLower = headers.map(h => h.toLowerCase());

    const findCol = (keys) => {
      for (const k of keys) {
        let idx = headersLower.findIndex(h => h === k.toLowerCase());
        if (idx !== -1) return idx;
        idx = headersLower.findIndex(h => h.includes(k.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const colMap = {
      iac_code: findCol(['IAC', 'Title', 'iac_code', 'iac code', 'codigo', 'código']),
      type_line: findCol(['Type-line', 'type_line', 'type line', 'tipo']),
      area: findCol(['Área', 'Area', 'area']),
      qty_pp_line_26_priority: findCol(['Qtty PP Line 26 Priority', 'qty_pp_line_26_priority', 'qty priority']),
      qty_pp_line_26_no_priority: findCol(['Qtty PP LINE 26 NON-PRIORITY', 'qty_pp_line_26_no_priority', 'qty no priority']),
      opening_date: findCol(['Opening Date', 'opening_date', 'opening date', 'data abertura']),
      when_open: findCol(['When Open', 'when_open', 'when open', 'quando']),
      project: findCol(['Project', 'project', 'projeto']),
      comments: findCol(['Comments', 'comments', 'comentários', 'observações']),
      requester: findCol(['Requester', 'requester', 'solicitante']),
      team_leader: findCol(['Team Leader', 'team_leader', 'team leader']),
      chinese_work_staff: findCol(['Chinese Work Staff', 'chinese_work_staff', 'chinese staff', 'chinese']),
      status_current: findCol(['Status_Current', 'status_current', 'status current', 'status']),
      apresentado_work_team: findCol(['Apresentado Work Team', 'apresentado_work_team', 'apresentado']),
      organizer: findCol(['Organizer', 'organizer', 'organizador']),
      supervisor: findCol(['Supervisor', 'supervisor']),
      evaluation_team: findCol(['Evaluation Team', 'evaluation_team', 'evaluation team', 'avaliação']),
      priority: findCol(['Priority', 'priority', 'prioridade']),
      validity: findCol(['Validity', 'validity', 'validade']),
      continuidade: findCol(['Continuidade', 'continuidade', 'continuity']),
    };

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => {
        if (colIdx < 0 || colIdx >= headers.length) return null;
        const cellValue = row.getCell(colIdx + 1).value;
        if (cellValue === null || cellValue === undefined) return null;
        // Handle Date objects directly
        if (cellValue instanceof Date) {
          if (isNaN(cellValue.getTime())) return null;
          return cellValue.toISOString().slice(0, 10);
        }
        // Handle numeric cells - check if it's an Excel date serial number
        if (typeof cellValue === 'number') {
          // Excel date serial numbers are typically between 1 and ~47000 (years 1900-2028)
          // But IAC codes or other numeric IDs can be much larger
          if (cellValue > 0 && cellValue < 60000) {
            const excelEpoch = new Date(1899, 11, 30);
            const jsDate = new Date(excelEpoch.getTime() + cellValue * 86400000);
            if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() >= 1900 && jsDate.getFullYear() <= 2030) {
              return jsDate.toISOString().slice(0, 10);
            }
          }
          // Not a date — return as string
          return String(cellValue).trim();
        }
        // Handle rich text cells (ExcelJS object format)
        if (typeof cellValue === 'object' && cellValue.richText) {
          return cellValue.richText.map(r => r.text || '').join('').trim() || null;
        }
        // Handle formula results
        if (typeof cellValue === 'object' && cellValue.result !== undefined) {
          const result = cellValue.result;
          if (result === null || result === undefined) return null;
          return String(result).trim();
        }
        return cellValue.toString().trim();
      };

      const iacCode = getCell(colMap.iac_code);
      if (!iacCode || iacCode === '') { skipped++; continue; }

      const parseDate = (v) => {
        if (!v) return null;
        if (v instanceof Date) {
          if (isNaN(v.getTime())) return null;
          return v.toISOString().slice(0, 10);
        }
        // If already in YYYY-MM-DD format, validate and return
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
          const d = new Date(String(v));
          return isNaN(d.getTime()) ? null : String(v);
        }
        // Handle Brazilian format DD/MM/YYYY or DD-MM-YYYY
        const s = String(v).trim();
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
          const day = parseInt(m[1], 10);
          const month = parseInt(m[2], 10);
          const year = parseInt(m[3], 10);
          
          // Validate date components
          if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
            return null;
          }
          
          // Create date and verify it's valid (handles cases like 31/06/2026)
          const date = new Date(year, month - 1, day);
          if (isNaN(date.getTime())) return null;
          
          // Verify the date components match (catches invalid dates like Feb 30)
          if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
            return null;
          }
          
          const dayStr = String(day).padStart(2, '0');
          const monthStr = String(month).padStart(2, '0');
          return `${year}-${monthStr}-${dayStr}`;
        }
        // Handle DD/MM/YY format
        const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
        if (m2) {
          const day = parseInt(m2[1], 10);
          const month = parseInt(m2[2], 10);
          const year = 2000 + parseInt(m2[3], 10);
          
          if (month < 1 || month > 12 || day < 1 || day > 31) return null;
          
          const date = new Date(year, month - 1, day);
          if (isNaN(date.getTime())) return null;
          if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
            return null;
          }
          
          const dayStr = String(day).padStart(2, '0');
          const monthStr = String(month).padStart(2, '0');
          return `${year}-${monthStr}-${dayStr}`;
        }
        return null;
      };

      const parseNum = (v) => {
        if (!v || v === '') return null;
        if (typeof v === 'number') {
          // Excel date serial numbers are typically > 30000 (dates after 1982)
          // Quantities in YYMMDD format like 19000101 should be rejected
          // But normal quantities up to ~1000000 are valid
          if (v > 100000 && v < 100000000) {
            // Likely a date in YYYYMMDD or YYMMDD format, not a quantity
            return null;
          }
          return v;
        }
        const s = String(v).replace(/[^\d.,]/g, '');
        if (!s.includes(',')) {
          const n = parseFloat(s);
          // Reject dates in YYYYMMDD format (> 100000 and < 100000000)
          if (n > 100000 && n < 100000000) return null;
          return isNaN(n) ? null : n;
        }
        const normalized = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(normalized);
        return isNaN(n) ? null : n;
      };

      const truncate = (v, max) => {
        if (!v) return null;
        const s = String(v);
        return s.length > max ? s.slice(0, max) : s;
      };

      const project = getCell(colMap.project);
      // Generate unique_key: iac_code + first 40 chars of project
      const uniqueKey = iacCode + '|' + (project ? project.substring(0, 40) : '');

      const tlRaw = getCell(colMap.team_leader) || '';
      const tlUserId = resolveUserId(tlRaw, userNameMap);
      const tlName = resolveUserName(tlRaw, userNameMap, usersResult.rows) || truncate(tlRaw, 120);

      const data = {
        iac_code: truncate(iacCode, 50),
        type_line: truncate(getCell(colMap.type_line) || 'New', 50),
        area: truncate(getCell(colMap.area) || 'Elétrica', 50),
        qty_pp_line_26_priority: parseNum(getCell(colMap.qty_pp_line_26_priority)),
        qty_pp_line_26_no_priority: parseNum(getCell(colMap.qty_pp_line_26_no_priority)),
        opening_date: parseDate(getCell(colMap.opening_date)),
        when_open: parseDate(getCell(colMap.when_open)),
        project: project,
        comments: getCell(colMap.comments),
        requester: truncate(getCell(colMap.requester), 120),
        team_leader: tlName,
        team_leader_user_id: tlUserId,
        chinese_work_staff: truncate(getCell(colMap.chinese_work_staff), 120),
        status_current: truncate(getCell(colMap.status_current) || '0 - Not started yet', 50),
        apresentado_work_team: truncate(getCell(colMap.apresentado_work_team) || 'Não', 10),
        organizer: truncate(getCell(colMap.organizer), 120),
        supervisor: truncate(getCell(colMap.supervisor), 120),
        evaluation_team: getCell(colMap.evaluation_team),
        priority: truncate(getCell(colMap.priority) || 'Non Priority', 50),
        validity: truncate(getCell(colMap.validity) || 'Dez/2027', 20),
        continuidade: truncate(getCell(colMap.continuidade) || 'Sim', 10),
        unique_key: uniqueKey.substring(0, 100),
      };

      const r = await client.query(`
        INSERT INTO lists_iacs (
          iac_code, type_line, area,
          qty_pp_line_26_priority, qty_pp_line_26_no_priority,
          opening_date, when_open, project,
          comments, requester, team_leader, team_leader_user_id, chinese_work_staff,
          status_current, apresentado_work_team,
          organizer, supervisor, evaluation_team,
          priority, validity, continuidade, unique_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (unique_key) DO UPDATE SET
          type_line=EXCLUDED.type_line, area=EXCLUDED.area,
          qty_pp_line_26_priority=EXCLUDED.qty_pp_line_26_priority,
          qty_pp_line_26_no_priority=EXCLUDED.qty_pp_line_26_no_priority,
          opening_date=EXCLUDED.opening_date, when_open=EXCLUDED.when_open,
          project=EXCLUDED.project, comments=EXCLUDED.comments,
          requester=EXCLUDED.requester, team_leader=EXCLUDED.team_leader,
          team_leader_user_id=EXCLUDED.team_leader_user_id,
          chinese_work_staff=EXCLUDED.chinese_work_staff,
          status_current=EXCLUDED.status_current,
          apresentado_work_team=EXCLUDED.apresentado_work_team,
          organizer=EXCLUDED.organizer, supervisor=EXCLUDED.supervisor,
          evaluation_team=EXCLUDED.evaluation_team,
          priority=EXCLUDED.priority, validity=EXCLUDED.validity,
          continuidade=EXCLUDED.continuidade, updated_at=NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        data.iac_code, data.type_line, data.area,
        data.qty_pp_line_26_priority, data.qty_pp_line_26_no_priority,
        data.opening_date, data.when_open, data.project,
        data.comments, data.requester, data.team_leader, data.team_leader_user_id, data.chinese_work_staff,
        data.status_current, data.apresentado_work_team,
        data.organizer, data.supervisor, data.evaluation_team,
        data.priority, data.validity, data.continuidade, data.unique_key,
      ]);
      if (r.rows[0].inserted) inserted++; else updated++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, inserted, updated, skipped });
  } catch (err) {
    await client.query('ROLLBACK');
    safeError(res, err);
  } finally {
    client.release();
  }
});

// POST /api/lists/iacs/import/preview — parse and return summary without saving
router.post('/iacs/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const ws = workbook.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'Planilha vazia' });

    // Extract headers from row 1
    const headers = [];
    ws.getRow(1).eachCell(c => headers.push((c.value || '').toString().trim()));

    const headersLower = headers.map(h => h.toLowerCase());

    const findCol = (keys) => {
      for (const k of keys) {
        // Try exact match
        let idx = headersLower.findIndex(h => h === k.toLowerCase());
        if (idx !== -1) return idx;
        // Try contains
        idx = headersLower.findIndex(h => h.includes(k.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const colMap = {
      iac_code: findCol(['IAC', 'Title', 'iac_code', 'iac code', 'codigo', 'código']),
      type_line: findCol(['Type-line', 'type_line', 'type line', 'tipo']),
      area: findCol(['Área', 'Area', 'area']),
      qty_pp_line_26_priority: findCol(['Qtty PP Line 26 Priority', 'qty_pp_line_26_priority', 'qty priority']),
      qty_pp_line_26_no_priority: findCol(['Qtty PP LINE 26 NON-PRIORITY', 'qty_pp_line_26_no_priority', 'qty no priority']),
      opening_date: findCol(['Opening Date', 'opening_date', 'opening date', 'data abertura']),
      when_open: findCol(['When Open', 'when_open', 'when open', 'quando']),
      project: findCol(['Project', 'project', 'projeto']),
      comments: findCol(['Comments', 'comments', 'comentários', 'observações']),
      requester: findCol(['Requester', 'requester', 'solicitante']),
      team_leader: findCol(['Team Leader', 'team_leader', 'team leader']),
      chinese_work_staff: findCol(['Chinese Work Staff', 'chinese_work_staff', 'chinese staff', 'chinese']),
      status_current: findCol(['Status_Current', 'status_current', 'status current', 'status']),
      apresentado_work_team: findCol(['Apresentado Work Team', 'apresentado_work_team', 'apresentado']),
      organizer: findCol(['Organizer', 'organizer', 'organizador']),
      supervisor: findCol(['Supervisor', 'supervisor']),
      evaluation_team: findCol(['Evaluation Team', 'evaluation_team', 'evaluation team', 'avaliação']),
      priority: findCol(['Priority', 'priority', 'prioridade']),
      validity: findCol(['Validity', 'validity', 'validade']),
      continuidade: findCol(['Continuidade', 'continuidade', 'continuity']),
    };

    const rows = [];
    const areas = {};
    const statuses = {};
    const priorities = {};
    const teamLeaderSet = new Set();
    let skipped = 0;

    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => {
        if (colIdx < 0 || colIdx >= headers.length) return null;
        const cellValue = row.getCell(colIdx + 1).value;
        if (cellValue === null || cellValue === undefined) return null;
        // Handle Date objects directly
        if (cellValue instanceof Date) {
          if (isNaN(cellValue.getTime())) return null;
          return cellValue.toISOString().slice(0, 10);
        }
        // Handle numeric cells - check if it's an Excel date serial number
        if (typeof cellValue === 'number') {
          // Excel date serial numbers are typically between 1 and ~47000 (years 1900-2028)
          // But IAC codes or other numeric IDs can be much larger
          if (cellValue > 0 && cellValue < 60000) {
            const excelEpoch = new Date(1899, 11, 30);
            const jsDate = new Date(excelEpoch.getTime() + cellValue * 86400000);
            if (!isNaN(jsDate.getTime()) && jsDate.getFullYear() >= 1900 && jsDate.getFullYear() <= 2030) {
              return jsDate.toISOString().slice(0, 10);
            }
          }
          // Not a date — return as string
          return String(cellValue).trim();
        }
        // Handle rich text cells (ExcelJS object format)
        if (typeof cellValue === 'object' && cellValue.richText) {
          return cellValue.richText.map(r => r.text || '').join('').trim() || null;
        }
        // Handle formula results
        if (typeof cellValue === 'object' && cellValue.result !== undefined) {
          const result = cellValue.result;
          if (result === null || result === undefined) return null;
          return String(result).trim();
        }
        return cellValue.toString().trim();
      };

      const iacCode = getCell(colMap.iac_code);

      if (!iacCode || iacCode === '') { skipped++; continue; }

      const project = getCell(colMap.project);
      const uniqueKey = iacCode + '|' + (project ? project.substring(0, 40) : '');

      const area = getCell(colMap.area) || 'Elétrica';
      const status = getCell(colMap.status_current) || '0 - Not started yet';
      const priority = getCell(colMap.priority) || 'Non Priority';
      const typeLine = getCell(colMap.type_line) || 'New';
      const teamLeader = getCell(colMap.team_leader);
      if (teamLeader) teamLeaderSet.add(teamLeader);

      areas[area] = (areas[area] || 0) + 1;
      statuses[status] = (statuses[status] || 0) + 1;
      priorities[priority] = (priorities[priority] || 0) + 1;

      if (rows.length < 20) {
        rows.push({
          iac_code: iacCode,
          area,
          status_current: status,
          priority,
          type_line: typeLine,
        });
      }
    }

    // Check existing IACs by unique_key
    const allUniqueKeys = new Set();
    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => (colIdx >= 0 ? (row.getCell(colIdx + 1).value || '').toString().trim() : null);
      const iacCode = getCell(colMap.iac_code);
      const project = getCell(colMap.project);
      if (iacCode && iacCode !== '') {
        const uk = iacCode + '|' + (project ? project.substring(0, 40) : '');
        allUniqueKeys.add(uk.substring(0, 100));
      }
    }
    const uniqueKeysArray = [...allUniqueKeys];
    const existingRows = [];
    for (let i = 0; i < uniqueKeysArray.length; i += 10000) {
      const batch = uniqueKeysArray.slice(i, i + 10000);
      const r = await pool.query('SELECT unique_key FROM lists_iacs WHERE unique_key = ANY($1)', [batch]);
      existingRows.push(...r.rows);
    }
    const existingSet = new Set(existingRows.map(r => r.unique_key));
    let newCount = 0, updateCount = 0;
    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => (colIdx >= 0 ? (row.getCell(colIdx + 1).value || '').toString().trim() : null);
      const iacCode = getCell(colMap.iac_code);
      if (!iacCode || iacCode === '') continue;
      const project = getCell(colMap.project);
      const uk = iacCode + '|' + (project ? project.substring(0, 40) : '');
      if (existingSet.has(uk.substring(0, 100))) updateCount++; else newCount++;
    }

    res.json({
      totalRows: ws.rowCount - 1 - skipped,
      skipped,
      newCount,
      updateCount,
      areas,
      statuses,
      priorities,
      previewRows: rows,
      uniqueTeamLeaders: [...teamLeaderSet].sort(),
    });
  } catch (err) {
    console.error('[IAC IMPORT ERROR]', err);
    safeError(res, err);
  }
});

// POST /api/lists/projects-tracking/import/preview — parse and return summary without saving
router.post('/projects-tracking/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const ws = workbook.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'Planilha vazia' });

    const headers = [];
    ws.getRow(1).eachCell(c => headers.push((c.value || '').toString().trim().toLowerCase()));

    const findCol = (keys) => {
      for (const k of keys) {
        const idx = headers.findIndex(h => h.includes(k.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const colMap = {
      area: findCol(['área', 'area']),
      uhe: findCol(['uhe', 'usina']),
      pp_contrato: findCol(['pp', 'contrato', 'pp/contrato']),
      projeto_atividade: findCol(['projeto/atividade', 'atividade', 'descrição']),
      projeto: findCol(['projeto', 'nome']),
      status: findCol(['status']),
      gestor: findCol(['gestor', 'responsável']),
      resumo: findCol(['resumo', 'observação', 'obs']),
      empresa: findCol(['empresa']),
      vencimento: findCol(['vencimento', 'data']),
      cronograma: findCol(['cronograma']),
      aditivos: findCol(['aditivos']),
      reajustes: findCol(['reajustes']),
      valor_contrato: findCol(['valor contrato', 'val. contrato', 'valor']),
      realizado_contrato: findCol(['realizado contrato', 'realizado']),
      saldo_contrato: findCol(['saldo contrato', 'saldo']),
      valor_si: findCol(['valor si']),
      realizado_si: findCol(['realizado si']),
      saldo_si: findCol(['saldo si']),
      fornecedor: findCol(['fornecedor']),
      natureza: findCol(['natureza']),
      aditivo_em_andamento: findCol(['aditivo em and', 'aditivo']),
    };

    const rows = [];
    const areas = {};
    const statuses = {};
    const naturezas = { CAPEX: 0, OPEX: 0, 'Guarda-chuva': 0 };
    const gestorSet = new Set();
    let totalContrato = 0;
    let skipped = 0;

    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => {
        if (colIdx < 0) return null;
        const cell = row.getCell(colIdx + 1);
        // Return Date objects directly so parseDate can handle them
        if (cell.value instanceof Date) return cell.value;
        return (cell.value || '').toString().trim();
      };

      const pp = getCell(colMap.pp_contrato);
      if (!pp) { skipped++; continue; }

      const parseVal = (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return Math.round(v * 100) / 100;
        const s = String(v).replace(/[^\d.,]/g, '');
        if (!s.includes(',')) {
          const n = parseFloat(s);
          return isNaN(n) ? null : Math.round(n * 100) / 100;
        }
        const normalized = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(normalized);
        return isNaN(n) ? null : Math.round(n * 100) / 100;
      };

      const area = getCell(colMap.area) || 'Elétrica';
      const status = getCell(colMap.status) || 'Em andamento';
      const natureza = getCell(colMap.natureza) || 'OPEX';
      const val = parseVal(getCell(colMap.valor_contrato)) || 0;
      const gestor = getCell(colMap.gestor);
      if (gestor) gestorSet.add(gestor);

      areas[area] = (areas[area] || 0) + 1;
      statuses[status] = (statuses[status] || 0) + 1;
      if (naturezas[natureza] !== undefined) naturezas[natureza]++;
      totalContrato += val;

      if (rows.length < 20) {
        rows.push({
          pp_contrato: pp,
          area,
          status,
          natureza,
          valor_contrato: val,
          fornecedor: getCell(colMap.fornecedor) || '—',
        });
      }
    }

    // First pass: collect ALL unique_keys, then query existing ones
    const allUniqueKeys = new Set();
    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => (colIdx >= 0 ? (row.getCell(colIdx + 1).value || '').toString().trim() : null);
      const pp = getCell(colMap.pp_contrato);
      const projetoAtividade = getCell(colMap.projeto_atividade);
      if (pp) {
        const uk = pp + '|' + (projetoAtividade ? projetoAtividade.substring(0, 40) : '');
        allUniqueKeys.add(uk.substring(0, 100));
      }
    }
    const uniqueKeysArray = [...allUniqueKeys];
    // Query in batches of 10000 (PostgreSQL ANY() limit)
    const existingRows = [];
    for (let i = 0; i < uniqueKeysArray.length; i += 10000) {
      const batch = uniqueKeysArray.slice(i, i + 10000);
      const r = await pool.query('SELECT unique_key FROM lists_projects_tracking WHERE unique_key = ANY($1)', [batch]);
      existingRows.push(...r.rows);
    }
    const existingSet = new Set(existingRows.map(r => r.unique_key));
    let newCount = 0, updateCount = 0;
    for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
      const row = ws.getRow(rowIdx);
      const getCell = (colIdx) => (colIdx >= 0 ? (row.getCell(colIdx + 1).value || '').toString().trim() : null);
      const pp = getCell(colMap.pp_contrato);
      if (!pp) continue;
      const projetoAtividade = getCell(colMap.projeto_atividade);
      const uk = pp + '|' + (projetoAtividade ? projetoAtividade.substring(0, 40) : '');
      if (existingSet.has(uk.substring(0, 100))) updateCount++; else newCount++;
    }

    res.json({
      totalRows: ws.rowCount - 1 - skipped,
      skipped,
      newCount,
      updateCount,
      areas,
      statuses,
      naturezas,
      totalContrato,
      previewRows: rows,
      uniqueGestors: [...gestorSet].sort(),
    });
  } catch (err) { safeError(res, err); }
});

export default router;
