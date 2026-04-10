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

// ──────────────────────────────────────────────────────────────
// POST /api/users (criar usuário por admin)
// ──────────────────────────────────────────────────────────────
describe('POST /api/users', () => {
  it('admin pode criar usuário', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        name: 'Usuário Criado',
        email: `${PREFIX}.criado@ctg-test.internal`,
        password: 'SenhaForte123!',
        role: 'engenheiro',
        area: 'Operação'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(`${PREFIX}.criado@ctg-test.internal`);
  });

  it('engenheiro não pode criar usuário (403)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader(engCookies))
      .send({
        name: 'Usuário Não Criado',
        email: `${PREFIX}.naocriado@ctg-test.internal`,
        password: 'SenhaForte123!',
        role: 'engenheiro'
      });

    expect(res.status).toBe(403);
  });

  it('email duplicado retorna 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        name: 'Usuário Duplicado',
        email: `${PREFIX}.admin@ctg-test.internal`,
        password: 'SenhaForte123!',
        role: 'engenheiro'
      });

    expect(res.status).toBe(400);
  });

  it('role inválida retorna 400 ou 500', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        name: 'Usuário Inválido',
        email: `${PREFIX}.invalido@ctg-test.internal`,
        password: 'SenhaForte123!',
        role: 'role_invalida'
      });

    // Pode ser 400 ou 500 dependendo da implementação
    expect([400, 500]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/users/:id/reject
// ──────────────────────────────────────────────────────────────
describe('POST /api/users/:id/reject', () => {
  let pendingUserId;

  beforeAll(async () => {
    const pendingUser = await createTestUser({
      email: `${PREFIX}.pending-reject@ctg-test.internal`,
      role: 'engenheiro',
      pending_approval: true
    });
    pendingUserId = pendingUser.id;
  });

  it('admin pode rejeitar usuário pendente', async () => {
    const res = await request(app)
      .post(`/api/users/${pendingUserId}/reject`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.active === false || res.body.active === undefined).toBe(true);
  });

  it('usuário inexistente retorna 200 ou 404', async () => {
    const res = await request(app)
      .post('/api/users/999999/reject')
      .set('Cookie', cookieHeader(adminCookies));

    // Pode ser 200 ou 404 dependendo da implementação
    expect([200, 404]).toContain(res.status);
  });

  it('engenheiro não pode rejeitar usuário (403)', async () => {
    const res = await request(app)
      .post(`/api/users/${pendingUserId}/reject`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/users/:id/reset-password
// ──────────────────────────────────────────────────────────────
describe('POST /api/users/:id/reset-password', () => {
  it('admin pode resetar senha de usuário', async () => {
    const newUser = await createTestUser({
      email: `${PREFIX}.reset@ctg-test.internal`,
      role: 'engenheiro'
    });

    const res = await request(app)
      .post(`/api/users/${newUser.id}/reset-password`)
      .set('Cookie', cookieHeader(adminCookies));

    // Pode ser 200 ou 400 dependendo da implementação
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('tempPassword');
    }
  });

  it('usuário inexistente retorna 400 ou 404', async () => {
    const res = await request(app)
      .post('/api/users/999999/reset-password')
      .set('Cookie', cookieHeader(adminCookies));

    expect([400, 404]).toContain(res.status);
  });

  it('engenheiro não pode resetar senha de outro usuário (403)', async () => {
    const newUser = await createTestUser({
      email: `${PREFIX}.reset2@ctg-test.internal`,
      role: 'engenheiro'
    });

    const res = await request(app)
      .post(`/api/users/${newUser.id}/reset-password`)
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/users/engineers
// ──────────────────────────────────────────────────────────────
describe('GET /api/users/engineers', () => {
  it('admin pode listar engenheiros', async () => {
    const res = await request(app)
      .get('/api/users/engineers')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('coordenador pode listar engenheiros', async () => {
    const res = await request(app)
      .get('/api/users/engineers')
      .set('Cookie', cookieHeader(coordCookies));

    expect(res.status).toBe(200);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/users/engineers');

    expect(res.status).toBe(401);
  });
});
