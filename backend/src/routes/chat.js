import { Router } from 'express';
import { pool } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const SUPERIOR_ROLES = ['gestor', 'planejador', 'coordenador', 'admin'];

// ─── Sistema de rotação de chaves Groq ───────────────────────────────
const apiKeys = process.env.GROQ_API_KEYS 
  ? process.env.GROQ_API_KEYS.split(',').map(k => k.trim()).filter(Boolean)
  : process.env.GROQ_API_KEY 
    ? [process.env.GROQ_API_KEY]
    : [];
let currentKeyIndex = 0;

function getNextApiKey() {
  if (apiKeys.length === 0) return null;
  const key = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return key;
}

async function fetchWithKeyRotation(url, options) {
  let lastError = null;
  
  // Tentar todas as chaves disponíveis
  for (let triedKeys = 0; triedKeys < apiKeys.length; triedKeys++) {
    const key = getNextApiKey();
    if (!key) throw new Error('Nenhuma chave de API configurada');
    
    const opts = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${key}`,
      },
    };
    
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        // Rate limit atingido, tenta próxima chave
        lastError = { status: 429, message: 'Rate limit' };
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  
  // Todas as chaves falharam
  const err = new Error('Todas as chaves de API atingiram o limite ou falharam');
  err.status = lastError?.status || 500;
  throw err;
}

// ─── Helpers: buscar dados respeitando permissões ───────────────────────────────

// Busca projetos que o usuário tem permissão para ver
async function getAllowedProjects(userId, role, area) {
  // Superiores veem todos os projetos
  if (['admin', 'gestor', 'planejador'].includes(role)) {
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

// Busca resumo dos projetos do usuário (para contexto do chat)
async function getProjectsSummary(userId, role, area) {
  const projects = await getAllowedProjects(userId, role, area);
  if (projects.length === 0) return 'Nenhum projeto atribuído no momento.';

  // Buscar forecasts reais
  const projectIds = projects.map(p => p.id);
  const forecasts = await getProjectsForecast(projectIds);

  const lines = projects.map(p => {
    const plants = Array.isArray(p.plants) ? p.plants.join(', ') : (p.plants || '—');
    let line = `• ${p.code} — ${p.name}\n  Usina(s): ${plants}`;
    
    // SI e Pool
    if (p.si_value || p.pool_value) {
      line += `\n  SI: ${formatBRL(p.si_value)} | Pool: ${formatBRL(p.pool_value)}`;
    }
    
    // Forecasts por ano
    if (forecasts[p.id]) {
      const years = Object.keys(forecasts[p.id]).sort();
      line += '\n  📅 Forecasts:';
      years.forEach(year => {
        const yData = forecasts[p.id][year];
        const months = Object.keys(yData.byMonth).sort((a,b) => a-b);
        const monthsStr = months.map(m => `M${m}: ${formatBRL(yData.byMonth[m])}`).join(', ');
        line += `\n    ${year}: ${formatBRL(yData.total)} (${monthsStr})`;
      });
    }
    
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
6. **FORMATAÇÃO**: Use Markdown para formatar respostas. Mantenha a formatação limpa e legível.
7. **PROIBIÇÃO DE CÁLCULOS INVENTADOS**: NUNCA invente, estime ou calcule valores que não estejam explicitamente fornecidos no contexto. Se o contexto diz "Forecast: 2026: Total 5000 (M1: 500, M2: 500, ...)", use APENAS esses valores. NUNCA multiplique valores mensais por 12 ou qualquer outro número. Se não houver dados de forecast para um ano específico, diga "Dados de forecast não disponíveis para este ano" em vez de inventar.

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
  if (apiKeys.length === 0)
    return res.status(503).json({ error: 'Chat não configurado. Adicione GROQ_API_KEY ou GROQ_API_KEYS ao .env do servidor.' });

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'Mensagens inválidas' });

  try {
    // Buscar dados que o usuário tem permissão para ver
    const userId = req.user.id;
    const userRole = req.user.role;
    const userArea = req.user.area;
    const userName = req.user.name;

    const [projectsSummary, projectsCount] = await Promise.all([
      getProjectsSummary(userId, userRole, userArea),
      pool.query('SELECT COUNT(*) FROM projects').then(r => parseInt(r.rows[0].count)),
    ]);

    // Montar contexto com dados reais
    const userContext = `
## DADOS DO USUÁRIO
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
- Seja conciso e use os dados reais fornecidos.
`.trim();

    const groqRes = await fetchWithKeyRotation('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: userContext },
          ...messages.slice(-10).map(({ role, content }) => ({ role, content })),
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok)
      return res.status(groqRes.status).json({ error: data.error?.message || 'Erro na API Groq' });

    res.json({ content: data.choices[0].message.content });
  } catch (err) {
    console.error('[CHAT ERROR]', err.message);
    const status = err.status || 500;
    res.status(status).json({ error: 'Erro ao processar mensagem' });
  }
});

export default router;
