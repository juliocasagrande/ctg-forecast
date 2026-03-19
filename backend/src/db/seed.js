// backend/src/db/seed.js
// Cria o primeiro usuário administrador
// Uso: node src/db/seed.js

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function seed() {
  const client = await pool.connect();
  try {
    // Garante que as tabelas existem
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(120) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'engenheiro'
          CHECK (role IN ('admin','gestor','engenheiro')),
        active BOOLEAN DEFAULT true,
        avatar_initials VARCHAR(4),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const ADMIN_NAME  = process.env.ADMIN_NAME  || 'Administrador';
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ctgbrasil.com';
    const ADMIN_PASS  = process.env.ADMIN_PASS  || 'ctg@2026';

    const hash = await bcrypt.hash(ADMIN_PASS, 10);
    const initials = ADMIN_NAME.split(' ').slice(0,2).map(w=>w[0].toUpperCase()).join('');

    const r = await client.query(`
      INSERT INTO users (name, email, password_hash, role, avatar_initials)
      VALUES ($1, $2, $3, 'admin', $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = 'admin',
        updated_at = NOW()
      RETURNING id, name, email, role
    `, [ADMIN_NAME, ADMIN_EMAIL.toLowerCase(), hash, initials]);

    console.log('\n✅ Usuário admin criado/atualizado:');
    console.log(`   Nome:  ${r.rows[0].name}`);
    console.log(`   Email: ${r.rows[0].email}`);
    console.log(`   Senha: ${ADMIN_PASS}`);
    console.log('\n⚠️  Troque a senha após o primeiro login!\n');
  } catch (err) {
    console.error('Erro no seed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
