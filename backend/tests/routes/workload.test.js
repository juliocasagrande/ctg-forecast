/**
 * Testes de integraÃ§Ã£o â€” /api/workload (Controle de Carga)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables } from '../helpers/db.js';

const app    = getTestApp();
const PREFIX = 'wl';

let adminCookies, engMecCookies, engMec2Cookies, engEleCookies, coordMecCookies, coordEleCookies, gerenteCookies;
let adminUser, engMecUser, engMec2User, engEleUser, coordMecUser, coordEleUser, gerenteUser;

beforeAll(async () => {
  await cleanTables('workload_demands', 'users');

  adminUser    = await createTestUser({ email: `${PREFIX}.admin@ctg-test.internal`,    role: 'admin' });
  engMecUser   = await createTestUser({ email: `${PREFIX}.engmec@ctg-test.internal`,   role: 'engenheiro', area: 'mecanica' });
  engMec2User  = await createTestUser({ email: `${PREFIX}.engmec2@ctg-test.internal`,  role: 'engenheiro', area: 'mecanica' });
  engEleUser   = await createTestUser({ email: `${PREFIX}.engele@ctg-test.internal`,   role: 'engenheiro', area: 'eletrica' });
  coordMecUser = await createTestUser({ email: `${PREFIX}.coordmec@ctg-test.internal`, role: 'coordenador', area: 'mecanica' });
  coordEleUser = await createTestUser({ email: `${PREFIX}.coordele@ctg-test.internal`, role: 'coordenador', area: 'eletrica' });
  gerenteUser  = await createTestUser({ email: `${PREFIX}.gerente@ctg-test.internal`,  role: 'gerente' });

  ({ cookies: adminCookies    } = await loginAs(app, adminUser));
  ({ cookies: engMecCookies   } = await loginAs(app, engMecUser));
  ({ cookies: engMec2Cookies  } = await loginAs(app, engMec2User));
  ({ cookies: engEleCookies   } = await loginAs(app, engEleUser));
  ({ cookies: coordMecCookies } = await loginAs(app, coordMecUser));
  ({ cookies: coordEleCookies } = await loginAs(app, coordEleUser));
  ({ cookies: gerenteCookies  } = await loginAs(app, gerenteUser));
});

afterAll(async () => {
  await cleanTables('workload_demands', 'users');
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/workload â€” criaÃ§Ã£o e validaÃ§Ã£o
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('POST /api/workload', () => {
  it('engenheiro cria demanda para si mesmo', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ user_id: engMecUser.id, title: 'RevisÃ£o de projeto', load_percent: 40 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('planejada');
    expect(res.body.priority).toBe('media');
  });

  it('engenheiro NÃƒO pode criar demanda para outro usuÃ¡rio (403)', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ user_id: engMec2User.id, title: 'Demanda indevida', load_percent: 10 });

    expect(res.status).toBe(403);
  });

  it('rejeita carga estimada fora da faixa 0-100', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ user_id: engMecUser.id, title: 'Carga invalida', load_percent: 150 });

    expect(res.status).toBe(400);
  });

  it('rejeita status invÃ¡lido', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ user_id: engMecUser.id, title: 'Status invalido', load_percent: 10, status: 'foo' });

    expect(res.status).toBe(400);
  });

  it('rejeita prioridade invÃ¡lida', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ user_id: engMecUser.id, title: 'Prioridade invalida', load_percent: 10, priority: 'urgente' });

    expect(res.status).toBe(400);
  });

  it('rejeita titulo vazio', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ user_id: engMecUser.id, title: '  ', load_percent: 10 });

    expect(res.status).toBe(400);
  });

  it('coordenador mecÃ¢nico cria demanda para engenheiro mecÃ¢nico', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(coordMecCookies))
      .send({ user_id: engMec2User.id, title: 'Tarefa atribuida pelo coordenador', load_percent: 30 });

    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(engMec2User.id);
  });

  it('coordenador mecÃ¢nico NÃƒO pode criar demanda para engenheiro de outra Ã¡rea (403)', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(coordMecCookies))
      .send({ user_id: engEleUser.id, title: 'Fora da area', load_percent: 20 });

    expect(res.status).toBe(403);
  });

  it('coordenador mecÃ¢nico NÃƒO pode criar demanda para gerente (403)', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(coordMecCookies))
      .send({ user_id: gerenteUser.id, title: 'Para gerente', load_percent: 20 });

    expect(res.status).toBe(403);
  });

  it('gerente cria demanda para qualquer engenheiro', async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(gerenteCookies))
      .send({ user_id: engEleUser.id, title: 'Demanda do gerente', load_percent: 25 });

    expect(res.status).toBe(201);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app)
      .post('/api/workload')
      .send({ title: 'Sem auth', load_percent: 10 });

    expect(res.status).toBe(401);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET /api/workload e /api/workload/members â€” visibilidade
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('GET /api/workload e /members', () => {
  it('engenheiro vÃª apenas as prÃ³prias demandas', async () => {
    const res = await request(app)
      .get('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies));

    expect(res.status).toBe(200);
    expect(res.body.every(d => d.user_id === engMecUser.id)).toBe(true);
  });

  it('coordenador mecÃ¢nico vÃª demandas prÃ³prias e dos engenheiros mecÃ¢nicos, mas nÃ£o de outra Ã¡rea', async () => {
    const res = await request(app)
      .get('/api/workload')
      .set('Cookie', cookieHeader(coordMecCookies));

    expect(res.status).toBe(200);
    const userIds = res.body.map(d => d.user_id);
    expect(userIds).toContain(engMec2User.id);
    expect(userIds).not.toContain(engEleUser.id);
  });

  it('gerente vÃª demandas de todas as Ã¡reas', async () => {
    const res = await request(app)
      .get('/api/workload')
      .set('Cookie', cookieHeader(gerenteCookies));

    expect(res.status).toBe(200);
    const userIds = res.body.map(d => d.user_id);
    expect(userIds).toContain(engEleUser.id);
    expect(userIds).toContain(engMecUser.id);
  });

  it('coordenador mecÃ¢nico vÃª os engenheiros mecÃ¢nicos em /members', async () => {
    const res = await request(app)
      .get('/api/workload/members')
      .set('Cookie', cookieHeader(coordMecCookies));

    expect(res.status).toBe(200);
    const ids = res.body.map(m => m.id);
    expect(ids).toContain(engMecUser.id);
    expect(ids).toContain(engMec2User.id);
    expect(ids).not.toContain(engEleUser.id);
  });

  it('sem auth retorna 401', async () => {
    const res = await request(app).get('/api/workload');
    expect(res.status).toBe(401);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PUT /api/workload/:id â€” ediÃ§Ã£o e permissÃµes
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('PUT /api/workload/:id', () => {
  let demandId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMec2Cookies))
      .send({ user_id: engMec2User.id, title: 'Demanda para edicao', load_percent: 20 });
    demandId = res.body.id;
  });

  it('coordenador mecÃ¢nico edita demanda de engenheiro mecÃ¢nico', async () => {
    const res = await request(app)
      .put(`/api/workload/${demandId}`)
      .set('Cookie', cookieHeader(coordMecCookies))
      .send({ title: 'Demanda editada pelo coordenador', load_percent: 55, status: 'em_andamento', priority: 'alta' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Demanda editada pelo coordenador');
    expect(res.body.load_percent).toBe(55);
  });

  it('coordenador de outra Ã¡rea NÃƒO pode editar demanda de engenheiro mecÃ¢nico (403)', async () => {
    const res = await request(app)
      .put(`/api/workload/${demandId}`)
      .set('Cookie', cookieHeader(coordEleCookies))
      .send({ title: 'Tentativa indevida', load_percent: 10 });

    expect(res.status).toBe(403);
  });

  it('engenheiro NÃƒO pode editar demanda de outro usuÃ¡rio (403)', async () => {
    const res = await request(app)
      .put(`/api/workload/${demandId}`)
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ title: 'Tentativa indevida', load_percent: 10 });

    expect(res.status).toBe(403);
  });

  it('gerente edita qualquer demanda', async () => {
    const res = await request(app)
      .put(`/api/workload/${demandId}`)
      .set('Cookie', cookieHeader(gerenteCookies))
      .send({ title: 'Editado pelo gerente', load_percent: 60, status: 'bloqueada', priority: 'baixa' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Editado pelo gerente');
  });

  it('demanda inexistente retorna 404', async () => {
    const res = await request(app)
      .put('/api/workload/999999')
      .set('Cookie', cookieHeader(adminCookies))
      .send({ title: 'Inexistente', load_percent: 10 });

    expect(res.status).toBe(404);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DELETE /api/workload/:id
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe('DELETE /api/workload/:id', () => {
  it('engenheiro NÃƒO pode excluir demanda de outro usuÃ¡rio (403)', async () => {
    const createRes = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMec2Cookies))
      .send({ user_id: engMec2User.id, title: 'Para exclusao', load_percent: 5 });

    const res = await request(app)
      .delete(`/api/workload/${createRes.body.id}`)
      .set('Cookie', cookieHeader(engMecCookies));

    expect(res.status).toBe(403);
  });

  it('engenheiro exclui a prÃ³pria demanda', async () => {
    const createRes = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(engMecCookies))
      .send({ user_id: engMecUser.id, title: 'Demanda propria', load_percent: 5 });

    const res = await request(app)
      .delete(`/api/workload/${createRes.body.id}`)
      .set('Cookie', cookieHeader(engMecCookies));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('demanda inexistente retorna 404', async () => {
    const res = await request(app)
      .delete('/api/workload/999999')
      .set('Cookie', cookieHeader(adminCookies));

    expect(res.status).toBe(404);
  });
});

// GET /api/workload/alerts/late - alertas de demandas atrasadas
// -----------------------------------------------------------------------------
describe('GET /api/workload/alerts/late', () => {
  let lateMecId, lateEleId;

  beforeAll(async () => {
    const mec = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(coordMecCookies))
      .send({ user_id: engMecUser.id, title: 'Atrasada mecanica', load_percent: 35, status: 'bloqueada', due_date: '2026-01-10' });
    lateMecId = mec.body.id;

    const ele = await request(app)
      .post('/api/workload')
      .set('Cookie', cookieHeader(gerenteCookies))
      .send({ user_id: engEleUser.id, title: 'Atrasada eletrica', load_percent: 25, status: 'bloqueada', due_date: '2026-01-11' });
    lateEleId = ele.body.id;
  });

  it('responsavel ve a propria demanda atrasada', async () => {
    const res = await request(app)
      .get('/api/workload/alerts/late')
      .set('Cookie', cookieHeader(engMecCookies));

    expect(res.status).toBe(200);
    expect(res.body.demands.map(d => d.id)).toContain(lateMecId);
    expect(res.body.demands.map(d => d.id)).not.toContain(lateEleId);
  });

  it('coordenador ve atrasadas da propria area', async () => {
    const res = await request(app)
      .get('/api/workload/alerts/late')
      .set('Cookie', cookieHeader(coordMecCookies));

    expect(res.status).toBe(200);
    const ids = res.body.demands.map(d => d.id);
    expect(ids).toContain(lateMecId);
    expect(ids).not.toContain(lateEleId);
  });

  it('gerente ve atrasadas de todas as areas', async () => {
    const res = await request(app)
      .get('/api/workload/alerts/late')
      .set('Cookie', cookieHeader(gerenteCookies));

    expect(res.status).toBe(200);
    const ids = res.body.demands.map(d => d.id);
    expect(ids).toContain(lateMecId);
    expect(ids).toContain(lateEleId);
  });
});
