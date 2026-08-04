// Catálogo de páginas configuráveis por permissão de usuário (ver user_page_access).
// Mantido em espelho em frontend/src/config/pages.js (mesma ordem/seções do Sidebar).
export const PAGE_REGISTRY = [
  { key: 'forecast',  label: 'Forecast' },
  { key: 'projects',  label: 'Projetos' },
  { key: 'polos',     label: 'Polos' },
  { key: 'report',    label: 'Relatórios' },

  { key: 'projects_tracking', label: 'Acompanhamento Projetos' },
  { key: 'iacs',               label: 'IACs 2026' },
  { key: 'schedule_project',   label: 'Project CTG' },

  { key: 'workload',           label: 'Controle de Carga' },
  { key: 'vacations',          label: 'Férias' },
  { key: 'metas',              label: 'Metas' },

  { key: 'documents',          label: 'Controle Documentos' },
  { key: 'drawings',           label: 'Controle Desenhos' },
  { key: 'pms',                label: 'PMS' },

  { key: 'equipamentos',       label: 'Mapa de Equipamentos' },
  { key: 'equipamentos_admin', label: 'Tabela de Equipamentos' },
];

export const PAGE_KEYS = PAGE_REGISTRY.map(p => p.key);
