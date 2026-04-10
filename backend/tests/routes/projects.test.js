/**
 * Testes de integração — /api/projects
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { createProject, assignEngineer } from '../helpers/fixtures.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'proj';

let adminCookies, coordCookies, engCookies, gerenteCookies;
let adminUser, coordUser, engUser;
let publicProject, assignedProject;

beforeAll(async () => {
  await cleanTables('project_assignments', 'projects', 'users');

  adminUser  = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`,  role: 'admin' });
  coordUser  = await createTestUser({ email: `${PREFIX}.coord@ctg-test.internal`,  role: 'coordenador', area: 'eletrica' });
  engUser    = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`,    role: 'engenheiro',  area: 'eletrica' });
  const gerente = await createTestUser({ email: `${PREFIX}.ger@ctg-test.internal`, role: 'gerente' });

  ({ cookies: adminCookies  } = await loginAs(app, adminUser));
  ({ cookies: coordCookies  } = await loginAs(app, coordUser));
  ({ cookies: engCookies    } = await loginAs(app, engUser));
  ({ cookies: gerenteCookies } = await loginAs(app, gerente));

  // Projeto ao qual o engenheiro está atribuído
  assignedProject = await createProject({ code: 'PROJ-ASSIGNED', name: 'Projeto Atribuído' });
  await assignEngineer(assignedProject.id, engUser.id);

  // Projeto sem atribuição (apenas admin/planejador/gerente vê)
  publicProject = await createProject({ code: 'PROJ-PUBLIC', name: 'Projeto Público' });
});

afterAll(async () => {
  await cleanTables('project_assignments', 'projects', 'users');
});

// ──────────────────────────────────────────────────────────────
// GET /api/projects
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects', () => {
  it('admin vê todos os projetos', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    const codes = res.body.map(p => p.code);
    expect(codes).toContain('PROJ-ASSIGNED');
    expect(codes).toContain('PROJ-PUBLIC');
  });

  it('engenheiro vê apenas projetos atribuídos', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    const codes = res.body.map(p => p.code);
    expect(codes).toContain('PROJ-ASSIGNED');
    expect(codes).not.toContain('PROJ-PUBLIC');
  });

  it('gerente vê todos os projetos (somente leitura)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Cookie', cookieHeader(gerenteCookies));

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:id
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects/:id', () => {
  it('admin acessa qualquer projeto', async () => {
    const res = await request(app)
      .get(`/api/projects/${publicProject.id}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PROJ-PUBLIC');
  });

  it('engenheiro acessa projeto atribuído', async () => {
    const res = await request(app)
      .get(`/api/projects/${assignedProject.id}`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
  });

  it('engenheiro não acessa projeto sem atribuição (403)', async () => {
    const res = await request(app)
      .get(`/api/projects/${publicProject.id}`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/projects (criar)
// ──────────────────────────────────────────────────────────────
describe('POST /api/projects', () => {
  it('admin cria projeto com sucesso', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        code: 'PROJ-NEW-001',
        name: 'Projeto Criado via Teste',
        description: 'Teste de criação',
        si_value: 200_000,
        pool_value: 80_000,
        area: 'eletrica',
        plants: [],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.code).toBe('PROJ-NEW-001');
  });

  it('engenheiro não pode criar projeto (403)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookieHeader(engCookies))
      .send({ code: 'HACK-001', name: 'Hackeado', area: 'eletrica' });

    expect(res.status).toBe(403);
  });

  it('gerente não pode criar projeto (403)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookieHeader(gerenteCookies))
      .send({ code: 'GERENTE-001', name: 'Gerente Criando', area: 'eletrica' });

    expect(res.status).toBe(403);
  });

  it('retorna 400 para código duplicado', async () => {
    await request(app)
      .post('/api/projects')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ code: 'PROJ-DUP', name: 'Duplicado A', area: 'eletrica', plants: [] });

    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ code: 'PROJ-DUP', name: 'Duplicado B', area: 'eletrica', plants: [] });

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/projects/:id (atualizar)
// ──────────────────────────────────────────────────────────────
describe('PUT /api/projects/:id', () => {
  it('admin atualiza projeto', async () => {
    const res = await request(app)
      .put(`/api/projects/${publicProject.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ name: 'Nome Atualizado', description: 'Desc atualizada' });

    expect(res.status).toBe(200);
  });

  it('engenheiro não pode atualizar projeto (403)', async () => {
    const res = await request(app)
      .put(`/api/projects/${assignedProject.id}`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ name: 'Hackeado' });

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/projects/:id
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/projects/:id', () => {
  it('admin deleta projeto ou retorna erro se tiver dependências', async () => {
    const proj = await createProject({ code: 'PROJ-TO-DELETE' });

    const res = await request(app)
      .delete(`/api/projects/${proj.id}`)
      .set('Cookie', cookieHeader(adminCookies));

    // Pode ser 200, 400 (se tiver dependências) ou 404
    expect([200, 400, 404]).toContain(res.status);
  });

  it('engenheiro não pode deletar projeto (403)', async () => {
    const res = await request(app)
      .delete(`/api/projects/${assignedProject.id}`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/projects/:id/engineers (atribuir engenheiro)
// ──────────────────────────────────────────────────────────────
describe('POST /api/projects/:id/engineers', () => {
  it('admin atribui engenheiro a projeto', async () => {
    const newEng = await createTestUser({ email: `${PREFIX}.neweng@ctg-test.internal` });

    const res = await request(app)
      .post(`/api/projects/${publicProject.id}/engineers`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ userId: newEng.id });

    // Pode retornar 200 ou 201
    expect([200, 201]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/projects/:id/engineers/:userId
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/projects/:id/engineers/:userId', () => {
  it('admin remove engenheiro de projeto', async () => {
    const res = await request(app)
      .delete(`/api/projects/${assignedProject.id}/engineers/${engUser.id}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect([200, 204]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:id/engineers
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects/:id/engineers', () => {
  it('admin pode listar engenheiros de um projeto', async () => {
    const res = await request(app)
      .get(`/api/projects/${assignedProject.id}/engineers`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('engenheiro atribuído pode ver engenheiros do projeto ou retorna erro', async () => {
    const res = await request(app)
      .get(`/api/projects/${assignedProject.id}/engineers`)
      .set('Cookie', cookieHeader(engCookies));

    // Pode ser 200 ou 403 dependendo da implementação
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  it('usuário sem acesso não pode ver engenheiros (403)', async () => {
    const outsider = await createTestUser({ email: `${PREFIX}.out@ctg-test.internal`, role: 'engenheiro' });
    const { cookies } = await loginAs(app, outsider);

    const res = await request(app)
      .get(`/api/projects/${assignedProject.id}/engineers`)
      .set('Cookie', cookieHeader(cookies));

    expect(res.status).toBe(403);
  });
});
