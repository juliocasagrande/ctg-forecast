/**
 * Testes de integração — /api/chat
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'chat';

let userCookies;

beforeAll(async () => {
  await cleanTables('users');
  const user = await createTestUser({ email: `${PREFIX}.user@ctg-test.internal`, role: 'engenheiro' });
  ({ cookies: userCookies } = await loginAs(app, user));
});

afterAll(async () => {
  await cleanTables('users');
});

// ──────────────────────────────────────────────────────────────
// Sem autenticação
// ──────────────────────────────────────────────────────────────
describe('POST /api/chat — sem auth', () => {
  it('retorna 401', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'Olá' }] });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// Sem GROQ_API_KEY
// ──────────────────────────────────────────────────────────────
describe('POST /api/chat — sem GROQ_API_KEY', () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; delete process.env.GROQ_API_KEYS; });

  it('retorna 503 com mensagem explicativa', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: [{ role: 'user', content: 'Olá' }] });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GROQ_API_KEY/);
  });
});

// ──────────────────────────────────────────────────────────────
// Com GROQ_API_KEY configurado (fetch mockado)
// ──────────────────────────────────────────────────────────────
describe('POST /api/chat — com GROQ_API_KEY', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key-mock';
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEYS;
    vi.restoreAllMocks();
  });

  it('messages vazio retorna 400', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('messages não é array retorna 400', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: 'Olá' });

    expect(res.status).toBe(400);
  });

  it('body sem messages retorna 400', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({});

    expect(res.status).toBe(400);
  });

  it('propriedade time é removida antes de enviar ao Groq', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Ok.' } }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: [{ role: 'user', content: 'Olá', time: '13:33' }] });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMsg = body.messages.find(m => m.role === 'user');
    expect(userMsg).not.toHaveProperty('time');
    expect(userMsg).toHaveProperty('content', 'Olá');
  });

  it('resposta válida do Groq retorna 200 com content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Resposta do assistente CTG.' } }],
      }),
    }));

    const res = await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: [{ role: 'user', content: 'O que é um IAC?' }] });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content', 'Resposta do assistente CTG.');
  });

  it('envia no máximo 12 mensagens ao Groq (janela de contexto)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Ok.' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const manyMessages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg ${i}`,
    }));

    await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: manyMessages });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // system prompt + up to 12 user messages
    const userMessages = body.messages.filter(m => m.role !== 'system');
    expect(userMessages.length).toBeLessThanOrEqual(12);
  });

  it('erro 429 da API Groq é repassado ao cliente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded' } }),
    }));

    const res = await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: [{ role: 'user', content: 'Olá' }] });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limit/i);
  });

  it('falha de rede retorna 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const res = await request(app)
      .post('/api/chat')
      .set('Cookie', cookieHeader(userCookies))
      .send({ messages: [{ role: 'user', content: 'Olá' }] });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
