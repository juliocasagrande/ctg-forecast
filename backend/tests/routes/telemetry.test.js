import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createApp } from '../../src/app.js';
import { cookieHeader, createTestUser, loginAs } from '../helpers/auth.js';
import { cleanTables, query } from '../helpers/db.js';

const app = getTestApp();
const telemetryApp = createApp({ disableRateLimit: true, disableTelemetry: false });
const sessionId = '16fd2706-8baf-433b-82eb-8c7fada847da';
let adminCookies;
let userCookies;
let userId;

beforeAll(async () => {
  await cleanTables('app_client_errors', 'app_api_events', 'app_page_views', 'app_sessions', 'lists_iacs', 'projects', 'users');
  const admin = await createTestUser({ email: 'telemetry.admin@ctg-test.internal', role: 'admin' });
  const user = await createTestUser({ email: 'telemetry.user@ctg-test.internal', role: 'engenheiro' });
  userId = user.id;
  ({ cookies: adminCookies } = await loginAs(app, admin));
  ({ cookies: userCookies } = await loginAs(app, user));
});

afterAll(async () => {
  await cleanTables('app_client_errors', 'app_api_events', 'app_page_views', 'app_sessions', 'lists_iacs', 'projects', 'users');
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

    await query(`
      INSERT INTO app_api_events
        (user_id, session_key, page_path, endpoint, method, operation, status_code, duration_ms, success,
         actor_name, actor_role, record_label, change_details)
      VALUES ($1, $2, '/lists/iacs', '/api/lists/iacs/:id', 'PATCH', 'write', 200, 12, true,
              'Autor preservado', 'engenheiro', 'IAC-001', $3::jsonb)
    `, [userId, sessionId, JSON.stringify([
      { field: 'status', label: 'Status', old_value: 'Em andamento', new_value: 'Concluído' },
    ])]);
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
    expect(response.body.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'PATCH',
        page_path: '/lists/iacs',
        user_name: 'Autor preservado',
        user_role: 'engenheiro',
        record_label: 'IAC-001',
        change_details: [expect.objectContaining({ field: 'status', old_value: 'Em andamento', new_value: 'Concluído' })],
      }),
    ]));
    expect(response.body.pages[0]).toMatchObject({ page_path: '/projects/:id' });
    expect(response.body.errors.some(error => error.message === 'Falha controlada')).toBe(true);
  });

  it('persiste o campo alterado e a identificação do IAC', async () => {
    const created = await request(app).post('/api/lists/iacs')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ iac_code: 'IAC-AUDIT-001', project: 'Projeto auditável', comments: 'Texto anterior' });
    expect(created.status).toBe(201);

    const updated = await request(telemetryApp).put(`/api/lists/iacs/${created.body.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .set('x-app-page', '/lists/iacs')
      .send({ ...created.body, comments: 'Texto alterado' });
    expect(updated.status).toBe(200);

    let event;
    for (let attempt = 0; attempt < 20 && !event; attempt += 1) {
      const result = await query(`
        SELECT record_label, change_details, actor_name, action_label, change_description
        FROM app_api_events
        WHERE endpoint = '/api/lists/iacs/:id' AND method = 'PUT'
        ORDER BY id DESC LIMIT 1
      `);
      event = result.rows[0];
      if (!event) await new Promise(resolve => setTimeout(resolve, 25));
    }

    expect(event).toMatchObject({
      record_label: 'IAC-AUDIT-001',
      actor_name: expect.any(String),
      action_label: 'Alteração',
      change_description: 'Alterou o campo Comentários em IAC-AUDIT-001',
    });
    expect(event.change_details).toEqual([
      expect.objectContaining({ field: 'comments', old_value: 'Texto anterior', new_value: 'Texto alterado' }),
    ]);
  });

  it('audita automaticamente o campo alterado e o projeto afetado', async () => {
    const created = await request(app).post('/api/projects')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        code: 'PRJ-AUDIT-001',
        name: 'Projeto auditável',
        description: 'Descrição anterior',
        si_value: 100,
        pool_value: 50,
        plants: ['Jupiá'],
      });
    expect(created.status).toBe(201);

    const updated = await request(telemetryApp).put('/api/projects/' + created.body.id)
      .set('Cookie', cookieHeader(adminCookies))
      .set('x-app-page', '/projects')
      .send({
        code: created.body.code,
        name: created.body.name,
        description: 'Descrição rastreável',
        si_value: 100,
        pool_value: 50,
        plants: ['Jupiá'],
      });
    expect(updated.status).toBe(200);

    let event;
    for (let attempt = 0; attempt < 20 && !event; attempt += 1) {
      const result = await query(
        'SELECT record_label, change_details, action_label, change_description '
        + 'FROM app_api_events WHERE endpoint=$1 AND method=$2 ORDER BY id DESC LIMIT 1',
        ['/api/projects/:id', 'PUT']
      );
      event = result.rows[0];
      if (!event) await new Promise(resolve => setTimeout(resolve, 25));
    }

    expect(event).toMatchObject({
      record_label: 'PRJ-AUDIT-001 · Projeto auditável',
      action_label: 'Alteração',
      change_description: 'Alterou o campo Descrição em PRJ-AUDIT-001 · Projeto auditável',
    });
    expect(event.change_details).toEqual([
      expect.objectContaining({
        field: 'description',
        old_value: 'Descrição anterior',
        new_value: 'Descrição rastreável',
      }),
    ]);

    const initialForecast = {
      category: 'Contratos',
      type: 'Forecast',
      year: 2026,
      month: 8,
      value: 100,
      comment: 'Estimativa inicial',
    };
    expect((await request(app).put('/api/forecast/project/' + created.body.id)
      .set('Cookie', cookieHeader(adminCookies))
      .send(initialForecast)).status).toBe(200);
    expect((await request(telemetryApp).put('/api/forecast/project/' + created.body.id)
      .set('Cookie', cookieHeader(adminCookies))
      .set('x-app-page', '/forecast')
      .send({ ...initialForecast, value: 125 })).status).toBe(200);

    let forecastEvent;
    for (let attempt = 0; attempt < 20 && !forecastEvent; attempt += 1) {
      const result = await query(
        'SELECT record_label, change_details, action_label, change_description '
        + 'FROM app_api_events WHERE endpoint=$1 AND method=$2 ORDER BY id DESC LIMIT 1',
        ['/api/forecast/project/:id', 'PUT']
      );
      forecastEvent = result.rows[0];
      if (!forecastEvent) await new Promise(resolve => setTimeout(resolve, 25));
    }

    expect(forecastEvent).toMatchObject({
      record_label: 'PRJ-AUDIT-001 · Projeto auditável',
      action_label: 'Alteração',
      change_description: 'Alterou 1 campo de lançamento do Forecast em PRJ-AUDIT-001 · Projeto auditável',
    });
    expect(forecastEvent.change_details).toEqual([
      expect.objectContaining({ field: 'value', old_value: '100', new_value: '125' }),
    ]);
  });

  it('não exibe rastreabilidade com mais de 30 dias', async () => {
    const expiredAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO app_api_events '
      + '(user_id, endpoint, method, operation, status_code, duration_ms, success, actor_name, audit_visible, created_at) '
      + 'VALUES ($1, $2, $3, $4, 200, 1, true, $5, true, $6)',
      [userId, '/api/projects/:id', 'PUT', 'write', 'Autor antigo', expiredAt]
    );

    const response = await request(app).get('/api/telemetry/overview?days=90')
      .set('Cookie', cookieHeader(adminCookies));

    expect(response.status).toBe(200);
    expect(response.body.changes.some(item => item.user_name === 'Autor antigo')).toBe(false);
  });

  it('bloqueia o painel de engenharia de dados para quem não é administrador', async () => {
    const response = await request(app).get('/api/telemetry/data-engineering?days=30')
      .set('Cookie', cookieHeader(userCookies));
    expect(response.status).toBe(403);
  });

  it('entrega performance, qualidade de dados, catálogo e saúde do pipeline ao administrador', async () => {
    const response = await request(app).get('/api/telemetry/data-engineering?days=30')
      .set('Cookie', cookieHeader(adminCookies));

    expect(response.status).toBe(200);
    expect(response.body.days).toBe(30);
    expect(Array.isArray(response.body.endpoint_performance)).toBe(true);
    expect(Array.isArray(response.body.data_quality)).toBe(true);
    expect(Array.isArray(response.body.catalog)).toBe(true);
    expect(response.body.catalog.some(row => row.table_name === 'users')).toBe(true);
    expect(response.body.pipeline).toEqual(expect.objectContaining({
      last_event_at: expect.any(String),
      daily: expect.any(Array),
    }));
  });
});
