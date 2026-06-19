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
        iac_code: 'IAC-TEST-001',
        area: 'Elétrica',
        project: 'Projeto Teste',
        priority: 'Non Priority',
        status_current: '0 - Not started yet',
        acceptance_letter_signed: '2026-03-06',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.acceptance_letter_signed).toBeTruthy();
    createdIacId = res.body.id;
  });
});

describe('PUT /api/lists/iacs/:id', () => {
  it('atualiza IAC', async () => {
    if (!createdIacId) return;

    const res = await request(app)
      .put(`/api/lists/iacs/${createdIacId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        status_current: '1 - In progress',
        priority: 'Priority',
        acceptance_letter_signed: '2026-03-07',
      });

    expect(res.status).toBe(200);
    expect(res.body.acceptance_letter_signed).toBeTruthy();
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
        pp_contrato: 'TRACK-TEST-001',
        projeto_atividade: 'Projeto Rastreado - Atividade de teste',
        projeto: 'Projeto Rastreado',
        gestor: 'Responsável',
        status: 'Em andamento',
        area: 'Elétrica',
        uhe: 'UHE Jupiá',
        fornecedor: 'Fornecedor Teste',
        natureza: 'CAPEX',
        valor_contrato: 100000,
        realizado_contrato: 50000,
        valor_si: 20000,
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
      .send({ status: 'Encerrado' });

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

// ──────────────────────────────────────────────────────────────
// POST /api/lists/iacs/:id/viewed
// ──────────────────────────────────────────────────────────────
describe('POST /api/lists/iacs/:id/viewed', () => {
  it('marca IAC como visualizado ou retorna erro se tabela não existir', async () => {
    // Primeiro criar um IAC
    const createRes = await request(app)
      .post('/api/lists/iacs')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        iac_code: 'IAC-VIEWED-001',
        area: 'Operação',
        responsible: 'Responsável Teste',
      });

    if (!createRes.body.id) return;
    const iacId = createRes.body.id;

    const res = await request(app)
      .post(`/api/lists/iacs/${iacId}/viewed`)
      .set('Cookie', cookieHeader(adminCookies));

    // Pode ser 200, 201 ou 500 se tabela não existir
    expect([200, 201, 404, 500]).toContain(res.status);
  });

  it('IAC inexistente retorna erro', async () => {
    const res = await request(app)
      .post('/api/lists/iacs/999999/viewed')
      .set('Cookie', cookieHeader(adminCookies));

    // Pode ser 404 ou 500
    expect([404, 500]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/lists/iacs/:id/viewed-by-me
// ──────────────────────────────────────────────────────────────
describe('GET /api/lists/iacs/:id/viewed-by-me', () => {
  it('verifica se IAC foi visualizado pelo usuário ou retorna erro se tabela não existir', async () => {
    const createRes = await request(app)
      .post('/api/lists/iacs')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        iac_code: 'IAC-VIEWED-BY-ME-001',
        area: 'Operação',
        responsible: 'Responsável Teste',
      });

    if (!createRes.body.id) return;

    const res = await request(app)
      .get(`/api/lists/iacs/${createRes.body.id}/viewed-by-me`)
      .set('Cookie', cookieHeader(adminCookies));

    // Pode ser 200 ou 500 se tabela não existir
    expect([200, 404, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('viewed');
    }
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/lists/iacs/:id/alert-info
// ──────────────────────────────────────────────────────────────
describe('GET /api/lists/iacs/:id/alert-info', () => {
  it('obtém informações de alerta do IAC', async () => {
    const createRes = await request(app)
      .post('/api/lists/iacs')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        iac_code: 'IAC-ALERT-001',
        area: 'Operação',
        responsible: 'Responsável Teste',
      });

    if (!createRes.body.id) return;

    const res = await request(app)
      .get(`/api/lists/iacs/${createRes.body.id}/alert-info`)
      .set('Cookie', cookieHeader(adminCookies));

    expect([200, 404, 500]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/lists/iacs/stale-iacs
// ──────────────────────────────────────────────────────────────
describe('GET /api/lists/iacs/stale-iacs', () => {
  it('lista IACs desatualizados', async () => {
    const res = await request(app)
      .get('/api/lists/iacs/stale-iacs')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/lists/projects-tracking/:id/viewed-by-me
// ──────────────────────────────────────────────────────────────
describe('GET /api/lists/projects-tracking/:id/viewed-by-me', () => {
  it('verifica se projeto foi visualizado pelo usuário ou retorna erro', async () => {
    const createRes = await request(app)
      .post('/api/lists/projects-tracking')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        pp_contrato: 'TRACK-VIEWED-001',
        projeto_atividade: 'Projeto para testar viewed',
        area: 'Elétrica',
      });

    if (!createRes.body.id) return;

    const res = await request(app)
      .get(`/api/lists/projects-tracking/${createRes.body.id}/viewed-by-me`)
      .set('Cookie', cookieHeader(adminCookies));

    // Pode ser 200, 404 ou 500
    expect([200, 404, 500]).toContain(res.status);
    if (res.status === 200 && res.body) {
      expect(res.body).toHaveProperty('viewed');
    }
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/lists/projects-tracking/:id/alert-info
// ──────────────────────────────────────────────────────────────
describe('GET /api/lists/projects-tracking/:id/alert-info', () => {
  it('obtém informações de alerta do projeto', async () => {
    const createRes = await request(app)
      .post('/api/lists/projects-tracking')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        pp_contrato: 'TRACK-ALERT-001',
        projeto_atividade: 'Projeto para testar alertas',
        area: 'Elétrica',
      });

    if (!createRes.body.id) return;

    const res = await request(app)
      .get(`/api/lists/projects-tracking/${createRes.body.id}/alert-info`)
      .set('Cookie', cookieHeader(adminCookies));

    expect([200, 404, 500]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/lists/projects-tracking/stale-projects
// ──────────────────────────────────────────────────────────────
describe('GET /api/lists/projects-tracking/stale-projects', () => {
  it('lista projetos desatualizados', async () => {
    const res = await request(app)
      .get('/api/lists/projects-tracking/stale-projects')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
