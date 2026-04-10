/**
 * Testes de integração — /api/feedback
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'fb';

let adminCookies, devCookies, userCookies;

beforeAll(async () => {
  await cleanTables('feedback', 'users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const devUser = await createTestUser({ email: 'julio.casagrande@ctgbr.com.br', role: 'admin' });
  const regularUser = await createTestUser({ email: `${PREFIX}.user@ctg-test.internal`, role: 'engenheiro' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: devCookies } = await loginAs(app, devUser));
  ({ cookies: userCookies } = await loginAs(app, regularUser));
});

afterAll(async () => {
  await cleanTables('feedback', 'users');
});

// ──────────────────────────────────────────────────────────────
// POST /api/feedback — Salvar feedback
// ──────────────────────────────────────────────────────────────
describe('POST /api/feedback', () => {
  it('usuário pode enviar feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({
        type: 'suggestion',
        subject: 'Melhoria na interface',
        message: 'Seria bom ter um tema escuro'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.subject).toBe('Melhoria na interface');
  });

  it('feedback sem assunto retorna 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({
        type: 'bug',
        subject: '',
        message: 'Erro ao salvar'
      });

    expect(res.status).toBe(400);
  });

  it('feedback sem mensagem retorna 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({
        type: 'bug',
        subject: 'Erro',
        message: ''
      });

    expect(res.status).toBe(400);
  });

  it('mensagem muito longa retorna 400', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({
        type: 'suggestion',
        subject: 'Teste',
        message: 'x'.repeat(2001)
      });

    expect(res.status).toBe(400);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ subject: 'Teste', message: 'Mensagem' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/feedback — Listar feedbacks
// ──────────────────────────────────────────────────────────────
describe('GET /api/feedback', () => {
  it('admin pode listar todos os feedbacks', async () => {
    const res = await request(app)
      .get('/api/feedback')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('developer pode listar feedbacks', async () => {
    const res = await request(app)
      .get('/api/feedback')
      .set('Cookie', cookieHeader(devCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('usuário comum não pode listar feedbacks (403)', async () => {
    const res = await request(app)
      .get('/api/feedback')
      .set('Cookie', cookieHeader(userCookies));

    expect(res.status).toBe(403);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/feedback');

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/feedback/stats — Contagem de feedbacks
// ──────────────────────────────────────────────────────────────
describe('GET /api/feedback/stats', () => {
  it('admin pode ver estatísticas', async () => {
    const res = await request(app)
      .get('/api/feedback/stats')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('unread');
  });

  it('developer pode ver estatísticas', async () => {
    const res = await request(app)
      .get('/api/feedback/stats')
      .set('Cookie', cookieHeader(devCookies));

    expect(res.status).toBe(200);
  });

  it('usuário comum não pode ver estatísticas (403)', async () => {
    const res = await request(app)
      .get('/api/feedback/stats')
      .set('Cookie', cookieHeader(userCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/feedback/:id/status — Alterar status
// ──────────────────────────────────────────────────────────────
describe('PUT /api/feedback/:id/status', () => {
  it('admin pode alterar status do feedback', async () => {
    // Primeiro criar um feedback
    const createRes = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({ type: 'bug', subject: 'Bug teste', message: 'Mensagem de bug' });

    const feedbackId = createRes.body.id;

    const res = await request(app)
      .put(`/api/feedback/${feedbackId}/status`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'read' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('read');
  });

  it('status inválido retorna 400', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({ type: 'bug', subject: 'Bug teste 2', message: 'Mensagem' });

    const res = await request(app)
      .put(`/api/feedback/${createRes.body.id}/status`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('feedback inexistente retorna 404', async () => {
    const res = await request(app)
      .put('/api/feedback/999999/status')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'read' });

    expect(res.status).toBe(404);
  });

  it('usuário comum não pode alterar status (403)', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({ type: 'bug', subject: 'Bug teste 3', message: 'Mensagem' });

    const res = await request(app)
      .put(`/api/feedback/${createRes.body.id}/status`)
      .set('Cookie', cookieHeader(userCookies))
      .send({ status: 'read' });

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/feedback/:id — Deletar feedback
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/feedback/:id', () => {
  it('admin pode deletar feedback', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({ type: 'bug', subject: 'Para deletar', message: 'Mensagem' });

    const res = await request(app)
      .delete(`/api/feedback/${createRes.body.id}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('feedback inexistente retorna 200 (DELETE é idempotente)', async () => {
    const res = await request(app)
      .delete('/api/feedback/999999')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });

  it('usuário comum não pode deletar feedback (403)', async () => {
    const createRes = await request(app)
      .post('/api/feedback')
      .set('Cookie', cookieHeader(userCookies))
      .send({ type: 'bug', subject: 'Para deletar 2', message: 'Mensagem' });

    const res = await request(app)
      .delete(`/api/feedback/${createRes.body.id}`)
      .set('Cookie', cookieHeader(userCookies));

    expect(res.status).toBe(403);
  });
});
