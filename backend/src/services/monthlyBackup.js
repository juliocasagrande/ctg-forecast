import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/schema.js';
import { enviarEmail } from '../utils/mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BACKUP_DIR = path.resolve(__dirname, '../../../backups');
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const BACKUP_EMAIL_SENT_SETTING_KEY = 'operational_backup_email_sent_period';

function resolveBackupDir() {
  return process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
}

function backupRecipients() {
  return (process.env.BACKUP_EMAIL_TO || '')
    .split(',')
    .map(email => email.trim())
    .filter(Boolean);
}

function emailEnabled() {
  return process.env.BACKUP_EMAIL_ENABLED !== 'false' && backupRecipients().length > 0;
}

function monthStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function backupFilePath(date = new Date()) {
  return path.join(resolveBackupDir(), `CTG_Backup_Operacional_${monthStamp(date)}.xlsx`);
}

async function getLastSentBackupPeriod() {
  const result = await pool.query(
    'SELECT value FROM system_settings WHERE key = $1',
    [BACKUP_EMAIL_SENT_SETTING_KEY]
  );
  return result.rows[0]?.value || null;
}

async function markBackupEmailSent(period) {
  await pool.query(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = NOW()
  `, [BACKUP_EMAIL_SENT_SETTING_KEY, period]);
}

async function wasBackupEmailSent(period) {
  return (await getLastSentBackupPeriod()) === period;
}

function nextMonthlyRunDate(from = new Date()) {
  const next = new Date(from);
  next.setDate(1);
  next.setHours(3, 0, 0, 0);
  if (next <= from) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function asDateText(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const clean = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function styleWorksheet(ws) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, ws.rowCount), column: ws.columnCount },
  };

  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '001F5B' } };
    cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder('D1D5DB');
  });

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = thinBorder('E2E8F0');
    });
  });
}

function thinBorder(color) {
  const side = { style: 'thin', color: { argb: color } };
  return { top: side, bottom: side, left: side, right: side };
}

function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map(column => ({
    header: column.header,
    key: column.key,
    width: column.width || 16,
  }));

  rows.forEach(row => {
    const values = {};
    columns.forEach(column => {
      const raw = row[column.key];
      if (column.type === 'date') values[column.key] = asDateText(raw);
      else if (column.type === 'money' || column.type === 'number') values[column.key] = asNumber(raw);
      else values[column.key] = raw ?? '';
    });
    ws.addRow(values);
  });

  columns.forEach((column, index) => {
    if (column.type === 'money') ws.getColumn(index + 1).numFmt = '#,##0.00';
  });

  styleWorksheet(ws);
  return ws;
}

async function fetchBackupData() {
  const [projects, iacs, documents, pmsDocuments] = await Promise.all([
    pool.query(`
      SELECT * FROM lists_projects_tracking
      ORDER BY area ASC, status ASC, pp_contrato ASC
    `),
    pool.query(`
      SELECT * FROM lists_iacs
      ORDER BY area ASC, status_current ASC, iac_code ASC
    `),
    pool.query(`
      SELECT d.*,
        creator.name AS created_by_name,
        updater.name AS updated_by_name,
        STRING_AGG(DISTINCT author.name, ', ' ORDER BY author.name) AS authors_list
      FROM documents d
      LEFT JOIN users creator ON creator.id = d.created_by
      LEFT JOIN users updater ON updater.id = d.updated_by
      LEFT JOIN document_authors da ON da.document_id = d.id
      LEFT JOIN users author ON author.id = da.user_id
      GROUP BY d.id, creator.name, updater.name
      ORDER BY d.year ASC, d.sequence_number ASC, d.base_code ASC NULLS LAST, d.revision ASC NULLS FIRST
    `),
    pool.query(`
      SELECT d.*,
        creator.name AS created_by_name,
        updater.name AS updated_by_name,
        (d.date + INTERVAL '3 years')::date AS expiry_date,
        CASE WHEN (d.date + INTERVAL '3 years') < CURRENT_DATE THEN 'Vencido'
             WHEN (d.date + INTERVAL '3 years') <= CURRENT_DATE + INTERVAL '30 days' THEN 'Alerta'
             ELSE 'Em dia' END AS validade_status
      FROM pms_documents d
      LEFT JOIN users creator ON creator.id = d.created_by
      LEFT JOIN users updater ON updater.id = d.updated_by
      ORDER BY d.type ASC, d.base_code ASC, d.revision ASC NULLS FIRST
    `),
  ]);

  return {
    projects: projects.rows,
    iacs: iacs.rows,
    documents: documents.rows,
    pmsDocuments: pmsDocuments.rows,
  };
}

function addSummarySheet(wb, data, fileDate) {
  const ws = wb.addWorksheet('Resumo');
  ws.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Valor', key: 'value', width: 24 },
  ];
  ws.addRows([
    { item: 'Backup gerado em', value: asDateText(fileDate) },
    { item: 'Projetos em acompanhamento', value: data.projects.length },
    { item: 'IACs', value: data.iacs.length },
    { item: 'Documentos', value: data.documents.length },
    { item: 'Documentos PMS', value: data.pmsDocuments.length },
  ]);
  styleWorksheet(ws);
}

export async function createOperationalBackup({ date = new Date(), overwrite = false } = {}) {
  const targetDir = resolveBackupDir();
  const targetFile = backupFilePath(date);

  await fs.mkdir(targetDir, { recursive: true });

  if (!overwrite) {
    try {
      await fs.access(targetFile);
      return { filePath: targetFile, skipped: true };
    } catch {
      // File does not exist yet.
    }
  }

  const data = await fetchBackupData();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CTG Engenharia';
  wb.created = date;
  wb.modified = date;

  addSummarySheet(wb, data, date);
  addSheet(wb, 'PMS', [
    { header: 'Tipo', key: 'type', width: 10 },
    { header: 'Codigo', key: 'code', width: 22 },
    { header: 'Categoria', key: 'category', width: 26 },
    { header: 'Usina', key: 'plant', width: 14 },
    { header: 'Nº Equip', key: 'equipment_number', width: 12 },
    { header: 'Subitem', key: 'sub_item', width: 12 },
    { header: 'Area', key: 'area', width: 26 },
    { header: 'Titulo PT', key: 'title_pt', width: 40 },
    { header: 'Titulo EN', key: 'title_en', width: 40 },
    { header: 'Responsavel', key: 'responsible', width: 24 },
    { header: 'Data', key: 'date', type: 'date', width: 14 },
    { header: 'Validade', key: 'expiry_date', type: 'date', width: 14 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Status Validade', key: 'validade_status', width: 16 },
    { header: 'Link do Documento', key: 'document_link', width: 40 },
    { header: 'Observacoes', key: 'notes', width: 32 },
    { header: 'Criado Por', key: 'created_by_name', width: 22 },
    { header: 'Atualizado Por', key: 'updated_by_name', width: 22 },
    { header: 'Criado em', key: 'created_at', type: 'date', width: 14 },
    { header: 'Atualizado em', key: 'updated_at', type: 'date', width: 14 },
  ], data.pmsDocuments);
  addSheet(wb, 'Projetos', [
    { header: 'Area', key: 'area', width: 14 },
    { header: 'UHE', key: 'uhe', width: 18 },
    { header: 'PP/Contrato', key: 'pp_contrato', width: 14 },
    { header: 'Projeto/Atividade', key: 'projeto_atividade', width: 38 },
    { header: 'Projeto', key: 'projeto', width: 22 },
    { header: 'Status', key: 'status', width: 22 },
    { header: 'Gestor', key: 'gestor', width: 24 },
    { header: 'Empresa', key: 'empresa', width: 24 },
    { header: 'Vencimento', key: 'vencimento', type: 'date', width: 14 },
    { header: 'Vencimento Texto', key: 'vencimento_txt', width: 18 },
    { header: 'Cronograma', key: 'cronograma', width: 18 },
    { header: 'Aditivos', key: 'aditivos', width: 18 },
    { header: 'Reajustes', key: 'reajustes', width: 18 },
    { header: 'Valor Contrato', key: 'valor_contrato', type: 'money', width: 16 },
    { header: 'Realizado Contrato', key: 'realizado_contrato', type: 'money', width: 18 },
    { header: 'Saldo Contrato', key: 'saldo_contrato', type: 'money', width: 16 },
    { header: 'Valor SI', key: 'valor_si', type: 'money', width: 14 },
    { header: 'Realizado SI', key: 'realizado_si', type: 'money', width: 16 },
    { header: 'Saldo SI', key: 'saldo_si', type: 'money', width: 14 },
    { header: 'Fornecedor', key: 'fornecedor', width: 24 },
    { header: 'Natureza', key: 'natureza', width: 14 },
    { header: 'Aditivo em Andamento', key: 'aditivo_em_andamento', width: 20 },
    { header: 'Resumo', key: 'resumo', width: 42 },
    { header: 'Criado em', key: 'created_at', type: 'date', width: 14 },
    { header: 'Atualizado em', key: 'updated_at', type: 'date', width: 14 },
  ], data.projects);

  addSheet(wb, 'IACs', [
    { header: 'IAC Code', key: 'iac_code', width: 16 },
    { header: 'Tipo', key: 'type_line', width: 12 },
    { header: 'Area', key: 'area', width: 16 },
    { header: 'Qtty PP Line 26 Priority', key: 'qty_pp_line_26_priority', type: 'number', width: 24 },
    { header: 'Qtty PP Line 26 Non-Priority', key: 'qty_pp_line_26_no_priority', type: 'number', width: 28 },
    { header: 'Opening Date', key: 'opening_date', type: 'date', width: 14 },
    { header: 'When Open', key: 'when_open', type: 'date', width: 14 },
    { header: 'Acceptance Letter Signed', key: 'acceptance_letter_signed', type: 'date', width: 24 },
    { header: 'Projeto', key: 'project', width: 38 },
    { header: 'Comentarios', key: 'comments', width: 38 },
    { header: 'Solicitante', key: 'requester', width: 22 },
    { header: 'Team Leader', key: 'team_leader', width: 22 },
    { header: 'Chinese Work Staff', key: 'chinese_work_staff', width: 22 },
    { header: 'Status Atual', key: 'status_current', width: 24 },
    { header: 'Apresentado Work Team', key: 'apresentado_work_team', width: 22 },
    { header: 'Organizador', key: 'organizer', width: 22 },
    { header: 'Supervisor', key: 'supervisor', width: 22 },
    { header: 'Equipe de Avaliacao', key: 'evaluation_team', width: 28 },
    { header: 'Prioridade', key: 'priority', width: 16 },
    { header: 'Validade', key: 'validity', width: 14 },
    { header: 'Continuidade', key: 'continuidade', width: 14 },
    { header: 'Criado em', key: 'created_at', type: 'date', width: 14 },
    { header: 'Atualizado em', key: 'updated_at', type: 'date', width: 14 },
  ], data.iacs);

  addSheet(wb, 'Documentos', [
    { header: 'Codigo', key: 'code', width: 22 },
    { header: 'Tipo', key: 'type', width: 12 },
    { header: 'Area', key: 'area', width: 14 },
    { header: 'Numero Seq.', key: 'sequence_number', type: 'number', width: 12 },
    { header: 'Ano', key: 'year', type: 'number', width: 10 },
    { header: 'Revisao', key: 'revision', type: 'number', width: 10 },
    { header: 'Usina', key: 'plant', width: 22 },
    { header: 'Responsavel', key: 'responsible', width: 24 },
    { header: 'Data', key: 'date', type: 'date', width: 14 },
    { header: 'Titulo do Documento', key: 'subject', width: 46 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Link do Documento', key: 'document_link', width: 42 },
    { header: 'Autores', key: 'authors_list', width: 34 },
    { header: 'Observacoes', key: 'notes', width: 38 },
    { header: 'Criado Por', key: 'created_by_name', width: 22 },
    { header: 'Atualizado Por', key: 'updated_by_name', width: 22 },
    { header: 'Criado em', key: 'created_at', type: 'date', width: 14 },
    { header: 'Atualizado em', key: 'updated_at', type: 'date', width: 14 },
  ], data.documents);

  await wb.xlsx.writeFile(targetFile);
  return { filePath: targetFile, skipped: false };
}

async function sendBackupEmail({ filePath, date = new Date(), skipped = false }) {
  if (!emailEnabled()) return { sent: false, reason: 'not-configured' };

  const recipients = backupRecipients();
  const label = monthStamp(date);
  const statusText = skipped
    ? 'O arquivo mensal ja existia e foi reenviado como anexo.'
    : 'O arquivo mensal foi gerado e segue anexado.';

  await enviarEmail({
    destinatarios: recipients,
    assunto: `Backup operacional CTG Engenharia - ${label}`,
    mensagemHtml: `
      <div style="font-family:Arial,sans-serif;color:#0F172A;line-height:1.5">
        <h2 style="color:#001F5B;margin:0 0 12px">Backup operacional mensal</h2>
        <p>${statusText}</p>
        <p><strong>Periodo:</strong> ${label}</p>
        <p><strong>Arquivo:</strong> ${path.basename(filePath)}</p>
        <p style="color:#64748B;font-size:12px;margin-top:18px">
          Backup automatico das abas Projetos, IACs e Documentos.
        </p>
      </div>
    `,
    anexoPath: filePath,
    anexoNome: path.basename(filePath),
  });

  return { sent: true, recipients };
}

async function runScheduledBackup(date = new Date()) {
  const period = monthStamp(date);

  try {
    if (await wasBackupEmailSent(period)) {
      console.log(`[backup] E-mail mensal ja enviado para o periodo ${period}; ignorando startup/schedule.`);
      return;
    }

    const result = await createOperationalBackup({ date, overwrite: false });
    if (result.skipped) {
      console.log(`[backup] Backup mensal ja existe: ${result.filePath}`);
    } else {
      console.log(`[backup] Backup mensal gerado: ${result.filePath}`);
    }

    const emailResult = await sendBackupEmail({ ...result, date });
    if (emailResult.sent) {
      await markBackupEmailSent(period);
      console.log(`[backup] E-mail mensal enviado para: ${emailResult.recipients.join(', ')}`);
    }
  } catch (err) {
    console.error('[backup] Falha ao gerar backup mensal:', err);
  }
}

export async function createAndEmailOperationalBackup(options = {}) {
  const result = await createOperationalBackup(options);
  const email = await sendBackupEmail({ ...result, date: options.date || new Date() });
  return { ...result, email };
}

export function startMonthlyBackupSchedule({ runIfDueOnStartup = true } = {}) {
  if (process.env.BACKUP_ENABLED === 'false') {
    console.log('[backup] Backup mensal desabilitado por BACKUP_ENABLED=false');
    return null;
  }

  if (runIfDueOnStartup && new Date().getDate() === 1) {
    runScheduledBackup();
  }

  let timer = null;
  let stopped = false;

  const setSafeTimeout = (callback, delay) => {
    timer = setTimeout(callback, Math.min(delay, MAX_TIMEOUT_MS));
    if (typeof timer.unref === 'function') timer.unref();
  };

  const scheduleNext = () => {
    const now = new Date();
    const next = nextMonthlyRunDate(now);

    const waitUntilNext = () => {
      if (stopped) return;

      const remaining = next.getTime() - Date.now();
      if (remaining > MAX_TIMEOUT_MS) {
        setSafeTimeout(waitUntilNext, MAX_TIMEOUT_MS);
        return;
      }

      setSafeTimeout(async () => {
        await runScheduledBackup(new Date());
        scheduleNext();
      }, Math.max(1000, remaining));
    };

    console.log(`[backup] Proximo backup mensal: ${next.toLocaleString('pt-BR')}`);
    waitUntilNext();
  };

  scheduleNext();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

