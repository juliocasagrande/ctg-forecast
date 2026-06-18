import dotenv from 'dotenv';
dotenv.config();

import { initDB } from './db/schema.js';
import { seedAdmin } from './db/seed.js';
import { createApp } from './app.js';
import { startMonthlyBackupSchedule } from './services/monthlyBackup.js';

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  console.error('FRONTEND_URL nao definida. Configure a variavel de ambiente antes de subir em producao.');
  process.exit(1);
}

const app = createApp();
const PORT = process.env.PORT || 3005;

async function start() {
  try {
    await initDB();
    await seedAdmin();
    app.listen(PORT, () => {
      console.log(`App rodando na porta ${PORT}`);
      startMonthlyBackupSchedule();
    });
  } catch (err) {
    console.error('Falha ao iniciar:', err);
    process.exit(1);
  }
}

start();
