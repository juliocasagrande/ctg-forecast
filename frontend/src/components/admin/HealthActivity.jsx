import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const PAGE_LABELS = {
  '/':'Início', '/admin':'Gerenciar usuários', '/admin/health':'Saúde da aplicação', '/forecast':'Forecast',
  '/projects':'Projetos', '/projects/:id':'Detalhe do projeto', '/polos':'Polos', '/report':'Relatórios',
  '/vacations':'Férias', '/metas':'Metas', '/workload':'Controle de carga', '/documents':'Documentos',
  '/drawings':'Desenhos', '/pms':'PMS', '/lists/iacs':'IACs', '/lists/projects-tracking':'Acompanhamento de projetos',
  '/lists/schedule-project':'Cronograma Project', '/engineering/equipamentos':'Mapa de equipamentos',
  '/engineering/equipamentos-admin':'Gestão de equipamentos', '/profile':'Perfil', '/settings':'Configurações',
  '/tutorial':'Tutorial', '/feedback':'Sugestões',
};
export const pageLabel = path => PAGE_LABELS[path] || path || 'Página não identificada';
const num = value => Number(value) || 0;

export function Panel({ title, subtitle, children, className='', actions=null }) {
  return <section className={`health-panel ${className}`}><div className="health-panel-header"><div>
    <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
  </div>{actions}</div>{children}</section>;
}
export const Empty = ({ children='Ainda não há dados neste período.' }) => <div className="health-empty">{children}</div>;

export default function HealthActivity({ daily, pages }) {
  return <div className="health-main-grid">
    <Panel title="Atividade ao longo do tempo" subtitle="Sessões, páginas abertas, gravações e erros por dia" className="health-chart-panel">
      <div className="health-chart"><ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={daily} margin={{top:8,right:8,left:-18,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/>
          <XAxis dataKey="label" tick={{fontSize:11,fill:'#64748B'}} axisLine={false} tickLine={false} minTickGap={20}/>
          <YAxis tick={{fontSize:11,fill:'#64748B'}} axisLine={false} tickLine={false} allowDecimals={false}/>
          <Tooltip contentStyle={{borderRadius:10,border:'1px solid #E2E8F0',fontSize:12}}/>
          <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
          <Bar dataKey="views" name="Páginas" fill="#8ED8F8" radius={[3,3,0,0]}/>
          <Bar dataKey="writes" name="Gravações" fill="#0070B8" radius={[3,3,0,0]}/>
          <Line dataKey="sessions" name="Sessões" stroke="#7C3AED" strokeWidth={2.5} dot={false}/>
          <Line dataKey="errors" name="Erros" stroke="#DC2626" strokeWidth={2} dot={{r:2}}/>
        </ComposedChart>
      </ResponsiveContainer></div>
    </Panel>
    <Panel title="Páginas mais acessadas" subtitle="Visualizações e alcance de usuários">
      {!pages?.length ? <Empty/> : <div className="health-ranking">{pages.map((page,index) => {
        const max=num(pages[0]?.views)||1;
        return <div className="health-ranking-row" key={page.page_path}><span className="health-rank">{index+1}</span>
          <div className="health-ranking-content"><div><strong>{pageLabel(page.page_path)}</strong><span>{num(page.users).toLocaleString('pt-BR')} usuários</span></div>
            <div className="health-bar"><i style={{width:`${num(page.views)/max*100}%`}}/></div></div>
          <b>{num(page.views).toLocaleString('pt-BR')}</b></div>;
      })}</div>}
    </Panel>
  </div>;
}
