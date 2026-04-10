/**
 * Testes de integração — /api/users
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'usr';

let adminCookies, coordCookies, engCookies;
let adminUser, engUser, pendingUser;

beforeAll(async () => {
  await cleanTables('users');

  adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const coordUser = await createTestUser({ email: `${PREFIX}.coord@ctg-test.internal`, role: 'coordenador' });
  engUser   = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`,   role: 'engenheiro' });
  pendingUser = await createTestUser({
    email: `${PREFIX}.pending@ctg-test.internal`,
    role: 'engenheiro',
    active: false,
    pending_approval: true,
  });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: coordCookies } = await loginAs(app, coordUser));
  ({ cookies: engCookies   } = await loginAs(app, engUser));
});

afterAll(async () => {
  await cleanTables('users');
});

// ──────────────────────────────────────────────────────────────
// GET /api/users
// ──────────────────────────────────────────────────────────────
describe('GET /api/users', () => {
  it('admin recebe lista de usuários', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Não deve expor password_hash
    res.body.forEach(u => expect(u).not.toHaveProperty('password_hash'));
  });

  it('engenheiro não pode listar usuários (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });

  it('requisição sem auth retorna 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/users/pending
// ──────────────────────────────────────────────────────────────
describe('GET /api/users/pending', () => {
  it('admin vê usuários pendentes', async () => {
    const res = await request(app)
      .get('/api/users/pending')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const emails = res.body.map(u => u.email);
    expect(emails).toContain(pendingUser.email);
  });

  it('não-admin recebe 403', async () => {
    const res = await request(app)
      .get('/api/users/pending')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/users/:id/approve
// ──────────────────────────────────────────────────────────────
describe('POST /api/users/:id/approve', () => {
  it('admin aprova usuário pendente', async () => {
    const res = await request(app)
      .post(`/api/users/${pendingUser.id}/approve`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });

  it('não-admin não pode aprovar (403)', async () => {
    const res = await request(app)
      .post(`/api/users/${pendingUser.id}/approve`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/users/:id
// ──────────────────────────────────────────────────────────────
describe('PUT /api/users/:id', () => {
  it('admin atualiza dados do usuário', async () => {
    const res = await request(app)
      .put(`/api/users/${engUser.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ name: 'Engenheiro Atualizado', role: 'engenheiro', area: 'mecanica' });

    expect(res.status).toBe(200);
  });

  it('engenheiro não pode editar outros usuários (403)', async () => {
    const res = await request(app)
      .put(`/api/users/${adminUser.id}`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ name: 'Hackeado' });

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/users/:id/deactivate
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/users/:id (desativar)', () => {
  it('admin desativa usuário', async () => {
    const target = await createTestUser({ email: `${PREFIX}.todeactivate@ctg-test.internal` });

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });

  it('engenheiro não pode desativar usuários (403)', async () => {
    const target = await createTestUser({ email: `${PREFIX}.todeact2@ctg-test.internal` });

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/users/for-delegation
// ──────────────────────────────────────────────────────────────
describe('GET /api/users/for-delegation', () => {
  it('usuário autenticado pode listar usuários para delegação', async () => {
    const res = await request(app)
      .get('/api/users/for-delegation')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
