import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function initDB() {
  const client = await pool.connect();
  try {
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
      CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_user ON project_assignments(user_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);
      CREATE INDEX IF NOT EXISTS idx_checkins_project ON project_checkins(project_id);
      CREATE INDEX IF NOT EXISTS idx_activity_project ON project_activity_log(project_id);
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
      ALTER TABLE forecast_entries DROP CONSTRAINT IF EXISTS forecast_entries_type_check;
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
        ('fiscal_year_start',    '1')
      ON CONFLICT (key) DO NOTHING;
    `);

    console.log('✅ Migrations applied');
  } finally {
    client.release();
  }
}
