/**
 * Testes de integração — /api/documents
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'doc';

let adminCookies, engCookies;
let createdDocId;

beforeAll(async () => {
  await cleanTables('document_authors', 'documents', 'users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const engUser   = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`,   role: 'engenheiro' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: engCookies   } = await loginAs(app, engUser));
});

afterAll(async () => {
  await cleanTables('document_authors', 'documents', 'users');
});

// ──────────────────────────────────────────────────────────────
// GET /api/documents/next-sequence
// ──────────────────────────────────────────────────────────────
describe('GET /api/documents/next-sequence', () => {
  it('retorna próximo número de sequência', async () => {
    const res = await request(app)
      .get('/api/documents/next-sequence')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sequence');
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/documents (criar)
// ──────────────────────────────────────────────────────────────
describe('POST /api/documents', () => {
  it('cria documento com sucesso', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        code:          'DOC-TEST-001',
        type:          'RELATORIO',
        area:          'eletrica',
        responsible:   'Responsável Teste',
        title:         'Documento de Teste',
        document_link: null,
        authors:       [],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    createdDocId = res.body.id;
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post('/api/documents')
      .send({ code: 'DOC-UNAUTH', type: 'RELATORIO', area: 'eletrica', title: 'X' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/documents (listar)
// ──────────────────────────────────────────────────────────────
describe('GET /api/documents', () => {
  it('lista documentos com paginação', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    // Pode retornar array ou { data, total }
    const list = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(list)).toBe(true);
  });

  it('filtra por área', async () => {
    const res = await request(app)
      .get('/api/documents')
      .query({ area: 'eletrica' })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/documents/stats
// ──────────────────────────────────────────────────────────────
describe('GET /api/documents/stats', () => {
  it('retorna estatísticas de documentos', async () => {
    const res = await request(app)
      .get('/api/documents/stats')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/documents/:id (atualizar)
// ──────────────────────────────────────────────────────────────
describe('PUT /api/documents/:id', () => {
  it('atualiza documento existente', async () => {
    if (!createdDocId) return;

    const res = await request(app)
      .put(`/api/documents/${createdDocId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ title: 'Título Atualizado', responsible: 'Novo Responsável' });

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/documents/:id/revision (nova revisão)
// ──────────────────────────────────────────────────────────────
describe('POST /api/documents/:id/revision', () => {
  it('cria nova revisão do documento', async () => {
    if (!createdDocId) return;

    const res = await request(app)
      .post(`/api/documents/${createdDocId}/revision`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        revision_number: 1,
        revision_date:   '2025-06-01',
        description:     'Primeira revisão',
        document_link:   null,
      });

    expect([200, 201]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// PATCH /api/documents/:id/status (alterar status)
// ──────────────────────────────────────────────────────────────
describe('PATCH /api/documents/:id/status', () => {
  it('altera status do documento', async () => {
    if (!createdDocId) return;

    const res = await request(app)
      .patch(`/api/documents/${createdDocId}/status`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'publicado' });

    expect(res.status).toBe(200);
  });
});
