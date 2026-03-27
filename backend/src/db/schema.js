import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: process.env.PG_REJECT_UNAUTHORIZED !== 'false', // default: true (secure)
  } : false
});

async function ensureAdminUser(client) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASS;
  const name = process.env.ADMIN_NAME || 'Administrador';

  if (!email || !password) {
    console.warn('⚠️ ADMIN_EMAIL ou ADMIN_PASS não definidos');
    return;
  }

  // Verifica se já existe
  const existing = await client.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (existing.rows.length > 0) {
    console.log('ℹ️ Admin já existe');
    return;
  }

  // Cria hash seguro
  const hash = await bcrypt.hash(password, 10);

  await client.query(
    `INSERT INTO users (name, email, password_hash, role, active)
     VALUES ($1, $2, $3, 'admin', true)`,
    [name, email, hash]
  );

  console.log('✅ Usuário admin criado automaticamente');
}

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'engenheiro';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
    `);

    await client.query(`
      ALTER TABLE forecast_entries ADD COLUMN IF NOT EXISTS type VARCHAR(10);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(120) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'engenheiro'
          CHECK (role IN ('admin','gestor','engenheiro','planejador')),
        active BOOLEAN DEFAULT true,
        pending_approval BOOLEAN DEFAULT false,
        avatar_initials VARCHAR(4),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        si_value NUMERIC(15,2) DEFAULT 0,
        pool_value NUMERIC(15,2) DEFAULT 0,
        plants TEXT[] DEFAULT '{}',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_assignments (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by INTEGER REFERENCES users(id),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS forecast_entries (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        category VARCHAR(20) NOT NULL CHECK (category IN ('Viagens','Contratos','POs')),
        type VARCHAR(10) NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        value NUMERIC(15,2) DEFAULT 0,
        comment TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id, category, type, year, month)
      );

      CREATE TABLE IF NOT EXISTS actual_consolidated (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        value NUMERIC(15,2) DEFAULT 0,
        comment TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id)
      );

      CREATE TABLE IF NOT EXISTS project_checkins (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        checked_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_activity_log (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        action VARCHAR(40) NOT NULL,
        acted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_notes (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        note_date DATE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS message_reads (
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_forecast_project ON forecast_entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_forecast_year ON forecast_entries(year);
      CREATE INDEX IF NOT EXISTS idx_forecast_project_year_type ON forecast_entries(project_id, year, type);
      CREATE INDEX IF NOT EXISTS idx_forecast_type_year ON forecast_entries(type, year);
      CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
      CREATE INDEX IF NOT EXISTS idx_messages_project_user ON messages(project_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_message_reads_user ON message_reads(user_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_user ON project_assignments(user_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);
      CREATE INDEX IF NOT EXISTS idx_checkins_project ON project_checkins(project_id);
      CREATE INDEX IF NOT EXISTS idx_activity_project ON project_activity_log(project_id);
      CREATE INDEX IF NOT EXISTS idx_notes_project ON project_notes(project_id);
    `);
    console.log('✅ Database initialized');

    // Incremental migrations
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN DEFAULT false;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS plants TEXT[] DEFAULT '{}';
      ALTER TABLE project_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // Role constraint
    await client.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','gestor','engenheiro','planejador'));
    `);

    // Expand forecast_entries type to include Meta and Pool
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='forecast_entries' AND column_name='type'
        ) THEN
          ALTER TABLE forecast_entries DROP CONSTRAINT IF EXISTS forecast_entries_type_check;
          ALTER TABLE forecast_entries ADD CONSTRAINT forecast_entries_type_check
            CHECK (type IN ('Budget','Forecast','Actual','Meta','Pool'));
        END IF;
      END$$;
      ALTER TABLE forecast_entries ADD CONSTRAINT forecast_entries_type_check
        CHECK (type IN ('Budget','Forecast','Actual','Meta','Pool'));
    `);

    // System settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key   VARCHAR(80) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO system_settings (key, value) VALUES
        ('alert_stale_days',     '30'),
        ('alert_empty_forecast', 'true'),
        ('alert_unread_messages','true'),
        ('color_budget',         '#15803D'),
        ('color_forecast',       '#0EA5E9'),
        ('color_actual',         '#1E40AF'),
        ('color_meta',           '#7C3AED'),
        ('color_pool',           '#0891B2'),
        ('export_include_meta',  'true'),
        ('export_include_pool',  'true'),
        ('fiscal_year_start',    '1'),
        ('active_year_start',    '2025'),
        ('active_year_end',      '2027'),
        ('actual_deadline_business_day', '6')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Consolidated yearly values (for closed/past years — single value per type+category+year)
    await client.query(`
      CREATE TABLE IF NOT EXISTS year_consolidated (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        category VARCHAR(20) NOT NULL CHECK (category IN ('Viagens','Contratos','POs','Total')),
        type VARCHAR(10) NOT NULL CHECK (type IN ('Budget','Forecast','Actual','Meta','Pool')),
        value NUMERIC(15,2) DEFAULT 0,
        comment TEXT,
        consolidated_by INTEGER REFERENCES users(id),
        consolidated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id, year, category, type)
      );
      CREATE INDEX IF NOT EXISTS idx_year_consolidated_project ON year_consolidated(project_id);
      CREATE INDEX IF NOT EXISTS idx_year_consolidated_year ON year_consolidated(project_id, year);
    `);

    // Migration: allow 'Total' category in year_consolidated
    await client.query(`
      ALTER TABLE year_consolidated DROP CONSTRAINT IF EXISTS year_consolidated_category_check;
      ALTER TABLE year_consolidated ADD CONSTRAINT year_consolidated_category_check
        CHECK (category IN ('Viagens','Contratos','POs','Total'));
    `);

    // Feedback / suggestions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(20) NOT NULL DEFAULT 'suggestion',
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        user_name VARCHAR(120),
        user_email VARCHAR(120),
        user_role VARCHAR(20),
        status VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Audit log for security events (login, password changes, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        event VARCHAR(40) NOT NULL,
        email VARCHAR(120),
        user_id INTEGER,
        ip_address VARCHAR(45),
        user_agent TEXT,
        success BOOLEAN NOT NULL DEFAULT true,
        detail TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event);
      CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(email);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
    `);

    // Access delegation (férias/ausência)
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_delegations (
        id SERIAL PRIMARY KEY,
        delegator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delegate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason VARCHAR(200),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT no_self_delegation CHECK (delegator_id != delegate_id)
      );
      CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON access_delegations(delegator_id);
      CREATE INDEX IF NOT EXISTS idx_delegations_delegate ON access_delegations(delegate_id);
      CREATE INDEX IF NOT EXISTS idx_delegations_dates ON access_delegations(start_date, end_date);
    `);

    // Alert dismissals — tracks acknowledged alerts so they don't reappear
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_dismissals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alert_type VARCHAR(30) NOT NULL,
        alert_key VARCHAR(120) NOT NULL,
        dismissed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, alert_type, alert_key)
      );
      CREATE INDEX IF NOT EXISTS idx_alert_dismissals_user ON alert_dismissals(user_id);
    `);

    console.log('✅ Migrations applied (with security tables)');
    try {
      await ensureAdminUser(client);
    } catch (err) {
      console.warn('⚠️ Falha ao garantir usuário admin (startup continua):', err.message);
    }
  } finally {
    client.release();
  }
}