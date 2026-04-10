/**
 * Testes de integração — /api/export
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { createProject, assignEngineer, createForecastEntry } from '../helpers/fixtures.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'exp';

let adminCookies, engenheiroCookies;
let project;

beforeAll(async () => {
  await cleanTables('forecast_entries', 'projects', 'users', 'project_assignments');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: engenheiroCookies } = await loginAs(app, engUser));

  project = await createProject({ code: 'EXP-PROJECT-001', name: 'Projeto Export' });
  await assignEngineer(project.id, engUser.id);

  // Add some forecast entries for export
  const year = new Date().getFullYear();
  await createForecastEntry({ project_id: project.id, category: 'Viagens', type: 'Budget', year, month: 1, value: 1000 });
  await createForecastEntry({ project_id: project.id, category: 'Viagens', type: 'Forecast', year, month: 1, value: 1500 });
  await createForecastEntry({ project_id: project.id, category: 'Contratos', type: 'Budget', year, month: 1, value: 5000 });
});

afterAll(async () => {
  await cleanTables('forecast_entries', 'projects', 'users', 'project_assignments');
});

// ──────────────────────────────────────────────────────────────
// GET /api/export/project/:id — Export Excel de um projeto
// ──────────────────────────────────────────────────────────────
describe('GET /api/export/project/:id', () => {
  it('admin pode exportar projeto como Excel', async () => {
    const res = await request(app)
      .get(`/api/export/project/${project.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats');
    expect(res.body).toBeInstanceOf(Buffer);
  });

  it('engenheiro pode exportar projeto atribuído', async () => {
    const res = await request(app)
      .get(`/api/export/project/${project.id}`)
      .set('Cookie', cookieHeader(engenheiroCookies))
      .responseType('blob');

    expect(res.status).toBe(200);
  });

  it('engenheiro sem acesso recebe 403', async () => {
    const outsider = await createTestUser({ email: `${PREFIX}.out@ctg-test.internal`, role: 'engenheiro' });
    const { cookies } = await loginAs(app, outsider);

    const res = await request(app)
      .get(`/api/export/project/${project.id}`)
      .set('Cookie', cookieHeader(cookies));

    expect(res.status).toBe(403);
  });

  it('projeto inexistente retorna 404', async () => {
    const res = await request(app)
      .get('/api/export/project/999999')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(404);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get(`/api/export/project/${project.id}`);

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/export/planejador — Export Excel de todos os projetos
// ──────────────────────────────────────────────────────────────
describe('GET /api/export/planejador', () => {
  it('admin pode exportar todos os projetos', async () => {
    const res = await request(app)
      .get('/api/export/planejador')
      .set('Cookie', cookieHeader(adminCookies))
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats');
  });

  it('planejador pode exportar todos os projetos', async () => {
    const planejador = await createTestUser({ email: `${PREFIX}.plan@ctg-test.internal`, role: 'planejador' });
    const { cookies } = await loginAs(app, planejador);

    const res = await request(app)
      .get('/api/export/planejador')
      .set('Cookie', cookieHeader(cookies))
      .responseType('blob');

    expect(res.status).toBe(200);
  });

  it('coordenador pode exportar todos os projetos', async () => {
    const coordenador = await createTestUser({ email: `${PREFIX}.coord@ctg-test.internal`, role: 'coordenador' });
    const { cookies } = await loginAs(app, coordenador);

    const res = await request(app)
      .get('/api/export/planejador')
      .set('Cookie', cookieHeader(cookies))
      .responseType('blob');

    expect(res.status).toBe(200);
  });

  it('engenheiro pode exportar apenas projetos atribuídos', async () => {
    const res = await request(app)
      .get('/api/export/planejador')
      .set('Cookie', cookieHeader(engenheiroCookies))
      .responseType('blob');

    expect(res.status).toBe(200);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/export/planejador');

    expect(res.status).toBe(401);
  });
});
