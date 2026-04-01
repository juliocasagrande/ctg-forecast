import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.PG_REJECT_UNAUTHORIZED !== 'false' }
    : false
});

/* ─────────────────────────────────────────────
 * ADMIN
 * ───────────────────────────────────────────── */
async function ensureAdminUser(client) {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASS;
    const name = process.env.ADMIN_NAME || 'Administrador';

    if (!email || !password) {
      console.warn('⚠️ ADMIN não configurado');
      return;
    }

    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) return;

    const hash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, 'admin', true)`,
      [name, email, hash]
    );

    console.log('✅ Admin criado');
  } catch (err) {
    console.warn('⚠️ Erro ao criar admin:', err.message);
  }
}

/* ─────────────────────────────────────────────
 * INIT DB (SAFE AZURE)
 * ───────────────────────────────────────────── */
export async function initDB() {
  const client = await pool.connect();

  try {
    console.log('🚀 Iniciando migrations...');

    /* ───────── USERS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120),
        email VARCHAR(120) UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'engenheiro';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_initials VARCHAR(4);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS area VARCHAR(30) DEFAULT NULL;
    `);

    await client.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','gestor','coordenador','engenheiro','planejador','gerente'));
    `);

    /* ───────── PROJECTS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE,
        name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS si_value NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS pool_value NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS plants TEXT[] DEFAULT '{}';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    /* ───────── PROJECT ASSIGNMENTS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_assignments (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        assigned_by INTEGER REFERENCES users(id),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id, user_id)
      );
    `);

    /* ───────── FORECAST ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS forecast_entries (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    await client.query(`
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS category VARCHAR(20);
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS type VARCHAR(10);
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS year INTEGER;
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS month INTEGER;
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS value NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS comment TEXT;
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE forecast_entries DROP CONSTRAINT IF EXISTS forecast_entries_type_check;
      ALTER TABLE forecast_entries ADD CONSTRAINT forecast_entries_type_check
        CHECK (type IN ('Budget','Forecast','Actual','Meta','Pool'));
    `);

    /* ✅ CORREÇÃO 1: UNIQUE constraint para upsert funcionar corretamente */
    await client.query(`
      ALTER TABLE forecast_entries
        DROP CONSTRAINT IF EXISTS uq_forecast_entry;
      ALTER TABLE forecast_entries
        ADD CONSTRAINT uq_forecast_entry
        UNIQUE (project_id, category, type, year, month);
    `);

    /* ───────── OUTRAS TABELAS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS actual_consolidated (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        value NUMERIC(15,2) DEFAULT 0,
        comment TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id)
      );

      CREATE TABLE IF NOT EXISTS project_checkins (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        checked_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_activity_log (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20),
        action VARCHAR(40),
        acted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_notes (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        note_date DATE,
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS message_reads (
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        read_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
      );
    `);

    /* ───────── SYSTEM SETTINGS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(80) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      INSERT INTO system_settings (key, value) VALUES
        ('alert_stale_days','30'),
        ('alert_empty_forecast','true')
      ON CONFLICT (key) DO NOTHING;
    `);

    /* ───────── YEAR CONSOLIDATED ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS year_consolidated (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        year INTEGER,
        category VARCHAR(20),
        type VARCHAR(10),
        value NUMERIC(15,2),
        UNIQUE(project_id, year, category, type)
      );
    `);

    /* ✅ CORREÇÃO 2: Colunas que faltavam na year_consolidated */
    await client.query(`
      ALTER TABLE year_consolidated ADD COLUMN IF NOT EXISTS comment TEXT;
      ALTER TABLE year_consolidated ADD COLUMN IF NOT EXISTS consolidated_by INTEGER REFERENCES users(id);
      ALTER TABLE year_consolidated ADD COLUMN IF NOT EXISTS consolidated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    /* ───────── FEEDBACK / AUDIT ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        subject TEXT,
        message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        event VARCHAR(40),
        email VARCHAR(120),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    /* ───────── DELEGATIONS / ALERTS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_delegations (
        id SERIAL PRIMARY KEY,
        delegator_id INTEGER REFERENCES users(id),
        delegate_id INTEGER REFERENCES users(id),
        start_date DATE,
        end_date DATE,
        active BOOLEAN DEFAULT true
      );

      ALTER TABLE access_delegations ADD COLUMN IF NOT EXISTS reason TEXT;

      CREATE TABLE IF NOT EXISTS alert_dismissals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        alert_type VARCHAR(30),
        alert_key VARCHAR(120),
        dismissed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, alert_type, alert_key)
      );
    `);

    /* ───────── DOCUMENTS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id              SERIAL PRIMARY KEY,
        code            VARCHAR(60) UNIQUE,
        type            VARCHAR(20) NOT NULL,
        area            VARCHAR(30) NOT NULL,
        sequence_number INTEGER NOT NULL,
        year            INTEGER NOT NULL,
        revision        INTEGER DEFAULT NULL,
        plant           VARCHAR(60) DEFAULT NULL,
        responsible     VARCHAR(120) NOT NULL,
        date            DATE NOT NULL,
        subject         TEXT NOT NULL,
        status          VARCHAR(30) NOT NULL DEFAULT 'Em elaboração',
        document_link   TEXT DEFAULT NULL,
        notes           TEXT DEFAULT NULL,
        created_by      INTEGER REFERENCES users(id),
        updated_by      INTEGER REFERENCES users(id),
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    /* ───────── VACATION PERIODS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS vacation_periods (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        area          VARCHAR(30) NOT NULL DEFAULT 'eletrica',
        period_number INTEGER NOT NULL CHECK (period_number IN (1,2,3)),
        start_date    DATE NOT NULL,
        end_date      DATE NOT NULL,
        days          INTEGER,
        adp_registered BOOLEAN DEFAULT false,
        year          INTEGER NOT NULL,
        notes         TEXT,
        created_by    INTEGER REFERENCES users(id),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, year, period_number)
      );

      -- Garante que a constraint de área aceita todas as categorias
      ALTER TABLE vacation_periods DROP CONSTRAINT IF EXISTS vacation_periods_area_check;
      ALTER TABLE vacation_periods ADD CONSTRAINT vacation_periods_area_check
        CHECK (area IN ('eletrica','mecanica','confiabilidade','coordenacao','modernizacao'));
    `);

    console.log('✅ Migrations OK');

    await ensureAdminUser(client);

  } catch (err) {
    console.error('❌ ERRO NO DB:', err);
    // NÃO derruba container
  } finally {
    client.release();
  }
}