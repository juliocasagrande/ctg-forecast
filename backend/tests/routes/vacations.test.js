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

let adminCookies, engCookies, eng2Cookies, coordCookies, gerenteCookies, coordMecCookies;
let adminUser, engUser, eng2User, coordUser, gerenteUser, coordMecUser, engMecNoVacUser;
let createdVacId;

beforeAll(async () => {
  await cleanTables('vacation_periods', 'users');

  adminUser  = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`,  role: 'admin' });
  engUser    = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`,    role: 'engenheiro', area: 'eletrica' });
  eng2User   = await createTestUser({ email: `${PREFIX}.eng2@ctg-test.internal`,   role: 'engenheiro', area: 'eletrica' });
  coordUser  = await createTestUser({ email: `${PREFIX}.coord@ctg-test.internal`,  role: 'coordenador', area: 'eletrica' });
  gerenteUser = await createTestUser({ email: `${PREFIX}.ger@ctg-test.internal`,   role: 'gerente' });
  coordMecUser = await createTestUser({ email: `${PREFIX}.coordmec@ctg-test.internal`, role: 'coordenador', area: 'mecanica' });
  engMecNoVacUser = await createTestUser({ email: `${PREFIX}.engmecnv@ctg-test.internal`, role: 'engenheiro', area: 'mecanica' });

  ({ cookies: adminCookies   } = await loginAs(app, adminUser));
  ({ cookies: engCookies     } = await loginAs(app, engUser));
  ({ cookies: eng2Cookies    } = await loginAs(app, eng2User));
  ({ cookies: coordCookies   } = await loginAs(app, coordUser));
  ({ cookies: gerenteCookies } = await loginAs(app, gerenteUser));
  ({ cookies: coordMecCookies } = await loginAs(app, coordMecUser));
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

  it('filtra por área', async () => {
    const res = await request(app)
      .get('/api/vacations')
      .query({ year: 2025, area: 'eletrica' })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('engenheiro pode listar férias', async () => {
    const res = await request(app)
      .get('/api/vacations')
      .query({ year: 2025 })
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
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
  it('admin cria período de férias para engenheiro', async () => {
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
    expect(res.body).toHaveProperty('days');
    expect(res.body.days).toBe(15);
    createdVacId = res.body.id;
  });

  it('engenheiro cria férias para si mesmo', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(eng2Cookies))
      .send({
        user_id:       eng2User.id,
        period_number: 1,
        start_date:    '2025-08-01',
        end_date:      '2025-08-10',
        year:          2025,
        area:          'eletrica',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('engenheiro NÃO pode criar férias para outro usuário (403)', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(engCookies))
      .send({
        user_id:       eng2User.id,
        period_number: 3,
        start_date:    '2025-09-01',
        end_date:      '2025-09-10',
        year:          2025,
        area:          'eletrica',
      });

    expect(res.status).toBe(403);
  });

  it('coordenador NÃO pode criar férias para gerente (403)', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(coordCookies))
      .send({
        user_id:       gerenteUser.id,
        period_number: 1,
        start_date:    '2025-10-01',
        end_date:      '2025-10-10',
        year:          2025,
        area:          'eletrica',
      });

    expect(res.status).toBe(403);
  });

  it('data de fim antes do início retorna 400', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        user_id:       engUser.id,
        period_number: 9,
        start_date:    '2025-07-15',
        end_date:      '2025-07-01',
        year:          2025,
        area:          'eletrica',
      });

    expect(res.status).toBe(400);
  });

  it('formato de data inválido retorna 400', async () => {
    const res = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        user_id:       engUser.id,
        period_number: 9,
        start_date:    '01/07/2025',
        end_date:      '15/07/2025',
        year:          2025,
        area:          'eletrica',
      });

    expect(res.status).toBe(400);
  });

  it('período duplicado para o mesmo usuário/ano retorna 409', async () => {
    // Período 1 de engUser já criado no primeiro teste
    const res = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        user_id:       engUser.id,
        period_number: 1,
        start_date:    '2025-11-01',
        end_date:      '2025-11-10',
        year:          2025,
        area:          'eletrica',
      });

    expect(res.status).toBe(409);
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
  it('admin atualiza período de férias', async () => {
    if (!createdVacId) return;

    const res = await request(app)
      .put(`/api/vacations/${createdVacId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        start_date:    '2025-07-05',
        end_date:      '2025-07-20',
        area:          'eletrica',
        period_number: 1,
        year:          2025,
      });

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(16);
  });

  it('data de fim antes do início retorna 400 no PUT', async () => {
    if (!createdVacId) return;

    const res = await request(app)
      .put(`/api/vacations/${createdVacId}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        start_date:    '2025-07-20',
        end_date:      '2025-07-05',
        area:          'eletrica',
        period_number: 1,
        year:          2025,
      });

    expect(res.status).toBe(400);
  });

  it('engenheiro NÃO pode editar férias de outro usuário (403)', async () => {
    if (!createdVacId) return;

    const res = await request(app)
      .put(`/api/vacations/${createdVacId}`)
      .set('Cookie', cookieHeader(eng2Cookies))
      .send({
        start_date:    '2025-07-10',
        end_date:      '2025-07-25',
        area:          'eletrica',
        period_number: 1,
        year:          2025,
      });

    expect(res.status).toBe(403);
  });

  it('período inexistente retorna 404', async () => {
    const res = await request(app)
      .put('/api/vacations/999999')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        start_date:    '2025-07-05',
        end_date:      '2025-07-20',
        area:          'eletrica',
        period_number: 1,
        year:          2025,
      });

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/vacations/:id
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/vacations/:id', () => {
  it('engenheiro NÃO pode deletar férias de outro usuário (403)', async () => {
    if (!createdVacId) return;

    const res = await request(app)
      .delete(`/api/vacations/${createdVacId}`)
      .set('Cookie', cookieHeader(eng2Cookies));

    expect(res.status).toBe(403);
  });

  it('admin deleta período de férias', async () => {
    if (!createdVacId) return;

    const res = await request(app)
      .delete(`/api/vacations/${createdVacId}`)
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('engenheiro pode deletar suas próprias férias', async () => {
    // Criar período para eng2 deletar
    const createRes = await request(app)
      .post('/api/vacations')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        user_id:       eng2User.id,
        period_number: 2,
        start_date:    '2025-11-01',
        end_date:      '2025-11-10',
        year:          2025,
        area:          'eletrica',
      });

    expect(createRes.status).toBe(201);

    const res = await request(app)
      .delete(`/api/vacations/${createRes.body.id}`)
      .set('Cookie', cookieHeader(eng2Cookies));

    expect(res.status).toBe(200);
  });

  it('período inexistente retorna 404', async () => {
    const res = await request(app)
      .delete('/api/vacations/999999')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/vacations/members
// ──────────────────────────────────────────────────────────────
describe('GET /api/vacations/members', () => {
  it('admin vê todos os membros', async () => {
    const res = await request(app)
      .get('/api/vacations/members')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('area');
    }
  });

  it('engenheiro vê membros da sua área', async () => {
    const res = await request(app)
      .get('/api/vacations/members')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('coordenador vê membros da sua área + gerentes', async () => {
    const res = await request(app)
      .get('/api/vacations/members')
      .set('Cookie', cookieHeader(coordCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('coordenador mecânico vê engenheiros mecânicos sem férias cadastradas, outros coordenadores e gerentes', async () => {
    const res = await request(app)
      .get('/api/vacations/members')
      .set('Cookie', cookieHeader(coordMecCookies));

    expect(res.status).toBe(200);
    const ids = res.body.map(m => m.id);
    // engenheiro mecânico sem nenhum período de férias cadastrado deve aparecer
    expect(ids).toContain(engMecNoVacUser.id);
    // o próprio coordenador mecânico aparece
    expect(ids).toContain(coordMecUser.id);
    // outros coordenadores (de outra área) também aparecem na seção de gestão
    expect(ids).toContain(coordUser.id);
    // gerentes também aparecem na seção de gestão
    expect(ids).toContain(gerenteUser.id);
    // engenheiros de outra área não aparecem
    expect(ids).not.toContain(engUser.id);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/vacations/members');

    expect(res.status).toBe(401);
  });
});
