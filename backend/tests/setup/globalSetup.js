/**
 * globalSetup.js — Roda UMA VEZ no processo principal do Vitest.
 * Responsável por:
 *   1. Carregar o .env.test
 *   2. Inicializar as tabelas do banco de testes (CREATE TABLE IF NOT EXISTS)
 *   3. Fechar o pool ao final de todos os testes
 */
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setup() {
  // 1. Carrega variáveis de ambiente de teste
  const { config } = await import('dotenv');
  config({
    path: path.join(__dirname, '../.env.test'),
    override: true,
  });
  process.env.NODE_ENV = 'test';

  // 2. Cria as tabelas (idempotente — usa CREATE TABLE IF NOT EXISTS)
  const { initDB } = await import('../../src/db/schema.js');
  await initDB();

  console.log('\n✅  Banco de testes inicializado.\n');
}

export async function teardown() {
  try {
    const { pool } = await import('../../src/db/schema.js');
    await pool.end();
    console.log('\n✅  Pool do banco de testes encerrado.\n');
  } catch {
    // ignora erros no teardown
  }
}
