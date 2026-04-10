/**
 * Testes de integração — /api/report
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { createProject, createForecastEntry } from '../helpers/fixtures.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'rpt';

let adminCookies, engenheiroCookies;
let project;

beforeAll(async () => {
  await cleanTables('forecast_entries', 'project_notes', 'projects', 'users', 'project_assignments');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: engenheiroCookies } = await loginAs(app, engUser));

  project = await createProject({ code: 'RPT-PROJECT-001', name: 'Projeto Relatório' });

  const year = new Date().getFullYear();
  await createForecastEntry({ project_id: project.id, category: 'Viagens', type: 'Budget', year, month: 1, value: 10000 });
  await createForecastEntry({ project_id: project.id, category: 'Viagens', type: 'Forecast', year, month: 1, value: 15000 });
  await createForecastEntry({ project_id: project.id, category: 'Viagens', type: 'Actual', year, month: 1, value: 12000 });
});

afterAll(async () => {
  await cleanTables('forecast_entries', 'project_notes', 'projects', 'users', 'project_assignments');
});

// ──────────────────────────────────────────────────────────────
// GET /api/report/data — Dados do relatório geral
// ──────────────────────────────────────────────────────────────
describe('GET /api/report/data', () => {
  it('admin pode obter dados do relatório', async () => {
    const res = await request(app)
      .get('/api/report/data')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('projects');
    expect(res.body).toHaveProperty('polos');
    expect(res.body).toHaveProperty('kpis');
    expect(res.body).toHaveProperty('yearStart');
    expect(res.body).toHaveProperty('yearEnd');
  });

  it('engenheiro pode obter dados do relatório', async () => {
    const res = await request(app)
      .get('/api/report/data')
      .set('Cookie', cookieHeader(engenheiroCookies));

    expect(res.status).toBe(200);
  });

  it('retorna KPIs com valores corretos', async () => {
    const res = await request(app)
      .get('/api/report/data')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.kpis).toHaveProperty('budget');
    expect(res.body.kpis).toHaveProperty('forecast');
    expect(res.body.kpis).toHaveProperty('actual');
    expect(res.body.kpis).toHaveProperty('pool');
    expect(res.body.kpis).toHaveProperty('si');
  });

  it('filtra por ano específico', async () => {
    const year = new Date().getFullYear();
    const res = await request(app)
      .get('/api/report/data')
      .query({ yearStart: year, yearEnd: year })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.yearStart).toBe(year);
    expect(res.body.yearEnd).toBe(year);
  });

  it('filtra por range de anos', async () => {
    const year = new Date().getFullYear();
    const res = await request(app)
      .get('/api/report/data')
      .query({ yearStart: year - 1, yearEnd: year + 1 })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.yearStart).toBe(year - 1);
    expect(res.body.yearEnd).toBe(year + 1);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/report/data');

    expect(res.status).toBe(401);
  });
});
