import dotenv from 'dotenv';
dotenv.config();

import { createAndEmailOperationalBackup } from '../services/monthlyBackup.js';
import { pool } from '../db/schema.js';

try {
  const result = await createAndEmailOperationalBackup({ overwrite: true });
  console.log(result.skipped ? `Backup ja existia: ${result.filePath}` : `Backup gerado: ${result.filePath}`);
  if (result.email?.sent) {
    console.log(`E-mail enviado para: ${result.email.recipients.join(', ')}`);
  } else {
    console.log('E-mail nao enviado: BACKUP_EMAIL_TO nao configurado.');
  }
} catch (err) {
  console.error('Falha ao gerar backup:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
