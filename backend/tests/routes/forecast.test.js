/**
 * Testes de integração — /api/forecast
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { createProject, assignEngineer } from '../helpers/fixtures.js';
import { cleanTables, query } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'fc';
const YEAR   = new Date().getFullYear();

let adminCookies, engCookies, planejadorCookies;
let project;
let engUser;

beforeAll(async () => {
  await cleanTables('forecast_entries', 'year_consolidated', 'actual_consolidated', 'project_assignments', 'documents', 'document_authors', 'alert_dismissals', 'projects', 'users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const planejador = await createTestUser({ email: `${PREFIX}.plan@ctg-test.internal`, role: 'planejador' });
  engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro' });

  ({ cookies: adminCookies      } = await loginAs(app, adminUser));
  ({ cookies: planejadorCookies } = await loginAs(app, planejador));
  ({ cookies: engCookies        } = await loginAs(app, engUser));

  project = await createProject({ code: 'FC-PROJECT-001', name: 'Projeto Forecast' });
  await assignEngineer(project.id, engUser.id);
});

afterAll(async () => {
  await cleanTables('forecast_entries', 'year_consolidated', 'actual_consolidated', 'project_assignments', 'documents', 'document_authors', 'alert_dismissals', 'projects', 'users');
});

// ──────────────────────────────────────────────────────────────
// POST /api/forecast/project/:id/bulk  (upsert em lote)
// ──────────────────────────────────────────────────────────────
describe('POST /api/forecast/project/:id/bulk', () => {
  it('engenheiro insere/atualiza entradas de previsão', async () => {
    const entries = [
      { category: 'Viagens', type: 'Forecast', year: YEAR, month: 1, value: 10000 },
      { category: 'Viagens', type: 'Forecast', year: YEAR, month: 2, value: 15000 },
      { category: 'Contratos', type: 'Forecast', year: YEAR, month: 1, value: 5000 },
    ];

    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/bulk`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ entries });

    expect(res.status).toBe(200);
  });

  it('usuário sem acesso ao projeto recebe 403', async () => {
    const outsider = await createTestUser({ email: `${PREFIX}.out@ctg-test.internal` });
    const { cookies } = await loginAs(app, outsider);

    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/bulk`)
      .set('Cookie', cookieHeader(cookies))
      .send({ entries: [{ category: 'Viagens', type: 'Forecast', year: YEAR, month: 1, value: 1 }] });

    expect(res.status).toBe(403);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/bulk`)
      .send({ entries: [] });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/forecast/project/:id  (ler por ano)
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/project/:id', () => {
  it('engenheiro lê previsões do projeto atribuído', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}`)
      .query({ year: YEAR })
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('admin lê previsões de qualquer projeto', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}`)
      .query({ year: YEAR })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/forecast/project/:id/summary
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/project/:id/summary', () => {
  it('retorna resumo do projeto', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/summary`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/forecast/dashboard
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/dashboard', () => {
  it('admin recebe métricas do dashboard', async () => {
    const res = await request(app)
      .get('/api/forecast/dashboard')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/forecast/summaries
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/summaries', () => {
  it('retorna lista de resumos de projetos', async () => {
    const res = await request(app)
      .get('/api/forecast/summaries')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/forecast/alerts
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/alerts', () => {
  it('retorna alertas ativos', async () => {
    const res = await request(app)
      .get('/api/forecast/alerts')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    // Pode retornar array ou objeto dependendo da implementação
    expect(res.body !== null && typeof res.body === 'object').toBe(true);
  });

  it('conta documentos pendentes quando o usuário é responsável, mesmo sem ser autor', async () => {
    await query(`
      INSERT INTO documents (
        type, area, sequence_number, year, responsible, date, subject, status,
        code, base_code, created_by, updated_by, created_at, updated_at
      )
      VALUES (
        'RT', 'eletrica', 901, 26, $1, CURRENT_DATE, 'Documento pendente por responsavel',
        'Em elaboração', 'RT-eletrica-901-26', 'RT-eletrica-901-26', 1, 1,
        NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'
      )
    `, [engUser.name]);

    const res = await request(app)
      .get('/api/forecast/alerts')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(res.body.doc_unpublished.docs.some(d => d.code === 'RT-eletrica-901-26')).toBe(true);
  });

  it('para engenheiro, nao conta documentos criados por ele quando outro usuario e responsavel', async () => {
    await query(`
      INSERT INTO documents (
        type, area, sequence_number, year, responsible, date, subject, status,
        code, base_code, created_by, updated_by, created_at, updated_at
      )
      VALUES (
        'RT', 'eletrica', 902, 26, 'Outro Responsavel', CURRENT_DATE, 'Documento criado mas nao responsavel',
        'Em elaboração', 'RT-eletrica-902-26', 'RT-eletrica-902-26', $1, $1,
        NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'
      )
    `, [engUser.id]);

    const res = await request(app)
      .get('/api/forecast/alerts')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(res.body.doc_unpublished.docs.some(d => d.code === 'RT-eletrica-902-26')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/forecast/project/:id/year-consolidated
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/project/:id/year-consolidated', () => {
  it('retorna dados consolidados do ano', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/year-consolidated`)
      .query({ year: YEAR })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/forecast/close-year (fechar ano)
// ──────────────────────────────────────────────────────────────
describe('POST /api/forecast/close-year', () => {
  it('planejador pode fechar o ano', async () => {
    const res = await request(app)
      .post('/api/forecast/close-year')
      .set('Cookie', cookieHeader(planejadorCookies))
      .send({ year: YEAR - 1 });

    // 200 (sucesso) ou 400 (ano já fechado) são aceitáveis
    expect([200, 400]).toContain(res.status);
  });

  it('engenheiro não pode fechar o ano (403)', async () => {
    const res = await request(app)
      .post('/api/forecast/close-year')
      .set('Cookie', cookieHeader(engCookies))
      .send({ year: YEAR - 1 });

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/forecast/project/:id (single upsert)
// ──────────────────────────────────────────────────────────────
describe('PUT /api/forecast/project/:id', () => {
  it('coordenador pode inserir entrada única', async () => {
    const coordenador = await createTestUser({ email: `${PREFIX}.coord@ctg-test.internal`, role: 'coordenador' });
    const { cookies } = await loginAs(app, coordenador);

    const res = await request(app)
      .put(`/api/forecast/project/${project.id}`)
      .set('Cookie', cookieHeader(cookies))
      .send({
        category: 'Viagens',
        type: 'Budget',
        year: YEAR,
        month: 3,
        value: 5000,
        comment: 'Teste single upsert'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });

  it('engenheiro só pode editar Forecast e Actual (403 para Budget)', async () => {
    const res = await request(app)
      .put(`/api/forecast/project/${project.id}`)
      .set('Cookie', cookieHeader(engCookies))
      .send({
        category: 'Viagens',
        type: 'Budget',
        year: YEAR,
        month: 3,
        value: 5000
      });

    expect(res.status).toBe(403);
  });

  it('engenheiro pode editar Forecast', async () => {
    const res = await request(app)
      .put(`/api/forecast/project/${project.id}`)
      .set('Cookie', cookieHeader(engCookies))
      .send({
        category: 'Viagens',
        type: 'Forecast',
        year: YEAR,
        month: 3,
        value: 6000
      });

    expect(res.status).toBe(200);
  });

  it('gerente tem acesso somente leitura (403)', async () => {
    const gerente = await createTestUser({ email: `${PREFIX}.gerente@ctg-test.internal`, role: 'gerente' });
    const { cookies } = await loginAs(app, gerente);

    const res = await request(app)
      .put(`/api/forecast/project/${project.id}`)
      .set('Cookie', cookieHeader(cookies))
      .send({
        category: 'Viagens',
        type: 'Forecast',
        year: YEAR,
        month: 3,
        value: 7000
      });

    expect(res.status).toBe(403);
  });

  it('categoria inválida retorna 400', async () => {
    const res = await request(app)
      .put(`/api/forecast/project/${project.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        category: 'InvalidCat',
        type: 'Forecast',
        year: YEAR,
        month: 3,
        value: 5000
      });

    expect(res.status).toBe(400);
  });

  it('mês inválido retorna 400', async () => {
    const res = await request(app)
      .put(`/api/forecast/project/${project.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        category: 'Viagens',
        type: 'Forecast',
        year: YEAR,
        month: 13,
        value: 5000
      });

    expect(res.status).toBe(400);
  });

  it('ano inválido retorna 400', async () => {
    const res = await request(app)
      .put(`/api/forecast/project/${project.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        category: 'Viagens',
        type: 'Forecast',
        year: 2010,
        month: 3,
        value: 5000
      });

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────
// Notes CRUD — /api/forecast/project/:id/notes
// ──────────────────────────────────────────────────────────────
describe('Notes CRUD', () => {
  let noteId;

  it('admin pode criar nota', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        note_date: `${YEAR}-03-15`,
        content: 'Nota de teste criada pelo admin'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    noteId = res.body.id;
  });

  it('criar nota sem conteúdo retorna 400', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        note_date: `${YEAR}-03-15`,
        content: ''
      });

    expect(res.status).toBe(400);
  });

  it('engenheiro pode criar nota', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(engCookies))
      .send({
        note_date: `${YEAR}-04-01`,
        content: 'Nota do engenheiro'
      });

    expect(res.status).toBe(201);
  });

  it('data inválida retorna 400', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        note_date: 'invalid-date',
        content: 'Nota com data inválida'
      });

    expect(res.status).toBe(400);
  });

  it('admin pode listar notas', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('engenheiro pode listar notas do projeto atribuído', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
  });

  it('usuário sem acesso não pode listar notas (403)', async () => {
    const outsider = await createTestUser({ email: `${PREFIX}.out2@ctg-test.internal`, role: 'engenheiro' });
    const { cookies } = await loginAs(app, outsider);

    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(cookies));

    expect(res.status).toBe(403);
  });

  it('admin pode editar nota', async () => {
    const res = await request(app)
      .put(`/api/forecast/notes/${noteId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        content: 'Nota atualizada pelo admin',
        note_date: `${YEAR}-03-20`
      });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Nota atualizada pelo admin');
  });

  it('planejador pode editar nota de outro usuário', async () => {
    const res = await request(app)
      .put(`/api/forecast/notes/${noteId}`)
      .set('Cookie', cookieHeader(planejadorCookies))
      .send({
        content: 'Nota atualizada pelo planejador',
        note_date: `${YEAR}-03-21`
      });

    expect(res.status).toBe(200);
  });

  it('engenheiro não pode editar nota de outro usuário (403)', async () => {
    const res = await request(app)
      .put(`/api/forecast/notes/${noteId}`)
      .set('Cookie', cookieHeader(engCookies))
      .send({
        content: 'Tentativa de edição',
        note_date: `${YEAR}-03-22`
      });

    expect(res.status).toBe(403);
  });

  it('nota inexistente retorna 404', async () => {
    const res = await request(app)
      .put('/api/forecast/notes/999999')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ content: 'Teste', note_date: `${YEAR}-03-22` });

    expect(res.status).toBe(404);
  });

  it('admin pode deletar nota', async () => {
    const res = await request(app)
      .delete(`/api/forecast/notes/${noteId}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('planejador pode deletar nota de outro usuário', async () => {
    // Criar nota para deletar
    const createRes = await request(app)
      .post(`/api/forecast/project/${project.id}/notes`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ content: 'Nota para deletar', note_date: `${YEAR}-04-05` });

    const res = await request(app)
      .delete(`/api/forecast/notes/${createRes.body.id}`)
      .set('Cookie', cookieHeader(planejadorCookies));

    expect(res.status).toBe(200);
  });

  it('nota inexistente retorna 404 no DELETE', async () => {
    const res = await request(app)
      .delete('/api/forecast/notes/999999')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// Actual Consolidated
// ──────────────────────────────────────────────────────────────
describe('Actual Consolidated', () => {
  it('coordenador pode salvar actual consolidado', async () => {
    const coordenador = await createTestUser({ email: `${PREFIX}.coord2@ctg-test.internal`, role: 'coordenador' });
    const { cookies } = await loginAs(app, coordenador);

    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/actual-consolidated`)
      .set('Cookie', cookieHeader(cookies))
      .send({
        value: 50000,
        comment: 'Actual consolidado do coordenador'
      });

    expect(res.status).toBe(200);
    // Valor pode ser retornado como string ou number
    expect(res.body.value == 50000 || res.body.value === '50000.00').toBe(true);
  });

  it('planejador pode salvar actual consolidado', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/actual-consolidated`)
      .set('Cookie', cookieHeader(planejadorCookies))
      .send({
        value: 55000,
        comment: 'Actual consolidado do planejador'
      });

    expect(res.status).toBe(200);
  });

  it('engenheiro não pode salvar actual consolidado (403)', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/actual-consolidated`)
      .set('Cookie', cookieHeader(engCookies))
      .send({
        value: 60000,
        comment: 'Tentativa do engenheiro'
      });

    expect(res.status).toBe(403);
  });

  it('qualquer usuário autenticado pode ler actual consolidado', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/actual-consolidated`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('value');
  });
});

// ──────────────────────────────────────────────────────────────
// Check-in
// ──────────────────────────────────────────────────────────────
describe('POST /api/forecast/project/:id/checkin', () => {
  it('engenheiro pode fazer check-in', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/checkin`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });

  it('admin pode fazer check-in', async () => {
    const res = await request(app)
      .post(`/api/forecast/project/${project.id}/checkin`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });

  it('projeto inexistente retorna erro', async () => {
    const res = await request(app)
      .post('/api/forecast/project/999999/checkin')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(500); // FK constraint error
  });
});

// ──────────────────────────────────────────────────────────────
// Activity log
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/project/:id/activity', () => {
  it('admin pode ver activity log', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/activity`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('forecast');
    expect(res.body).toHaveProperty('checkins');
    expect(res.body).toHaveProperty('consolidated');
  });

  it('engenheiro pode ver activity log do projeto atribuído', async () => {
    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/activity`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
  });

  it('usuário sem acesso não pode ver activity log (403)', async () => {
    const outsider = await createTestUser({ email: `${PREFIX}.out3@ctg-test.internal`, role: 'engenheiro' });
    const { cookies } = await loginAs(app, outsider);

    const res = await request(app)
      .get(`/api/forecast/project/${project.id}/activity`)
      .set('Cookie', cookieHeader(cookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/forecast/unread-counts
// ──────────────────────────────────────────────────────────────
describe('GET /api/forecast/unread-counts', () => {
  it('usuário autenticado pode obter contagem de mensagens não lidas', async () => {
    const res = await request(app)
      .get('/api/forecast/unread-counts')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/forecast/unread-counts');

    expect(res.status).toBe(401);
  });
});
