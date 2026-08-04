// Catálogo de páginas configuráveis por permissão de usuário (ver user_page_access).
// Mantido em espelho em backend/src/config/pages.js. `section` agrupa as colunas
// na grade de permissões (AdminPanel) e segue a mesma ordem das seções do Sidebar.
export const PAGE_REGISTRY = [
  { key: 'forecast',  label: 'Forecast',    route: '/forecast', section: 'Gestão de Orçamento' },
  { key: 'projects',  label: 'Projetos',    route: '/projects', section: 'Gestão de Orçamento' },
  { key: 'polos',     label: 'Polos',       route: '/polos',    section: 'Gestão de Orçamento' },
  { key: 'report',    label: 'Relatórios',  route: '/report',   section: 'Gestão de Orçamento' },

  { key: 'projects_tracking', label: 'Acompanhamento Projetos', route: '/lists/projects-tracking', section: 'Gestão de Processos' },
  { key: 'iacs',               label: 'IACs 2026',               route: '/lists/iacs',                section: 'Gestão de Processos' },
  { key: 'schedule_project',   label: 'Project CTG',             route: '/lists/schedule-project',    section: 'Gestão de Processos' },

  { key: 'workload',           label: 'Controle de Carga',       route: '/workload',                  section: 'Gestão de Pessoas' },
  { key: 'vacations',          label: 'Férias',                  route: '/vacations',                 section: 'Gestão de Pessoas' },
  { key: 'metas',              label: 'Metas',                   route: '/metas',                     section: 'Gestão de Pessoas' },

  { key: 'documents',          label: 'Controle Documentos',     route: '/documents',                 section: 'Gestão de Documentos' },
  { key: 'drawings',           label: 'Controle Desenhos',       route: '/drawings',                  section: 'Gestão de Documentos' },
  { key: 'pms',                label: 'PMS',                     route: '/pms',                       section: 'Gestão de Documentos' },

  { key: 'equipamentos',       label: 'Mapa de Equipamentos',    route: '/engineering/equipamentos',       section: 'Gestão de Ativos' },
  { key: 'equipamentos_admin', label: 'Tabela de Equipamentos',  route: '/engineering/equipamentos-admin', section: 'Gestão de Ativos' },
];
