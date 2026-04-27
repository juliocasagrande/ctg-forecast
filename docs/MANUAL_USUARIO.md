# Manual de Utilização — Sistema CTG Engenharia

## Introdução

Este manual descreve as funcionalidades disponíveis no sistema de gestão de projetos e engenharia da CTG Brasil. O sistema é uma plataforma web que permite o acompanhamento de projetos, forecast financeiro, controle de férias, gestão de documentos, IACs e muito mais.

---

## 1. Login e Autenticação

### Acesso ao Sistema
1. Acesse a URL do sistema
2. Insira seu e-mail institucional
3. Digite sua senha
4. Clique em "Entrar"

### Roles e Permissões
O sistema possui diferentes perfis de acesso:
- **Administrador**: Acesso completo a todas as funcionalidades
- **Planejador**: Pode gerenciar projetos, visualizar todos os dados, configurar o sistema
- **Coordenador**: Visualiza dados da equipe e projetos sob sua coordenação
- **Gerente/Gestor**: Visualiza dados consolidados por área e usina
- **Engenheiro**: Visualiza apenas seus próprios projetos

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

#### Curva S (Evolução Mensal)
Gráfico que mostra a evolução mensal do budget, forecast, meta e pool ao longo do tempo, com média acumulada.
- Clique em **"Expandir"** para ver o gráfico em tela cheia
- Passe o mouse sobre as barras para ver os valores detalhados

#### Gráfico Contextual
O segundo gráfico varia conforme seu perfil:
- **Gerente**: Mostra dados por **Usina**
- **Coordenador**: Mostra dados por **Engenheiro**
- **Engenheiro**: Mostra dados por **Projeto**

### 2.3 Tabela de Projetos
Lista todos os projetos com as colunas:
- Código do projeto
- Nome
- Usinas vinculadas
- Engenheiros responsáveis
- Budget, Forecast, Realizado
- % de Execução
- SI (valor de suplementação)
- Data da última atualização

**Como usar**: Clique em qualquer linha para abrir os detalhes do projeto.

### 2.4 Filtros
No header da página, você encontra filtros:
- **Período**: Selecione o ano inicial e final (use os controles deslizantes)
- **Usina**: Filtre projetos por usina específica
- **Projeto**: Filtre por projetos específicos

---

## 3. Página de Projetos

Acesse pelo menu **"Projetos"**.

### 3.1 Visualizações
O sistema oferece três formas de visualizar os projetos:

1. **Lista de Projetos**: Visualização em formato de lista com todos os projetos
2. **Por Usina**: Agrupa projetos por usina, mostrando resumo financeiro
3. **Por Engenheiro**: (Apenas para coordenadores/gestores) Agrupa projetos por responsável

### 3.2操作ções
- Clique em um projeto para **editar** suas informações
- Use os filtros de período e usina para refinar a visualização

---

## 4. Detalhes do Projeto

Ao clicar em um projeto na lista, você acessa sua página de detalhes com várias abas:

### 4.1 Aba "Visão Geral"
- Informações básicas do projeto
- Status atual
- Engenheiros designados
- Usinas relacionadas

### 4.2 Aba "Forecast"
- **Wizard de Previsão**: Interface para inserir previsões mensais de gasto
- **Importar**: Importar dados de forecast de arquivo Excel
- **Exportar**: Exportar dados para Excel
- Visualização por mês/ano com gráficos

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

### 4.6 Aba "Delegação"
- Gerenciar permissões de acesso ao projeto
- Delegar responsabilidades para outros usuários

---

## 5. Página de Polos (Visão Consolidada)

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

### 5.3操作ções
- Clique no nome do polo para **expandir/recusar** as usinas
- Clique na usina para **expandir/recusar** os projetos
- Clique no projeto para ir para seus detalhes
- A linha "Total Geral" mostra a soma de todos os projetos

---

## 6. Controle de Férias

Acesse pelo menu **"Férias"**.

### 6.1 Selecionar Ano e Área
No header, selecione:
- **Ano**: Ano de referência para visualização
- **Área**: Elétrica, Mecânica ou Confiabilidade

### 6.2 Indicadores (KPIs)
- Número de colaboradores na área
- Quantos já têm férias marcadas
- Quantos períodos estão registrados no ADP
- Total de dias de férias marcados

### 6.3 Timeline Geral
Visualização gráfica da distribuição de férias ao longo do ano:
- Cada linha representa um colaborador
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

### 6.5 操作ções de Edição
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

Acesse pelo menu **"IACs"**.

### 7.1 O que são IACs?
IACs são Autorizações de Investimento que documentam solicitações de investimento em equipamentos, serviços e obras.

### 7.2 Visão Geral
A página inicial mostra:
- **Gráfico de Status**: Distribuição de IACs por status
- **Gráfico de Prioridade**: Distribuição por prioridade (Priority, Non Priority, Hired)
- **Lista de IACs**: Tabela com todos os registros

### 7.3 Filtros
- **Busca**: Pesquisar por código, projeto ou responsável
- **Status**: Filtrar por status específico
- **Prioridade**: Filtrar por prioridade
- **Abas**: Todos, Meus IACs, ou filtrar por área (Confiabilidade, Elétrica, Mecânica)
- **Filtros por coluna**: Clique no ícone de filtro em cada coluna

### 7.4 status Disponíveis
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

### 7.5操作ções
- **Novo IAC**: Clique no botão "Novo IAC" (para gestores/coordenadores)
- **Editar**: Clique em um registro para abrir o formulário
- **Check-in**: Ao editar, você pode clicar em "Check-in" para marcar que visitou o IAC
- **Importar**: Importar dados de arquivo Excel (para gestores)
- **Exportar**: Exportar todos os dados para Excel

### 7.6 Campos do IAC
- Código IAC
- Tipo (New, Transfer, Waiver, Hired 2025)
- Área (Confiabilidade, Elétrica, Mecânica)
- Projeto
- Datas de abertura
- Quantidades (Priority, No Priority)
- Status atual
- Prioridade
- Validade
- Continuidade
- Responsáveis (Solicitante, Team Leader, Chinese Work Staff, Organizador, Supervisor)
- Equipe de Avaliação
- Comentários

---

## 8. Acompanhamento de Projetos

Acesse pelo menu **"Acompanhamento"** (ou "Projetos Tracking").

### 8.1 O que é?
Sistema de acompanhamento de contratos e projetos em andamento, com controle de valores, status e cronograma.

### 8.2 Visão Geral
- **Gráfico de Natureza**: Distribuição por CAPEX, OPEX, Guarda-chuva
- **Gráfico por Usina**: Valor de contrato por usina
- **Lista de Projetos**: Tabela com todos os registros

### 8.3 Campos dos Projetos
- **Identificação**: Área, Usina, PP/Contrato, Projeto/Atividade
- **Status**: Em andamento, Em fase de encerramento, Encerrado, Paralisado, Capitalizado Parcialmente, Capitalizado Integralmente
- **Gestor**: Responsável pelo projeto
- **Fornecedor/Empresa**: Dados do contratada
- **Natureza**: CAPEX, OPEX, Guarda-chuva
- **Valores**: Valor contrato, Realizado, Saldo, Valor SI, Realizado SI, Saldo SI
- **Datas**: Vencimento
- **Outros**: Cronograma, Aditivos, Reajustes, Resumo

### 8.4 操作ções
- **Novo Projeto**: Criar novo registro (para coordenadores/gestores)
- **Editar**: Clique em um registro para modificar
- **Check-in**: Marcar como visitado
- **Importar/Exportar**: Recursos disponíveis para gestores
- **Gerar Relatório HTML**: Criar relatório mensal em formato HTML

---

## 9. Controle de Documentos

Acesse pelo menu **"Documentos"**.

### 9.1 Tipos de Documentos
- ATA (Atas)
- CTA (Cartas)
- RT (Relatório Técnico)
- EP (Ensaios Preditivos)
- ET (Especificação Técnica)
- ROP (Relatório de Ocorrências e Perturbações)
- MC (Memorial de Cálculo)
- ROG (Relatório de Ocorrência Grave e Indisponibilidade)
- RFH (Relatório de Falha Humana)

### 9.2 Áreas
- ENG (Engenharia de Manutenção)
- PRD (Produção)
- COP (Coordenação Operação)

### 9.3 status
- Em elaboração
- Para aprovação
- Publicado
- Cancelado

### 9.4操作ções
- Criar novo documento com geração automática de código
- Editar documentos existentes
- Controlar revisões
- Upload de arquivos (se implementado)

---

## 10. Feedback e Sugestões

### 10.1 Enviar Feedback
Acesse pelo menu **"Sugestões e Feedback"**.
- Preencha o formulário com sua sugestão ou reporte de problema
- O sistema registra automaticamente o usuário remetente

### 10.2 Caixa de Entrada (Administradores)
Os administradores têm acesso a uma caixa de entrada para visualizar e gerenciar os feedbacks recebidos.

---

## 11. Configurações e Perfil

### 11.1 Meu Perfil
Acesse pelo menu **"Perfil"**.
- Visualizar suas informações pessoais
- Atualizar dados cadastrais

### 11.2 Configurações (Planejadores)
Acesse pelo menu **"Configurações"**.
- Definir o período ativo do sistema (ano inicial e final)
- Configurar cores do sistema
- Gerenciar outras configurações do aplicativo

---

## 12. Administração

### 12.1 Painel de Admin
Acesso restrito a administradores.
- **Gerenciamento de Usuários**: Criar, editar, excluir usuários
- **Perfis**: Atribuir roles (admin, planejador, coordenador, gestor, engenheiro)
- **Áreas**: Definir áreas de atuação

---

## 13. Funcionalidades Gerais

### 13.1 Notificações
O sistema possui um sino de notificações (AlertBell) no header que exibe alertas importantes.

### 13.2 Atualização PWA
O sistema pode ser instalado como aplicativo. Se houver uma nova versão disponível, você será notificado para atualizar.

### 13.3 Exportação
Várias páginas permitem exportar dados para Excel:
- Dashboard (Relatório Geral)
- Projetos
- IACs
- Acompanhamento de Projetos
- Férias

### 13.4 Responsividade
O sistema funciona em dispositivos móveis, com:
- Menu inferior simplificado
- Filtros em formato de "bottom sheet"
- Layouts adaptativos

---

## 14. Legenda de Cores

### Cores de Forecast
- **Budget**: Verde
- **Forecast**: Azul
- **Realizado/Actual**: Azul escuro
- **Meta**: Roxo
- **Pool**: Ciano

### Cores de Status
- **Em andamento**: Azul
- **Em fase de encerramento**: Amarelo
- **Encerrado**: Cinza
- **Paralisado**: Vermelho
- **Capitalizado**: Roxo/Verde

### Cores de Prioridade (IACs)
- **Priority**: Amarelo
- **Non Priority**: Cinza
- **Hired**: Verde

---

## 15. Dicas de Uso

1. **Mantenha os dados atualizados**: O forecast deve ser atualizado regularmente para refletir a realidade do projeto
2. **Use filtros**: Em páginas com muitos dados, use os filtros para encontrar informações específicas
3. **Verifique datas de atualização**: A tabela de projetos mostra quando foi a última atualização do forecast
4. **Registre check-ins**: Ao trabalhar com IACs e projetos de acompanhamento, use o check-in para controlar o que já foi revisado
5. **Conflicto de férias**: O sistema alerta quando duas pessoas da mesma área estão programadas para férias no mesmo período
6. **Saldo negativo**: Em acompanhamento de projetos, saldos negativos são destacados em vermelho

---

## Suporte

Em caso de dúvidas ou problemas, utilize o sistema de Feedback para entrar em contato com a equipe de desenvolvimento.

---

*Documento generado automaticamente — CTG Engenharia*