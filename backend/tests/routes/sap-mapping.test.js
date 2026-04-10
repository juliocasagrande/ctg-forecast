/**
 * Testes de integração — /api/settings/sap-mapping e /api/settings/sap-keywords
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'sap';

let adminCookies, planejadorCookies, engenheiroCookies, devCookies;

beforeAll(async () => {
  // Não limpar tabelas que podem não existir
  await cleanTables('users');

  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  const planejadorUser = await createTestUser({ email: `${PREFIX}.plan@ctg-test.internal`, role: 'planejador' });
  const engUser = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro' });
  const devUser = await createTestUser({ email: 'julio.casagrande@ctgbr.com.br', role: 'admin' });

  ({ cookies: adminCookies } = await loginAs(app, adminUser));
  ({ cookies: planejadorCookies } = await loginAs(app, planejadorUser));
  ({ cookies: engenheiroCookies } = await loginAs(app, engUser));
  ({ cookies: devCookies } = await loginAs(app, devUser));
});

afterAll(async () => {
  await cleanTables('users');
});

// ──────────────────────────────────────────────────────────────
// GET /api/settings/sap-mapping — Listar mapeamentos SAP
// ──────────────────────────────────────────────────────────────
describe('GET /api/settings/sap-mapping', () => {
  it('usuário autenticado pode listar mapeamentos', async () => {
    const res = await request(app)
      .get('/api/settings/sap-mapping')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('engenheiro pode listar mapeamentos', async () => {
    const res = await request(app)
      .get('/api/settings/sap-mapping')
      .set('Cookie', cookieHeader(engenheiroCookies));

    expect(res.status).toBe(200);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/settings/sap-mapping');

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/settings/sap-mapping — Salvar mapeamentos SAP
// ──────────────────────────────────────────────────────────────
describe('PUT /api/settings/sap-mapping', () => {
  it('admin pode salvar mapeamentos SAP', async () => {
    const mapping = [
      { descr: 'TESTE MATERIAL', category: 'Contratos' },
      { descr: 'TESTE VIAGEM', category: 'Viagens' }
    ];

    const res = await request(app)
      .put('/api/settings/sap-mapping')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ mapping });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('planejador pode salvar mapeamentos SAP', async () => {
    const mapping = [
      { descr: 'TESTE MATERIAL 2', category: 'Contratos' }
    ];

    const res = await request(app)
      .put('/api/settings/sap-mapping')
      .set('Cookie', cookieHeader(planejadorCookies))
      .send({ mapping });

    expect(res.status).toBe(200);
  });

  it('developer pode salvar mapeamentos SAP', async () => {
    const mapping = [
      { descr: 'TESTE MATERIAL 3', category: 'Viagens' }
    ];

    const res = await request(app)
      .put('/api/settings/sap-mapping')
      .set('Cookie', cookieHeader(devCookies))
      .send({ mapping });

    expect(res.status).toBe(200);
  });

  it('engenheiro NÃO pode salvar mapeamentos SAP (403)', async () => {
    const mapping = [
      { descr: 'TESTE MATERIAL 4', category: 'Contratos' }
    ];

    const res = await request(app)
      .put('/api/settings/sap-mapping')
      .set('Cookie', cookieHeader(engenheiroCookies))
      .send({ mapping });

    expect(res.status).toBe(403);
  });

  it('mapping inválido retorna 400', async () => {
    const res = await request(app)
      .put('/api/settings/sap-mapping')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ mapping: 'not an array' });

    expect(res.status).toBe(400);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .put('/api/settings/sap-mapping')
      .send({ mapping: [] });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/settings/sap-keywords — Listar palavras-chave SAP
// ──────────────────────────────────────────────────────────────
describe('GET /api/settings/sap-keywords', () => {
  it('usuário autenticado pode listar palavras-chave', async () => {
    const res = await request(app)
      .get('/api/settings/sap-keywords')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('Dispensado');
    expect(res.body).toHaveProperty('Viagens');
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .get('/api/settings/sap-keywords');

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/settings/sap-keywords — Salvar palavras-chave SAP
// ──────────────────────────────────────────────────────────────
describe('PUT /api/settings/sap-keywords', () => {
  it('admin pode salvar palavras-chave', async () => {
    const keywords = {
      Dispensado: ['salario', 'teste'],
      Viagens: ['viagem', 'taxi']
    };

    const res = await request(app)
      .put('/api/settings/sap-keywords')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ keywords });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('Dispensado');
    expect(res.body).toHaveProperty('Viagens');
  });

  it('planejador pode salvar palavras-chave', async () => {
    const keywords = {
      Dispensado: ['fgts'],
      Viagens: ['pedagio']
    };

    const res = await request(app)
      .put('/api/settings/sap-keywords')
      .set('Cookie', cookieHeader(planejadorCookies))
      .send({ keywords });

    expect(res.status).toBe(200);
  });

  it('developer pode salvar palavras-chave', async () => {
    const keywords = {
      Dispensado: ['inss'],
      Viagens: ['estacionamento']
    };

    const res = await request(app)
      .put('/api/settings/sap-keywords')
      .set('Cookie', cookieHeader(devCookies))
      .send({ keywords });

    expect(res.status).toBe(200);
  });

  it('engenheiro NÃO pode salvar palavras-chave (403)', async () => {
    const keywords = {
      Dispensado: ['teste'],
      Viagens: ['teste']
    };

    const res = await request(app)
      .put('/api/settings/sap-keywords')
      .set('Cookie', cookieHeader(engenheiroCookies))
      .send({ keywords });

    expect(res.status).toBe(403);
  });

  it('keywords inválido retorna 400', async () => {
    const res = await request(app)
      .put('/api/settings/sap-keywords')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ keywords: 'not an object' });

    expect(res.status).toBe(400);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .put('/api/settings/sap-keywords')
      .send({ keywords: {} });

    expect(res.status).toBe(401);
  });
});
