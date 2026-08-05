import { useMemo, useState } from 'react';
import { Empty, Panel, pageLabel } from './HealthActivity.jsx';

const ROLE_LABELS = { admin:'Administrador', coordenador:'Coordenador', engenheiro:'Engenheiro', planejador:'Planejador', gerente:'Gerente', diretor:'Diretor' };
const num = value => Number(value) || 0;
const fmt = value => num(value).toLocaleString('pt-BR');
const CHANGE_ACTIONS = {
  POST:   { label:'Criação', verb:'Criou' },
  PUT:    { label:'Alteração', verb:'Alterou' },
  PATCH:  { label:'Alteração', verb:'Alterou' },
  DELETE: { label:'Exclusão', verb:'Excluiu' },
};
const CHANGE_ENTITIES = [
  ['/api/lists/projects-tracking', 'um acompanhamento de projeto'],
  ['/api/lists/iacs', 'um IAC'],
  ['/api/schedule-projects', 'um cronograma'],
  ['/api/equipamentos', 'um equipamento'],
  ['/api/documents', 'um documento'],
  ['/api/drawings', 'um desenho'],
  ['/api/pms', 'um documento PMS'],
  ['/api/projects', 'um projeto'],
  ['/api/forecast', 'um registro do Forecast'],
  ['/api/metas', 'uma meta'],
  ['/api/workload', 'um registro de carga'],
  ['/api/vacations', 'um registro de férias'],
  ['/api/delegations', 'uma delegação'],
  ['/api/settings', 'uma configuração'],
  ['/api/users', 'um usuário'],
  ['/api/feedback', 'uma sugestão'],
];

function describeChange(item) {
  const defaultAction = CHANGE_ACTIONS[item.method] || { label:item.method, verb:'Executou uma ação em' };
  const action = item.action_label ? { ...defaultAction, label:item.action_label } : defaultAction;
  const entity = CHANGE_ENTITIES.find(([prefix]) => String(item.endpoint || '').startsWith(prefix))?.[1] || 'um registro';
  const details = changeDetails(item);
  const field = details.length === 1 ? details[0].label : null;
  const description = item.change_description || (field && ['PUT', 'PATCH'].includes(item.method)
    ? `${action.verb} o campo ${field} em ${entity}`
    : `${action.verb} ${entity}`);
  return { ...action, description };
}
function changeDetails(item) {
  if (Array.isArray(item.change_details)) return item.change_details;
  if (typeof item.change_details !== 'string') return [];
  try {
    const parsed = JSON.parse(item.change_details);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function auditValue(value) {
  if (value === null || value === undefined || value === '') return 'sem valor';
  const text = String(value);
  if (text === 'true') return 'Sim';
  if (text === 'false') return 'Não';
  const date = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : text;
}
function ChangeValue({ value, kind }) {
  const text = auditValue(value);
  return <span className={`health-change-value health-change-value--${kind}`} title={text}>{text}</span>;
}
function ChangeDetail({ detail, method }) {
  return <li><b>{detail.label}</b>
    {method === 'POST'
      ? <span>criado com <ChangeValue value={detail.new_value} kind={'new'}/></span>
      : method === 'DELETE'
        ? <span>valor excluído: <ChangeValue value={detail.old_value} kind={'old'}/></span>
        : <span>de <ChangeValue value={detail.old_value} kind={'old'}/> para <ChangeValue value={detail.new_value} kind={'new'}/></span>}
  </li>;
}
function ChangeDetails({ item }) {
  const details = changeDetails(item);
  if (!details.length) return null;
  const visible = details.slice(0, 4);
  const remaining = details.slice(4);
  return <div className="health-change-details">
    <ul>{visible.map(detail => <ChangeDetail key={detail.field} detail={detail} method={item.method}/>)}</ul>
    {!!remaining.length && <details><summary>Ver outros {remaining.length} {remaining.length === 1 ? 'campo' : 'campos'}</summary>
      <ul>{remaining.map(detail => <ChangeDetail key={detail.field} detail={detail} method={item.method}/>)}</ul>
    </details>}
  </div>;
}
function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
function duration(value) {
  const total=Math.round(num(value));
  if (total<60) return `${total}s`;
  const hours=Math.floor(total/3600), minutes=Math.round((total%3600)/60);
  return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function RecentErrors({ errors }) {
  return <Panel title="Erros recentes" subtitle="Falhas de leitura, gravação e interface para investigação">
    {!errors.length ? <div className="health-no-errors"><span>✓</span><strong>Nenhum erro registrado no período.</strong></div>
      : <div className="health-error-list">{errors.map((item,index) => <div className="health-error-row" key={`${item.created_at}-${index}`}>
        <span className="health-error-badge">{item.status_code||'JS'}</span><div className="health-error-main">
          <strong>{item.message||`${item.source==='write'?'Falha de gravação':'Falha de leitura'} em ${item.endpoint}`}</strong>
          <span>{pageLabel(item.page_path)} · {item.user_name||'Usuário removido'}</span></div>
        <time>{new Date(item.created_at).toLocaleString('pt-BR')}</time></div>)}</div>}
  </Panel>;
}

export default function HealthTables({ operations=[], users=[], errors=[], changes=[] }) {
  const [changeFilters, setChangeFilters] = useState({ dateFrom:'', dateTo:'', page:'', user:'' });
  const changePages = useMemo(() => Array.from(new Map(changes.map(item => {
    const value = item.page_path || '__unidentified__';
    return [value, { value, label:pageLabel(item.page_path) }];
  })).values()).sort((a,b) => a.label.localeCompare(b.label, 'pt-BR')), [changes]);
  const changeUsers = useMemo(() => Array.from(new Map(changes.map(item => {
    const value = item.user_name || '__removed__';
    return [value, { value, label:item.user_name || 'Usuário removido' }];
  })).values()).sort((a,b) => a.label.localeCompare(b.label, 'pt-BR')), [changes]);
  const filteredChanges = useMemo(() => changes.filter(item => {
    const itemDate = localDateKey(item.created_at);
    return (!changeFilters.dateFrom || itemDate >= changeFilters.dateFrom) &&
      (!changeFilters.dateTo || itemDate <= changeFilters.dateTo) &&
      (!changeFilters.page || (item.page_path || '__unidentified__') === changeFilters.page) &&
      (!changeFilters.user || (item.user_name || '__removed__') === changeFilters.user);
  }), [changes, changeFilters]);
  const hasChangeFilters = Object.values(changeFilters).some(Boolean);
  const setChangeFilter = (key, value) => setChangeFilters(current => ({ ...current, [key]:value }));

  return <>
    <div className="health-bottom-grid">
      <Panel title="Atualizações por página" subtitle="Operações concluídas com sucesso no período">
        {!operations.length ? <Empty>Nenhuma alteração registrada neste período.</Empty> : <div className="health-table-wrap"><table className="health-table">
          <thead><tr><th>Página</th><th>Criações</th><th>Alterações</th><th>Exclusões</th><th>Falhas</th></tr></thead>
          <tbody>{operations.map(row => <tr key={row.page_path}><td>{pageLabel(row.page_path)}</td><td>{fmt(row.creations)}</td>
            <td>{fmt(row.updates)}</td><td>{fmt(row.deletions)}</td><td className={num(row.errors)?'health-danger':''}>{fmt(row.errors)}</td></tr>)}</tbody>
        </table></div>}
      </Panel>
      <Panel title="Uso por usuário" subtitle="Tempo ativo, sessões e navegação">
        {!users.length ? <Empty/> : <div className="health-table-wrap"><table className="health-table">
          <thead><tr><th>Usuário</th><th>Tempo</th><th>Sessões</th><th>Páginas</th></tr></thead>
          <tbody>{users.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{ROLE_LABELS[row.role]||row.role}</small></td>
            <td>{duration(row.active_seconds)}</td><td>{fmt(row.sessions)}</td><td>{fmt(row.page_views)}</td></tr>)}</tbody>
        </table></div>}
      </Panel>
    </div>
    <Panel title="Log de alterações" subtitle="Campos, valores e responsáveis pelas alterações dos últimos 30 dias">
      <div className="health-change-filters">
        <label><span>Data inicial</span><input type="date" value={changeFilters.dateFrom} max={changeFilters.dateTo || undefined} disabled={!changes.length} onChange={event => setChangeFilter('dateFrom', event.target.value)}/></label>
        <label><span>Data final</span><input type="date" value={changeFilters.dateTo} min={changeFilters.dateFrom || undefined} disabled={!changes.length} onChange={event => setChangeFilter('dateTo', event.target.value)}/></label>
        <label><span>Página</span><select value={changeFilters.page} disabled={!changes.length} onChange={event => setChangeFilter('page', event.target.value)}>
          <option value="">Todas as páginas</option>{changePages.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label><span>Usuário</span><select value={changeFilters.user} disabled={!changes.length} onChange={event => setChangeFilter('user', event.target.value)}>
          <option value="">Todos os usuários</option>{changeUsers.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <div className="health-change-filter-result"><span>{fmt(filteredChanges.length)} de {fmt(changes.length)} registros</span>
          <button type="button" disabled={!hasChangeFilters} onClick={() => setChangeFilters({ dateFrom:'', dateTo:'', page:'', user:'' })}>Limpar filtros</button>
        </div>
      </div>
      {!changes.length ? <Empty>Nenhuma alteração registrada neste período.</Empty>
        : !filteredChanges.length ? <Empty>Nenhuma alteração corresponde aos filtros selecionados.</Empty>
        : <div className="health-table-wrap health-changes-wrap"><table className="health-table health-change-table">
          <thead><tr><th>O que foi feito</th><th>Página</th><th>Por quem</th><th>Quando</th></tr></thead>
          <tbody>{filteredChanges.map(item => {
            const change = describeChange(item);
            return <tr key={item.id}>
              <td><div className="health-change-description"><span className={`health-change-badge health-change-badge--${item.method?.toLowerCase()}`}>{change.label}</span>
                <div><strong>{change.description}</strong><small>{item.record_label ? `Registro: ${item.record_label} · ` : ''}{item.endpoint}</small>
                  <ChangeDetails item={item}/></div></div></td>
              <td>{pageLabel(item.page_path)}</td>
              <td><strong>{item.user_name || 'Usuário removido'}</strong><small>{ROLE_LABELS[item.user_role] || item.user_role || '—'}</small></td>
              <td><time>{new Date(item.created_at).toLocaleString('pt-BR')}</time></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </Panel>
    <RecentErrors errors={errors}/>
  </>;
}
