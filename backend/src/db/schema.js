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
       ALTER TABLE users ADD COLUMN IF NOT EXISTS azure_upn VARCHAR(120) DEFAULT NULL;
     `);

    await client.query(`
      ALTER TABLE IF EXISTS metas ADD COLUMN IF NOT EXISTS assigned_user_ids INTEGER[] DEFAULT NULL;
      ALTER TABLE IF EXISTS metas ADD COLUMN IF NOT EXISTS assigned_weights JSONB DEFAULT '{}'::jsonb;
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
        ('tracking_alert_interval_days','6'),
        ('tracking_alert_enabled','true'),
        ('tracking_alert_roles','gerente,coordenador,engenheiro,admin'),
        ('iac_alert_interval_days','6'),
        ('iac_alert_enabled','true'),
        ('iac_alert_roles','gerente,coordenador,engenheiro,admin')
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(`
      UPDATE system_settings SET value='6'
      WHERE (key='tracking_alert_interval_days' AND value='30')
         OR (key='iac_alert_interval_days' AND value='14');
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

    /* ───────── PMS DOCUMENTS (POL/IM/GM/MM — controle de documentos técnicos) ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS pms_documents (
        id               SERIAL PRIMARY KEY,
        type             VARCHAR(10)  NOT NULL,
        code             VARCHAR(60)  UNIQUE NOT NULL,
        base_code        VARCHAR(60)  NOT NULL,
        revision         INTEGER      DEFAULT NULL,
        category         VARCHAR(120) DEFAULT NULL,
        plant            VARCHAR(60)  DEFAULT NULL,
        equipment_number VARCHAR(30)  DEFAULT NULL,
        sub_item         VARCHAR(30)  DEFAULT NULL,
        area             VARCHAR(80)  NOT NULL,
        title_pt         TEXT         NOT NULL,
        title_en         TEXT         DEFAULT NULL,
        has_pt           BOOLEAN      DEFAULT true,
        has_en           BOOLEAN      DEFAULT false,
        responsible      VARCHAR(120) NOT NULL,
        date             DATE         NOT NULL,
        status           VARCHAR(30)  NOT NULL DEFAULT 'Em elaboração',
        document_link    TEXT         DEFAULT NULL,
        notes            TEXT         DEFAULT NULL,
        created_by       INTEGER REFERENCES users(id),
        updated_by       INTEGER REFERENCES users(id),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      INSERT INTO system_settings (key, value) VALUES
        ('pms_alert_enabled','true'),
        ('pms_alert_days','30'),
        ('pms_alert_roles','coordenador,gerente,admin')
      ON CONFLICT (key) DO NOTHING;
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

    /* ───────── METAS (Metas Engenharia) ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS metas (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        area            VARCHAR(30) NOT NULL DEFAULT 'eletrica',
        year            INTEGER NOT NULL,
        meta_number     INTEGER NOT NULL,
        description     TEXT NOT NULL,
        target_value    NUMERIC(15,2) DEFAULT 0,
        achieved_value   NUMERIC(15,2) DEFAULT 0,
        unit            VARCHAR(30) DEFAULT '',
        status          VARCHAR(30) DEFAULT 'Em andamento',
        evidence_image  TEXT DEFAULT NULL,
        evidence_link   TEXT DEFAULT NULL,
        notes           TEXT DEFAULT NULL,
        created_by      INTEGER REFERENCES users(id),
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, year, meta_number)
      );

      -- Garante que a constraint de área aceita todas as categorias
      ALTER TABLE metas DROP CONSTRAINT IF EXISTS metas_area_check;
      ALTER TABLE metas ADD CONSTRAINT metas_area_check
        CHECK (area IN ('eletrica','mecanica','confiabilidade','coordenacao','modernizacao'));

      -- Garante que a constraint de status aceita os valores corretos
      ALTER TABLE metas DROP CONSTRAINT IF EXISTS metas_status_check;
      ALTER TABLE metas ADD CONSTRAINT metas_status_check
        CHECK (status IN ('Não iniciado','Nao iniciado','Em andamento','Concluida','Concluída','Cancelada'));

      ALTER TABLE metas ADD COLUMN IF NOT EXISTS kpi TEXT DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS detailed TEXT DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS weight NUMERIC(8,4) DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS target_80 TEXT DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS target_100 TEXT DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS target_120 TEXT DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS evidence_link TEXT DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS evidence_images JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS evidence_fits JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS evidence_layout VARCHAR(40) DEFAULT 'grid-2x2';
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS is_general BOOLEAN DEFAULT false;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS assigned_area VARCHAR(30) DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS assigned_user_ids INTEGER[] DEFAULT NULL;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS assigned_weights JSONB DEFAULT '{}'::jsonb;
      UPDATE metas SET user_id = NULL WHERE COALESCE(is_general, false) = true;
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
        acceptance_letter_signed     DATE,
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
      ALTER TABLE lists_iacs ADD COLUMN IF NOT EXISTS acceptance_letter_signed DATE;
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
        caminho_projeto       TEXT,
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
      ALTER TABLE lists_projects_tracking ADD COLUMN IF NOT EXISTS caminho_projeto TEXT;
    `);

    // Per-usina breakdown for projects spanning multiple plants (e.g. UHE "Geral").
    // Each column holds a JSON array of { uhe, valor } entries; the flat
    // valor_contrato/realizado_contrato/valor_si/realizado_si columns above always
    // keep the clean aggregate total so existing SUM()/parseFloat() consumers
    // (chat, monthly report, export, dashboard) keep working unchanged.
    await client.query(`
      ALTER TABLE lists_projects_tracking ADD COLUMN IF NOT EXISTS valor_contrato_breakdown JSONB;
      ALTER TABLE lists_projects_tracking ADD COLUMN IF NOT EXISTS realizado_contrato_breakdown JSONB;
      ALTER TABLE lists_projects_tracking ADD COLUMN IF NOT EXISTS valor_si_breakdown JSONB;
      ALTER TABLE lists_projects_tracking ADD COLUMN IF NOT EXISTS realizado_si_breakdown JSONB;
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

    /* ───────── CONTROLE DE CARGA (workload demands) ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS workload_demands (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         VARCHAR(200) NOT NULL,
        description   TEXT DEFAULT NULL,
        status        VARCHAR(20) NOT NULL DEFAULT 'planejada',
        priority      VARCHAR(10) NOT NULL DEFAULT 'media',
        load_percent  INTEGER NOT NULL DEFAULT 0,
        due_date      DATE DEFAULT NULL,
        created_by    INTEGER REFERENCES users(id),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE workload_demands ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT NULL;

      ALTER TABLE workload_demands DROP CONSTRAINT IF EXISTS workload_demands_status_check;
      ALTER TABLE workload_demands ADD CONSTRAINT workload_demands_status_check
        CHECK (status IN ('planejada','em_andamento','bloqueada','concluida'));

      ALTER TABLE workload_demands DROP CONSTRAINT IF EXISTS workload_demands_priority_check;
      ALTER TABLE workload_demands ADD CONSTRAINT workload_demands_priority_check
        CHECK (priority IN ('baixa','media','alta'));

      ALTER TABLE workload_demands DROP CONSTRAINT IF EXISTS workload_demands_load_percent_check;
      ALTER TABLE workload_demands ADD CONSTRAINT workload_demands_load_percent_check
        CHECK (load_percent >= 0 AND load_percent <= 100);

      CREATE INDEX IF NOT EXISTS idx_workload_demands_user   ON workload_demands(user_id);
      CREATE INDEX IF NOT EXISTS idx_workload_demands_status ON workload_demands(status);
    `);

    /* ───────── EQUIPAMENTOS DE SUBESTAÇÃO ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS equipamentos_subestacao (
        id                SERIAL PRIMARY KEY,
        usina             VARCHAR(100) NOT NULL,
        tipo_tabela       VARCHAR(100) NOT NULL DEFAULT 'Geral',
        equipamento       VARCHAR(100) NOT NULL,
        ug                VARCHAR(60)  NOT NULL,
        tag               VARCHAR(60)  NOT NULL,
        fabricante        VARCHAR(120),
        modelo            VARCHAR(120),
        num_serie         VARCHAR(120),
        tem_sobressalente VARCHAR(10)  DEFAULT 'Não',
        quantos           INTEGER      DEFAULT 0,
        ano               INTEGER,
        url_imagem        TEXT,
        created_by        INTEGER REFERENCES users(id),
        created_at        TIMESTAMPTZ  DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE equipamentos_subestacao ADD COLUMN IF NOT EXISTS tipo_tabela VARCHAR(100) NOT NULL DEFAULT 'Geral';
    `);

    // Normalize existing usina names to full format
    await client.query(`
      UPDATE equipamentos_subestacao SET usina = 'UHE Capivara'      WHERE usina = 'Capivara';
      UPDATE equipamentos_subestacao SET usina = 'UHE Garibaldi'     WHERE usina = 'Garibaldi';
      UPDATE equipamentos_subestacao SET usina = 'UHE Ilha Solteira' WHERE usina = 'Ilha Solteira';
      UPDATE equipamentos_subestacao SET usina = 'UHE Rosana'        WHERE usina = 'Rosana';
      UPDATE equipamentos_subestacao SET usina = 'UHE Salto'         WHERE usina = 'Salto';
      UPDATE equipamentos_subestacao SET usina = 'UHE Taquaruçu'     WHERE usina = 'Taquaruçu';
      UPDATE equipamentos_subestacao SET usina = 'UHE Chavantes'     WHERE usina = 'Chavantes';
      UPDATE equipamentos_subestacao SET usina = 'UHE Jupiá'         WHERE usina = 'Jupiá';
      UPDATE equipamentos_subestacao SET usina = 'UHE Jurumirim'     WHERE usina = 'Jurumirim';
      UPDATE equipamentos_subestacao SET usina = 'UHE Salto Grande'  WHERE usina = 'Salto Grande';
      UPDATE equipamentos_subestacao SET usina = 'UHE Canoas 1'      WHERE usina IN ('Canoas I','Canoas 1');
      UPDATE equipamentos_subestacao SET usina = 'UHE Canoas 2'      WHERE usina IN ('Canoas II','Canoas 2');
      UPDATE equipamentos_subestacao SET usina = 'PCH Palmeiras'     WHERE usina = 'Palmeiras';
      UPDATE equipamentos_subestacao SET usina = 'PCH Retiro'        WHERE usina = 'Retiro';
    `);

    /* ───────── EQUIPAMENTOS: CONTROLE DE ACESSO ───────── */
    // Access is per tipo_tabela only — usina is irrelevant for permissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS equipamentos_acesso (
        id          SERIAL PRIMARY KEY,
        tipo_tabela VARCHAR(100) NOT NULL,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tipo_tabela, user_id)
      );
    `);

    /* ───────── EQUIPAMENTOS: TABELAS PRÉ-CONFIGURADAS ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS equipamentos_tabelas_pre (
        id          SERIAL PRIMARY KEY,
        tipo_tabela VARCHAR(100) NOT NULL,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tipo_tabela)
      );
    `);

    /* ───────── CRONOGRAMAS PROJECT (por usuário) ───────── */
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_projects (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_uid          VARCHAR(80) NOT NULL,
        name                TEXT NOT NULL DEFAULT 'Novo cronograma',
        plant               TEXT DEFAULT '',
        description         TEXT DEFAULT '',
        active_revision_uid VARCHAR(80) DEFAULT 'rev-0',
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, client_uid)
      );

      CREATE TABLE IF NOT EXISTS schedule_revisions (
        id          SERIAL PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES schedule_projects(id) ON DELETE CASCADE,
        client_uid  VARCHAR(80) NOT NULL,
        label       VARCHAR(40) NOT NULL,
        sort_order  INTEGER DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id, client_uid)
      );

      CREATE TABLE IF NOT EXISTS schedule_tasks (
        id              SERIAL PRIMARY KEY,
        revision_id     INTEGER NOT NULL REFERENCES schedule_revisions(id) ON DELETE CASCADE,
        client_uid      VARCHAR(80) NOT NULL,
        wbs             VARCHAR(40) DEFAULT '',
        name            TEXT NOT NULL DEFAULT 'Nova tarefa',
        type            VARCHAR(20) NOT NULL DEFAULT 'task',
        start_date      DATE,
        end_date        DATE,
        progress        INTEGER DEFAULT 0,
        predecessor_uid VARCHAR(80) DEFAULT '',
        dependency_type VARCHAR(10) DEFAULT 'FS',
        notes           TEXT DEFAULT '',
        sort_order      INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(revision_id, client_uid)
      );

      CREATE TABLE IF NOT EXISTS schedule_user_settings (
        user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        weekends_as_workdays  BOOLEAN DEFAULT false,
        show_today            BOOLEAN DEFAULT true,
        shade_weekends        BOOLEAN DEFAULT true,
        workdays              INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
        holidays              JSONB DEFAULT '[]'::jsonb,
        extra_workdays         JSONB DEFAULT '[]'::jsonb,
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE schedule_user_settings ADD COLUMN IF NOT EXISTS workdays INTEGER[] DEFAULT ARRAY[1,2,3,4,5];
      ALTER TABLE schedule_user_settings ADD COLUMN IF NOT EXISTS holidays JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE schedule_user_settings ADD COLUMN IF NOT EXISTS extra_workdays JSONB DEFAULT '[]'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_schedule_projects_user
        ON schedule_projects(user_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_revisions_project
        ON schedule_revisions(project_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_tasks_revision
        ON schedule_tasks(revision_id);

      -- FKs e colunas filtradas frequentemente (Dashboard / listagens)
      CREATE INDEX IF NOT EXISTS idx_project_assignments_user        ON project_assignments(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_project                ON messages(project_id);
      CREATE INDEX IF NOT EXISTS idx_messages_user                   ON messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user_created          ON audit_log(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alert_dismissals_user           ON alert_dismissals(user_id, dismissed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_documents_year_responsible      ON documents(year, responsible);
      CREATE INDEX IF NOT EXISTS idx_metas_user_year                 ON metas(user_id, year);
      CREATE INDEX IF NOT EXISTS idx_forecast_entries_project        ON forecast_entries(project_id);
    `);

    console.log('✅ Migrations OK');

    await ensureAdminUser(client);

  } catch (err) {
    console.error('❌ ERRO NO DB:', err);
    throw err;
  } finally {
    client.release();
  }
}
