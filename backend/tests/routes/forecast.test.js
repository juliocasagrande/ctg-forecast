/**
 * Testes de integração — /api/forecast
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { createProject, assignEngineer } from '../helpers/fixtures.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'fc';
const YEAR   = new Date().getFullYear();

let adminCookies, engCookies, planejadorCookies;
let project;
let engUser;

beforeAll(async () => {
  await cleanTables('forecast_entries', 'year_consolidated', 'actual_consolidated', 'project_assignments', 'projects', 'users');

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
  await cleanTables('forecast_entries', 'year_consolidated', 'actual_consolidated', 'project_assignments', 'projects', 'users');
});

// ──────────────────────────────────────────────────────────────
// POST /api/forecast/project/:id/bulk  (upsert em lote)
// ──────────────────────────────────────────────────────────────
describe('POST /api/forecast/project/:id/bulk', () => {
  it('engenheiro insere/atualiza entradas de previsão', async () => {
    const entries = [
      { category: 'CAPEX', type: 'PREVISTO', year: YEAR, month: 1, value: 10000 },
      { category: 'CAPEX', type: 'PREVISTO', year: YEAR, month: 2, value: 15000 },
      { category: 'OPEX',  type: 'PREVISTO', year: YEAR, month: 1, value: 5000  },
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
      .send({ entries: [{ category: 'CAPEX', type: 'PREVISTO', year: YEAR, month: 1, value: 1 }] });

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
    expect(Array.isArray(res.body)).toBe(true);
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
