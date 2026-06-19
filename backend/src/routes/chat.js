import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ─── Sistema de rotação de chaves Groq ───────────────────────────────
let currentKeyIndex = 0;

// Lê as chaves do env em tempo de execução (necessário para testes e hot-reload)
function getApiKeys() {
  if (process.env.GROQ_API_KEYS)
    return process.env.GROQ_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
  if (process.env.GROQ_API_KEY) return [process.env.GROQ_API_KEY];
  return [];
}

async function fetchWithKeyRotation(url, options) {
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    const err = new Error('Nenhuma chave de API configurada');
    err.status = 503;
    throw err;
  }

  let lastError = null;
  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[currentKeyIndex % apiKeys.length];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;

    const opts = {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${key}` },
    };
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        lastError = { status: 429, message: 'Rate limit atingido' };
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }

  const err = new Error(lastError?.message || 'Todas as chaves de API falharam');
  err.status = lastError?.status || 500;
  throw err;
}

// ─── Helpers: buscar dados respeitando permissões ───────────────────────────────

// Busca projetos que o usuário tem permissão para ver
async function getAllowedProjects(userId, role, area, allAreasAccess = false) {
  // Superiores veem todos os projetos (coordenador com acesso a todas as áreas também)
  if (['admin', 'gestor', 'planejador'].includes(role) || (role === 'coordenador' && allAreasAccess)) {
    const r = await pool.query(`
      SELECT p.id, p.code, p.name, p.plants, p.si_value, p.pool_value
      FROM projects p
      ORDER BY p.code
    `);
    return r.rows;
  }

  // Coordenador: projetos com engenheiros da sua área
  if (role === 'coordenador') {
    const r = await pool.query(`
      SELECT DISTINCT p.id, p.code, p.name, p.plants, p.si_value, p.pool_value
      FROM projects p
      INNER JOIN project_assignments pa ON pa.project_id = p.id
      INNER JOIN users u ON u.id = pa.user_id AND u.role = 'engenheiro' AND u.area = $1
      ORDER BY p.code
    `, [area || '']);
    return r.rows;
  }

  // Engenheiro: projetos atribuídos + delegados
  const r = await pool.query(`
    SELECT DISTINCT p.id, p.code, p.name, p.plants, p.si_value, p.pool_value
    FROM projects p
    LEFT JOIN project_assignments pa ON pa.project_id = p.id AND pa.user_id = $1
    LEFT JOIN access_delegations d ON d.delegate_id = $1 AND d.active = true AND CURRENT_DATE BETWEEN d.start_date AND d.end_date
    LEFT JOIN project_assignments pa2 ON pa2.project_id = p.id AND pa2.user_id = d.delegator_id
    WHERE pa.user_id = $1 OR pa2.user_id IS NOT NULL
    ORDER BY p.code
  `, [userId]);
  return r.rows;
}

// Helper: formatar como Real brasileiro (R$ XXX.XXX,XX)
function formatBRL(value) {
  const num = parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

// Busca forecasts reais agrupados por projeto e ano
async function getProjectsForecast(projectIds) {
  if (!projectIds.length) return {};
  const r = await pool.query(`
    SELECT project_id, year, month, type, COALESCE(value, 0) as value
    FROM forecast_entries
    WHERE project_id = ANY($1) AND type = 'Forecast'
    ORDER BY project_id, year, month
  `, [projectIds]);
  
  // Agrupar por projeto e ano
  const forecast = {};
  for (const row of r.rows) {
    if (!forecast[row.project_id]) forecast[row.project_id] = {};
    if (!forecast[row.project_id][row.year]) forecast[row.project_id][row.year] = { total: 0, byMonth: {} };
    const val = parseFloat(row.value) || 0;
    forecast[row.project_id][row.year].total += val;
    if (!forecast[row.project_id][row.year].byMonth[row.month]) forecast[row.project_id][row.year].byMonth[row.month] = 0;
    forecast[row.project_id][row.year].byMonth[row.month] += val;
  }
  return forecast;
}

// Busca dados de tracking (SI, Contrato, Realizado, Saldo) dos projetos
// Vincula pelo código do projeto (projects.code = lists_projects_tracking.pp_contrato)
async function getProjectsTrackingInfo(projectCodes) {
  if (!projectCodes.length) return {};
  const r = await pool.query(`
    SELECT 
      p.id as project_id,
      p.code as project_code,
      COALESCE(t.valor_si, '0') as valor_si,
      COALESCE(t.realizado_si, '0') as realizado_si,
      COALESCE(t.saldo_si, '0') as saldo_si,
      COALESCE(t.valor_contrato, '0') as valor_contrato,
      COALESCE(t.realizado_contrato, '0') as realizado_contrato,
      COALESCE(t.saldo_contrato, '0') as saldo_contrato
    FROM projects p
    LEFT JOIN lists_projects_tracking t ON t.pp_contrato = p.code
    WHERE p.code = ANY($1::text[])
  `, [projectCodes]);
  
  const tracking = {};
  for (const row of r.rows) {
    const valorSI = parseFloat(row.valor_si) || 0;
    const realizadoSI = parseFloat(row.realizado_si) || 0;
    const saldoSI = parseFloat(row.saldo_si) || 0;
    const valorContrato = parseFloat(row.valor_contrato) || 0;
    const realizadoContrato = parseFloat(row.realizado_contrato) || 0;
    const saldoContrato = parseFloat(row.saldo_contrato) || 0;
    
    const pctRealizadoSI = valorSI > 0 ? ((realizadoSI / valorSI) * 100).toFixed(1) : '0.0';
    const pctSaldoSI = valorSI > 0 ? ((saldoSI / valorSI) * 100).toFixed(1) : '0.0';
    const pctRealizadoContrato = valorContrato > 0 ? ((realizadoContrato / valorContrato) * 100).toFixed(1) : '0.0';
    const pctSaldoContrato = valorContrato > 0 ? ((saldoContrato / valorContrato) * 100).toFixed(1) : '0.0';
    
    tracking[row.project_id] = {
      si: { total: valorSI, realizado: realizadoSI, saldo: saldoSI, pctRealizado: pctRealizadoSI, pctSaldo: pctSaldoSI },
      contrato: { total: valorContrato, realizado: realizadoContrato, saldo: saldoContrato, pctRealizado: pctRealizadoContrato, pctSaldo: pctSaldoContrato }
    };
  }
  return tracking;
}

// Busca totais de Budget e Realizado por projeto em uma única query
async function getProjectsFinancials(projectIds) {
  if (!projectIds.length) return {};
  const r = await pool.query(`
    SELECT project_id, type, COALESCE(SUM(value), 0) AS total
    FROM forecast_entries
    WHERE project_id = ANY($1) AND type IN ('Budget', 'Realizado')
    GROUP BY project_id, type
  `, [projectIds]);
  const result = {};
  for (const row of r.rows) {
    if (!result[row.project_id]) result[row.project_id] = { budget: 0, realizado: 0 };
    if (row.type === 'Budget')    result[row.project_id].budget    = parseFloat(row.total) || 0;
    if (row.type === 'Realizado') result[row.project_id].realizado = parseFloat(row.total) || 0;
  }
  return result;
}

// Busca resumo dos projetos do usuário (para contexto do chat)
async function getProjectsSummary(userId, role, area, allAreasAccess = false) {
  const projects = await getAllowedProjects(userId, role, area, allAreasAccess);
  if (projects.length === 0) return 'Nenhum projeto atribuído no momento.';

  const projectIds   = projects.map(p => p.id);
  const projectCodes = projects.map(p => p.code);
  const currentYear  = new Date().getFullYear();

  const [forecasts, tracking, financials] = await Promise.all([
    getProjectsForecast(projectIds),
    getProjectsTrackingInfo(projectCodes),
    getProjectsFinancials(projectIds),
  ]);

  const lines = projects.map(p => {
    const plants     = Array.isArray(p.plants) ? p.plants.join(', ') : (p.plants || '—');
    const t          = tracking[p.id];
    const fin        = financials[p.id] || { budget: 0, realizado: 0 };
    const siValue    = parseFloat(p.si_value)   || 0;
    const pool       = parseFloat(p.pool_value) || 0;
    const saldoSI    = t?.si.saldo ?? 0;

    // Forecast (entries type=Forecast) por ano corrente e total
    let forecastFutureCurrent = 0;
    let forecastFutureTotal   = 0;
    if (forecasts[p.id]) {
      Object.entries(forecasts[p.id]).forEach(([y, d]) => {
        forecastFutureTotal += d.total;
        if (parseInt(y) === currentYear) forecastFutureCurrent = d.total;
      });
    }

    // Totais finais = Forecast + Realizado
    const budgetTotal   = fin.budget   + fin.realizado;
    const forecastTotal = forecastFutureTotal + fin.realizado;
    const forecastCurrentTotal = forecastFutureCurrent + fin.realizado;

    // Δ Budget − Forecast (prefixo +/=/- para o renderer colorido do front)
    const delta = budgetTotal - forecastTotal;
    const deltaStr = delta > 0
      ? `+${formatBRL(delta)}`
      : delta < 0 ? `-${formatBRL(Math.abs(delta))}` : `=${formatBRL(0)}`;

    let line = `• ${p.code} — ${p.name}`;
    line += `\n  Usina(s): ${plants}`;
    line += `\n  Valor SI: ${formatBRL(siValue)} | Pool: ${formatBRL(pool)} | Saldo SI: ${formatBRL(saldoSI)}`;
    line += `\n  Realizado: ${formatBRL(fin.realizado)}`;
    line += `\n  Budget (forecast Budget + Realizado): ${formatBRL(budgetTotal)}`;
    line += `\n  Forecast ${currentYear} (Forecast + Realizado): ${formatBRL(forecastCurrentTotal)} | Forecast Total (Forecast + Realizado): ${formatBRL(forecastTotal)}`;
    line += `\n  Δ Budget-Forecast: ${deltaStr}`;

    if (t?.si.total > 0)
      line += `\n  SI → Total: ${formatBRL(t.si.total)} | Realizado SI: ${formatBRL(t.si.realizado)} (${t.si.pctRealizado}%) | Saldo: ${formatBRL(t.si.saldo)}`;
    if (t?.contrato.total > 0)
      line += `\n  Contrato → Total: ${formatBRL(t.contrato.total)} | Realizado Contrato: ${formatBRL(t.contrato.realizado)} (${t.contrato.pctRealizado}%) | Saldo: ${formatBRL(t.contrato.saldo)}`;

    return line;
  });
  return lines.join('\n\n');
}

// ─── SYSTEM_PROMPT restrito ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é a Assistente CTG, assistente virtual **apenas informativo** do sistema CTG.Engenharia da CTG Brasil.

## REGRAS OBRIGATÓRIAS
1. **ESCOPO RESTRITO**: Você SÓ pode fornecer informações sobre:
   - O sistema CTG.Engenharia (funcionalidades, módulos, como usar)
   - Projetos que o usuário tem permissão para acessar
   - Dados e relatórios desse projetos
2. **FORA DO ESCOPO**: Se perguntarem sobre outros assuntos (receitas, notícias, cultura geral, outras empresas, etc.), responda SEMPRE:
   "Desculpe, sou um assistente exclusivo para informações sobre o sistema CTG.Engenharia e seus projetos. Não posso fornecer informações sobre outros assuntos."
3. **APENAS INFORMATIVO**: Você NUNCA deve:
   - Executar ações (criar, editar, excluir projetos ou dados)
   - Sugerir que pode executar ações
   - Pedir confirmação para executar ações
   - Apenas informe e explique como o usuário pode fazer algo.
4. **PERMISSÕES**: Você só verá dados que o usuário tem permissão para ver. Nunca invente dados que não estejam no contexto fornecido.
5. **IDIOMA**: Responda sempre em português brasileiro, de forma concisa, objetiva e profissional.
6. **FORMATAÇÃO — TABELAS PRIMEIRO**: Sempre que a resposta contiver dados comparativos, listas de projetos, valores financeiros ou qualquer conjunto estruturado, use **tabela Markdown** como formato principal. Use texto corrido apenas para explicações curtas ou quando não houver dados tabulares.
7. **PROIBIÇÃO DE CÁLCULOS INVENTADOS**: NUNCA invente, estime ou calcule valores que não estejam explicitamente fornecidos no contexto. Use APENAS os valores do contexto. Se não houver dados para um período, escreva "—" na célula da tabela.
8. **STATUS / RESUMO DOS PROJETOS**: Quando perguntado sobre "status", "situação", "resumo" ou "meus projetos", monte SEMPRE uma tabela Markdown com exatamente estas colunas (na ordem):
   | Projeto | Usina | Valor SI | Saldo SI | Budget | Forecast [ano atual] | Forecast Total | Δ Budget-Forecast |
   - A coluna **Δ Budget-Forecast** deve conter o valor numérico formatado com prefixo obrigatório: "+R$ X" se Budget > Forecast Total, "-R$ X" se Budget < Forecast Total, "=R$ 0" se iguais. NUNCA omita o prefixo.
   - Preencha com "—" células sem dados. NÃO crie colunas adicionais de Forecast por ano.
   - NÃO use colunas de status de documento ("Em elaboração", "Publicado") — isso é status de documento, não de projeto.

## Sistema CTG.Engenharia — Visão Geral
Plataforma web de gestão de engenharia de manutenção que integra: forecast financeiro de projetos, controle de IACs, acompanhamento de contratos, gestão de documentos técnicos, controle de férias e relatórios.

## Usinas
PCH Palmeiras, PCH Retiro, UHE Canoas 1, UHE Canoas 2, UHE Capivara, UHE Chavantes, UHE Garibaldi, UHE Ilha Solteira, UHE Jupiá, UHE Jurumirim, UHE Rosana, UHE Salto, UHE Salto Grande, UHE Taquaruçu.

## Perfis de Acesso
- **Admin/Planejador**: Acesso completo a todos os projetos
- **Coordenador**: Projetos da sua área (engenheiros subordinados)
- **Gestor**: Dados consolidados por área e usina
- **Engenheiro**: Apenas seus próprios projetos atribuídos

## Módulos Principais
### Projetos
Lista de projetos, visualização por usina/engenheiro. Abas: Visão Geral, Forecast (Wizard mensal), Mapeamento SAP, Atividades, Chat da equipe, Delegação.
### Dashboard
KPIs (Budget, Forecast, Realizado, SI), Curva S, gráficos contextuais por perfil.
### Polos
Visão consolidada: Polo → Usina → Projeto. Budget, Pool, Actual, Forecast.
### IACs
Investment Authorization Committee. Status (0-10), tipos (New, Transfer, Waiver), importação/exportação Excel.
### Acompanhamento
Contratos em andamento, valores, cronograma, importação/exportação, relatório HTML.
### Documentos
Tipos: ATA, CTA, RT, EP, ET, ROP, MC, ROG, RFH. Controle de revisões. Status: Em elaboração, Para aprovação, Publicado, Cancelado.
### Férias
Controle por área (Elétrica, Mecânica, Confiabilidade). Timeline, KPIs, tabelas.

## Funcionalidades
- AlertBell: alertas de projetos/IACs desatualizados
- PWA: instalável, notificações de versão
- Check-in: registrar revisão de itens
- Forecast Wizard: previsões mensais guiadas
- Exportação Excel em todas as páginas
- Importação Excel para IACs, Projetos e Documentos`;

router.post('/', async (req, res) => {
  if (getApiKeys().length === 0)
    return res.status(503).json({ error: 'Chat não configurado. Adicione GROQ_API_KEY ou GROQ_API_KEYS ao .env do servidor.' });

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'Mensagens inválidas' });

  try {
    const userId   = req.user.id;
    const userRole = req.user.role;
    const userArea = req.user.area;
    const userName = req.user.name;

    const [projectsSummary, projectsCount] = await Promise.all([
      getProjectsSummary(userId, userRole, userArea, req.user._allAreasAccess),
      pool.query('SELECT COUNT(*) FROM projects').then(r => parseInt(r.rows[0].count)),
    ]);

    const userContext = `## DADOS DO USUÁRIO
- Nome: ${userName}
- Cargo: ${userRole}
- Área: ${userArea || 'N/A'}

## PROJETOS QUE VOCÊ PODE VER (${userRole === 'engenheiro' ? 'apenas seus projetos atribuídos' : userRole === 'coordenador' ? 'projetos da sua área' : 'todos os projetos'})
Total de projetos no sistema: ${projectsCount}
Seus projetos:
${projectsSummary}

## INSTRUÇÕES PARA RESPOSTA
- Use APENAS os dados acima para responder sobre projetos.
- Se perguntarem sobre um projeto específico, verifique se ele está na lista acima.
- Se não estiver na lista, informe que o usuário não tem permissão para ver esse projeto.
- Seja conciso e use os dados reais fornecidos.`;

    const groqRes = await fetchWithKeyRotation('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n---\n\n${userContext}` },
          ...messages.slice(-12).map(({ role, content }) => ({ role, content })),
        ],
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok)
      return res.status(groqRes.status).json({ error: data.error?.message || 'Erro na API Groq' });

    res.json({ content: data.choices[0].message.content });
  } catch (err) {
    console.error('[CHAT ERROR]', err.message);
    const status = err.status || 500;
    const message = status === 429
      ? 'Rate limit atingido. Tente novamente em alguns instantes.'
      : 'Erro ao processar mensagem';
    res.status(status).json({ error: message });
  }
});

export default router;
