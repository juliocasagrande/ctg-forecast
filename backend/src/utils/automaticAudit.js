import { buildChangeDetails } from './changeAudit.js';
import { PAGE_REGISTRY } from '../config/pages.js';
import { BUTTON_REGISTRY } from '../config/buttons.js';

const FIELD_LABELS = {
  name: 'Nome', code: 'Código', description: 'Descrição', status: 'Status', priority: 'Prioridade',
  title: 'Título', subject: 'Assunto', comments: 'Comentários', comment: 'Comentário', notes: 'Observações',
  area: 'Área', plant: 'Usina', plants: 'Usinas', responsible: 'Responsável', date: 'Data',
  start_date: 'Data inicial', end_date: 'Data final', due_date: 'Prazo', note_date: 'Data da anotação',
  value: 'Valor', si_value: 'Valor da SI', pool_value: 'Valor do Pool', load_percent: 'Carga estimada',
  category: 'Categoria', type: 'Tipo', year: 'Ano', month: 'Mês', revision: 'Revisão',
  sequence_number: 'Número sequencial', base_code: 'Código base',
  document_link: 'Link do documento', link_path: 'Link / Caminho', content: 'Conteúdo',
  role: 'Perfil', active: 'Ativo', email: 'E-mail', user_id: 'Colaborador', engineer_ids: 'Engenheiros',
  achieved_value: 'Valor realizado', target_value: 'Valor alvo', weight: 'Peso', unit: 'Unidade',
  meta_number: 'Número da meta', detailed: 'Detalhamento', kpi: 'Indicador', target_80: 'Meta 80%',
  target_100: 'Meta 100%', target_120: 'Meta 120%', assigned_area: 'Área atribuída',
  evidence_link: 'Link da evidência', days: 'Quantidade de dias',
  assigned_user_ids: 'Colaboradores atribuídos', adp_registered: 'Registrado no ADP',
  usina: 'Usina', tipo_tabela: 'Tabela', equipamento: 'Equipamento', ug: 'Unidade geradora',
  tag: 'TAG', fabricante: 'Fabricante', modelo: 'Modelo', num_serie: 'Número de série',
  equipment_number: 'Número do equipamento', sub_item: 'Subitem',
  title_pt: 'Título em português', title_en: 'Título em inglês',
  has_pt: 'Possui versão em português', has_en: 'Possui versão em inglês',
  tem_sobressalente: 'Possui sobressalente', quantos: 'Quantidade', ano: 'Ano',
  project: 'Projeto', project_name: 'Projeto', client_uid: 'Identificador', progress: 'Progresso',
  page_key: 'Página', access: 'Nível de acesso', button_key: 'Botão', enabled: 'Habilitado',
  user_ids: 'Usuários com acesso', azure_upn: 'Conta Microsoft',
  reason: 'Motivo', delegate_id: 'Usuário delegado', period_number: 'Período',
  created: 'Criados', updated: 'Atualizados', deleted: 'Excluídos', skipped: 'Ignorados',
  errors: 'Erros', imported: 'Importados', count: 'Registros processados', mapping: 'Mapeamento',
  keywords: 'Palavras-chave',
};

const EXCLUDED_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'updated_by_name',
  'password', 'password_hash', 'new_password', 'token', 'reset_token', 'session_id',
  'avatar_initials', 'evidence_image', 'evidence_images', 'image', 'file', 'url_imagem',
  'last_activity_at', 'last_activity_type', 'last_activity_user_id', 'last_activity_user_name',
]);

const SIMPLE_TARGETS = [
  { pattern: /^\/api\/projects\/(\d+)\/engineers(?:\/\d+)?$/, table: 'projects', key: 'id', entity: 'projeto', labels: ['code', 'name'], semanticOnly: true },
  { pattern: /^\/api\/projects(?:\/(\d+))?$/, table: 'projects', key: 'id', entity: 'projeto', labels: ['code', 'name'] },
  { pattern: /^\/api\/documents\/(\d+)\/revision$/, table: 'documents', key: 'id', entity: 'documento', labels: ['code', 'subject'], semanticOnly: true },
  { pattern: /^\/api\/drawings\/(\d+)\/revision$/, table: 'drawings', key: 'id', entity: 'desenho', labels: ['code', 'subject'], semanticOnly: true },
  { pattern: /^\/api\/pms\/(\d+)\/revision$/, table: 'pms_documents', key: 'id', entity: 'documento PMS', labels: ['code', 'title_pt'], semanticOnly: true },
  { pattern: /^\/api\/metas\/(\d+)\/evidence(?:$|[-\/].*)/, table: 'metas', key: 'id', entity: 'meta', labels: ['meta_number', 'description'], semanticOnly: true },
  { pattern: /^\/api\/users\/(\d+)\/(?:reset-password|approve|reject)$/, table: 'users', key: 'id', entity: 'usuário', labels: ['name', 'email'], semanticOnly: true },
  { pattern: /^\/api\/schedule-projects\/([^/]+)\/shares(?:\/\d+)?$/, table: 'schedule_projects', key: 'client_uid', entity: 'cronograma', labels: ['name', 'plant'], semanticOnly: true },
  { pattern: /^\/api\/documents(?:\/(\d+))(?:\/status)?$/, table: 'documents', key: 'id', entity: 'documento', labels: ['code', 'subject'] },
  { pattern: /^\/api\/documents$/, table: 'documents', key: 'id', entity: 'documento', labels: ['code', 'subject'] },
  { pattern: /^\/api\/drawings(?:\/(\d+))(?:\/status)?$/, table: 'drawings', key: 'id', entity: 'desenho', labels: ['code', 'subject'] },
  { pattern: /^\/api\/drawings$/, table: 'drawings', key: 'id', entity: 'desenho', labels: ['code', 'subject'] },
  { pattern: /^\/api\/pms(?:\/(\d+))(?:\/status)?$/, table: 'pms_documents', key: 'id', entity: 'documento PMS', labels: ['code', 'title_pt'] },
  { pattern: /^\/api\/pms$/, table: 'pms_documents', key: 'id', entity: 'documento PMS', labels: ['code', 'title_pt'] },
  { pattern: /^\/api\/metas(?:\/(\d+))?$/, table: 'metas', key: 'id', entity: 'meta', labels: ['meta_number', 'description'] },
  { pattern: /^\/api\/workload(?:\/(\d+))?$/, table: 'workload_demands', key: 'id', entity: 'demanda de carga', labels: ['title'] },
  { pattern: /^\/api\/equipamentos(?:\/(\d+))?$/, table: 'equipamentos_subestacao', key: 'id', entity: 'equipamento', labels: ['equipamento', 'tag'] },
  { pattern: /^\/api\/feedback(?:\/(\d+))(?:\/status)?$/, table: 'feedback', key: 'id', entity: 'sugestão', labels: ['subject'] },
  { pattern: /^\/api\/feedback$/, table: 'feedback', key: 'id', entity: 'sugestão', labels: ['subject'] },
  { pattern: /^\/api\/delegations(?:\/(\d+))?$/, table: 'access_delegations', key: 'id', entity: 'delegação', labels: ['delegate_id', 'start_date'] },
  { pattern: /^\/api\/users(?:\/(\d+))?$/, table: 'users', key: 'id', entity: 'usuário', labels: ['name', 'email'] },
  { pattern: /^\/api\/schedule-projects(?:\/([^/]+))?$/, table: 'schedule_projects', key: 'client_uid', entity: 'cronograma', labels: ['name', 'plant'] },
  { pattern: /^\/api\/forecast\/notes\/(\d+)$/, table: 'project_notes', key: 'id', entity: 'anotação do Forecast', labels: ['note_date', 'content'] },
];

const ENTITY_PREFIXES = [
  ['/api/forecast', 'Forecast'], ['/api/projects', 'projetos'], ['/api/lists/iacs', 'IACs'],
  ['/api/lists/projects-tracking', 'acompanhamentos de projeto'], ['/api/vacations', 'férias'],
  ['/api/schedule-projects', 'cronogramas'], ['/api/documents', 'documentos'], ['/api/drawings', 'desenhos'],
  ['/api/pms', 'documentos PMS'], ['/api/metas', 'metas'], ['/api/workload', 'controle de carga'],
  ['/api/equipamentos', 'equipamentos'], ['/api/users', 'usuários'], ['/api/settings', 'configurações'],
  ['/api/delegations', 'delegações'], ['/api/feedback', 'sugestões'], ['/api/messages', 'mensagens'],
  ['/api/auth', 'conta do usuário'],
];

const SEMANTIC_ACTIONS = [
  [/\/import(?:-|\/|$)|\/import-bulk$/, 'Importação', 'Importou dados em'],
  [/\/revision$/, 'Revisão', 'Criou uma nova revisão em'],
  [/\/checkin$|\/viewed$/, 'Check-in', 'Realizou check-in em'],
  [/\/engineers(?:\/[^/]+)?$/, 'Equipe', 'Atualizou a equipe de'],
  [/\/shares(?:\/|$)/, 'Compartilhamento', 'Atualizou o compartilhamento de'],
  [/\/evidence(?:-|\/|$)/, 'Evidência', 'Atualizou evidências em'],
  [/\/reset-password$/, 'Senha', 'Redefiniu a senha em'],
  [/\/approve$/, 'Aprovação', 'Aprovou o cadastro de'],
  [/\/reject$/, 'Rejeição', 'Rejeitou o cadastro de'],
  [/\/change-password$/, 'Senha', 'Alterou a senha da'],
  [/\/page-access$/, 'Permissões', 'Atualizou permissões de páginas em'],
  [/\/button-access$/, 'Permissões', 'Atualizou permissões de botões em'],
  [/\/actual-consolidated$/, 'Consolidação', 'Atualizou o realizado consolidado em'],
  [/\/year-consolidated(?:\/bulk)?$/, 'Consolidação', 'Atualizou valores anuais consolidados em'],
  [/\/close-year$/, 'Fechamento', 'Realizou o fechamento anual em'],
];

const NOT_AUDITABLE = [
  /^\/api\/telemetry\//, /\/alerts\/dismiss/, /\/import\/preview$/, /\/import\/preview\//,
  /^\/api\/monthly-report\//, /^\/api\/lists\/(?:iacs|projects-tracking)\/\d+\/viewed$/,
  /^\/api\/auth\/(login|logout|azure-login|forgot-password|reset-password)$/,
];

function entityForPath(path) {
  return ENTITY_PREFIXES.find(([prefix]) => path.startsWith(prefix))?.[1] || 'registro';
}

export function humanizeField(field) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return String(field || 'Campo').replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());
}

function auditableField(field) {
  return field && !EXCLUDED_FIELDS.has(field) && !/(password|token|secret|base64)/i.test(field);
}

function recordFromResponse(body, target, match) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [body.item, body.record, body.project, body.meta, body.data, body].filter(Boolean);
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) && typeof candidate === 'object') return candidate;
    if (Array.isArray(candidate) && target) {
      const identifier = match?.[1];
      const found = candidate.find(item => String(item?.[target.key]) === String(identifier));
      if (found) return found;
    }
  }
  return null;
}

function recordLabel(target, record, identifier) {
  if (!target) return identifier ? `Registro ${identifier}` : null;
  const values = target.labels.map(key => record?.[key]).filter(value => value !== null && value !== undefined && value !== '');
  return values.length ? values.slice(0, 2).join(' · ') : `${target.entity} ${identifier || ''}`.trim();
}

function semanticAction(path) {
  const match = SEMANTIC_ACTIONS.find(([pattern]) => pattern.test(path));
  return match ? { actionLabel: match[1], verb: match[2] } : null;
}

async function loadForecastBefore(req, pool) {
  const single = req.path.match(/^\/api\/forecast\/project\/(\d+)$/);
  if (single && req.method === 'PUT') {
    const { category, type, year, month } = req.body || {};
    const { rows } = await pool.query(
      `SELECT * FROM forecast_entries WHERE project_id=$1 AND category=$2 AND type=$3 AND year=$4 AND month=$5`,
      [single[1], category, type, year, month],
    );
    const project = await pool.query('SELECT code, name FROM projects WHERE id=$1', [single[1]]);
    return { kind: 'forecast-single', before: rows[0] || null, project: project.rows[0], entity: 'lançamento do Forecast' };
  }
  const bulk = req.path.match(/^\/api\/forecast\/project\/(\d+)\/bulk$/);
  if (bulk) {
    const [entries, project] = await Promise.all([
      pool.query('SELECT * FROM forecast_entries WHERE project_id=$1', [bulk[1]]),
      pool.query('SELECT code, name FROM projects WHERE id=$1', [bulk[1]]),
    ]);
    return { kind: 'forecast-bulk', beforeRows: entries.rows, project: project.rows[0], entity: 'Forecast' };
  }
  const consolidated = req.path.match(/^\/api\/forecast\/project\/(\d+)\/actual-consolidated$/);
  if (consolidated) {
    const [record, project] = await Promise.all([
      pool.query('SELECT * FROM actual_consolidated WHERE project_id=$1', [consolidated[1]]),
      pool.query('SELECT code, name FROM projects WHERE id=$1', [consolidated[1]]),
    ]);
    return { kind: 'forecast-single', before: record.rows[0] || null, project: project.rows[0], entity: 'realizado consolidado' };
  }
  const yearly = req.path.match(/^\/api\/forecast\/project\/(\d+)\/year-consolidated(\/bulk)?$/);
  if (yearly) {
    const [records, project] = await Promise.all([
      pool.query('SELECT * FROM year_consolidated WHERE project_id=$1', [yearly[1]]),
      pool.query('SELECT code, name FROM projects WHERE id=$1', [yearly[1]]),
    ]);
    if (yearly[2]) return { kind: 'forecast-year-bulk', beforeRows: records.rows, project: project.rows[0], entity: 'consolidado anual' };
    const { year, category, type } = req.body || {};
    const before = records.rows.find(row => String(row.year) === String(year) && row.category === category && row.type === type) || null;
    return { kind: 'forecast-single', before, project: project.rows[0], entity: 'consolidado anual' };
  }
  const projectAction = req.path.match(/^\/api\/forecast\/project\/(\d+)\/(notes|checkin)$/);
  if (projectAction) {
    const project = await pool.query('SELECT code, name FROM projects WHERE id=$1', [projectAction[1]]);
    return { kind: projectAction[2] === 'checkin' ? 'forecast-checkin' : 'forecast-note', project: project.rows[0], entity: 'Forecast' };
  }
  const message = req.path.match(/^\/api\/projects\/(\d+)\/messages$/);
  if (message && req.method === 'POST') {
    const project = await pool.query('SELECT code, name FROM projects WHERE id=$1', [message[1]]);
    return { kind: 'project-message', project: project.rows[0], entity: 'mensagem de projeto' };
  }
  return null;
}

async function loadSettingsBefore(req, pool) {
  if (req.method !== 'PUT' || !req.path.startsWith('/api/settings')) return null;
  if (req.path === '/api/settings') {
    const keys = Object.keys(req.body || {}).filter(auditableField);
    const { rows } = keys.length
      ? await pool.query('SELECT key, value FROM system_settings WHERE key = ANY($1::text[])', [keys])
      : { rows: [] };
    return { kind: 'settings', before: Object.fromEntries(rows.map(row => [row.key, row.value])), entity: 'configurações' };
  }
  if (req.path === '/api/settings/sap-mapping') {
    const { rows } = await pool.query('SELECT descr, category FROM sap_cost_mapping ORDER BY category, descr');
    return { kind: 'settings-mapping', before: { mapping: rows }, entity: 'mapeamento SAP' };
  }
  if (req.path === '/api/settings/sap-keywords') {
    const { rows } = await pool.query('SELECT category, keywords FROM sap_keyword_rules ORDER BY category');
    return { kind: 'settings-keywords', before: { keywords: Object.fromEntries(rows.map(row => [row.category, row.keywords])) }, entity: 'palavras-chave SAP' };
  }
  return null;
}

async function loadUserAccessBefore(req, pool) {
  const pageAccess = req.path.match(/^\/api\/users\/(\d+)\/page-access$/);
  if (pageAccess && req.method === 'PUT') {
    const keys = (req.body?.pages || []).map(item => item.page_key).filter(Boolean);
    const [access, user] = await Promise.all([
      pool.query('SELECT page_key, access FROM user_page_access WHERE user_id=$1 AND page_key = ANY($2::text[])', [pageAccess[1], keys]),
      pool.query('SELECT name, email FROM users WHERE id=$1', [pageAccess[1]]),
    ]);
    const overrides = Object.fromEntries(access.rows.map(row => [row.page_key, row.access]));
    return { kind: 'user-page-access', before: overrides, user: user.rows[0], entity: 'permissões de páginas' };
  }
  const buttonAccess = req.path.match(/^\/api\/users\/(\d+)\/button-access$/);
  if (buttonAccess && req.method === 'PUT') {
    const [access, user] = await Promise.all([
      pool.query('SELECT page_key, button_key, enabled FROM user_button_access WHERE user_id=$1', [buttonAccess[1]]),
      pool.query('SELECT name, email FROM users WHERE id=$1', [buttonAccess[1]]),
    ]);
    const overrides = Object.fromEntries(access.rows.map(row => [`${row.page_key}:${row.button_key}`, row.enabled]));
    return { kind: 'user-button-access', before: overrides, user: user.rows[0], entity: 'permissões de botões' };
  }
  return null;
}

async function loadEquipmentBefore(req, pool) {
  if (!req.path.startsWith('/api/equipamentos')) return null;
  if (req.path === '/api/equipamentos/acesso' && req.method === 'PUT' && Array.isArray(req.body)) {
    const tableNames = req.body.map(item => item.tipo_tabela).filter(Boolean);
    const requestedUserIds = req.body.flatMap(item => item.user_ids || []).filter(Boolean);
    const [currentAccess, users] = await Promise.all([
      tableNames.length
        ? pool.query(
          'SELECT ea.tipo_tabela, ea.user_id, u.name FROM equipamentos_acesso ea JOIN users u ON u.id=ea.user_id WHERE ea.tipo_tabela=ANY($1::text[])',
          [tableNames]
        )
        : { rows: [] },
      requestedUserIds.length
        ? pool.query('SELECT id, name FROM users WHERE id=ANY($1::int[])', [requestedUserIds])
        : { rows: [] },
    ]);
    return {
      kind: 'equipment-access',
      beforeRows: currentAccess.rows,
      userNames: Object.fromEntries(users.rows.map(user => [user.id, user.name])),
      entity: 'acesso às tabelas de equipamentos',
    };
  }
  if (req.path === '/api/equipamentos/tabelas-pre' || req.path === '/api/equipamentos/tabela') {
    return { kind: 'equipment-table', entity: 'tabela de equipamentos' };
  }
  return null;
}

export async function prepareAutomaticAudit(req, pool) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || NOT_AUDITABLE.some(pattern => pattern.test(req.path))) {
    return { auditable: false };
  }

  const forecast = await loadForecastBefore(req, pool);
  if (forecast) return { auditable: true, ...forecast };
  const settings = await loadSettingsBefore(req, pool);
  if (settings) return { auditable: true, ...settings };
  const userAccess = await loadUserAccessBefore(req, pool);
  if (userAccess) return { auditable: true, ...userAccess };
  const equipment = await loadEquipmentBefore(req, pool);
  if (equipment) return { auditable: true, ...equipment };

  const matched = SIMPLE_TARGETS.map(target => ({ target, match: req.path.match(target.pattern) })).find(item => item.match);
  if (!matched) return { auditable: true, entity: entityForPath(req.path), semantic: semanticAction(req.path) };

  const { target, match } = matched;
  let before = null;
  if (match[1] && (['PUT', 'PATCH', 'DELETE'].includes(req.method) || target.semanticOnly)) {
    const { rows } = await pool.query(`SELECT * FROM ${target.table} WHERE ${target.key}=$1 LIMIT 1`, [match[1]]);
    before = rows[0] || null;
  }
  const relation = req.path.match(/^\/api\/projects\/\d+\/engineers(?:\/(\d+))?$/)
    || req.path.match(/^\/api\/schedule-projects\/[^/]+\/shares(?:\/(\d+))?$/);
  const relatedUserId = relation ? relation[1] || req.body?.user_id || req.body?.userId : null;
  const relatedUser = relatedUserId
    ? (await pool.query('SELECT id, name, email FROM users WHERE id=$1', [relatedUserId])).rows[0] || null
    : null;
  return { auditable: true, target, match, before, relatedUser, entity: target.entity, semantic: semanticAction(req.path) };
}

function forecastBulkChange(req, context) {
  const previous = new Map((context.beforeRows || []).map(row => [
    `${row.category}|${row.type}|${row.year}|${row.month}`, row,
  ]));
  const changes = [];
  for (const entry of req.body?.entries || []) {
    const key = `${entry.category}|${entry.type}|${entry.year}|${entry.month}`;
    const old = previous.get(key) || {};
    const month = String(entry.month).padStart(2, '0');
    const prefix = `${entry.type} · ${entry.category} · ${month}/${entry.year}`;
    for (const [field, label] of [['value', 'Valor'], ['comment', 'Comentário']]) {
      const detail = buildChangeDetails([[field, `${prefix} · ${label}`]], old, entry)[0];
      if (detail) changes.push(detail);
    }
  }
  const project = context.project ? `${context.project.code} · ${context.project.name}` : 'projeto';
  return {
    actionLabel: 'Alteração',
    description: `Atualizou ${changes.length} ${changes.length === 1 ? 'campo' : 'campos'} do Forecast em ${project}`,
    recordLabel: project,
    changes: changes.slice(0, 50),
  };
}

function forecastYearBulkChange(req, context) {
  const previous = new Map((context.beforeRows || []).map(row => [`${row.year}|${row.category}|${row.type}`, row]));
  const changes = [];
  for (const entry of req.body?.entries || []) {
    const old = previous.get(`${entry.year}|${entry.category}|${entry.type}`) || {};
    const prefix = `${entry.type} · ${entry.category} · ${entry.year}`;
    for (const [field, label] of [['value', 'Valor'], ['comment', 'Comentário']]) {
      const detail = buildChangeDetails([[field, `${prefix} · ${label}`]], old, entry)[0];
      if (detail) changes.push(detail);
    }
  }
  const project = context.project ? `${context.project.code} · ${context.project.name}` : 'projeto';
  return {
    actionLabel: 'Consolidação',
    description: `Atualizou ${changes.length} ${changes.length === 1 ? 'campo anual consolidado' : 'campos anuais consolidados'} em ${project}`,
    recordLabel: project,
    changes: changes.slice(0, 50),
  };
}

function forecastSingleChange(req, context, responseBody) {
  const after = { ...(req.body || {}), ...(recordFromResponse(responseBody) || {}) };
  const fields = Object.keys(req.body || {}).filter(auditableField).map(field => [field, humanizeField(field)]);
  const changes = buildChangeDetails(fields, context.before, after).slice(0, 50);
  const project = context.project ? `${context.project.code} · ${context.project.name}` : 'projeto';
  return {
    actionLabel: context.entity === 'realizado consolidado' || context.entity === 'consolidado anual' ? 'Consolidação' : 'Alteração',
    description: `Alterou ${changes.length} ${changes.length === 1 ? 'campo' : 'campos'} de ${context.entity} em ${project}`,
    recordLabel: project,
    changes,
  };
}

function settingsChange(req, context, responseBody) {
  const safeSettings = Object.fromEntries(Object.entries(req.body || {}).filter(([field]) => auditableField(field)));
  const requestData = context.kind === 'settings' ? safeSettings
    : context.kind === 'settings-mapping' ? { mapping: req.body?.mapping }
      : { keywords: req.body?.keywords };
  const after = context.kind === 'settings' ? { ...requestData, ...(responseBody || {}) } : requestData;
  const fields = Object.keys(requestData).map(field => [field, humanizeField(field)]);
  const changes = buildChangeDetails(fields, context.before, after).slice(0, 50);
  return {
    actionLabel: 'Configuração',
    description: `Alterou ${changes.length} ${changes.length === 1 ? 'configuração' : 'configurações'} em ${context.entity}`,
    recordLabel: context.entity,
    changes,
  };
}

function userAccessChange(req, context) {
  const isPage = context.kind === 'user-page-access';
  const changes = [];
  for (const entry of isPage ? req.body?.pages || [] : req.body?.buttons || []) {
    const key = isPage ? entry.page_key : `${entry.page_key}:${entry.button_key}`;
    const pageLabel = PAGE_REGISTRY.find(page => page.key === entry.page_key)?.label || humanizeField(entry.page_key);
    const buttonLabel = BUTTON_REGISTRY[entry.page_key]?.find(button => button.key === entry.button_key)?.label;
    const label = isPage ? `Página: ${pageLabel}` : `${pageLabel} · Botão: ${buttonLabel || humanizeField(entry.button_key)}`;
    const oldValue = context.before[key] ?? (isPage ? 'editor' : true);
    const newValue = isPage ? entry.access : entry.enabled;
    const detail = buildChangeDetails([[key, label]], { [key]: oldValue }, { [key]: newValue })[0];
    if (detail) changes.push(detail);
  }
  const user = context.user ? `${context.user.name} · ${context.user.email}` : 'usuário';
  return {
    actionLabel: 'Permissões',
    description: `Alterou ${changes.length} ${changes.length === 1 ? 'permissão' : 'permissões'} de ${user}`,
    recordLabel: user,
    changes: changes.slice(0, 50),
  };
}

function equipmentAccessChange(req, context) {
  const previous = new Map();
  for (const row of context.beforeRows || []) {
    const names = previous.get(row.tipo_tabela) || [];
    names.push(row.name);
    previous.set(row.tipo_tabela, names);
  }
  const changes = [];
  for (const assignment of req.body || []) {
    const oldValue = (previous.get(assignment.tipo_tabela) || []).sort().join(', ') || null;
    const newValue = (assignment.user_ids || [])
      .map(id => context.userNames[id] || 'Usuário #' + id)
      .sort()
      .join(', ') || null;
    if (oldValue !== newValue) {
      changes.push({
        field: 'access_' + assignment.tipo_tabela,
        label: 'Acesso à tabela ' + assignment.tipo_tabela,
        old_value: oldValue,
        new_value: newValue,
      });
    }
  }
  return {
    actionLabel: 'Permissões',
    description: 'Alterou ' + changes.length + (changes.length === 1 ? ' permissão de tabela' : ' permissões de tabelas'),
    recordLabel: 'Tabelas de equipamentos',
    changes: changes.slice(0, 50),
  };
}

function equipmentTableChange(req, responseBody) {
  const table = req.body?.tipo_tabela || 'não identificada';
  const isDelete = req.method === 'DELETE';
  const deleted = Number(responseBody?.deleted) || 0;
  const description = req.path.endsWith('/tabela') && isDelete
    ? 'Excluiu ' + deleted + (deleted === 1 ? ' equipamento da tabela ' : ' equipamentos da tabela ') + table
    : (isDelete ? 'Excluiu a tabela de equipamentos ' : 'Criou a tabela de equipamentos ') + table;
  return {
    actionLabel: isDelete ? 'Exclusão' : 'Criação',
    description,
    recordLabel: table,
    changes: [{
      field: 'tipo_tabela',
      label: 'Tabela',
      old_value: isDelete ? table : null,
      new_value: isDelete ? null : table,
    }],
  };
}

export function buildAutomaticAudit(req, context, responseBody) {
  if (!context?.auditable) return { excludeFromChangeLog: true };
  if (context.kind === 'forecast-bulk') return forecastBulkChange(req, context);
  if (context.kind === 'forecast-year-bulk') return forecastYearBulkChange(req, context);
  if (context.kind === 'forecast-single') return forecastSingleChange(req, context, responseBody);
  if (context.kind === 'forecast-checkin') {
    const project = context.project ? `${context.project.code} · ${context.project.name}` : 'projeto';
    return { actionLabel: 'Check-in', description: `Realizou check-in no Forecast de ${project}`, recordLabel: project, changes: [] };
  }
  if (context.kind === 'forecast-note') {
    const project = context.project ? `${context.project.code} · ${context.project.name}` : 'projeto';
    const after = { ...(req.body || {}), ...(recordFromResponse(responseBody) || {}) };
    const fields = Object.keys(req.body || {}).filter(auditableField).map(field => [field, humanizeField(field)]);
    return { actionLabel: 'Anotação', description: `Criou uma anotação no Forecast de ${project}`, recordLabel: project, changes: buildChangeDetails(fields, null, after) };
  }
  if (context.kind === 'project-message') {
    const project = context.project ? context.project.code + ' · ' + context.project.name : 'projeto';
    const content = buildChangeDetails([['content', 'Mensagem']], null, req.body || {});
    return {
      actionLabel: 'Mensagem',
      description: 'Publicou uma mensagem no projeto ' + project,
      recordLabel: project,
      changes: content,
    };
  }
  if (context.kind?.startsWith('settings')) return settingsChange(req, context, responseBody);
  if (context.kind === 'user-page-access' || context.kind === 'user-button-access') return userAccessChange(req, context);
  if (context.kind === 'equipment-access') return equipmentAccessChange(req, context);
  if (context.kind === 'equipment-table') return equipmentTableChange(req, responseBody);

  const target = context.target;
  const afterResponse = recordFromResponse(responseBody, target, context.match);
  const after = req.method === 'DELETE' ? null : { ...(req.body || {}), ...(afterResponse || {}) };
  const before = context.before || null;
  const deletionBefore = req.method === 'DELETE' && !before ? req.body || null : before;
  const comparisonBefore = target?.semanticOnly ? null : deletionBefore;
  const source = target?.semanticOnly ? req.body || {} : req.method === 'DELETE' ? deletionBefore || {} : req.body || after || {};
  const fields = Object.keys(source).filter(auditableField).map(field => [field, humanizeField(field)]);
  const changes = buildChangeDetails(fields, comparisonBefore, after).slice(0, 50);
  const identifier = context.match?.[1];
  const label = recordLabel(target, after || before, identifier);
  const entity = context.entity || entityForPath(req.path);
  const semantic = context.semantic || semanticAction(req.path);

  if (semantic) {
    if (context.relatedUser) {
      const user = context.relatedUser.name + ' · ' + context.relatedUser.email;
      const isDelete = req.method === 'DELETE';
      const isEngineer = req.path.includes('/engineers');
      const relationLabel = isEngineer ? 'Engenheiro' : 'Usuário com acesso';
      return {
        actionLabel: isEngineer ? 'Equipe' : 'Compartilhamento',
        description: isEngineer
          ? (isDelete ? 'Removeu ' : 'Adicionou ') + user + (isDelete ? ' da equipe de ' : ' à equipe de ') + (label || entity)
          : (isDelete ? 'Removeu o acesso de ' : 'Compartilhou com ') + user + (isDelete ? ' ao cronograma ' : ' o cronograma ') + (label || entity),
        recordLabel: label,
        changes: [{
          field: 'user_id',
          label: relationLabel,
          old_value: isDelete ? user : null,
          new_value: isDelete ? null : user,
        }],
      };
    }
    if (semantic.actionLabel === 'Importação') {
      const result = responseBody && typeof responseBody === 'object' ? responseBody : {};
      const summary = Object.fromEntries(Object.entries(result).map(([field, value]) => [
        field,
        Array.isArray(value) ? value.length : value,
      ]));
      const summaryFields = ['created', 'updated', 'deleted', 'skipped', 'errors', 'imported', 'count']
        .filter(field => summary[field] !== undefined)
        .map(field => [field, humanizeField(field)]);
      const summaryChanges = buildChangeDetails(summaryFields, null, summary);
      return {
        actionLabel: semantic.actionLabel,
        description: `${semantic.verb} ${entity}${summaryChanges.length ? ` (${summaryChanges.map(item => `${item.label}: ${item.new_value}`).join(', ')})` : ''}`,
        recordLabel: label,
        changes: summaryChanges,
      };
    }
    return {
      actionLabel: semantic.actionLabel,
      description: `${semantic.verb} ${label || entity}`,
      recordLabel: label,
      changes,
    };
  }

  if (target?.table === 'users' && req.method === 'DELETE') {
    return {
      actionLabel: 'Desativação',
      description: 'Desativou o usuário ' + (label || identifier),
      recordLabel: label,
      changes: buildChangeDetails([['active', 'Ativo']], before, { ...before, active: false }),
    };
  }

  const actionLabel = req.method === 'POST' ? 'Criação' : req.method === 'DELETE' ? 'Exclusão' : 'Alteração';
  const description = req.method === 'POST'
    ? `Criou ${entity}${label ? `: ${label}` : ''}`
    : req.method === 'DELETE'
      ? `Excluiu ${entity}${label ? `: ${label}` : ''}`
      : changes.length === 1
        ? `Alterou o campo ${changes[0].label} em ${label || entity}`
        : `Alterou ${changes.length} ${changes.length === 1 ? 'campo' : 'campos'} em ${label || entity}`;
  return { actionLabel, description, recordLabel: label, changes };
}
