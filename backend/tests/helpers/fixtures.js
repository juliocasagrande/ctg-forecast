/**
 * helpers/fixtures.js — Fábricas de dados para testes.
 */
import { query } from './db.js';

let _projectSeq = 1;

/** Cria um projeto de teste no banco */
export async function createProject({
  code        = `TST-${String(_projectSeq++).padStart(3, '0')}`,
  name        = 'Projeto Teste',
  description = 'Descrição de teste',
  si_value    = 100_000,
  pool_value  = 50_000,
  plants      = [],
} = {}) {
  // Convert JS array to PostgreSQL array format
  const pgPlants = Array.isArray(plants) && plants.length > 0 
    ? `{${plants.map(p => `"${p}"`).join(',')}}` 
    : '{}';
    
  const r = await query(
    `INSERT INTO projects (code, name, description, si_value, pool_value, plants)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [code, name, description, si_value, pool_value, pgPlants]
  );
  return r.rows[0];
}

/** Atribui um engenheiro a um projeto */
export async function assignEngineer(projectId, userId, assignedBy = null) {
  await query(
    `INSERT INTO project_assignments (project_id, user_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [projectId, userId, assignedBy ?? userId]
  );
}

/** Cria uma entrada de previsão */
export async function createForecastEntry({
  project_id,
  category   = 'Viagens',
  type       = 'Forecast',
  year       = new Date().getFullYear(),
  month      = 1,
  value      = 10_000,
  updated_by = null,
} = {}) {
  const r = await query(
    `INSERT INTO forecast_entries (project_id, category, type, year, month, value, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [project_id, category, type, year, month, value, updated_by]
  );
  return r.rows[0];
}

/** Cria um documento de teste */
export async function createDocument({
  code             = 'DOC-TEST-001',
  type             = 'RELATORIO',
  area             = 'eletrica',
  status           = 'rascunho',
  responsible      = 'Responsável Teste',
  document_link    = null,
  revision_number  = 0,
  title            = 'Documento de Teste',
} = {}) {
  const r = await query(
    `INSERT INTO documents (code, type, area, status, responsible, document_link, revision_number, title)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [code, type, area, status, responsible, document_link, revision_number, title]
  );
  return r.rows[0];
}

/** Cria um período de férias */
export async function createVacation({
  user_id,
  period_number = 1,
  start_date    = '2025-07-01',
  end_date      = '2025-07-15',
  year          = 2025,
  area          = 'eletrica',
} = {}) {
  const r = await query(
    `INSERT INTO vacation_periods (user_id, period_number, start_date, end_date, year, area)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [user_id, period_number, start_date, end_date, year, area]
  );
  return r.rows[0];
}

/** Cria uma delegação de acesso */
export async function createDelegation({
  delegator_id,
  delegate_id,
  start_date = '2025-01-01',
  end_date   = '2025-12-31',
  active     = true,
} = {}) {
  const r = await query(
    `INSERT INTO access_delegations (delegator_id, delegate_id, start_date, end_date, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [delegator_id, delegate_id, start_date, end_date, active]
  );
  return r.rows[0];
}
