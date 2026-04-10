/**
 * Testes de integração — /api/monthly-report
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'mr';

let adminCookies, planejadorCookies, engenheiroCookies;

beforeAll(async () => {
  await cleanTables('users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const planejadorUser = await createTestUser({ email: `${PREFIX}.plan@ctg-test.internal`, role: 'planejador' });
  const engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: planejadorCookies } = await loginAs(app, planejadorUser));
  ({ cookies: engenheiroCookies } = await loginAs(app, engUser));
});

afterAll(async () => {
  await cleanTables('users');
});

// ──────────────────────────────────────────────────────────────
// POST /api/monthly-report/generate — Gerar relatório mensal via upload Excel
// ──────────────────────────────────────────────────────────────
describe('POST /api/monthly-report/generate', () => {
  it('admin pode gerar relatório mensal (falha sem arquivo, mas 400 é esperado)', async () => {
    const res = await request(app)
      .post('/api/monthly-report/generate')
      .set('Cookie', cookieHeader(adminCookies))
      .field('year', new Date().getFullYear())
      .field('month', new Date().getMonth() + 1);

    // Sem arquivo, deve retornar 400
    expect(res.status).toBe(400);
  });

  it('planejador pode gerar relatório mensal', async () => {
    const res = await request(app)
      .post('/api/monthly-report/generate')
      .set('Cookie', cookieHeader(planejadorCookies))
      .field('year', new Date().getFullYear())
      .field('month', new Date().getMonth() + 1);

    // Sem arquivo, deve retornar 400
    expect(res.status).toBe(400);
  });

  it('coordenador pode gerar relatório mensal', async () => {
    const coordenador = await createTestUser({ email: `${PREFIX}.coord@ctg-test.internal`, role: 'coordenador' });
    const { cookies } = await loginAs(app, coordenador);

    const res = await request(app)
      .post('/api/monthly-report/generate')
      .set('Cookie', cookieHeader(cookies))
      .field('year', new Date().getFullYear())
      .field('month', new Date().getMonth() + 1);

    expect(res.status).toBe(400);
  });

  it('gerente pode gerar relatório mensal', async () => {
    const gerente = await createTestUser({ email: `${PREFIX}.gerente@ctg-test.internal`, role: 'gerente' });
    const { cookies } = await loginAs(app, gerente);

    const res = await request(app)
      .post('/api/monthly-report/generate')
      .set('Cookie', cookieHeader(cookies))
      .field('year', new Date().getFullYear())
      .field('month', new Date().getMonth() + 1);

    expect(res.status).toBe(400);
  });

  it('engenheiro NÃO pode gerar relatório mensal (403)', async () => {
    const res = await request(app)
      .post('/api/monthly-report/generate')
      .set('Cookie', cookieHeader(engenheiroCookies))
      .field('year', new Date().getFullYear())
      .field('month', new Date().getMonth() + 1);

    expect(res.status).toBe(403);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post('/api/monthly-report/generate')
      .field('year', new Date().getFullYear())
      .field('month', new Date().getMonth() + 1);

    expect(res.status).toBe(401);
  });

  it('arquivo inválido retorna 400', async () => {
    const res = await request(app)
      .post('/api/monthly-report/generate')
      .set('Cookie', cookieHeader(adminCookies))
      .attach('excel', Buffer.from('not a real excel file'), {
        filename: 'invalid.txt',
        contentType: 'text/plain'
      })
      .field('year', new Date().getFullYear())
      .field('month', new Date().getMonth() + 1);

    expect(res.status).toBe(400);
  });
});
