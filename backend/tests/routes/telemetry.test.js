import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { cookieHeader, createTestUser, loginAs } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const sessionId = '16fd2706-8baf-433b-82eb-8c7fada847da';
let adminCookies;
let userCookies;

beforeAll(async () => {
  await cleanTables('app_client_errors', 'app_api_events', 'app_page_views', 'app_sessions', 'users');
  const admin = await createTestUser({ email: 'telemetry.admin@ctg-test.internal', role: 'admin' });
  const user = await createTestUser({ email: 'telemetry.user@ctg-test.internal', role: 'engenheiro' });
  ({ cookies: adminCookies } = await loginAs(app, admin));
  ({ cookies: userCookies } = await loginAs(app, user));
});

afterAll(async () => {
  await cleanTables('app_client_errors', 'app_api_events', 'app_page_views', 'app_sessions', 'users');
});

describe('telemetria de uso', () => {
  it('registra sessão, página, tempo ativo e erro do cliente', async () => {
    expect((await request(app).post('/api/telemetry/sessions/start')
      .set('Cookie', cookieHeader(userCookies))
      .send({ session_id: sessionId, page_path: '/projects/42' })).status).toBe(204);

    expect((await request(app).post('/api/telemetry/page-views')
      .set('Cookie', cookieHeader(userCookies))
      .send({ session_id: sessionId, page_path: '/projects/42' })).status).toBe(204);

    expect((await request(app).post('/api/telemetry/sessions/heartbeat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ session_id: sessionId, active_seconds: 125, page_path: '/projects/42' })).status).toBe(204);

    expect((await request(app).post('/api/telemetry/client-errors')
      .set('Cookie', cookieHeader(userCookies))
      .send({ session_id: sessionId, page_path: '/projects/42', source: 'render', message: 'Falha controlada' })).status).toBe(204);
  });

  it('bloqueia o painel para quem não é administrador', async () => {
    const response = await request(app).get('/api/telemetry/overview?days=30')
      .set('Cookie', cookieHeader(userCookies));
    expect(response.status).toBe(403);
  });

  it('entrega o painel agregado somente ao administrador', async () => {
    const response = await request(app).get('/api/telemetry/overview?days=30')
      .set('Cookie', cookieHeader(adminCookies));

    expect(response.status).toBe(200);
    expect(response.body.days).toBe(30);
    expect(response.body.summary.active_users).toBeGreaterThanOrEqual(1);
    expect(Number(response.body.summary.avg_session_seconds)).toBeGreaterThanOrEqual(125);
    expect(response.body.active_users).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.any(String), page_path: '/projects/:id' }),
    ]));
    expect(response.body.pages[0]).toMatchObject({ page_path: '/projects/:id' });
    expect(response.body.errors.some(error => error.message === 'Falha controlada')).toBe(true);
  });
});
