/**
 * Testes de integração — /api/auth
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'auth';

// ──────────────────────────────────────────────────────────────
// Setup / Teardown
// ──────────────────────────────────────────────────────────────
beforeAll(async () => {
  await cleanTables('users');
});

afterAll(async () => {
  await cleanTables('users');
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('retorna 200 e cookie com credenciais válidas', async () => {
    const user = await createTestUser({ email: `${PREFIX}.ok@ctg-test.internal` });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: user.email, role: 'engenheiro' });
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('retorna 401 para senha incorreta', async () => {
    const user = await createTestUser({ email: `${PREFIX}.wrong@ctg-test.internal` });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'SenhaErrada@999' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 401 para e-mail inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ninguem@ctg-test.internal', password: 'qualquer' });

    expect(res.status).toBe(401);
  });

  it('retorna 401 ou 403 para conta aguardando aprovação', async () => {
    const user = await createTestUser({
      email: `${PREFIX}.pending@ctg-test.internal`,
      active: false,
      pending_approval: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    // Pode ser 401 ou 403 dependendo da implementação
    expect([401, 403]).toContain(res.status);
  });

  it('retorna 400 quando email ou senha estão ausentes', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alguem@ctg-test.internal' });

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('retorna dados do usuário autenticado', async () => {
    const user = await createTestUser({ email: `${PREFIX}.me@ctg-test.internal` });
    const { cookies } = await loginAs(app, user);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader(cookies));

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token inválido', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'ctg_token=token_invalido');

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ──────────────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  it('retorna 200 e limpa o cookie', async () => {
    const user = await createTestUser({ email: `${PREFIX}.logout@ctg-test.internal` });
    const { cookies } = await loginAs(app, user);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader(cookies));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/change-password
// ──────────────────────────────────────────────────────────────
describe('POST /api/auth/change-password', () => {
  it('altera a senha com sucesso', async () => {
    const user = await createTestUser({ email: `${PREFIX}.chpw@ctg-test.internal` });
    const { cookies } = await loginAs(app, user);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookieHeader(cookies))
      .send({
        current_password: user.password,
        new_password: 'NovaSenha@Forte456',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('retorna 401 para senha atual incorreta', async () => {
    const user = await createTestUser({ email: `${PREFIX}.chpw2@ctg-test.internal` });
    const { cookies } = await loginAs(app, user);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookieHeader(cookies))
      .send({
        current_password: 'SenhaErrada@999',
        new_password: 'NovaSenha@Forte456',
      });

    expect(res.status).toBe(401);
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ current_password: 'x', new_password: 'y' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('cria conta pendente de aprovação', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Novo Engenheiro',
        email: `${PREFIX}.reg@ctg-test.internal`,
        password: 'Registro@Forte123',
        role: 'engenheiro',
        area: 'eletrica',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message');
  });

  it('retorna 400 para e-mail duplicado', async () => {
    const email = `${PREFIX}.dup@ctg-test.internal`;
    await createTestUser({ email });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicado',
        email,
        password: 'Duplicado@123',
        role: 'engenheiro',
        area: 'eletrica',
      });

    expect(res.status).toBe(400);
  });

  it('retorna 400 para role inválida', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Role Inválida',
        email: `${PREFIX}.badrole@ctg-test.internal`,
        password: 'Valida@123',
        role: 'superadmin',
        area: 'eletrica',
      });

    expect(res.status).toBe(400);
  });

  it('retorna 400 para senha fraca', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Senha Fraca',
        email: `${PREFIX}.weakpw@ctg-test.internal`,
        password: '123',
        role: 'engenheiro',
        area: 'eletrica',
      });

    expect(res.status).toBe(400);
  });
});
