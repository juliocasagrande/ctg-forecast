/**
 * Testes de integraÃ§Ã£o â€” /api/metas
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../setup/testApp.js';
import { createTestUser, loginAs, cookieHeader } from '../helpers/auth.js';
import { cleanTables, query } from '../helpers/db.js';

const app = getTestApp();
const PREFIX = 'metas';
const YEAR = new Date().getFullYear();

let engEletrica;
let engEletrica2;
let engMecanica;
let coordEletrica;
let gerente;
let overrideEng;
let cookies;

async function insertMeta({
  userId = null,
  area = 'eletrica',
  metaNumber,
  description,
  isGeneral = false,
  assignedArea = null,
  assignedUserIds = null,
}) {
  const res = await query(`
    INSERT INTO metas (
      user_id, area, year, meta_number, description, target_value,
      achieved_value, status, is_general, assigned_area, assigned_user_ids
    )
    VALUES ($1,$2,$3,$4,$5,100,0,'Em andamento',$6,$7,$8)
    RETURNING *
  `, [
    isGeneral ? null : userId,
    area,
    YEAR,
    metaNumber,
    description,
    isGeneral,
    assignedArea,
    assignedUserIds,
  ]);
  return res.rows[0];
}

async function seedMetas() {
  await query('TRUNCATE TABLE metas RESTART IDENTITY CASCADE');
  await insertMeta({ userId: engEletrica.id, metaNumber: 1, description: 'Meta individual eng eletrica' });
  await insertMeta({ userId: engEletrica2.id, metaNumber: 1, description: 'Meta individual eng eletrica 2' });
  await insertMeta({ userId: engMecanica.id, area: 'mecanica', metaNumber: 1, description: 'Meta individual eng mecanica' });
  await insertMeta({ userId: coordEletrica.id, metaNumber: 1, description: 'Meta individual coord eletrica' });
  await insertMeta({ isGeneral: true, area: 'eletrica', assignedArea: 'eletrica', metaNumber: 10, description: 'Meta coletiva eletrica' });
  await insertMeta({ isGeneral: true, area: 'mecanica', assignedArea: 'mecanica', metaNumber: 10, description: 'Meta coletiva mecanica' });
  await insertMeta({
    isGeneral: true,
    area: 'eletrica',
    assignedArea: 'eletrica',
    assignedUserIds: [engEletrica2.id],
    metaNumber: 11,
    description: 'Meta coletiva apenas eng eletrica 2',
  });
}

beforeAll(async () => {
  await cleanTables('metas', 'access_delegations', 'audit_log', 'users');

  engEletrica = await createTestUser({ name: 'Eng Eletrica', email: `${PREFIX}.eng@ctg-test.internal`, role: 'engenheiro', area: 'eletrica' });
  engEletrica2 = await createTestUser({ name: 'Eng Eletrica Dois', email: `${PREFIX}.eng2@ctg-test.internal`, role: 'engenheiro', area: 'eletrica' });
  engMecanica = await createTestUser({ name: 'Eng Mecanica', email: `${PREFIX}.mec@ctg-test.internal`, role: 'engenheiro', area: 'mecanica' });
  coordEletrica = await createTestUser({ name: 'Coord Eletrica', email: `${PREFIX}.coord@ctg-test.internal`, role: 'coordenador', area: 'eletrica' });
  gerente = await createTestUser({ name: 'Gerente', email: `${PREFIX}.gerente@ctg-test.internal`, role: 'gerente', area: null });
  overrideEng = await createTestUser({ name: 'Julio Override', email: 'julio.casagrande@ctgbr.com.br', role: 'engenheiro', area: 'eletrica' });

  cookies = {
    eng: (await loginAs(app, engEletrica)).cookies,
    coord: (await loginAs(app, coordEletrica)).cookies,
    gerente: (await loginAs(app, gerente)).cookies,
    override: (await loginAs(app, overrideEng)).cookies,
  };
});

beforeEach(async () => {
  await seedMetas();
});

afterAll(async () => {
  await cleanTables('metas', 'access_delegations', 'audit_log', 'users');
});

describe('GET /api/metas', () => {
  it('engenheiro ve apenas metas individuais proprias e coletivas aplicaveis', async () => {
    const res = await request(app)
      .get('/api/metas')
      .query({ year: YEAR })
      .set('Cookie', cookieHeader(cookies.eng));

    expect(res.status).toBe(200);
    const descriptions = res.body.map(m => m.description);
    expect(descriptions).toContain('Meta individual eng eletrica');
    expect(descriptions).toContain('Meta coletiva eletrica');
    expect(descriptions).not.toContain('Meta individual eng eletrica 2');
    expect(descriptions).not.toContain('Meta individual eng mecanica');
    expect(descriptions).not.toContain('Meta coletiva apenas eng eletrica 2');
  });

  it('coordenador ve metas proprias, dos engenheiros da area e coletivas da area', async () => {
    const res = await request(app)
      .get('/api/metas')
      .query({ year: YEAR })
      .set('Cookie', cookieHeader(cookies.coord));

    expect(res.status).toBe(200);
    const descriptions = res.body.map(m => m.description);
    expect(descriptions).toContain('Meta individual coord eletrica');
    expect(descriptions).toContain('Meta individual eng eletrica');
    expect(descriptions).toContain('Meta individual eng eletrica 2');
    expect(descriptions).toContain('Meta coletiva eletrica');
    expect(descriptions).not.toContain('Meta individual eng mecanica');
    expect(descriptions).not.toContain('Meta coletiva mecanica');
  });

  it('gerente ve metas de todas as areas', async () => {
    const res = await request(app)
      .get('/api/metas')
      .query({ year: YEAR })
      .set('Cookie', cookieHeader(cookies.gerente));

    expect(res.status).toBe(200);
    const descriptions = res.body.map(m => m.description);
    expect(descriptions).toContain('Meta individual eng eletrica');
    expect(descriptions).toContain('Meta individual eng mecanica');
    expect(descriptions).toContain('Meta coletiva eletrica');
    expect(descriptions).toContain('Meta coletiva mecanica');
  });

  it('usuario com override admin usa cargo original para escopo de visualizacao', async () => {
    await insertMeta({ userId: overrideEng.id, metaNumber: 2, description: 'Meta individual override' });

    const res = await request(app)
      .get('/api/metas')
      .query({ year: YEAR })
      .set('Cookie', cookieHeader(cookies.override));

    expect(res.status).toBe(200);
    const descriptions = res.body.map(m => m.description);
    expect(descriptions).toContain('Meta individual override');
    expect(descriptions).toContain('Meta coletiva eletrica');
    expect(descriptions).not.toContain('Meta individual eng eletrica');
    expect(descriptions).not.toContain('Meta individual eng mecanica');
  });
});
