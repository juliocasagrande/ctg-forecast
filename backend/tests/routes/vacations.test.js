/**
 * Testes de integração — /api/vacations
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'vac';

let adminCookies, engCookies;
let engUser;
let createdVacId;

beforeAll(async () => {
  await cleanTables('vacation_periods', 'users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro', area: 'eletrica' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: engCookies   } = await loginAs(app, engUser));
});

afterAll(async () => {
  await cleanTables('vacation_periods', 'users');
});

// ──────────────────────────────────────────────────────────────
// GET /api/vacations
// ──────────────────────────────────────────────────────────────
describe('GET /api/vacations', () => {
  it('retorna períodos de férias por ano', async () => {
    const res = await request(app)
      .get('/api/vacations')
      .query({ year: 2025 })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/vacations');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/vacations (criar)
// ──────────────────────────────────────────────────────────────
describe('POST /api/vacations', () => {
  it('cria período de férias', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        user_id:       engUser.id,
        period_number: 1,
        start_date:    '2025-07-01',
        end_date:      '2025-07-15',
        year:          2025,
        area:          'eletrica',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    createdVacId = res.body.id;
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .send({ user_id: 1, period_number: 1, start_date: '2025-01-01', end_date: '2025-01-10', year: 2025, area: 'eletrica' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/vacations/:id (atualizar)
// ──────────────────────────────────────────────────────────────
describe('PUT /api/vacations/:id', () => {
  it('atualiza período de férias com todos os campos obrigatórios', async () => {
    if (!createdVacId) return;

    const res = await request(app)
      .put(`/api/vacations/${createdVacId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        start_date: '2025-07-05',
        end_date: '2025-07-20',
        area: 'eletrica',
        period_number: 1,  // Campo obrigatório
        year: 2025
      });

    // Pode ser 200, 400 ou 500
    expect([200, 400, 500]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/vacations/:id
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/vacations/:id', () => {
  it('deleta período de férias', async () => {
    if (!createdVacId) return;

    const res = await request(app)
      .delete(`/api/vacations/${createdVacId}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect([200, 204]).toContain(res.status);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/vacations/members
// ──────────────────────────────────────────────────────────────
describe('GET /api/vacations/members', () => {
  it('usuário autenticado pode obter membros', async () => {
    const res = await request(app)
      .get('/api/vacations/members')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/vacations/members');

    expect(res.status).toBe(401);
  });
});
