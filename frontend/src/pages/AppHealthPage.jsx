import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import api from '../utils/api.js';
import HealthActivity from '../components/admin/HealthActivity.jsx';
import HealthTables from '../components/admin/HealthTables.jsx';
import DataEngineeringPanel from '../components/admin/DataEngineeringPanel.jsx';
import './AppHealthPage.css';

const TABS = [{ value: 'uso', label: 'Uso' }, { value: 'engenharia', label: 'Engenharia de Dados' }];

const PERIODS = [{ value: 7, label: '7 dias' }, { value: 30, label: '30 dias' }, { value: 90, label: '90 dias' }];
const ROLE_LABELS = { admin:'Administrador', coordenador:'Coordenador', engenheiro:'Engenheiro', planejador:'Planejador', gerente:'Gerente', diretor:'Diretor' };
const PAGE_LABELS = {
  '/':'Início', '/admin':'Gerenciar usuários', '/admin/health':'Saúde da aplicação', '/forecast':'Forecast',
  '/projects':'Projetos', '/projects/:id':'Detalhe do projeto', '/polos':'Polos', '/report':'Relatórios',
  '/vacations':'Férias', '/metas':'Metas', '/workload':'Controle de carga', '/documents':'Documentos',
  '/drawings':'Desenhos', '/pms':'PMS', '/lists/iacs':'IACs',
  '/lists/projects-tracking':'Acompanhamento de projetos', '/lists/schedule-project':'Cronograma Project',
  '/engineering/equipamentos':'Mapa de equipamentos', '/engineering/equipamentos-admin':'Gestão de equipamentos',
  '/profile':'Perfil', '/settings':'Configurações', '/tutorial':'Tutorial', '/feedback':'Sugestões',
};

const num = value => Number(value) || 0;
const fmtNum = value => num(value).toLocaleString('pt-BR');
const pageLabel = path => PAGE_LABELS[path] || path || 'Página não identificada';
function fmtDuration(value) {
  const total = Math.round(num(value));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600), minutes = Math.round((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function MetricCard({ label, value, helper, color, icon, children, cardProps={} }) {
  return <div {...cardProps} className={`health-metric-card ${cardProps.className || ''}`} style={{ '--metric-color': color }}>
    <div className="health-metric-icon">{icon}</div><div>
      <div className="health-metric-label">{label}</div><div className="health-metric-value">{value}</div>
      <div className="health-metric-helper">{helper}</div>
    </div>{children}
  </div>;
}

function ActiveUsersMetricCard({ users=[], sessions=0 }) {
  const [hovered, setHovered] = useState(false);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const [tooltipStyle, setTooltipStyle] = useState({ left: 0, top: 0 });
  const tooltipRef = useRef(null);

  const showTooltip = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTipPos({
      x: event.clientX || rect.right,
      y: event.clientY || rect.top + rect.height / 2,
    });
    setHovered(true);
  };

  useLayoutEffect(() => {
    if (!hovered || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    const margin = 8;
    let left = tipPos.x + 16;
    let top = tipPos.y - 10;
    if (left + rect.width + margin > window.innerWidth) left = tipPos.x - rect.width - 16;
    if (left < margin) left = margin;
    if (top + rect.height + margin > window.innerHeight) top = window.innerHeight - rect.height - margin;
    if (top < margin) top = margin;
    setTooltipStyle({ left, top });
  }, [hovered, tipPos]);

  return <MetricCard
    label="Usuários ativos"
    value={fmtNum(users.length)}
    helper={`${fmtNum(sessions)} ${num(sessions) === 1 ? 'sessão' : 'sessões'} agora`}
    color="#0070B8"
    icon="●"
    cardProps={{
      className: 'health-metric-card--interactive',
      tabIndex: 0,
      'aria-describedby': hovered ? 'health-active-users-tooltip' : undefined,
      onMouseEnter: showTooltip,
      onMouseMove: event => setTipPos({ x: event.clientX, y: event.clientY }),
      onMouseLeave: () => setHovered(false),
      onFocus: showTooltip,
      onBlur: () => setHovered(false),
    }}
  >
    {hovered && <div
      ref={tooltipRef}
      id="health-active-users-tooltip"
      role="tooltip"
      className="health-active-users-tooltip"
      style={{ left: tooltipStyle.left, top: tooltipStyle.top }}
    >
      <div className="health-active-tooltip-header">
        <div><strong>Usuários na aplicação</strong><span>Atividade nos últimos 2 minutos</span></div>
        <b>{users.length}</b>
      </div>
      {!users.length ? <div className="health-active-tooltip-empty">Nenhum usuário ativo neste momento.</div>
        : <div className="health-active-tooltip-list">{users.map(user => {
          const initials = String(user.name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
          return <div className="health-active-tooltip-row" key={user.id}>
            <span className="health-active-avatar">{initials}</span>
            <div><strong>{user.name}</strong><span>{pageLabel(user.page_path)}</span></div>
            <i title={`${user.session_count} sessão(ões) ativa(s)`}>{user.session_count}</i>
          </div>;
        })}</div>}
      <div className="health-active-tooltip-footer"><span/> Presença atualizada a cada 30 segundos</div>
    </div>}
  </MetricCard>;
}
function Panel({ title, subtitle, children, className='' }) {
  return <section className={`health-panel ${className}`}><div className="health-panel-header"><div>
    <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
  </div></div>{children}</section>;
}
const Empty = ({ children='Ainda não há dados neste período.' }) => <div className="health-empty">{children}</div>;

export default function AppHealthPage() {
  const [tab, setTab] = useState('uso');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (quiet=false) => {
    quiet ? setRefreshing(true) : setLoading(true); setError('');
    try { setData((await api.get('/telemetry/overview', { params:{ days } })).data); }
    catch { setError('Não foi possível carregar as métricas da aplicação.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [days]);
  useEffect(() => { load(); const timer=setInterval(() => load(true), 60000); return () => clearInterval(timer); }, [load]);

  const summary = data?.summary || {};
  const successRate = num(summary.success_rate);
  const health = successRate >= 99 && num(summary.server_errors) === 0
    ? { label:'Saudável', color:'#16A34A', bg:'#F0FDF4' }
    : successRate >= 97 && num(summary.server_errors) <= 3
      ? { label:'Atenção', color:'#D97706', bg:'#FFFBEB' }
      : { label:'Crítico', color:'#DC2626', bg:'#FEF2F2' };
  const daily = useMemo(() => (data?.daily || []).map(item => ({ ...item,
    label:new Date(`${String(item.day).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),
    sessions:num(item.sessions), views:num(item.views), writes:num(item.writes), errors:num(item.errors),
  })), [data]);
  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return <div className="health-page">
    <div className="health-toolbar"><div><div className="health-eyebrow">Observabilidade</div>
      <h2>Uso, sanidade e saúde</h2><p>Telemetria operacional e trilha de alterações para auditoria.</p></div>
      <div className="health-toolbar-actions"><div className="health-periods">{PERIODS.map(p =>
        <button key={p.value} className={days===p.value?'active':''} onClick={() => setDays(p.value)}>{p.label}</button>)}</div>
        <button className="health-refresh" onClick={() => load(true)} disabled={refreshing}><span className={refreshing?'spinning':''}>↻</span> Atualizar</button>
      </div>
    </div>
    <div className="health-tabs">{TABS.map(t =>
      <button key={t.value} className={tab===t.value?'active':''} onClick={() => setTab(t.value)}>{t.label}</button>)}</div>
    {error && <div className="health-error">{error}</div>}
    {tab === 'uso' ? <>
      <div className="health-status-strip" style={{'--status-color':health.color,'--status-bg':health.bg}}>
        <span className="health-status-dot"/><strong>Estado geral: {health.label}</strong>
        <span>{successRate.toLocaleString('pt-BR',{maximumFractionDigits:2})}% das operações concluídas com sucesso</span>
        <span className="health-updated">Atualizado {data?.generated_at ? new Date(data.generated_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : 'agora'}</span>
      </div>
      <div className="health-metrics-grid">
        <ActiveUsersMetricCard users={data?.active_users} sessions={summary.sessions}/>
        <MetricCard label="Tempo médio ativo" value={fmtDuration(summary.avg_session_seconds)} helper="por sessão, sem tempo ocioso" color="#7C3AED" icon="◷"/>
        <MetricCard label="Visualizações" value={fmtNum(summary.page_views)} helper="aberturas de páginas" color="#0891B2" icon="◉"/>
        <MetricCard label="Criações" value={fmtNum(summary.creations)} helper={`${fmtNum(summary.updates)} atualizações`} color="#16A34A" icon="＋"/>
        <MetricCard label="Erros de leitura" value={fmtNum(summary.read_errors)} helper={`de ${fmtNum(summary.reads)} leituras`} color="#D97706" icon="↓"/>
        <MetricCard label="Erros de gravação" value={fmtNum(summary.write_errors)} helper={`de ${fmtNum(summary.writes)} gravações`} color="#DC2626" icon="↑"/>
      </div>
      <HealthActivity daily={daily} pages={data?.pages}/>
      <HealthTables operations={data?.operations} users={data?.users} errors={data?.errors} changes={data?.changes}/>
    </> : <DataEngineeringPanel days={days}/>}
  </div>;
}
