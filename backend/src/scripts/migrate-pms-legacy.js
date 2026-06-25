/**
 * Migração única dos documentos PMS (POL/IM/GM/MM) da planilha legada
 * "CTG Brazil - Maintenance Instructions and Guides List.xlsx" para a
 * tabela pms_documents. Usa o mesmo parser do layout de referência
 * (backend/src/utils/pmsExcelFormat.js) usado pela importação da página.
 *
 * Uso: node src/scripts/migrate-pms-legacy.js "<caminho-do-xlsx>"
 *
 * A planilha não possui um responsável nominal por documento (só área e,
 * para GM/MM, usina) — o campo "responsible" é gravado com um placeholder
 * e deve ser reatribuído manualmente na UI depois da migração.
 */
import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../db/schema.js';
import { loadWorkbookFromBuffer, parseLegacyWorkbook } from '../utils/pmsExcelFormat.js';
import fs from 'fs/promises';

const PLACEHOLDER_RESPONSIBLE = process.env.PMS_MIGRATION_RESPONSIBLE || 'A definir';

async function run(filePath) {
  if (!filePath) {
    console.error('Uso: node src/scripts/migrate-pms-legacy.js "<caminho-do-xlsx>"');
    process.exitCode = 1;
    return;
  }

  const buffer = await fs.readFile(filePath);
  const workbook = await loadWorkbookFromBuffer(buffer);
  const { rows: allRows, perSheet } = parseLegacyWorkbook(workbook, PLACEHOLDER_RESPONSIBLE);
  Object.entries(perSheet).forEach(([type, n]) => console.log(`${type}: ${n} documentos encontrados`));

  const client = await pool.connect();
  let created = 0, skipped = 0, errors = 0;
  try {
    await client.query('BEGIN');
    for (const row of allRows) {
      try {
        const existing = await client.query('SELECT id FROM pms_documents WHERE code=$1', [row.code]);
        if (existing.rows.length) { skipped++; continue; }
        await client.query(`
          INSERT INTO pms_documents
            (type, code, base_code, revision, category, plant, equipment_number, sub_item, area,
             title_pt, title_en, has_pt, has_en, responsible, date, status, document_link, notes,
             created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
        `, [row.type, row.code, row.base_code, row.revision, row.category, row.plant,
            row.equipment_number, row.sub_item, row.area, row.title_pt, row.title_en,
            row.has_pt, row.has_en, row.responsible, row.date, row.status,
            row.document_link, row.notes]);
        created++;
      } catch (err) {
        console.error(`Erro ao importar ${row.code}:`, err.message);
        errors++;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`\nMigração concluída: ${created} criados, ${skipped} já existiam, ${errors} erros.`);
}

try {
  await run(process.argv[2]);
} catch (err) {
  console.error('Falha na migração:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
