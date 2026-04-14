/**
 * Script para diagnosticar e corrigir valores incorretos na tabela lists_projects_tracking
 * 
 * Uso:
 *   node scripts/fix-tracking-values.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function parseNum(v) {
  if (!v && v !== 0) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  
  const raw = String(v).trim();
  if (!raw) return 0;

  const isNegative = raw.startsWith('-') || raw.includes('(');
  const s = raw.replace(/^[+-]/, '').replace(/[^\d.,]/g, '');
  if (!s) return 0;

  if (s.includes(',')) {
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const result = parseFloat(normalized);
    return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
  }

  if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      const result = parseFloat(s);
      return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
    }
    const normalized = s.replace(/\./g, '');
    const result = parseFloat(normalized);
    return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
  }

  const result = parseFloat(s);
  return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
}

async function main() {
  console.log('🔍 Diagnosticando valores na tabela lists_projects_tracking...\n');

  const { rows } = await pool.query(`
    SELECT id, pp_contrato, valor_contrato, realizado_contrato, saldo_contrato,
           valor_si, realizado_si, saldo_si
    FROM lists_projects_tracking
    ORDER BY id
  `);

  console.log(`📊 Total de registros: ${rows.length}\n`);

  const suspicious = [];
  let totalValorContrato = 0;
  let totalSaldoContrato = 0;
  let totalValorSI = 0;
  let totalSaldoSI = 0;

  for (const row of rows) {
    const parsedVC = parseNum(row.valor_contrato);
    const parsedSC = parseNum(row.saldo_contrato);
    const parsedVSI = parseNum(row.valor_si);
    const parsedSSI = parseNum(row.saldo_si);

    totalValorContrato += parsedVC;
    totalSaldoContrato += parsedSC;
    totalValorSI += parsedVSI;
    totalSaldoSI += parsedSSI;

    // Verificar se os valores são suspeitos (> 100 milhões)
    const isSuspicious = parsedVC > 100000000 || 
                        Math.abs(parsedSC) > 100000000 ||
                        parsedVSI > 100000000 ||
                        Math.abs(parsedSSI) > 100000000;

    if (isSuspicious) {
      suspicious.push({
        id: row.id,
        pp: row.pp_contrato,
        valor_contrato_raw: row.valor_contrato,
        valor_contrato_parsed: parsedVC,
        saldo_contrato_raw: row.saldo_contrato,
        saldo_contrato_parsed: parsedSC,
        valor_si_raw: row.valor_si,
        valor_si_parsed: parsedVSI,
        saldo_si_raw: row.saldo_si,
        saldo_si_parsed: parsedSSI,
      });
    }
  }

  console.log('💰 TOTAIS CALCULADOS:');
  console.log(`   Valor Contrato: R$ ${totalValorContrato.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   Saldo Contrato: R$ ${totalSaldoContrato.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   Valor SI:       R$ ${totalValorSI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   Saldo SI:       R$ ${totalSaldoSI.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`);

  if (suspicious.length > 0) {
    console.log(`⚠️  ${suspicious.length} registro(s) com valores suspeitos:\n`);
    for (const s of suspicious) {
      console.log(`   ID ${s.id} | PP: ${s.pp}`);
      if (s.valor_contrato_parsed > 100000000) {
        console.log(`     valor_contrato: "${s.valor_contrato_raw}" → ${s.valor_contrato_parsed.toLocaleString('pt-BR')}`);
      }
      if (Math.abs(s.saldo_contrato_parsed) > 100000000) {
        console.log(`     saldo_contrato: "${s.saldo_contrato_raw}" → ${s.saldo_contrato_parsed.toLocaleString('pt-BR')}`);
      }
      if (s.valor_si_parsed > 100000000) {
        console.log(`     valor_si: "${s.valor_si_raw}" → ${s.valor_si_parsed.toLocaleString('pt-BR')}`);
      }
      if (Math.abs(s.saldo_si_parsed) > 100000000) {
        console.log(`     saldo_si: "${s.saldo_si_raw}" → ${s.saldo_si_parsed.toLocaleString('pt-BR')}`);
      }
      console.log('');
    }
  } else {
    console.log('✅ Nenhum valor suspeito encontrado!\n');
  }

  // Verificar se há valores muito grandes (possível erro de concatenação)
  const veryLarge = rows.filter(r => {
    const vc = parseNum(r.valor_contrato);
    return vc > 1000000000; // > 1 bilhão
  });

  if (veryLarge.length > 0) {
    console.log(`🚨 ${veryLarge.length} registro(s) com valores MUITO grandes (> 1 bilhão):`);
    for (const r of veryLarge) {
      console.log(`   ID ${r.id} | PP: ${r.pp_contrato} | valor_contrato: "${r.valor_contrato}" → ${parseNum(r.valor_contrato).toLocaleString('pt-BR')}`);
    }
    console.log('');
  }

  await pool.end();
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
