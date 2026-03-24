import { useState } from 'react';
import { useRole } from '../context/AuthContext.jsx';

const SECTIONS = [
  {
    id: 'overview',
    icon: '🏠',
    title: 'Visão Geral',
    content: `O **CTG Forecast** é o sistema de controle de forecast de projetos de engenharia e automação da CTG Brasil. 
    
Ele permite que engenheiros, planejadores e gestores colaborem no preenchimento, acompanhamento e análise de previsões orçamentárias por projeto.`,
  },
  {
    id: 'roles',
    icon: '👥',
    title: 'Perfis de Acesso',
    items: [
      { label: 'Engenheiro', desc: 'Preenche Forecast e Realizado dos projetos designados. Acesso restrito aos seus projetos.' },
      { label: 'Planejador', desc: 'Preenche Budget, Meta e Pool. Visão de todos os projetos. Gerencia configurações e período ativo.' },
      { label: 'Gestor', desc: 'Visão completa de todos os projetos em modo leitura. Cria projetos e designa engenheiros.' },
      { label: 'Administrador', desc: 'Gerencia usuários, aprova solicitações de acesso e controla permissões.' },
    ],
  },
  {
    id: 'dashboard',
    icon: '📊',
    title: 'Dashboard',
    content: `O Dashboard mostra uma visão consolidada de todos os projetos no período selecionado.

**KPIs no topo:** Budget total, Forecast total, Realizado e SI (Solicitação de Investimento).

**Gráfico combinado:** Barras mostram valores mensais, linhas mostram acumulado (S-Curve). Eixo esquerdo = mensal, eixo direito = acumulado.

**Filtros:** Use o seletor de período (De/Até) e o filtro de usinas para refinar a visão.`,
  },
  {
    id: 'forecast',
    icon: '📋',
    title: 'Preenchendo o Forecast',
    content: `Acesse um projeto e clique na aba **Forecast**. O Wizard guia você passo a passo:

1. **Selecione o ano** na barra superior
2. **Escolha o tipo** (Budget, Forecast, Realizado, etc.)
3. **Preencha mês a mês** para cada categoria (Viagens, Contratos, POs)
4. **Revise os totais** na etapa final
5. **Salve** clicando no botão 💾

O valor de referência (Budget ou Forecast) aparece ao lado de cada campo para comparação.`,
  },
  {
    id: 'charts',
    icon: '📈',
    title: 'Gráficos do Projeto',
    content: `Na aba **Gráficos** de cada projeto você encontra:

- **Evolução Mensal + S-Curve** — mesmo formato do Dashboard, com barras e linhas
- **Forecast por Categoria** — gráfico de rosca mostrando a distribuição entre Viagens, Contratos e POs
- **Execução por Categoria** — comparação Forecast vs Realizado com percentuais
- **Budget vs Forecast** — comparação por categoria`,
  },
  {
    id: 'chat',
    icon: '💬',
    title: 'Chat do Projeto',
    content: `Cada projeto tem um chat integrado na aba **Chat**. Use para:

- Comunicar ajustes no forecast
- Discutir alterações com o gestor
- Registrar justificativas

As mensagens não lidas aparecem como badge no sino de alertas e na sidebar.`,
  },
  {
    id: 'export',
    icon: '📊',
    title: 'Exportação Excel',
    content: `Dentro de cada projeto, clique em **📊 Excel** para exportar os dados para planilha.

Você pode selecionar:
- **Categorias** (Viagens, Contratos, POs)
- **Tipos** (Budget, Forecast, Realizado, Meta, Pool)
- **Escopo** — apenas o projeto ou relatório geral de todos

O relatório HTML completo está disponível no menu **Relatório HTML**.`,
  },
  {
    id: 'settings',
    icon: '⚙️',
    title: 'Configurações (Planejador)',
    content: `Na página de **Configurações**, o planejador pode:

- **Alertas** — definir dias para alerta de desatualização
- **Cores** — personalizar as cores dos tipos de dados nos gráficos
- **Período** — configurar anos ativos (detalhamento mensal) e fechar anos
- **Exportação** — incluir/excluir Meta e Pool nos exports
- **Ano Fiscal** — definir mês de início do exercício`,
  },
  {
    id: 'pwa',
    icon: '📱',
    title: 'Instalação no Celular',
    content: `O CTG Forecast funciona como aplicativo no celular:

**iPhone/Safari:** Toque no botão de compartilhar (□↑) → "Adicionar à Tela de Início"

**Android/Chrome:** Toque nos três pontos (⋮) → "Instalar aplicativo" ou "Adicionar à tela inicial"

Após instalar, o app funciona em tela cheia com ícone na home. Notificações aparecem no badge do ícone.`,
  },
  {
    id: 'delegation',
    icon: '🔄',
    title: 'Delegação de Acesso (Férias)',
    content: `Quando precisar se ausentar (férias, licença, viagem), você pode delegar seus projetos e privilégios para outro usuário do sistema.

**Como delegar:**

1. Acesse **Meu Perfil** (menu lateral → seu nome)
2. Role até a seção **Delegação de Acesso**
3. Clique em **+ Nova Delegação**
4. Selecione o usuário que receberá o acesso
5. Defina as datas de início e fim do período
6. (Opcional) Informe o motivo (ex.: Férias)
7. Clique em **Criar Delegação**

**O que o delegado pode fazer:**

- Acessar todos os seus projetos
- Editar Forecast, Realizado e demais campos
- Todas as ações ficam registradas **no nome do delegado**, não no seu

**Importante:**

- A delegação é ativada automaticamente na data de início e desativada na data de fim
- Você pode **revogar** a delegação a qualquer momento antes do fim
- É possível criar múltiplas delegações (para pessoas diferentes ou períodos diferentes)
- Coordenadores, planejadores e engenheiros podem delegar seus acessos`,
  },
];

function MarkdownLight({ text }) {
  // Very simple markdown-like rendering
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- **')) {
          const match = trimmed.match(/^- \*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
          if (match) return <div key={i} style={{ paddingLeft: 12 }}><strong>{match[1]}</strong> — {match[2]}</div>;
        }
        if (trimmed.startsWith('- ')) {
          return <div key={i} style={{ paddingLeft: 12 }}>• {trimmed.slice(2)}</div>;
        }
        if (/^\d+\./.test(trimmed)) {
          return <div key={i} style={{ paddingLeft: 12 }}>{trimmed}</div>;
        }
        // Bold markers
        const parts = trimmed.split(/\*\*(.+?)\*\*/g);
        return (
          <p key={i} style={{ margin: 0 }}>
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
          </p>
        );
      })}
    </div>
  );
}

export default function TutorialPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const { role } = useRole();

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Nav */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20,
        padding: '10px 0', borderBottom: '1px solid var(--border)',
      }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: activeSection === s.id ? 'var(--ctg-navy)' : 'var(--bg-app)',
            color: activeSection === s.id ? '#fff' : 'var(--text-secondary)',
            fontSize: '0.8rem', fontWeight: activeSection === s.id ? 700 : 500,
            fontFamily: 'var(--font-body)', transition: 'all 0.15s',
          }}>
            {s.icon} {s.title}
          </button>
        ))}
      </div>

      {/* Content */}
      {SECTIONS.filter(s => s.id === activeSection).map(section => (
        <div key={section.id} className="card">
          <div className="card-header">
            <span className="card-title">{section.icon} {section.title}</span>
          </div>
          <div className="card-body" style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {section.content && <MarkdownLight text={section.content} />}
            {section.items && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {section.items.map(item => (
                  <div key={item.label} style={{
                    padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-app)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--ctg-navy)', marginBottom: 4, fontSize: '0.9rem' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
