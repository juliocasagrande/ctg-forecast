# Manual de Utilização — CTG Engenharia

## Introdução

Este manual descreve as funcionalidades disponíveis no sistema de gestão de projetos e engenharia da CTG Brasil. O sistema é uma plataforma web (PWA) que permite o acompanhamento de projetos, forecast financeiro, controle de férias, gestão de documentos, IACs, acompanhamento de contratos e muito mais.

---

## 1. Login e Autenticação

### Acesso ao Sistema
1. Acesse a URL do sistema
2. Insira seu e-mail institucional
3. Digite sua senha
4. Clique em "Entrar"
5. **Redefinição de senha**: Clique em "Esqueceu sua senha?" na tela de login para receber um link de redefinição por e-mail

### Roles e Permissões
O sistema possui diferentes perfis de acesso:
- **Administrador**: Acesso completo a todas as funcionalidades, gestão de usuários
- **Planejador**: Pode gerenciar projetos, visualizar todos os dados, configurar o sistema, definir orçamentos
- **Coordenador**: Visualiza dados da equipe e projetos sob sua coordenação, gerencia IACs e acompanhamento
- **Gestor/Gerente**: Visualiza dados consolidados por área e usina, cria projetos e designa engenheiros
- **Engenheiro**: Visualiza e edita apenas seus próprios projetos

---

## 2. Dashboard (Página Inicial)

O Dashboard é a página principal do sistema e apresenta uma visão consolidada dos projetos.

### 2.1 Indicadores (KPIs)
No topo da página, você encontra 4 cartões com indicadores principais:
- **Budget**: Valor total orçado para o período selecionado
- **Forecast**: Previsão de gasto (dados realizados + forecast)
- **Realizado**: Valor efetivamente gasto até o momento
- **SI Total**: Valor de Suplementação de Instalação aprovado

### 2.2 Gráficos

#### Curva S (Evolução Mensal + Acumulado)
Gráfico combinado que mostra a evolução mensal do budget, forecast, meta e pool ao longo do tempo, com linhas de média acumulada.
- **Eixo esquerdo**: Valores mensais (barras)
- **Eixo direito**: Valores acumulados (linhas)
- Clique em **"Expandir"** para ver o gráfico em tela cheia
- Passe o mouse sobre as barras para ver os valores detalhados

#### Gráfico Contextual
O segundo gráfico varia conforme seu perfil:
- **Gestor**: Mostra dados por **Usina** (barras de budget, forecast, realizado + linha de % execução)
- **Coordenador**: Mostra dados por **Engenheiro** (barras agrupadas)
- **Engenheiro**: Mostra dados por **Projeto** (barras de budget, forecast, realizado)

### 2.3 Tabela de Projetos
Lista todos os projetos com as colunas:
- Código do projeto
- Nome
- Usinas vinculadas
- Engenheiros responsáveis (para gestores/coordenadores)
- Budget, Forecast, Realizado
- % de Execução (destacado em vermelho se > 100%)
- SI (valor de suplementação)
- Data da última atualização (com badge colorido conforme dias: verde ≤ 30 dias, vermelho > 30 dias)
- Clique em qualquer linha para abrir os detalhes do projeto

**Funcionalidades da tabela**:
- Exibição limitada a 5 projetos com fade-out, clique em "Ver todos os projetos" para expandir
- Clique no cabeçalho das colunas para filtrar

### 2.4 Filtros
No header da página, você encontra filtros:
- **Período**: Selecione o ano inicial e final (use os controles deslizantes)
- **Usina**: Filtre projetos por usina específica (múltipla seleção)
- **Projeto**: Filtre por projetos específicos (múltipla seleção, disponível apenas no Dashboard)

---

## 3. Página de Projetos

Acesse pelo menu **"Projetos"**.

### 3.1 Visualizações
O sistema oferece três formas de visualizar os projetos:

1. **Lista de Projetos**: Visualização em formato de lista com todos os projetos
2. **Por Usina**: Agrupa projetos por usina, mostrando resumo financeiro
3. **Por Engenheiro**: (Apenas para coordenadores/gestores) Agrupa projetos por responsável

### 3.2 Operações
- Clique em um projeto para **editar** suas informações
- Use os filtros de período e usina para refinar a visualização
- **Novo Projeto**: Botão disponível para coordenadores, gestores e planejadores

---

## 4. Detalhes do Projeto

Ao clicar em um projeto na lista, você acessa sua página de detalhes com várias abas:

### 4.1 Aba "Visão Geral"
- Informações básicas do projeto
- Status atual
- Engenheiros designados
- Usinas relacionadas

### 4.2 Aba "Forecast"
- **Wizard de Previsão**: Interface passo a passo para inserir previsões mensais de gasto
  1. Selecione o ano na barra superior
  2. Escolha o tipo (Budget, Forecast, Realizado, etc.)
  3. Preencha mês a mês para cada categoria (Viagens, Contratos, POs)
  4. Revise os totais na etapa final
  5. Salve clicando no botão 💾
- **Importar**: Importar dados de forecast de arquivo Excel (com preview de validação)
- **Exportar**: Exportar dados para Excel com seleção de categorias e tipos
- **Gráficos do Projeto**:
  - Evolução Mensal + S-Curve (mesmo formato do Dashboard)
  - Forecast por Categoria (gráfico de rosca)
  - Execução por Categoria (comparação Forecast vs Realizado)
  - Budget vs Forecast (comparação por categoria)

### 4.3 Aba "Mapeamento SAP"
- Integração com sistema SAP
- Mapeamento de códigos Budget, Forecast, Actual, Meta, Pool

### 4.4 Aba "Atividades"
- Registro de atividades do projeto
- Histórico de atualizações
- Comentários da equipe

### 4.5 Aba "Chat"
- Comunicação integrada com a equipe do projeto
- Registro de mensagens e notificações
- Mensagens não lidas aparecem no sino de alertas e na sidebar

### 4.6 Aba "Delegação"
- Gerenciar permissões de acesso ao projeto
- Delegar responsabilidades para outros usuários
- **Como delegar**:
  1. Acesse **Meu Perfil** (menu lateral → seu nome)
  2. Role até a seção **Delegação de Acesso**
  3. Clique em **+ Nova Delegação**
  4. Selecione o usuário que receberá o acesso
  5. Defina as datas de início e fim do período
  6. (Opcional) Informe o motivo (ex.: Férias)
  7. Clique em **Criar Delegação**

**O que o delegado pode fazer**:
- Acessar todos os seus projetos
- Editar Forecast, Realizado e demais campos
- Todas as ações ficam registradas **no nome do delegado**, não no seu

**Importante**:
- A delegação é ativada automaticamente na data de início e desativada na data de fim
- Você pode **revogar** a delegação a qualquer momento antes do fim
- É possível criar múltiplas delegações (para pessoas diferentes ou períodos diferentes)
- Coordenadores, planejadores e engenheiros podem delegar seus acessos

---

## 5. Visão Geral Consolidada (Polos)

Acesse pelo menu **"Polos"**.

### 5.1 Estrutura Hierárquica
A página apresenta uma estrutura em árvore:
- **Polo** (Rio) → **Usina** → **Projeto**

### 5.2 Colunas de Dados
Para cada nível, são exibidas colunas com:
- Budget
- Pool
- Actual (Realizado)
- Forecast
- ACT + Forecast (Previsão Total)
- Variação Forecast (diferença entre Budget e Forecast)

### 5.3 Operações
- Clique no nome do polo para **expandir/recolher** as usinas
- Clique na usina para **expandir/recolher** os projetos
- Clique no projeto para ir para seus detalhes
- A linha "Total Geral" mostra a soma de todos os projetos
- **Filtro de Período**: Selecione o intervalo de anos no header

---

## 6. Controle de Férias

Acesse pelo menu **"Férias"**.

### 6.1 Selecionar Ano e Área
No header, selecione:
- **Ano**: Ano de referência para visualização (navegação por setas)
- **Área**: Elétrica, Mecânica, Confiabilidade, Modernização

### 6.2 Indicadores (KPIs)
- Número de colaboradores na área
- Quantos já têm férias marcadas
- Quantos períodos estão registrados no ADP
- Total de dias de férias marcados

### 6.3 Timeline Geral
Visualização gráfica da distribuição de férias ao longo do ano:
- Cada linha representa um colaborador (agrupados por: Coordenação, Elétrica, Mecânica, Confiabilidade, Modernização)
- Barras coloridas mostram os períodos de férias
- Uma linha vermelha indica o dia de hoje

### 6.4 Tabelas de Períodos
Duas tabelas são exibidas:
1. **Coordenação & Gerência**: Férias da equipe de gestão
2. **Por Área**: Férias dos engenheiros da área selecionada

Para cada pessoa, são mostrados os 3 períodos de férias:
- Datas de início e fim
- Quantidade de dias
- Indicador se está registrado no ADP

### 6.5 Operações de Edição
- **Adicionar período**: Clique em "+ Adicionar" em um dos períodos
- **Editar**: Clique no ícone de lápis (✎)
- **Excluir**: Clique no ícone de X (✕)
- **Visualizar**: Passe o mouse sobre a barra de férias para ver os detalhes

### 6.6 Registro de Férias
Ao adicionar/editar um período, você pode informar:
- Colaborador (apenas gestores/coordenadores)
- Área
- Período (1º, 2º ou 3º)
- Data de início e fim
- Se está registrado no ADP
- Observações

---

## 7. IACs (Investment Authorization Committee)

Acesse pelo menu **"IACs 2026"**.

### 7.1 O que são IACs?
IACs são Autorizações de Investimento que documentam solicitações de investimento em equipamentos, serviços e obras.

### 7.2 Visão Geral
A página inicial mostra:
- **Gráfico de Status**: Distribuição de IACs por status (barras verticais clicáveis para filtrar)
- **Gráfico de Prioridade**: Donut chart com distribuição por prioridade (Priority, Non Priority, Hired)
- **Lista de IACs**: Tabela com todos os registros + estatísticas de importação

### 7.3 Filtros
- **Busca**: Pesquisar por código, projeto ou responsável
- **Status**: Filtrar por status específico (clique nas barras do gráfico)
- **Prioridade**: Filtrar por prioridade (clique no donut chart)
- **Abas**: Todos, Meus IACs, ou filtrar por área (Confiabilidade, Elétrica, Mecânica)
- **Filtros por coluna**: Clique no ícone de filtro em cada coluna da tabela

### 7.4 Status Disponíveis
- 0 - Not started yet (Não iniciado)
- 1 - IA and PDs (IA e PDs)
- 2 - Invitation letter (Carta de convite)
- 3 - Proposal received (Proposta recebida)
- 4 - Clarification (Esclarecimento)
- 5 - Negotiation (Negociação)
- 6 - ER/DM Review/Approval (Revisão/Aprovação)
- 8 - Draft Contract (Rascunho de contrato)
- 9 - Contract signed (Contrato assinado)
- 91 - Hired 2025 (Contratado 2025)
- 10 - Cancelado

### 7.5 Prioridades
- **Priority**: Amarelo
- **Non Priority**: Cinza
- **Hired**: Verde

### 7.6 Tipos
- New (Novo)
- Transfer (Transferência)
- Waiver
- Hired 2025

### 7.7 Operações
- **Novo IAC**: Clique no botão "Novo IAC" (para gestores/coordenadores)
- **Editar**: Clique em um registro para abrir o formulário
- **Check-in**: Ao editar, você pode clicar em "✓ Check-in" para marcar que visitou o IAC
- **Importar**: Importar dados de arquivo Excel com **preview detalhado** (estatísticas de linhas, novos, atualizados, pulados, por área/status/prioridade)
- **Exportar**: Exportar todos os dados para Excel
- **Excluir**: Disponível no formulário de edição

### 7.8 Campos do IAC
- Código IAC
- Tipo (New, Transfer, Waiver, Hired 2025)
- Área (Confiabilidade, Elétrica, Mecânica)
- Projeto
- Datas de abertura (Opening date, When open)
- Quantidades (Priority, No Priority)
- Status atual
- Prioridade
- Validade (Dez/2025, Dez/2026, Dez/2027, Dez/2028, Dez/2029)
- Continuidade (Sim/Não)
- Apresentado Work Team (Sim/Não)
- Responsáveis (Solicitante, Team Leader, Chinese Work Staff, Organizador, Supervisor)
- Equipe de Avaliação
- Comentários

---

## 8. Acompanhamento de Projetos

Acesse pelo menu **"Acomp. de Projetos"**.

### 8.1 O que é?
Sistema de acompanhamento de contratos e projetos em andamento, com controle de valores, status e cronograma.

### 8.2 Visão Geral
- **Gráfico de Natureza**: Donut chart com distribuição por CAPEX, OPEX, Guarda-chuva (clicável por usina)
- **Gráfico por Usina**: Valor de contrato por usina (barras com valor utilizado)
- **Lista de Projetos**: Tabela com todos os registros + filtros por coluna

### 8.3 Status dos Projetos
- Em andamento (Azul)
- Em fase de encerramento (Amarelo)
- Encerrado (Cinza)
- Paralisado (Vermelho)
- Capitalizado Parcialmente (Roxo)
- Capitalizado Integralmente (Verde)

### 8.4 Natureza
- **CAPEX**: Azul
- **OPEX**: Verde
- **Guarda-chuva**: Amarelo

### 8.5 Campos dos Projetos
- **Identificação**: Área, Usina, PP/Contrato, Projeto/Atividade
- **Status**: Em andamento, Em fase de encerramento, Encerrado, Paralisado, Capitalizado Parcialmente, Capitalizado Integralmente
- **Gestor**: Responsável pelo projeto (seleção via usuários do sistema)
- **Fornecedor/Empresa**: Dados do contratada
- **Natureza**: CAPEX, OPEX, Guarda-chuva
- **Valores**: Valor contrato, Realizado, Saldo, Valor SI, Realizado SI, Saldo SI (cálculo automático de saldo)
- **Datas**: Vencimento
- **Outros**: Cronograma, Aditivos, Reajustes, Resumo
- **Aditivo em Andamento**: SIM/NÃO

### 8.6 Operações
- **Novo Projeto**: Criar novo registro (para coordenadores/gestores)
- **Editar**: Clique em um registro para modificar
- **Check-in**: Marcar como visitado (✓ Visitado)
- **Importar**: Importar dados de arquivo Excel com preview detalhado
- **Exportar**: Exportar todos os dados para Excel
- **Gerar Relatório HTML**: Criar relatório mensal em formato HTML
  - Seleione o **Período** (mês e ano)
  - Escolha a **Fonte de Dados**: Banco de dados ou arquivo Excel
  - Se escolher Excel, faça upload do arquivo (.xlsx ou .xls)
- **Excluir**: Disponível no formulário de edição

---

## 9. Controle de Documentos

Acesse pelo menu **"Documentos"**.

### 9.1 Tipos de Documentos (Siglas)
- **ATA**: Atas
- **CTA**: Cartas
- **RT**: Relatório Técnico
- **EP**: Ensaios Preditivos
- **ET**: Especificação Técnica
- **ROP**: Relatório de Ocorrências e Perturbações
- **MC**: Memorial de Cálculo
- **ROG**: Relatório de Ocorrência Grave e Indisponibilidade
- **RFH**: Relatório de Falha Humana

### 9.2 Áreas
- **ENG**: Engenharia de Manutenção
- **PRD**: Produção
- **COP**: Coordenação Operação

### 9.3 Status
- **Em elaboração** (Amarelo)
- **Para aprovação** (Azul)
- **Publicado** (Verde) - requer link do documento
- **Cancelado** (Vermelho) - irreversível sem permissão

### 9.4 Código Automático
O sistema gera automaticamente o código no formato: `TIPO-AREA-SEQ-ANO[-RREV]`
- Exemplo: `RT-ENG-001-26` ou `RT-ENG-001-26-R1`

### 9.5 Operações
- **Novo Documento**: Clique em "Novo Documento"
  - Selecione Tipo e Área (definem o código)
  - Número sequencial e Ano são preenchidos automaticamente
  - Informe Usina, Responsável, Data, Título
  - Selecione autores/participantes (múltipla escolha)
  - Adicione observações
  - **Revisão**: Ao criar uma revisão (R1, R2...), o documento original é mantido

- **Editar**: Clique em um registro para modificar (código, tipo e área ficam bloqueados)
- **Nova Revisão**: Botão 🔄 para criar nova revisão (apenas data e responsável são editáveis)
- **Alterar Status**: Botão 🔖 para alterar apenas o status (se "Publicado", informe o link)
- **Importar .docx**: Importe arquivos Word com numeração automática
  - O sistema detecta automaticamente: código, responsável, data, título, status, usina
  - Responsáveis são correlacionados com usuários do sistema (mapeamento manual para não encontrados)
  - Preview mostra quantos registros foram encontrados e correlacionados
- **Exportar Excel**: Exportar todos os dados para Excel
- **Exportar HTML**: Gerar relatório HTML completo com estatísticas e listagem
- **Upload de arquivo**: Na tabela, clique no link para acessar o documento (se publicado)

---

## 10. Relatório HTML

Acesse pelo menu **"Relatório HTML"**.

### 10.1 Gerar Relatório
Crie relatórios mensais em formato HTML para acompanhamento de contratos:

1. **Período do Relatório**:
   - Selecione o **Mês** (Janeiro a Dezembro)
   - Selecione o **Ano** (ano atual ± 1)

2. **Fonte de Dados**:
   - **Dados da Aplicação**: Gera o relatório usando os projetos cadastrados no banco de dados
   - **Arquivo Excel**: Envie um arquivo Excel externo para gerar o relatório (arraste ou clique para selecionar)

3. Clique em **"Gerar Relatório"** para criar o arquivo HTML

---

## 11. Feedback e Sugestões

### 11.1 Enviar Feedback
Acesse pelo menu **"Sugestões"**.
- Preencha o formulário com sua sugestão ou reporte de problema
- O sistema registra automaticamente o usuário remetente

### 11.2 Caixa de Entrada (Administradores/Desenvolvedor)
Acesse pelo menu **"Inbox de Feedback"** (apenas para o desenvolvedor).
- Visualizar e gerenciar os feedbacks recebidos
- Contador de mensagens não lidas no menu lateral

---

## 12. Tutorial

Acesse pelo menu **"Tutorial"**.

O sistema oferece um tutorial interativo com seções:
- **Visão Geral**: O que é o CTG.Engenharia
- **Perfis de Acesso**: Descrição de cada role
- **Dashboard**: Como interpretar os KPIs e gráficos
- **Preenchendo o Forecast**: Passo a passo do Wizard
- **Gráficos do Projeto**: Tipos de gráficos disponíveis
- **Chat do Projeto**: Como usar a comunicação integrada
- **Exportação Excel**: Como exportar dados
- **Configurações**: Opções disponíveis para planejadores
- **Instalação no Celular**: Como instalar o PWA (iPhone/Android)
- **Delegação de Acesso**: Como delegar seus acessos durante férias

---

## 13. Configurações (Planejadores)

Acesse pelo menu **"Configurações"** (apenas para planejadores).

### 13.1 Alertas
- Definir dias para alerta de desatualização do forecast

### 13.2 Cores
- Personalizar as cores dos tipos de dados nos gráficos:
  - Budget (Verde)
  - Forecast (Azul)
  - Realizado/Actual (Azul escuro)
  - Meta (Roxo)
  - Pool (Ciano)

### 13.3 Período
- Configurar anos ativos (detalhamento mensal)
- Fechar anos (ano mínimo para exibição)

### 13.4 Exportação
- Incluir/Excluir Meta e Pool nos exports

### 13.5 Ano Fiscal
- Definir mês de início do exercício fiscal

---

## 14. Meu Perfil

Acesse pelo menu **"Perfil"** ou clicando no seu nome na lateral.

### 14.1 Informações Pessoais
- Visualizar suas informações: nome, e-mail, role, área
- Atualizar dados cadastrais

### 14.2 Delegação de Acesso
Gerencie suas delegações ativas:
- **Nova Delegação**: Clique em "+ Nova Delegação"
  - Selecione o usuário que receberá o acesso
  - Defina as datas de início e fim
  - (Opcional) Informe o motivo
- **Revogar**: Clique no ícone X para revogar uma delegação ativa
- **Status**: Visualize delegações ativas, agendadas e encerradas

---

## 15. Administração

### 15.1 Painel de Admin
Acesso restrito a administradores (menu **"Gerenciar Usuários"**).
- **Gestão de Usuários**: Criar, editar, excluir usuários
- **Perfis**: Atribuir roles (admin, planejador, coordenador, gestor, engenheiro)
- **Áreas**: Definir áreas de atuação
- **Aprovação de acesso**: Gerenciar solicitações de acesso pendentes

---

## 16. Funcionalidades Gerais

### 16.1 Notificações
O sistema possui um sino de notificações (**AlertBell**) no header que exibe:
- Alertas importantes
- Mensagens não lidas do chat por projeto
- Contador de mensagens não lidas

### 16.2 Atualização PWA
O sistema pode ser instalado como aplicativo (Progressive Web App):
- **iPhone/Safari**: Toque no botão de compartilhar (□↑) → "Adicionar à Tela de Início"
- **Android/Chrome**: Toque nos três pontos (⋮) → "Instalar aplicativo" ou "Adicionar à tela inicial"
- Após instalar, o app funciona em tela cheia com ícone na home
- Notificações aparecem no badge do ícone
- Se houver uma nova versão disponível, você será notificado para atualizar

### 16.3 Exportação
Várias páginas permitem exportar dados para Excel:
- Dashboard (Relatório Geral com seleção de colunas: Budget, Forecast, Actual, Meta, Pool)
- Projetos (por projeto ou relatório geral)
- IACs
- Acompanhamento de Projetos
- Férias
- Documentos (Excel e HTML)

### 16.4 Responsividade
O sistema funciona em dispositivos móveis, com:
- Menu inferior simplificado (Dashboard, Projetos, Perfil, Config.)
- Filtros em formato de "bottom sheet" (modal deslizante)
- Layouts adaptativos
- Visualização completa em qualquer tela

### 16.5 Navegação Mobile
No mobile, o menu lateral é substituído por:
- Botão ☰ no header para abrir a sidebar
- Navegação inferior fixa com ícones para: Dashboard, Polos, Projetos, Perfil

---

## 17. Legenda de Cores

### Cores de Forecast
- **Budget**: Verde (#15803D)
- **Forecast**: Azul (#0369A1)
- **Realizado/Actual**: Azul escuro (#1E40AF)
- **Meta**: Roxo (#6D28D9)
- **Pool**: Ciano (#0891B2)

### Cores de Status (Acompanhamento)
- **Em andamento**: Azul (#0EA5E9)
- **Em fase de encerramento**: Amarelo (#F59E0B)
- **Encerrado**: Cinza (#94A3B8)
- **Paralisado**: Vermelho (#EF4444)
- **Capitalizado Parcialmente**: Roxo (#8B5CF6)
- **Capitalizado Integralmente**: Verde (#10B981)

### Cores de Status (IACs)
- **0 - Not started**: Cinza claro
- **1 - IA and PDs**: Azul
- **2 - Invitation letter**: Roxo claro
- **3 - Proposal received**: Amarelo
- **4 - Clarification**: Laranja
- **5 - Negotiation**: Azul claro
- **6 - ER/DM Review**: Verde
- **8 - Draft Contract**: Verde claro
- **9 - Contract signed**: Verde escuro
- **91 - Hired 2025**: Cinza
- **10 - Cancelado**: Vermelho

### Cores de Prioridade (IACs)
- **Priority**: Amarelo (#F59E0B)
- **Non Priority**: Cinza (#64748B)
- **Hired**: Verde (#10B981)

### Cores de Status (Documentos)
- **Em elaboração**: Amarelo (#F59E0B)
- **Para aprovação**: Azul (#3B82F6)
- **Publicado**: Verde (#10B981)
- **Cancelado**: Vermelho (#EF4444)

### Cores de Natureza (Acompanhamento)
- **CAPEX**: Azul (#1D4ED8)
- **OPEX**: Verde (#065F46)
- **Guarda-chuva**: Amarelo (#92400E)

---

## 18. Dicas de Uso

1. **Mantenha os dados atualizados**: O forecast deve ser atualizado regularmente para refletir a realidade do projeto
2. **Use filtros**: Em páginas com muitos dados, use os filtros para encontrar informações específicas
3. **Verifique datas de atualização**: A tabela de projetos mostra quando foi a última atualização do forecast (verde ≤ 30 dias, vermelho > 30 dias)
4. **Registre check-ins**: Ao trabalhar com IACs e projetos de acompanhamento, use o check-in (✓) para controlar o que já foi revisado
5. **Conflito de férias**: O sistema alerta quando duas pessoas da mesma área estão programadas para férias no mesmo período
6. **Saldo negativo**: Em acompanhamento de projetos, saldos negativos são destacados em vermelho
7. **Código automático**: No controle de documentos, o código é gerado automaticamente ao selecionar tipo e área
8. **Importação com preview**: Ao importar dados (IACs, Projetos, Documentos), sempre há uma tela de preview com estatísticas detalhadas antes da confirmação
9. **Delegação de acesso**: Programe com antecedência suas delegações de acesso para períodos de férias ou viagens
10. **PWA no celular**: Instale o sistema como aplicativo no celular para acesso rápido e notificações push

---

## 19. Suporte

Em caso de dúvidas ou problemas:
1. Consulte o **Tutorial** no menu lateral
2. Use o sistema de **Feedback** para entrar em contato com a equipe de desenvolvimento
3. Entre em contato com o administrador do sistema

---

*Documento atualizado em: Abril de 2026*
*Versão do Sistema: CTG.Engenharia v2.0*
