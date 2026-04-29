import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.PG_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

/* ─────────────────────────────────────────────
 * ADMIN
 * ───────────────────────────────────────────── */
async function ensureAdminUser(client) {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASS;
    const name = process.env.ADMIN_NAME || 'Administrador';
    const forceReset = process.env.FORCE_ADMIN_RESET === 'true';

    if (!email || !password) {
      console.warn('⚠️ ADMIN não configurado');
      return;
    }

    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0 && !forceReset) return;

    const hash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         active = true,
         updated_at = NOW()`,
      [name, email, hash]
    );

    console.log(existing.rows.length > 0 ? '✅ Admin resetado' : '✅ Admin criado');
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
       ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
     `);

    await client.query(`
      UPDATE users SET role = 'coordenador' WHERE role = 'gestor';
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','coordenador','engenheiro','planejador','gerente'));
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
        ('alert_empty_forecast','true'),
        ('doc_alert_enabled','true'),
        ('doc_alert_interval_days','7'),
        ('doc_alert_exclude_cancelled','true'),
        ('doc_alert_exclude_published','true'),
        ('doc_alert_roles','engenheiro,coordenador,planejador'),
        ('doc_alert_areas',''),
        ('tracking_alert_interval_days','30'),
        ('tracking_alert_enabled','true')
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
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id),
        type       VARCHAR(30) DEFAULT 'suggestion',
        subject    TEXT,
        message    TEXT,
        user_name  VARCHAR(120),
        user_email VARCHAR(120),
        user_role  VARCHAR(30),
        status     VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS type       VARCHAR(30)  DEFAULT 'suggestion';
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_name  VARCHAR(120);
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_email VARCHAR(120);
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_role  VARCHAR(30);
      ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status     VARCHAR(20)  DEFAULT 'new';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        event VARCHAR(40),
        email VARCHAR(120),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address VARCHAR(60);
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS success BOOLEAN;
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS detail TEXT;
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

    /* ───────── PASSWORD RESET TOKENS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(100) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
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

    /* ───────── DOCUMENT AUTHORS (multi-author support) ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_authors (
        id          SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        added_by    INTEGER REFERENCES users(id),
        added_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(document_id, user_id)
      );
    `);

    /* ───────── DOCUMENT GROUP (agrupamento por base_code) ───────── */
    await client.query(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS base_code VARCHAR(50) DEFAULT NULL;
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

    /* ───────── LISTS: IACs ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS lists_iacs (
        id                          SERIAL PRIMARY KEY,
        iac_code                    VARCHAR(50),
        type_line                   VARCHAR(30) DEFAULT 'New',
        area                        VARCHAR(30) NOT NULL DEFAULT 'Elétrica',
        qty_pp_line_26_priority     INTEGER,
        qty_pp_line_26_no_priority  INTEGER,
        opening_date                DATE,
        when_open                   DATE,
        project                     TEXT,
        comments                    TEXT,
        requester                   VARCHAR(120),
        team_leader                 VARCHAR(120),
        chinese_work_staff          VARCHAR(120),
        status_current              VARCHAR(50) DEFAULT '0 - Not started yet',
        apresentado_work_team       VARCHAR(10) DEFAULT 'Não',
        organizer                   VARCHAR(120),
        supervisor                  VARCHAR(120),
        evaluation_team             TEXT,
        priority                    VARCHAR(20) DEFAULT 'Non Priority',
        validity                    VARCHAR(20) DEFAULT 'Dez/2027',
        continuidade                VARCHAR(10) DEFAULT 'Sim',
        created_at                  TIMESTAMPTZ DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Drop UNIQUE constraint on iac_code and add unique_key column
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'idx_iac_code_unique'
        ) THEN
          ALTER TABLE lists_iacs DROP CONSTRAINT idx_iac_code_unique;
        END IF;
      END $$;
    `);

    // Add unique_key column and create UNIQUE index on it
    // unique_key = iac_code + first 40 chars of project (to handle duplicate IAC codes with different projects)
    await client.query(`
      ALTER TABLE lists_iacs ADD COLUMN IF NOT EXISTS unique_key VARCHAR(100);
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'idx_iac_unique_key'
        ) THEN
          -- Generate unique_key for existing rows
          UPDATE lists_iacs
          SET unique_key = iac_code || '|' || COALESCE(SUBSTRING(project FROM 1 FOR 40), '')
          WHERE unique_key IS NULL;

          -- Create the UNIQUE index
          CREATE UNIQUE INDEX IF NOT EXISTS idx_iac_unique_key
            ON lists_iacs(unique_key);
        END IF;
      END $$;
    `);

    /* ───────── LISTS: PROJECTS TRACKING ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS lists_projects_tracking (
        id                    SERIAL PRIMARY KEY,
        area                  VARCHAR(30) NOT NULL DEFAULT 'Elétrica',
        uhe                   VARCHAR(60) DEFAULT 'Geral',
        pp_contrato           VARCHAR(30),
        projeto_atividade     TEXT,
        projeto               VARCHAR(200),
        status                VARCHAR(50) DEFAULT 'Em andamento',
        gestor                VARCHAR(120),
        resumo                TEXT,
        empresa               TEXT,
        vencimento            DATE,
        vencimento_txt        VARCHAR(60),
        cronograma            TEXT,
        aditivos              TEXT,
        reajustes             TEXT,
        valor_contrato        VARCHAR(60),
        realizado_contrato    VARCHAR(60),
        saldo_contrato        VARCHAR(60),
        valor_si              VARCHAR(60),
        realizado_si          VARCHAR(60),
        saldo_si              VARCHAR(60),
        fornecedor            VARCHAR(200),
        natureza              VARCHAR(30) DEFAULT 'OPEX',
        aditivo_em_andamento  VARCHAR(10) DEFAULT 'NÃO',
        unique_key            VARCHAR(100),
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Drop old UNIQUE constraint on pp_contrato (allow duplicate PP codes for temporary processes)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pt_pp_contrato'
        ) THEN
          DROP INDEX IF EXISTS idx_pt_pp_contrato;
        END IF;
      END $$;
    `);

    // Add unique_key column and create UNIQUE index on it
    // unique_key = pp_contrato + first 30 chars of projeto_atividade (to handle duplicate PP codes)
    await client.query(`
      ALTER TABLE lists_projects_tracking ADD COLUMN IF NOT EXISTS unique_key VARCHAR(100);
    `);
    
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pt_unique_key'
        ) THEN
          -- Generate unique_key for existing rows that don't have it
          UPDATE lists_projects_tracking
          SET unique_key = pp_contrato || '|' || COALESCE(SUBSTRING(projeto_atividade FROM 1 FOR 40), '')
          WHERE unique_key IS NULL;

          -- Create the UNIQUE index
          CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_unique_key
            ON lists_projects_tracking(unique_key);
        END IF;
      END $$;
    `);

    /* ───────── PROJECTS TRACKING: LAST VIEWED (per user) ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS lists_pt_last_viewed (
        id                    SERIAL PRIMARY KEY,
        tracking_id           INTEGER REFERENCES lists_projects_tracking(id) ON DELETE CASCADE,
        user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
        viewed_at             TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tracking_id, user_id)
      );
    `);

    /* ───────── IACs: LAST VIEWED (per user) ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS lists_iacs_last_viewed (
        id                    SERIAL PRIMARY KEY,
        iac_id                INTEGER REFERENCES lists_iacs(id) ON DELETE CASCADE,
        user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
        viewed_at             TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(iac_id, user_id)
      );
    `);

    /* ───────── USER FK RELATIONS: team_leader / gestor ───────── */
    await client.query(`
      ALTER TABLE lists_iacs ADD COLUMN IF NOT EXISTS team_leader_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE lists_projects_tracking ADD COLUMN IF NOT EXISTS gestor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
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