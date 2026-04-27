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

let adminCookies, engCookies, outsiderCookies;
let engUser, project;

beforeAll(async () => {
  await cleanTables('message_reads', 'messages', 'project_assignments', 'projects', 'users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro' });
  const outsider = await createTestUser({ email: `${PREFIX}.out@ctg-test.internal`, role: 'engenheiro' });

  ({ cookies: adminCookies  } = await loginAs(app, adminUser));
  ({ cookies: engCookies    } = await loginAs(app, engUser));
  ({ cookies: outsiderCookies } = await loginAs(app, outsider));

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
  it('engenheiro envia mensagem no projeto atribuído', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ content: 'Mensagem de teste do engenheiro' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.content).toBe('Mensagem de teste do engenheiro');
    expect(res.body.is_read).toBe(true);
  });

  it('admin envia mensagem no projeto', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ content: 'Mensagem do administrador' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('mensagem vazia retorna 400', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  it('mensagem só com espaços retorna 400', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ content: '   ' });

    expect(res.status).toBe(400);
  });

  it('mensagem muito longa (>2000 chars) retorna 400', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ content: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
  });

  it('usuário sem acesso ao projeto recebe 403', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(outsiderCookies))
      .send({ content: 'Invasão' });

    expect(res.status).toBe(403);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .send({ content: 'Não autorizado' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/messages
// ──────────────────────────────────────────────────────────────
describe('GET /api/projects/:projectId/messages', () => {
  it('lista mensagens do projeto e marca como lidas', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const msg = res.body[0];
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('content');
      expect(msg).toHaveProperty('user_name');
      expect(msg).toHaveProperty('is_read');
      expect(msg).not.toHaveProperty('password_hash');
    }
  });

  it('admin pode ler mensagens de qualquer projeto', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('usuário sem acesso recebe 403', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(outsiderCookies));

    expect(res.status).toBe(403);
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
  it('retorna contagem de não lidas como número inteiro', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages/unread-count`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('unread');
    expect(typeof res.body.unread).toBe('number');
    expect(res.body.unread).toBeGreaterThanOrEqual(0);
  });

  it('após ler mensagens, unread-count é zero para o mesmo usuário', async () => {
    // Garante que há ao menos uma mensagem
    await request(app)
      .post(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ content: 'Mensagem para testar unread' });

    // Admin lê as mensagens (GET marca como lido automaticamente)
    await request(app)
      .get(`/api/projects/${project.id}/messages`)
      .set('Cookie', cookieHeader(adminCookies));

    // Unread deve ser 0 para admin pois GET já marca como lido
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages/unread-count`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(0);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/messages/unread-count`);

    expect(res.status).toBe(401);
  });
});
