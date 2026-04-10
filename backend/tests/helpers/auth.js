/**
 * helpers/auth.js — Criação de usuários e login para testes.
 */
import request from 'supertest';
import bcrypt   from 'bcryptjs';
import { query } from './db.js';

const DEFAULT_PASSWORD = 'Teste@Seguro123';

/**
 * Insere um usuário diretamente no banco e retorna o registro + senha em texto.
 */
export async function createTestUser({
  name             = 'Usuário Teste',
  email,
  password         = DEFAULT_PASSWORD,
  role             = 'engenheiro',
  active           = true,
  pending_approval = false,
  area             = 'eletrica',
} = {}) {
  if (!email) throw new Error('createTestUser: email é obrigatório');

  const hash = await bcrypt.hash(password, 10);
  const initials = name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('');

  const r = await query(
    `INSERT INTO users (name, email, password_hash, role, active, pending_approval, area, avatar_initials)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role          = EXCLUDED.role,
           active        = EXCLUDED.active,
           pending_approval = EXCLUDED.pending_approval,
           area          = EXCLUDED.area
     RETURNING *`,
    [name, email.toLowerCase(), hash, role, active, pending_approval, area, initials]
  );

  return { ...r.rows[0], password };
}

/**
 * Faz login via HTTP e retorna o cookie de autenticação.
 * Lança erro se o login falhar.
 */
export async function loginAs(app, user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password });

  if (res.status !== 200) {
    throw new Error(
      `loginAs falhou para ${user.email} — status ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  const cookies = res.headers['set-cookie'];
  return { cookies, token: res.body.token, user: res.body.user };
}

/**
 * Retorna a string do cookie para uso em .set('Cookie', ...)
 */
export function cookieHeader(cookies) {
  return Array.isArray(cookies) ? cookies.join('; ') : cookies;
}

/** Atalho: cria um admin de teste e faz login */
export async function createAndLoginAdmin(app, emailPrefix = 'admin') {
  const user = await createTestUser({
    email: `${emailPrefix}@ctg-test.internal`,
    role: 'admin',
    name: 'Admin Teste',
  });
  return loginAs(app, user);
}
