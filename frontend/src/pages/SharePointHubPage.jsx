import { useMemo, useState } from 'react';

const ROOT_PATH = 'SharePoint > Diretorias de Engenharia e Gestao de Ativos > Areas > Engenharia Eletromecanica';

const CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'documentos', label: 'Documentos tecnicos' },
  { id: 'gestao', label: 'Gestao e rotina' },
  { id: 'areas', label: 'Areas tecnicas' },
  { id: 'projetos', label: 'Projetos e obras' },
  { id: 'referencias', label: 'Referencias' },
];

const FOLDERS = [
  ['ELETRICA', 'areas', 'Materiais, estudos e documentos da disciplina eletrica.', ['disciplina', 'eletrica', 'engenharia'], true],
  ['MECANICA', 'areas', 'Materiais, estudos e documentos da disciplina mecanica.', ['disciplina', 'mecanica', 'engenharia'], true],
  ['CONFIABILIDADE E PERFORMANCE', 'areas', 'Analises, indicadores e materiais de confiabilidade dos ativos.', ['performance', 'confiabilidade', 'indicadores'], true],
  ['Dados Tecnicos Equipamentos', 'documentos', 'Informacoes tecnicas de equipamentos para consulta rapida.', ['equipamentos', 'dados tecnicos', 'ativos'], true],
  ['PROJETOS', 'projetos', 'Arquivos de projetos, entregaveis e documentacao de acompanhamento.', ['projetos', 'obras', 'entregaveis'], true],
  ['ESPECIFICACAO TECNICA', 'documentos', 'Especificacoes tecnicas e documentos padrao para contratacao.', ['especificacao', 'padrao', 'contratacao'], true],
  ['PLANEJAMENTOS', 'projetos', 'Planos, cronogramas e materiais de planejamento.', ['planejamento', 'cronograma', 'programacao']],
  ['ORCAMENTOS', 'projetos', 'Bases de custos, estimativas e historico de orcamentos.', ['orcamento', 'custos', 'estimativas']],
  ['SUPRIMENTOS', 'projetos', 'Materiais ligados a compras, contratacoes e suprimentos.', ['compras', 'contratos', 'fornecedores']],
  ['RELATORIOS', 'documentos', 'Relatorios tecnicos e gerenciais da engenharia.', ['relatorios', 'tecnico', 'gerencial']],
  ['ATAS - FAX - MEMO', 'documentos', 'Registros formais, atas, memorandos e comunicacoes.', ['atas', 'memo', 'registro']],
  ['NUMERACAO DE DOCUMENTOS', 'documentos', 'Regras e controles para numeracao dos documentos de engenharia.', ['codificacao', 'documentos', 'controle']],
  ['NUMERACAO DE DESENHOS', 'documentos', 'Regras e controles para numeracao de desenhos tecnicos.', ['desenhos', 'codificacao', 'controle']],
  ['PMS-EDITAVEL', 'documentos', 'Arquivos editaveis ligados aos PMS e padroes de manutencao.', ['pms', 'editavel', 'manutencao']],
  ['ANEEL', 'referencias', 'Materiais e documentos relacionados a ANEEL.', ['aneel', 'regulatorio', 'referencia']],
  ['CATALOGOS-NORMAS-LIVROS', 'referencias', 'Catalogos, normas, livros e materiais de referencia.', ['normas', 'catalogos', 'livros']],
  ['O&M RISK WORKSHOP', 'referencias', 'Materiais de workshop, risco operacional e O&M.', ['risco', 'workshop', 'om']],
  ['APRESENTACOES E TREINAMENTO', 'gestao', 'Apresentacoes, treinamentos e materiais de capacitacao.', ['treinamento', 'apresentacoes', 'capacitacao']],
  ['GERENCIA', 'gestao', 'Materiais administrativos e rotinas de gerencia.', ['gerencia', 'administrativo', 'rotina']],
  ['HIGHLIGHTS SEMANAIS', 'gestao', 'Destaques semanais, informativos e consolidacoes rapidas.', ['highlights', 'semanal', 'status']],
  ['METAS CTG', 'gestao', 'Materiais e evidencias relacionados a metas.', ['metas', 'ctg', 'evidencias']],
  ['FERIAS', 'gestao', 'Controles e documentos relacionados a ferias da equipe.', ['ferias', 'pessoas', 'equipe']],
  ['Work team follow-up', 'gestao', 'Acompanhamentos de equipe, follow-ups e rotina de trabalho.', ['equipe', 'follow-up', 'rotina']],
  ['FOTOS DIVERSAS', 'referencias', 'Fotos de campo, registros visuais e imagens de apoio.', ['fotos', 'campo', 'registro']],
  ['DIVERSOS', 'referencias', 'Materiais diversos que ainda nao se encaixam em uma pasta especifica.', ['diversos', 'apoio']],
  ['Temp_Docs_ISA', 'referencias', 'Pasta temporaria para documentos ISA.', ['temporario', 'isa']],
].map(([name, category, description, tags, priority = false]) => ({ name, category, description, tags, priority }));

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function SvgIcon({ type = 'folder' }) {
  const props = { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': true };
  if (type === 'search') return <svg {...props}><path fillRule="evenodd" d="M8.5 3a5.5 5.5 0 014.38 8.83l3.15 3.14a.75.75 0 11-1.06 1.06l-3.14-3.15A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" /></svg>;
  if (type === 'path') return <svg {...props}><path d="M3 4.5A1.5 1.5 0 014.5 3h4.38a1.5 1.5 0 011.06.44l1.12 1.12c.28.28.66.44 1.06.44h3.38A1.5 1.5 0 0117 6.5v8A1.5 1.5 0 0115.5 16h-11A1.5 1.5 0 013 14.5v-10z" /></svg>;
  if (type === 'star') return <svg {...props}><path d="M10 2.4l2.1 4.25 4.7.68-3.4 3.31.8 4.68L10 13.1l-4.2 2.22.8-4.68-3.4-3.31 4.7-.68L10 2.4z" /></svg>;
  return <svg {...props}><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>;
}

export default function SharePointHubPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('todos');
  const [copied, setCopied] = useState('');

  const featured = FOLDERS.filter(folder => folder.priority);
  const filtered = useMemo(() => {
    const q = normalize(query);
    return FOLDERS.filter(folder => {
      const matchesCategory = category === 'todos' || folder.category === category;
      const haystack = normalize([folder.name, folder.description, ...folder.tags].join(' '));
      return matchesCategory && (!q || haystack.includes(q));
    });
  }, [category, query]);

  const copyPath = async (folder) => {
    try {
      await navigator.clipboard.writeText(`${ROOT_PATH} > ${folder.name}`);
      setCopied(folder.name);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 18, alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0070B8' }}>Central SharePoint</div>
          <h2 style={{ marginTop: 4, color: 'var(--ctg-navy)', fontFamily: 'var(--font-display)', fontSize: '1.55rem', lineHeight: 1.15 }}>Engenharia Eletromecanica</h2>
          <p style={{ marginTop: 6, maxWidth: 760, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Uma entrada organizada para localizar rapidamente as pastas principais da area, sem depender da lista crua do SharePoint.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 88px)', gap: 8 }}>
          <Metric value={FOLDERS.length} label="pastas" color="#0070B8" />
          <Metric value={CATEGORIES.length - 1} label="grupos" color="#10B981" />
          <Metric value={featured.length} label="atalhos" color="#F59E0B" />
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)', gap: 14, minHeight: 0 }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <Panel title="Buscar pasta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--border-strong)', borderRadius: 8, padding: '0 10px', background: '#FBFDFF' }}>
              <span style={{ color: '#0070B8', display: 'inline-flex' }}><SvgIcon type="search" /></span>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: PMS, relatorios, eletrica" style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', height: 40, fontSize: '0.84rem', color: 'var(--text-primary)' }} />
            </div>
          </Panel>

          <Panel title="Filtrar por grupo">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CATEGORIES.map(item => {
                const active = category === item.id;
                const count = item.id === 'todos' ? FOLDERS.length : FOLDERS.filter(folder => folder.category === item.id).length;
                return (
                  <button key={item.id} type="button" onClick={() => setCategory(item.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: `1.5px solid ${active ? '#0070B8' : '#E2E8F0'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#005B96' : 'var(--text-secondary)', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, textAlign: 'left' }}>
                    <span>{item.label}</span>
                    <strong style={{ fontSize: '0.72rem' }}>{count}</strong>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ color: 'var(--ctg-navy)', fontSize: '0.76rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 7 }}><SvgIcon type="path" /> Caminho raiz</div>
            <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.5 }}>{ROOT_PATH}</p>
          </div>
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <h3 style={{ color: 'var(--ctg-navy)', fontSize: '0.98rem', fontWeight: 900 }}>Atalhos mais provaveis</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700 }}>Sugestao inicial</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {featured.slice(0, 6).map(folder => <Shortcut key={folder.name} folder={folder} copied={copied === folder.name} onCopy={() => copyPath(folder)} />)}
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, overflow: 'auto', paddingRight: 2 }}>
            {filtered.map(folder => <FolderCard key={folder.name} folder={folder} copied={copied === folder.name} onCopy={() => copyPath(folder)} />)}
            {!filtered.length && <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma pasta encontrada para esse filtro.</div>}
          </section>
        </div>
      </section>
    </div>
  );
}

function Panel({ title, children }) {
  return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}><div style={{ color: 'var(--ctg-navy)', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{title}</div>{children}</div>;
}

function Metric({ value, label, color }) {
  return <div style={{ border: '1px solid #E2E8F0', background: '#FBFDFF', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}><strong style={{ display: 'block', color, fontFamily: 'var(--font-display)', fontSize: '1.35rem', lineHeight: 1 }}>{value}</strong><span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</span></div>;
}

function Shortcut({ folder, copied, onCopy }) {
  return <button type="button" onClick={onCopy} style={{ textAlign: 'left', border: '1px solid #DDE7F3', background: '#FBFDFF', borderRadius: 8, padding: 10, cursor: 'pointer', minHeight: 80 }}><span style={{ color: '#F59E0B', display: 'inline-flex', marginBottom: 7 }}><SvgIcon type="star" /></span><strong style={{ display: 'block', color: 'var(--ctg-navy)', fontSize: '0.78rem', lineHeight: 1.25 }}>{folder.name}</strong><span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)', fontSize: '0.68rem' }}>{copied ? 'Caminho copiado' : 'Clique para copiar o caminho'}</span></button>;
}

function FolderCard({ folder, copied, onCopy }) {
  const category = CATEGORIES.find(item => item.id === folder.category)?.label || 'Geral';
  return <article style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 14, minHeight: 166, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--shadow-sm)' }}><div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><span style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', color: '#0070B8', display: 'grid', placeItems: 'center', flexShrink: 0 }}><SvgIcon /></span><div style={{ minWidth: 0, flex: 1 }}><h3 style={{ color: 'var(--ctg-navy)', fontSize: '0.92rem', lineHeight: 1.25, fontWeight: 900 }}>{folder.name}</h3><div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', border: '1px solid #DDE7F3', background: '#F8FAFC', color: '#475569', borderRadius: 999, padding: '2px 8px', fontSize: '0.66rem', fontWeight: 900 }}>{category}</div></div></div><p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.45, flex: 1 }}>{folder.description}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{folder.tags.slice(0, 3).map(tag => <span key={tag} style={{ color: '#64748B', background: '#F1F5F9', borderRadius: 999, padding: '2px 7px', fontSize: '0.64rem', fontWeight: 800 }}>{tag}</span>)}</div><button type="button" onClick={onCopy} style={{ marginTop: 2, border: '1.5px solid #0070B8', color: '#0065A8', background: copied ? '#E0F2FE' : '#fff', borderRadius: 8, height: 34, fontSize: '0.76rem', fontWeight: 900, cursor: 'pointer' }}>{copied ? 'Caminho copiado' : 'Copiar caminho'}</button></article>;
}
