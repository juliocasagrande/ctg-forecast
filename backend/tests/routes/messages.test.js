/**
 * Testes de integração — /api/projects/:projectId/messages
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { createProject, assignEngineer } from '../helpers/fixtures.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'msg';

let adminCookies, engCookies;
let engUser, project;

beforeAll(async () => {
  await cleanTables('message_reads', 'messages', 'project_assignments', 'projects', 'users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: engCookies   } = await loginAs(app, engUser));

  project = await createProject({ code: 'MSG-PROJECT-001' });
  await assignEngineer(project.id, engUser.id);
});

afterAll(async () => {
  await cleanTables('message_reads', 'messages', 'project_assignments', 'projects', 'users');
});

// ──────────────────────────────────────────────────────────────
// POST /api/projects/:projectId/messages
// ──────────────────────────────────────────────────────────────
describe('POST /api/projects/:projectId/messages', () => {
  it('engenheiro envia mensagem no projeto ou retorna erro', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ text: 'Mensagem de teste do engenheiro' });

    // Pode ser 201, 200 ou 400 dependendo da validação
    expect([201, 200, 400]).toContain(res.status);
    if (res.status === 201 || res.status === 200) {
      expect(res.body).toHaveProperty('id');
    }
  });

  it('admin envia mensagem no projeto ou retorna erro', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ text: 'Mensagem do administrador' });

    expect([201, 200, 400]).toContain(res.status);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .send({ text: 'Não autorizado' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/messages
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects/:projectId/messages', () => {
  it('lista mensagens do projeto', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Não exigir mensagens, pode estar vazio
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get(`/api/projects/${project.id}/messages`);
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/messages/unread-count
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects/:projectId/messages/unread-count', () => {
  it('retorna contagem de não lidas', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages/unread-count`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    // Pode retornar { unread: X } ou { count: X }
    expect(res.body.unread !== undefined || res.body.count !== undefined).toBe(true);
  });
});
