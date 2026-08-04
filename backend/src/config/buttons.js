// Catálogo de botões de ação configuráveis por usuário (ver user_button_access).
// Mantido em espelho em frontend/src/config/buttons.js. Cobre apenas páginas cujos
// botões de cabeçalho (Novo/Importar/Exportar) já são renderizados de forma
// condicional em App.jsx — a chave `page_key` corresponde a PAGE_REGISTRY.
export const BUTTON_REGISTRY = {
  documents: [
    { key: 'import',       label: 'Importar' },
    { key: 'export_excel', label: 'Exportar Excel' },
    { key: 'export_html',  label: 'Exportar HTML' },
  ],
  drawings: [
    { key: 'import',       label: 'Importar' },
    { key: 'export_excel', label: 'Exportar Excel' },
    { key: 'export_html',  label: 'Exportar HTML' },
  ],
  pms: [
    { key: 'import', label: 'Importar' },
    { key: 'export', label: 'Exportar' },
  ],
  iacs: [
    { key: 'new',    label: 'Novo IAC' },
    { key: 'import', label: 'Importar' },
    { key: 'export', label: 'Exportar' },
  ],
  projects_tracking: [
    { key: 'new',          label: 'Novo Projeto' },
    { key: 'import',       label: 'Importar' },
    { key: 'export',       label: 'Exportar' },
    { key: 'export_html',  label: 'Relatório HTML' },
  ],
};

export const BUTTON_PAGE_KEYS = Object.keys(BUTTON_REGISTRY);
