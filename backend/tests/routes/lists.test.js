/**
 * Testes de integração — /api/lists  (IACs e Rastreamento de Projetos)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'lst';

let adminCookies, engCookies;
let createdIacId, createdTrackId;

beforeAll(async () => {
  await cleanTables('lists_iacs', 'lists_projects_tracking', 'users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const engUser   = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`,   role: 'engenheiro' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: engCookies   } = await loginAs(app, engUser));
});

afterAll(async () => {
  await cleanTables('lists_iacs', 'lists_projects_tracking', 'users');
});

// ════════════════════════════════════════════════════════════════
// IACs
// ════════════════════════════════════════════════════════════════

describe('GET /api/lists/iacs', () => {
  it('lista IACs autenticado', async () => {
    const res = await request(app)
      .get('/api/lists/iacs')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/lists/iacs');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/lists/iacs', () => {
  it('cria IAC', async () => {
    const res = await request(app)
      .post('/api/lists/iacs')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        codigo:      'IAC-TEST-001',
        descricao:   'Descrição de teste',
        responsavel: 'Responsável Teste',
        status:      'aberto',
        area:        'eletrica',
        prioridade:  'alta',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    createdIacId = res.body.id;
  });
});

describe('PUT /api/lists/iacs/:id', () => {
  it('atualiza IAC', async () => {
    if (!createdIacId) return;

    const res = await request(app)
      .put(`/api/lists/iacs/${createdIacId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'em_andamento', prioridade: 'media' });

    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/lists/iacs/:id', () => {
  it('deleta IAC', async () => {
    if (!createdIacId) return;

    const res = await request(app)
      .delete(`/api/lists/iacs/${createdIacId}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect([200, 204]).toContain(res.status);
  });
});

// ════════════════════════════════════════════════════════════════
// Rastreamento de Projetos
// ════════════════════════════════════════════════════════════════

describe('GET /api/lists/projects-tracking', () => {
  it('lista rastreamentos autenticado', async () => {
    const res = await request(app)
      .get('/api/lists/projects-tracking')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/lists/projects-tracking');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/lists/projects-tracking', () => {
  it('cria registro de rastreamento', async () => {
    const res = await request(app)
      .post('/api/lists/projects-tracking')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        codigo:      'TRACK-TEST-001',
        nome:        'Projeto Rastreado',
        responsavel: 'Responsável',
        status:      'ativo',
        area:        'eletrica',
        prioridade:  'alta',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    createdTrackId = res.body.id;
  });
});

describe('PUT /api/lists/projects-tracking/:id', () => {
  it('atualiza rastreamento', async () => {
    if (!createdTrackId) return;

    const res = await request(app)
      .put(`/api/lists/projects-tracking/${createdTrackId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'concluido' });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/lists/projects-tracking/:id/viewed', () => {
  it('marca como visto pelo usuário', async () => {
    if (!createdTrackId) return;

    const res = await request(app)
      .post(`/api/lists/projects-tracking/${createdTrackId}/viewed`)
      .set('Cookie', cookieHeader(engCookies));

    expect([200, 201]).toContain(res.status);
  });
});

describe('DELETE /api/lists/projects-tracking/:id', () => {
  it('deleta rastreamento', async () => {
    if (!createdTrackId) return;

    const res = await request(app)
      .delete(`/api/lists/projects-tracking/${createdTrackId}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect([200, 204]).toContain(res.status);
  });
});
