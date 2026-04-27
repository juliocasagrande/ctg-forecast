/**
 * Testes de integração — /api/documents
 *
 * Campos obrigatórios no POST:
 *   type, area, sequence_number (int), year (2 dígitos int),
 *   responsible, date (YYYY-MM-DD), subject, status
 * Código gerado automaticamente: {type}-{area}-{seq}-{yy}
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'doc';

let adminCookies, planejadorCookies, engCookies;
let adminUser, planejadorUser, engUser;

// IDs criados nos testes para reutilizar
let docCreatedByAdmin;
let docCreatedByEng;

function docPayload(overrides = {}) {
  return {
    type:            'IAC',
    area:            'eletrica',
    sequence_number: 1,
    year:            25,
    responsible:     'Responsável Teste',
    date:            '2025-06-01',
    subject:         'Documento de Teste',
    status:          'Em elaboração',
    ...overrides,
  };
}

beforeAll(async () => {
  await cleanTables('document_authors', 'documents', 'users');

  adminUser     = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`,  role: 'admin'      });
  planejadorUser = await createTestUser({ email: `${PREFIX}.plan@ctg-test.internal`,  role: 'planejador' });
  engUser       = await createTestUser({ email: `${PREFIX}.eng@ctg-test.internal`,    role: 'engenheiro' });

  ({ cookies: adminCookies      } = await loginAs(app, adminUser));
  ({ cookies: planejadorCookies } = await loginAs(app, planejadorUser));
  ({ cookies: engCookies        } = await loginAs(app, engUser));
});

afterAll(async () => {
  await cleanTables('document_authors', 'documents', 'users');
});

// ──────────────────────────────────────────────────────────────
// GET /api/documents/next-sequence
// ──────────────────────────────────────────────────────────────
describe('GET /api/documents/next-sequence', () => {
  it('retorna próximo número de sequência como inteiro', async () => {
    const res = await request(app)
      .get('/api/documents/next-sequence')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('next');
    expect(typeof res.body.next).toBe('number');
    expect(res.body.next).toBeGreaterThanOrEqual(1);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/documents/next-sequence');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/documents (criar)
// ──────────────────────────────────────────────────────────────
describe('POST /api/documents', () => {
  it('admin cria documento com todos os campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Cookie', cookieHeader(adminCookies))
      .send(docPayload({ sequence_number: 1 }));

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('code');
    expect(res.body.code).toMatch(/^IAC-eletrica-001-25/);
    expect(Array.isArray(res.body.authors)).toBe(true);
    // Criador é adicionado automaticamente como autor
    expect(res.body.authors.some(a => a.id === adminUser.id)).toBe(true);
    docCreatedByAdmin = res.body;
  });

  it('engenheiro pode criar documento (torna-se autor automaticamente)', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Cookie', cookieHeader(engCookies))
      .send(docPayload({ sequence_number: 2 }));

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.authors.some(a => a.id === engUser.id)).toBe(true);
    docCreatedByEng = res.body;
  });

  it('código duplicado retorna 409', async () => {
    // Mesmo sequence_number + area + type + year = mesmo código gerado
    const res = await request(app)
      .post('/api/documents')
      .set('Cookie', cookieHeader(adminCookies))
      .send(docPayload({ sequence_number: 1 }));

    expect(res.status).toBe(409);
  });

  it('campos obrigatórios ausentes retornam 400', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ type: 'IAC', area: 'eletrica' }); // faltam campos

    expect(res.status).toBe(400);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post('/api/documents')
      .send(docPayload({ sequence_number: 99 }));

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/documents (listar)
// ──────────────────────────────────────────────────────────────
describe('GET /api/documents', () => {
  it('lista documentos com campo authors', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    // Campos esperados
    const doc = res.body[0];
    expect(doc).toHaveProperty('id');
    expect(doc).toHaveProperty('code');
    expect(doc).toHaveProperty('authors');
  });

  it('engenheiro pode listar documentos', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filtra por ano', async () => {
    const res = await request(app)
      .get('/api/documents')
      .query({ year: 25 })
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/documents/stats
// ──────────────────────────────────────────────────────────────
describe('GET /api/documents/stats', () => {
  it('retorna estatísticas agrupadas', async () => {
    const res = await request(app)
      .get('/api/documents/stats')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('by_type');
    expect(res.body).toHaveProperty('by_status');
    expect(res.body).toHaveProperty('published_without_link');
    expect(Array.isArray(res.body.by_type)).toBe(true);
  });

  it('engenheiro pode ver estatísticas', async () => {
    const res = await request(app)
      .get('/api/documents/stats')
      .set('Cookie', cookieHeader(engCookies));

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/documents/:id (atualizar)
// ──────────────────────────────────────────────────────────────
describe('PUT /api/documents/:id', () => {
  it('admin (role superior) atualiza qualquer documento', async () => {
    if (!docCreatedByEng) return;

    const res = await request(app)
      .put(`/api/documents/${docCreatedByEng.id}`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        responsible:   'Novo Responsável',
        date:          '2025-06-15',
        subject:       'Título Atualizado',
        status:        'Para aprovação',
        document_link: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Título Atualizado');
  });

  it('engenheiro autor atualiza seu próprio documento', async () => {
    if (!docCreatedByEng) return;

    const res = await request(app)
      .put(`/api/documents/${docCreatedByEng.id}`)
      .set('Cookie', cookieHeader(engCookies))
      .send({
        responsible:   'Engenheiro Responsável',
        date:          '2025-07-01',
        subject:       'Documento do Eng',
        status:        'Em elaboração',
        document_link: null,
      });

    expect(res.status).toBe(200);
  });

  it('engenheiro NÃO autor não pode editar documento alheio (403)', async () => {
    if (!docCreatedByAdmin) return;

    // engUser não é autor de docCreatedByAdmin (admin criou)
    const res = await request(app)
      .put(`/api/documents/${docCreatedByAdmin.id}`)
      .set('Cookie', cookieHeader(engCookies))
      .send({
        responsible:   'Hacker',
        date:          '2025-07-01',
        subject:       'Hackeado',
        status:        'Em elaboração',
        document_link: null,
      });

    expect(res.status).toBe(403);
  });

  it('planejador (role superior) atualiza documento alheio', async () => {
    if (!docCreatedByEng) return;

    const res = await request(app)
      .put(`/api/documents/${docCreatedByEng.id}`)
      .set('Cookie', cookieHeader(planejadorCookies))
      .send({
        responsible:   'Planejador',
        date:          '2025-06-20',
        subject:       'Atualizado pelo Planejador',
        status:        'Em elaboração',
        document_link: null,
      });

    expect(res.status).toBe(200);
  });

  it('documento inexistente retorna 404', async () => {
    const res = await request(app)
      .put('/api/documents/999999')
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        responsible:   'Ninguém',
        date:          '2025-06-01',
        subject:       'Não existe',
        status:        'Em elaboração',
        document_link: null,
      });

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────
// PATCH /api/documents/:id/status (alterar status)
// ──────────────────────────────────────────────────────────────
describe('PATCH /api/documents/:id/status', () => {
  it('admin altera status para Publicado', async () => {
    if (!docCreatedByAdmin) return;

    const res = await request(app)
      .patch(`/api/documents/${docCreatedByAdmin.id}/status`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'Publicado' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Publicado');
  });

  it('status inválido retorna 400', async () => {
    if (!docCreatedByAdmin) return;

    const res = await request(app)
      .patch(`/api/documents/${docCreatedByAdmin.id}/status`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ status: 'status_invalido' });

    expect(res.status).toBe(400);
  });

  it('engenheiro NÃO autor não pode alterar status (403)', async () => {
    if (!docCreatedByAdmin) return;

    const res = await request(app)
      .patch(`/api/documents/${docCreatedByAdmin.id}/status`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ status: 'Cancelado' });

    expect(res.status).toBe(403);
  });

  it('todos os statuses válidos são aceitos', async () => {
    if (!docCreatedByAdmin) return;

    const validStatuses = ['Em elaboração', 'Para aprovação', 'Publicado', 'Cancelado'];

    for (const status of validStatuses) {
      const res = await request(app)
        .patch(`/api/documents/${docCreatedByAdmin.id}/status`)
        .set('Cookie', cookieHeader(adminCookies))
        .send({ status });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/documents/:id/revision (nova revisão)
// ──────────────────────────────────────────────────────────────
describe('POST /api/documents/:id/revision', () => {
  it('admin cria nova revisão de documento existente', async () => {
    if (!docCreatedByAdmin) return;

    const res = await request(app)
      .post(`/api/documents/${docCreatedByAdmin.id}/revision`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({
        date:        '2025-07-01',
        responsible: 'Responsável da Revisão',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.revision).toBe(0);
    expect(res.body.code).toContain('-R0');
  });

  it('data obrigatória — sem date retorna 400', async () => {
    if (!docCreatedByAdmin) return;

    const res = await request(app)
      .post(`/api/documents/${docCreatedByAdmin.id}/revision`)
      .set('Cookie', cookieHeader(adminCookies))
      .send({ responsible: 'Alguém' });

    expect(res.status).toBe(400);
  });

  it('engenheiro NÃO autor não pode criar revisão (403)', async () => {
    if (!docCreatedByAdmin) return;

    const res = await request(app)
      .post(`/api/documents/${docCreatedByAdmin.id}/revision`)
      .set('Cookie', cookieHeader(engCookies))
      .send({ date: '2025-08-01' });

    expect(res.status).toBe(403);
  });

  it('documento inexistente retorna 404', async () => {
    const res = await request(app)
      .post('/api/documents/999999/revision')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ date: '2025-08-01' });

    expect(res.status).toBe(404);
  });
});
