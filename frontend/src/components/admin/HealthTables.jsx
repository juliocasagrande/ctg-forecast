import { Empty, Panel, pageLabel } from './HealthActivity.jsx';

const ROLE_LABELS = { admin:'Administrador', coordenador:'Coordenador', engenheiro:'Engenheiro', planejador:'Planejador', gerente:'Gerente', diretor:'Diretor' };
const num = value => Number(value) || 0;
const fmt = value => num(value).toLocaleString('pt-BR');
function duration(value) {
  const total=Math.round(num(value));
  if (total<60) return `${total}s`;
  const hours=Math.floor(total/3600), minutes=Math.round((total%3600)/60);
  return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
}

export default function HealthTables({ operations=[], users=[], errors=[] }) {
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
    <Panel title="Erros recentes" subtitle="Falhas de leitura, gravação e interface para investigação">
      {!errors.length ? <div className="health-no-errors"><span>✓</span><strong>Nenhum erro registrado no período.</strong></div>
        : <div className="health-error-list">{errors.map((item,index) => <div className="health-error-row" key={`${item.created_at}-${index}`}>
          <span className="health-error-badge">{item.status_code||'JS'}</span><div className="health-error-main">
            <strong>{item.message||`${item.source==='write'?'Falha de gravação':'Falha de leitura'} em ${item.endpoint}`}</strong>
            <span>{pageLabel(item.page_path)} · {item.user_name||'Usuário removido'}</span></div>
          <time>{new Date(item.created_at).toLocaleString('pt-BR')}</time></div>)}</div>}
    </Panel>
  </>;
}
