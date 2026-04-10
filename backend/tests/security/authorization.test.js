/**
 * Testes de segurança — Autenticação e injeção
 *
 * Verifica que:
 *   1. Todas as rotas protegidas retornam 401 sem token
 *   2. Tokens adulterados são rejeitados
 *   3. Payloads maliciosos (SQL injection, XSS) não causam falhas
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'sec-auth';

let adminCookies;

beforeAll(async () => {
  await cleanTables('users');
  const adminUser = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`, role: 'admin' });
  ({ cookies: adminCookies } = await loginAs(app, adminUser));
});

afterAll(async () => {
  await cleanTables('users');
});

// ──────────────────────────────────────────────────────────────
// 1. Rotas que DEVEM exigir autenticação
// ──────────────────────────────────────────────────────────────
const PROTECTED_ROUTES = [
  { method: 'get',  path: '/api/users'         },
  { method: 'get',  path: '/api/auth/me'       },
  { method: 'get',  path: '/api/projects'      },
  { method: 'get',  path: '/api/forecast/dashboard' },
  { method: 'get',  path: '/api/documents'     },
  { method: 'get',  path: '/api/vacations'     },
  { method: 'get',  path: '/api/delegations'   },
  { method: 'get',  path: '/api/settings'      },
  { method: 'get',  path: '/api/lists/iacs'    },
  { method: 'get',  path: '/api/lists/projects-tracking' },
  { method: 'post', path: '/api/auth/change-password'    },
  { method: 'post', path: '/api/vacations'     },
  { method: 'post', path: '/api/delegations'   },
];

describe('Rotas protegidas — sem token retornam 401', () => {
  PROTECTED_ROUTES.forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path}`, async () => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    });
  });
});

// ──────────────────────────────────────────────────────────────
// 2. Rota pública — health check
// ──────────────────────────────────────────────────────────────
describe('Rota pública — sem autenticação', () => {
  it('GET /api/health retorna 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ──────────────────────────────────────────────────────────────
// 3. Tokens adulterados / inválidos
// ──────────────────────────────────────────────────────────────
describe('Tokens inválidos', () => {
  it('cookie com token forjado retorna 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'ctg_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD.assinatura_invalida');

    expect(res.status).toBe(401);
  });

  it('token expirado forjado retorna 401', async () => {
    // JWT com exp no passado e assinatura errada
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      Buffer.from(JSON.stringify({ id: 1, exp: 1 })).toString('base64url') +
      '.invalido';

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `ctg_token=${fakeToken}`);

    expect(res.status).toBe(401);
  });

  it('Authorization header com Bearer inválido retorna 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token_completamente_invalido');

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// 4. Injeção de SQL nos parâmetros de busca
// ──────────────────────────────────────────────────────────────
describe('SQL Injection — não deve causar erro 500', () => {
  const injections = [
    "' OR '1'='1",
    "1; DROP TABLE users;--",
    "1' UNION SELECT * FROM users--",
    "'; UPDATE users SET role='admin' WHERE '1'='1",
  ];

  injections.forEach(payload => {
    it(`Payload: ${payload.substring(0, 40)}`, async () => {
      const res = await request(app)
        .get('/api/projects')
        .query({ search: payload })
        .set('Cookie', cookieHeader(adminCookies));

      // Deve retornar 200 (ignorando o payload) ou 400 (validação),
      // NUNCA 500 (que indicaria erro de SQL não tratado)
      expect(res.status).not.toBe(500);
    });
  });
});

// ──────────────────────────────────────────────────────────────
// 5. XSS — payload não deve ser refletido sem sanitização
// ──────────────────────────────────────────────────────────────
describe('XSS — payload no body não gera erro 500', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '"><img src=x onerror=alert(1)>',
    'javascript:alert(document.cookie)',
  ];

  xssPayloads.forEach(payload => {
    it(`Login com payload XSS: ${payload.substring(0, 30)}`, async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: payload, password: payload });

      // Deve retornar 400 ou 401, jamais 500
      expect([400, 401, 403]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });
});

// ──────────────────────────────────────────────────────────────
// 6. Campos sensíveis não devem vazar nas respostas
// ──────────────────────────────────────────────────────────────
describe('Dados sensíveis — não devem aparecer nas respostas', () => {
  it('GET /api/users não expõe password_hash', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    res.body.forEach(user => {
      expect(user).not.toHaveProperty('password_hash');
    });
  });

  it('GET /api/auth/me não expõe password_hash', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('POST /api/auth/login não expõe password_hash', async () => {
    const user = await createTestUser({ email: `${PREFIX}.sensitive@ctg-test.internal` });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });
});

// ──────────────────────────────────────────────────────────────
// 7. Cabeçalhos de segurança
// ──────────────────────────────────────────────────────────────
describe('Cabeçalhos de segurança (Helmet)', () => {
  it('responde com X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('responde com X-Frame-Options ou CSP frame-ancestors', async () => {
    const res = await request(app).get('/api/health');
    const hasFrameOptions = res.headers['x-frame-options'] !== undefined;
    const hasCSP = res.headers['content-security-policy'] !== undefined;
    expect(hasFrameOptions || hasCSP).toBe(true);
  });
});
