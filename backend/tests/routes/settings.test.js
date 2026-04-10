/**
 * Testes de integração — /api/settings
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'set';

let adminCookies, planejadorCookies, engCookies;

beforeAll(async () => {
  await cleanTables('users');

  const adminUser     = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`,  role: 'admin'      });
  const planejador    = await createTestUser({ email: `${PREFIX}.plan@ctg-test.internal`,   role: 'planejador' });
  const engUser       = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`,    role: 'engenheiro' });

  ({ cookies: adminCookies      } = await loginAs(app, adminUser));
  ({ cookies: planejadorCookies } = await loginAs(app, planejador));
  ({ cookies: engCookies        } = await loginAs(app, engUser));
});

afterAll(async () => {
  await cleanTables('users');
});

// ──────────────────────────────────────────────────────────────
// GET /api/settings
// ──────────────────────────────────────────────────────────────
describe('GET /api/settings', () => {
  it('admin lê configurações', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
  });

  it('engenheiro pode ler configurações', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/settings
// ──────────────────────────────────────────────────────────────
describe('PUT /api/settings', () => {
  it('admin atualiza configurações', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ forecast_lock_day: 5 });

    expect(res.status).toBe(200);
  });

  it('planejador atualiza configurações', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Cookie', cookieHeader(planejadorCookies))
      .send({ forecast_lock_day: 10 });

    expect(res.status).toBe(200);
  });

  it('engenheiro não pode alterar configurações (403)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Cookie', cookieHeader(engCookies))
      .send({ forecast_lock_day: 99 });

    expect(res.status).toBe(403);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ forecast_lock_day: 1 });

    expect(res.status).toBe(401);
  });
});
