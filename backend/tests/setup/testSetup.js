/**
 * testSetup.js — Roda em CADA worker antes de qualquer arquivo de teste.
 * Garante que DATABASE_URL e NODE_ENV estão corretos no contexto do worker.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({
  path: path.join(__dirname, '../.env.test'),
  override: true,
});

process.env.NODE_ENV = 'test';
