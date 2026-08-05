import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../../utils/api.js';
import { Empty, Panel } from './HealthActivity.jsx';

const num = value => Number(value) || 0;
const fmt = value => num(value).toLocaleString('pt-BR');
const ANOMALY_Z = 2;

function fmtAgo(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s atrás`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h atrás` : `${Math.floor(hours / 24)}d atrás`;
}

function EndpointPerformance({ rows = [] }) {
  return <Panel title="Performance por endpoint" subtitle="p50/p95 de latência e taxa de erro real por rota (mín. 5 requisições)">
    {!rows.length ? <Empty>Sem volume suficiente no período selecionado.</Empty> : <div className="health-table-wrap"><table className="health-table">
      <thead><tr><th>Endpoint</th><th>Método</th><th>Requisições</th><th>p50</th><th>p95</th><th>Erros</th></tr></thead>
      <tbody>{rows.map(row => <tr key={`${row.endpoint}-${row.method}`}>
        <td>{row.endpoint}</td><td>{row.method}</td><td>{fmt(row.requests)}</td>
        <td>{fmt(row.p50_ms)}ms</td><td className={num(row.p95_ms) > 1000 ? 'health-danger' : ''}>{fmt(row.p95_ms)}ms</td>
        <td className={num(row.error_rate) > 0 ? 'health-danger' : ''}>{num(row.error_rate).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</td>
      </tr>)}</tbody>
    </table></div>}
  </Panel>;
}

function PipelineHealth({ pipeline }) {
  const daily = (pipeline?.daily || []).map(item => ({ ...item,
    label: new Date(`${String(item.day).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    events: num(item.events), avg_prev7: item.avg_prev7 !== null ? num(item.avg_prev7) : null,
    z: item.avg_prev7 !== null && num(item.stddev_prev7) > 0 ? (num(item.events) - num(item.avg_prev7)) / num(item.stddev_prev7) : null,
  }));
  const lastEventAt = pipeline?.last_event_at ? new Date(pipeline.last_event_at) : null;
  const secondsSince = lastEventAt ? (Date.now() - lastEventAt.getTime()) / 1000 : null;
  const anomalies = daily.filter(item => item.z !== null && Math.abs(item.z) > ANOMALY_Z);
  const fresh = secondsSince !== null && secondsSince < 15 * 60;

  return <Panel title="Saúde do pipeline" subtitle="Freshness e detecção de anomalia de volume (z-score sobre média móvel de 7 dias)">
    <div className="health-pipeline-status">
      <span className={`health-pipeline-dot ${fresh ? 'ok' : 'stale'}`}/>
      <div><strong>{lastEventAt ? `Último evento ${fmtAgo(secondsSince)}` : 'Nenhum evento registrado'}</strong>
        <span>{anomalies.length ? `${anomalies.length} dia(s) com volume fora do padrão (|z| > ${ANOMALY_Z})` : 'Volume diário dentro do padrão esperado'}</span></div>
    </div>
    {!daily.length ? <Empty>Sem eventos nos últimos 21 dias.</Empty> : <div className="health-chart health-pipeline-chart"><ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} minTickGap={20}/>
        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false}/>
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
          formatter={(value, name) => [fmt(value), name === 'events' ? 'Eventos' : 'Média móvel (7d)']}/>
        <Bar dataKey="events" name="events" radius={[3, 3, 0, 0]}>
          {daily.map(item => <Cell key={item.day} fill={item.z !== null && Math.abs(item.z) > ANOMALY_Z ? '#DC2626' : '#0070B8'}/>)}
        </Bar>
        <Line dataKey="avg_prev7" name="avg_prev7" stroke="#7C3AED" strokeWidth={2} dot={false} strokeDasharray="4 3"/>
      </ComposedChart>
    </ResponsiveContainer></div>}
  </Panel>;
}

function DataQuality({ checks = [] }) {
  const issues = checks.filter(item => num(item.count) > 0);
  return <Panel title="Qualidade de dados" subtitle="Checks de integridade não garantidos por FK/CHECK do schema (referências em texto livre e arrays)">
    {!issues.length ? <div className="health-no-errors"><span>✓</span><strong>Nenhuma inconsistência encontrada nos checks executados.</strong></div>
      : <div className="health-dq-list">{issues.map(item => <div className="health-dq-row" key={`${item.table_name}-${item.column_name}`}>
        <span className="health-dq-badge">{fmt(item.count)}</span>
        <div><strong>{item.description}</strong>
          <span>{item.table_name}.{item.column_name}{item.samples?.length ? ` · ex: ${item.samples.slice(0, 3).join(', ')}` : ''}</span></div>
      </div>)}</div>}
  </Panel>;
}

function DataCatalog({ tables = [] }) {
  return <Panel title="Catálogo de dados" subtitle="Volumetria real via pg_stat_user_tables (20 maiores tabelas)">
    {!tables.length ? <Empty/> : <div className="health-table-wrap"><table className="health-table">
      <thead><tr><th>Tabela</th><th>Linhas (estimado)</th><th>Tamanho</th><th>Última análise</th></tr></thead>
      <tbody>{tables.map(row => <tr key={row.table_name}>
        <td>{row.table_name}</td><td>{fmt(row.row_estimate)}</td><td>{row.total_size}</td>
        <td>{row.last_analyzed ? new Date(row.last_analyzed).toLocaleDateString('pt-BR') : 'nunca'}</td>
      </tr>)}</tbody>
    </table></div>}
  </Panel>;
}

export default function DataEngineeringPanel({ days }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.get('/telemetry/data-engineering', { params: { days } })
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar os dados de engenharia de dados.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (error) return <div className="health-error">{error}</div>;

  return <>
    <div className="health-de-grid">
      <EndpointPerformance rows={data?.endpoint_performance}/>
      <PipelineHealth pipeline={data?.pipeline}/>
    </div>
    <div className="health-de-grid">
      <DataQuality checks={data?.data_quality}/>
      <DataCatalog tables={data?.catalog}/>
    </div>
  </>;
}
