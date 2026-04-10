# Como Rodar os Testes

## Pré-requisitos

- Node.js 18+
- PostgreSQL rodando localmente (ou acessível via rede)
- Um banco de dados **exclusivo para testes** (nunca use o banco de produção)

---

## 1. Configurar o banco de testes

Crie um banco vazio no PostgreSQL:

```sql
CREATE DATABASE ctg_forecast_test;
```

---

## 2. Configurar as variáveis de ambiente

Na pasta `backend/tests/`, copie o arquivo de exemplo:

```bash
cp tests/.env.test.example tests/.env.test
```

Edite o `tests/.env.test` com seus dados:

```env
DATABASE_URL=postgresql://usuario:senha@localhost:5432/ctg_forecast_test
JWT_SECRET=chave-secreta-apenas-para-testes-nao-usar-em-prod
NODE_ENV=test
ADMIN_EMAIL=admin@ctg-test.internal
ADMIN_PASS=AdminTest@123!
ADMIN_NAME=Admin Teste
```

> **Atenção:** o arquivo `.env.test` nunca deve ser commitado. Ele já está no `.gitignore`.

---

## 3. Instalar as dependências

Na pasta `backend/`:

```bash
npm install
```

Isso instala o Vitest, Supertest e os demais pacotes de teste listados em `devDependencies`.

---

## 4. Rodar os testes

Todos os comandos devem ser executados dentro da pasta `backend/`.

### Execução única (CI / verificação rápida)

```bash
npm test
```

### Modo watch (desenvolvimento — re-executa ao salvar)

```bash
npm run test:watch
```

### Com relatório de cobertura de código

```bash
npm run test:coverage
```

O relatório HTML é gerado em `backend/coverage/index.html`.

### Interface visual no navegador

```bash
npm run test:ui
```

---

## 5. Rodar apenas um arquivo ou suite específica

Passe o nome do arquivo como argumento:

```bash
# Apenas testes de autenticação
npx vitest run tests/routes/auth.test.js

# Apenas testes de segurança
npx vitest run tests/security/

# Apenas testes de projetos e previsão
npx vitest run tests/routes/projects.test.js tests/routes/forecast.test.js
```

---

## 6. Estrutura dos testes

```
tests/
├── .env.test.example          # template de variáveis de ambiente
├── COMO_RODAR_TESTES.md       # este arquivo
├── setup/
│   ├── globalSetup.js         # inicializa o banco antes de todos os testes
│   ├── testSetup.js           # carrega .env.test em cada worker
│   └── testApp.js             # instância do Express para testes (sem rate-limit)
├── helpers/
│   ├── auth.js                # createTestUser(), loginAs(), cookieHeader()
│   ├── db.js                  # query(), cleanTables(), cleanAllTestData()
│   └── fixtures.js            # fábricas de projetos, forecast, documentos, etc.
├── routes/
│   ├── auth.test.js           # login, logout, /me, registro, troca de senha
│   ├── users.test.js          # CRUD de usuários, aprovação, desativação
│   ├── projects.test.js       # CRUD de projetos, atribuição de engenheiros
│   ├── forecast.test.js       # previsões, dashboard, alertas, fechar ano
│   ├── documents.test.js      # CRUD de documentos, revisões, status
│   ├── vacations.test.js      # períodos de férias
│   ├── delegations.test.js    # delegações de acesso
│   ├── lists.test.js          # IACs e rastreamento de projetos
│   ├── settings.test.js       # configurações do sistema
│   └── messages.test.js       # chat por projeto
└── security/
    ├── authorization.test.js  # 401 em rotas protegidas, tokens forjados,
    │                          # SQL injection, XSS, dados sensíveis, headers
    └── roles.test.js          # matriz de permissões por role
```

---

## 7. O que cada suite testa

| Arquivo | O que valida |
|---|---|
| `auth.test.js` | Login/logout, cookies JWT, registro com aprovação pendente, troca de senha |
| `users.test.js` | Listagem, aprovação, desativação e edição de usuários por role |
| `projects.test.js` | CRUD completo, visibilidade por role, atribuição de engenheiros |
| `forecast.test.js` | Inserção em lote, leitura por ano, dashboard, alertas, fechar ano |
| `documents.test.js` | Criação, listagem, revisões, troca de status |
| `vacations.test.js` | CRUD de períodos de férias por área e ano |
| `delegations.test.js` | Criar, listar e revogar delegações de acesso |
| `lists.test.js` | IACs e rastreamento de projetos (CRUD completo) |
| `settings.test.js` | Leitura livre, escrita restrita a admin/planejador |
| `messages.test.js` | Envio e leitura de mensagens por projeto |
| `authorization.test.js` | Todas as rotas protegidas retornam 401 sem token; tokens forjados; SQL injection; XSS; dados sensíveis não vazam; headers de segurança |
| `roles.test.js` | Matriz completa: admin, planejador, gerente, coordenador, engenheiro |

---

## 8. Como os testes funcionam

- **Banco real:** os testes rodam contra um PostgreSQL real (não há mocks). Isso garante que queries, constraints e migrações funcionem de verdade.
- **Isolamento:** cada suite limpa suas próprias tabelas em `beforeAll`/`afterAll`. Os testes rodam sequencialmente para evitar conflitos.
- **Rate-limiting desativado:** em `NODE_ENV=test` os limitadores de requisição são pulados automaticamente.
- **HTTPS redirect desativado:** o middleware `requireHTTPS` só atua em produção.

---

## 9. Troubleshooting

**Erro: `connect ECONNREFUSED` ou `password authentication failed`**
> O banco de testes não está rodando ou as credenciais em `.env.test` estão erradas.

**Erro: `relation "users" does not exist`**
> O `globalSetup` não conseguiu inicializar o banco. Verifique se `DATABASE_URL` está correta no `.env.test`.

**Erro: `Cannot find module 'vitest'`**
> Rode `npm install` dentro da pasta `backend/` antes de executar os testes.

**Testes falham com `403` inesperado**
> Verifique se o usuário de teste foi criado com a role correta e se o `loginAs()` retornou cookies válidos.

**Os testes passam localmente mas falham no CI**
> Certifique-se de que as variáveis de ambiente estão configuradas no pipeline (ex: secrets do GitHub Actions) e que o banco de testes está disponível.
