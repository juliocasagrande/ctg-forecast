// backend/src/db/seed.js
// Seed seguro de usuário administrador (idempotente)

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/* ──────────────────────────────────────────────────────────────
 * GUARDA DE SEGURANÇA
 * Não roda seed sem DATABASE_URL
 * ────────────────────────────────────────────────────────────── */
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida');
  process.exit(1);
}

/* ──────────────────────────────────────────────────────────────
 * POOL DE CONEXÃO (AZURE COMPATÍVEL)
 * ────────────────────────────────────────────────────────────── */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000
});

/* ──────────────────────────────────────────────────────────────
 * SEED
 * ────────────────────────────────────────────────────────────── */
export async function seedAdmin() {
  const client = await pool.connect();

  try {
    console.log('🌱 Iniciando seed do usuário admin...');

    /* ─── Garantir tabela ───────────────────────────────────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(120) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'engenheiro'
          CHECK (role IN ('admin','coordenador','engenheiro','planejador','gerente')),
        active BOOLEAN DEFAULT true,
        avatar_initials VARCHAR(4),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    /* ─── Dados do admin ─────────────────────────────────────── */
    const ADMIN_NAME  = process.env.ADMIN_NAME  || 'Administrador';
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@ctgbrasil.com').toLowerCase();
    const ADMIN_PASS = process.env.ADMIN_PASS;

    const initials = ADMIN_NAME
      .split(' ')
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase())
      .join('');

    /* ─── Verifica se já existe ──────────────────────────────── */
    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [ADMIN_EMAIL]
    );

    // Agora que temos `existing`, podemos validar ADMIN_PASS
    if (!ADMIN_PASS && existing.rows.length === 0) {
      throw new Error(
        'ADMIN_PASS não definido e usuário admin não existe no banco'
      );
    }

    let hash;

    if (existing.rows.length === 0) {
      // ✅ Novo admin — sempre precisa de hash
      hash = await bcrypt.hash(ADMIN_PASS, 12);
    } else {
      // ✅ Admin já existe → NÃO troca senha automaticamente em prod
      if (process.env.FORCE_ADMIN_RESET === 'true') {
        hash = await bcrypt.hash(ADMIN_PASS, 12);
      } else {
        hash = null;
      }
    }

    /* ─── Insert / Update ────────────────────────────────────── */
    // Quando hash é null (admin já existe e não é reset forçado),
    // usamos subquery para manter a senha atual do banco.
    const query = `
      INSERT INTO users (name, email, password_hash, role, avatar_initials)
      VALUES ($1, $2, $3, 'admin', $4)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = 'admin',
        updated_at = NOW()
      RETURNING id, name, email, role;
    `;

    let passwordToUse = hash;

    if (!hash) {
      // Busca password_hash existente caso não haja hash novo
      const res = await client.query(
        `SELECT password_hash FROM users WHERE email = $1`,
        [ADMIN_EMAIL]
      );
      if (res.rows.length === 0) {
        throw new Error('Usuário admin não existe e hash não definido');
      }
      passwordToUse = res.rows[0].password_hash;
    }

    const params = [ADMIN_NAME, ADMIN_EMAIL, passwordToUse, initials];
    const r = await client.query(query, params);

    console.log('✅ Usuário admin pronto:');
    console.log(`   Nome:  ${r.rows[0].name}`);
    console.log(`   Email: ${r.rows[0].email}`);
    console.log(`   Role:  ${r.rows[0].role}`);

    if (hash && process.env.NODE_ENV !== 'production') {
      console.log(`   Senha: ${ADMIN_PASS}`);
      console.log('⚠️  Troque a senha após o primeiro login!');
    }

  } catch (err) {
    console.error('❌ Erro no seedAdmin:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
