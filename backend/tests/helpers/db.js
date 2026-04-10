/**
 * helpers/db.js — Utilitários de banco para testes.
 * Usa pool dedicado apontando para o banco de testes.
 */
import pg from 'pg';

const { Pool } = pg;

let _pool;

function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      max: 5,
    });
  }
  return _pool;
}

/** Executa SQL bruto no banco de testes */
export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

/**
 * Apaga TODOS os dados de teste de forma segura (CASCADE).
 * Chame em beforeAll ou beforeEach para garantir isolamento.
 */
export async function cleanAllTestData() {
  await getPool().query(`
    TRUNCATE TABLE
      forecast_entries,
      year_consolidated,
      actual_consolidated,
      messages,
      message_reads,
      project_assignments,
      access_delegations,
      vacation_periods,
      documents,
      document_authors,
      lists_iacs,
      lists_projects_tracking,
      feedback,
      alert_dismissals,
      audit_log,
      projects,
      users
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Apaga apenas as tabelas listadas (CASCADE).
 * Ex: cleanTables('users', 'projects')
 */
export async function cleanTables(...tables) {
  if (!tables.length) return;
  const list = tables.join(', ');
  await getPool().query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Encerra o pool (chamado no afterAll global se necessário) */
export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
