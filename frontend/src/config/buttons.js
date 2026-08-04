// Catálogo de botões de ação configuráveis por usuário (ver AdminPanel > Configurações
// de Funções). Mantido em espelho em backend/src/config/buttons.js. `page_label` é usado
// apenas para exibição na matriz do admin.
export const BUTTON_REGISTRY = [
  {
    page_key: 'documents', page_label: 'Documentos',
    buttons: [
      { key: 'import',       label: 'Importar' },
      { key: 'export_excel', label: 'Exportar Excel' },
      { key: 'export_html',  label: 'Exportar HTML' },
    ],
  },
  {
    page_key: 'drawings', page_label: 'Desenhos',
    buttons: [
      { key: 'import',       label: 'Importar' },
      { key: 'export_excel', label: 'Exportar Excel' },
      { key: 'export_html',  label: 'Exportar HTML' },
    ],
  },
  {
    page_key: 'pms', page_label: 'PMS',
    buttons: [
      { key: 'import', label: 'Importar' },
      { key: 'export', label: 'Exportar' },
    ],
  },
  {
    page_key: 'iacs', page_label: 'IACs',
    buttons: [
      { key: 'new',    label: 'Novo IAC' },
      { key: 'import', label: 'Importar' },
      { key: 'export', label: 'Exportar' },
    ],
  },
  {
    page_key: 'projects_tracking', page_label: 'Acompanhamento',
    buttons: [
      { key: 'new',         label: 'Novo Projeto' },
      { key: 'import',      label: 'Importar' },
      { key: 'export',      label: 'Exportar' },
      { key: 'export_html', label: 'Relatório HTML' },
    ],
  },
];
