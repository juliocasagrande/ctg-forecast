import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';

const CAT_COLORS = {
  Contratos:     { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  Viagens:       { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', dot: '#22c55e' },
  Desconsiderar: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', dot: '#ef4444' },
};

const KW_RULE_META = {
  Dispensado: {
    label: 'Dispensados do cálculo',
    color: '#92400e', bg: '#fef3c7', border: '#fde68a',
    description: 'Excluídos da importação — salários, encargos',
    priority: 1,
  },
  Viagens: {
    label: 'Viagens',
    color: '#065f46', bg: '#f0fdf4', border: '#bbf7d0',
    description: 'Classificados como Viagens',
    priority: 2,
  },
};

// ── Keyword rule editor ───────────────────────────────────────────────────────
function KeywordRuleCard({ cat, meta, keywords, onUpdate }) {
  const [newKw, setNewKw] = useState('');

  function addKw() {
    const k = newKw.trim().toLowerCase();
    if (!k) return;
    if (keywords.includes(k)) return;
    onUpdate([...keywords, k]);
    setNewKw('');
  }

  function removeKw(kw) {
    onUpdate(keywords.filter(k => k !== kw));
  }

  return (
    <div style={{ border: `1.5px solid ${meta.border}`, borderRadius: 12, overflow: 'hidden', background: meta.bg }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: meta.color, color: '#fff',
          fontWeight: 900, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{meta.priority}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: meta.color }}>{meta.label}</div>
          <div style={{ fontSize: '0.73rem', color: meta.color, opacity: 0.75, marginTop: 1 }}>{meta.description}</div>
        </div>
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
          background: meta.color, color: '#fff', padding: '2px 8px', borderRadius: 20,
        }}>Prioridade {meta.priority}</span>
      </div>

      {/* Keywords body */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${meta.border}`, background: 'rgba(255,255,255,0.55)' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: meta.color, letterSpacing: '0.06em', marginBottom: 10 }}>
          Contém qualquer uma destas palavras (lógica OU) — ignora acentos e maiúsculas:
        </div>

        {/* Tag list */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, minHeight: 32 }}>
          {keywords.length === 0 && (
            <span style={{ fontSize: '0.78rem', color: meta.color, opacity: 0.5, fontStyle: 'italic' }}>Nenhuma palavra configurada</span>
          )}
          {keywords.map(kw => (
            <span key={kw} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: '#fff', border: `1.5px solid ${meta.border}`,
              borderRadius: 8, padding: '3px 8px 3px 10px',
              fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600, color: meta.color,
            }}>
              <span style={{ opacity: 0.4, fontSize: '0.65rem' }}>*</span>
              {kw}
              <span style={{ opacity: 0.4, fontSize: '0.65rem' }}>*</span>
              <button
                onClick={() => removeKw(kw)}
                title="Remover"
                style={{
                  marginLeft: 2, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: meta.color, opacity: 0.6, fontSize: '0.9rem', lineHeight: 1,
                  padding: '0 2px', display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
              >×</button>
            </span>
          ))}
        </div>

        {/* Add input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newKw}
            onChange={e => setNewKw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addKw(); }}
            placeholder={`Ex: ${cat === 'Dispensado' ? 'ferias' : 'onibus'}`}
            style={{
              flex: 1, padding: '7px 11px', border: `1.5px solid ${meta.border}`,
              borderRadius: 8, fontSize: '0.83rem', fontFamily: 'monospace',
              outline: 'none', background: '#fff', color: meta.color,
            }}
          />
          <button
            onClick={addKw}
            disabled={!newKw.trim()}
            style={{
              padding: '7px 16px', border: 'none', borderRadius: 8,
              background: newKw.trim() ? meta.color : '#94a3b8',
              color: '#fff', fontWeight: 700, fontSize: '0.82rem',
              cursor: newKw.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
            }}
          >+ Adicionar</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SapMappingTab() {
  const [rows,      setRows]      = useState([]);
  const [keywords,  setKeywords]  = useState({ Dispensado: [], Viagens: [] });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [kwSaving,  setKwSaving]  = useState(false);
  const [newDescr,  setNewDescr]  = useState('');
  const [newCat,    setNewCat]    = useState('Contratos');
  const [filter,    setFilter]    = useState('');
  const [activeTab, setActiveTab] = useState('rules');
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      api.get('/settings/sap-mapping'),
      api.get('/settings/sap-keywords'),
    ]).then(([mapRes, kwRes]) => {
      setRows(mapRes.data || []);
      setKeywords(kwRes.data || { Dispensado: [], Viagens: [] });
    }).catch(() => toast('Erro ao carregar configurações SAP.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  // ── Keyword handlers ───────────────────────────────────────────────────────
  function updateKeywordsForCat(cat, kws) {
    setKeywords(prev => ({ ...prev, [cat]: kws }));
  }

  async function handleSaveKeywords() {
    setKwSaving(true);
    try {
      const res = await api.put('/settings/sap-keywords', { keywords });
      setKeywords(res.data || keywords);
      toast('Palavras-chave salvas!', 'success');
    } catch {
      toast('Erro ao salvar palavras-chave.', 'error');
    } finally {
      setKwSaving(false);
    }
  }

  // ── Mapping handlers ───────────────────────────────────────────────────────
  async function handleSaveMapping() {
    setSaving(true);
    try {
      const saved = await api.put('/settings/sap-mapping', { mapping: rows });
      setRows(saved.data || rows);
      toast('Mapeamento SAP salvo!', 'success');
    } catch {
      toast('Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleAdd() {
    const d = newDescr.trim().toUpperCase();
    if (!d) return;
    if (rows.some(r => r.descr.toUpperCase() === d)) {
      toast('Essa descrição já existe.', 'error'); return;
    }
    setRows(prev => [...prev, { descr: d, category: newCat }]);
    setNewDescr('');
  }

  function handleChangeCategory(idx, cat) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, category: cat } : r));
  }

  function handleDelete(idx) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  const filtered = rows.filter(r =>
    !filter ||
    r.descr.toLowerCase().includes(filter.toLowerCase()) ||
    r.category.toLowerCase().includes(filter.toLowerCase())
  );

  const stats = { Contratos: 0, Viagens: 0, Desconsiderar: 0 };
  rows.forEach(r => { if (stats[r.category] !== undefined) stats[r.category]++; });

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--ctg-navy)', marginBottom: 4 }}>
          Mapeamento de Classes de Custo SAP
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          A classificação usa <strong>palavras-chave</strong> contidas na coluna <strong>"Descr.classe custo"</strong>.
          Prioridade: Dispensado → Viagens → Contratos (tudo que restar).
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {[
          { id: 'rules',   label: '📋 Regras de Palavras-chave' },
          { id: 'mapping', label: '🗂️ Mapeamento Avançado' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '9px 20px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: '0.85rem', fontWeight: activeTab === tab.id ? 700 : 400,
              background: 'transparent',
              color: activeTab === tab.id ? 'var(--ctg-navy)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2.5px solid var(--ctg-navy)' : '2.5px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── Tab: Regras de Palavras-chave ── */}
      {activeTab === 'rules' && (
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
            Edite as palavras-chave de cada categoria. A correspondência é feita verificando se a
            descrição <strong>contém</strong> qualquer uma das palavras (lógica <strong>OU</strong>), sem distinção
            de acentos ou maiúsculas. Salve para que as próximas importações usem as novas regras.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            {Object.entries(KW_RULE_META).map(([cat, meta]) => (
              <KeywordRuleCard
                key={cat}
                cat={cat}
                meta={meta}
                keywords={keywords[cat] || []}
                onUpdate={kws => updateKeywordsForCat(cat, kws)}
              />
            ))}

            {/* Contratos fallback card (read-only) */}
            <div style={{ border: '1.5px solid #bfdbfe', borderRadius: 12, overflow: 'hidden', background: '#eff6ff' }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: '#94a3b8', color: '#fff',
                  fontWeight: 900, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>3</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1d4ed8' }}>Contratos (restantes)</div>
                  <div style={{ fontSize: '0.73rem', color: '#1d4ed8', opacity: 0.75, marginTop: 1 }}>Tudo que não se enquadrar nas regras acima</div>
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', background: '#94a3b8', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>Fallback</span>
              </div>
              <div style={{ padding: '10px 16px', borderTop: '1px solid #bfdbfe', background: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                Qualquer descrição que <strong>não</strong> se enquadre nas regras acima será classificada como <strong>Contratos</strong>.
                Use <em>Mapeamento Avançado</em> para sobrescrever casos específicos.
              </div>
            </div>
          </div>

          {/* Fluxo visual */}
          <div style={{ marginBottom: 20, padding: '14px 18px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10 }}>
              Fluxo de classificação
            </div>
            {[
              { prefix: '', cond: `Contém ${(keywords.Dispensado||[]).map(k => `"${k}"`).join(', ') || '(nenhuma palavra)'} ?`, result: 'Dispensado', color: '#92400e', bg: '#fef3c7' },
              { prefix: 'Senão:', cond: `Contém ${(keywords.Viagens||[]).map(k => `"${k}"`).join(', ') || '(nenhuma palavra)'} ?`, result: 'Viagens',    color: '#065f46', bg: '#f0fdf4' },
              { prefix: 'Senão:', cond: 'Qualquer outro valor',                                                                      result: 'Contratos',  color: '#1d4ed8', bg: '#eff6ff' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.79rem', marginTop: i > 0 ? 6 : 0 }}>
                {row.prefix && <span style={{ color: '#94a3b8', fontSize: '0.7rem', minWidth: 38 }}>{row.prefix}</span>}
                <span style={{ background: row.bg, color: row.color, padding: '3px 9px', borderRadius: 6, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.cond}>{row.cond}</span>
                <span style={{ color: '#94a3b8' }}>→</span>
                <span style={{ background: row.bg, color: row.color, padding: '3px 9px', borderRadius: 6, fontWeight: 700 }}>{row.result}</span>
              </div>
            ))}
          </div>

          {/* Save keywords */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSaveKeywords}
              disabled={kwSaving}
              style={{
                padding: '10px 28px', border: 'none', borderRadius: 8,
                background: kwSaving ? '#94a3b8' : 'var(--ctg-navy)',
                color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                cursor: kwSaving ? 'wait' : 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              {kwSaving ? 'Salvando…' : '💾 Salvar Palavras-chave'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Mapeamento Avançado ── */}
      {activeTab === 'mapping' && (
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Mapeamentos por <strong>descrição exata</strong>. Aplicados após as regras de palavras-chave —
            podem sobrescrever a classificação padrão para descrições específicas.
          </p>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {Object.entries(CAT_COLORS).map(([cat, cc]) => (
              <div key={cat} style={{ padding: '12px 16px', borderRadius: 10, background: cc.bg, border: `1.5px solid ${cc.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: cc.dot, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: cc.text, letterSpacing: '0.06em' }}>{cat}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: cc.text }}>{stats[cat]}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Add new */}
          <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Descrição da Classe de Custo</div>
              <input
                value={newDescr} onChange={e => setNewDescr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="Ex: MANUTENÇÃO DE EQUIPAMENTOS"
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Classificar como</div>
              <select value={newCat} onChange={e => setNewCat(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff', cursor: 'pointer' }}
              >
                {['Contratos', 'Viagens', 'Desconsiderar'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={handleAdd} disabled={!newDescr.trim()}
              style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: newDescr.trim() ? 'var(--ctg-navy)' : '#94a3b8', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: newDescr.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
            >+ Adicionar</button>
          </div>

          {/* Filter */}
          <div style={{ marginBottom: 12 }}>
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="🔍  Filtrar por descrição ou categoria…"
              style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Table */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 44px', background: 'var(--ctg-navy)', padding: '8px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.7)' }}>
              <span>Descr.classe custo (SAP)</span><span>Classificação</span><span></span>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {filter ? 'Nenhum resultado.' : 'Nenhum mapeamento avançado cadastrado.'}
              </div>
            ) : filtered.map((row, idx) => {
              const realIdx = rows.indexOf(row);
              const cc = CAT_COLORS[row.category] || CAT_COLORS.Desconsiderar;
              return (
                <div key={`${row.descr}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 44px', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.descr}>{row.descr}</span>
                  <select value={row.category} onChange={e => handleChangeCategory(realIdx, e.target.value)}
                    style={{ padding: '5px 10px', border: `1.5px solid ${cc.border}`, borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-body)', background: cc.bg, color: cc.text, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
                  >
                    {['Contratos', 'Viagens', 'Desconsiderar'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => handleDelete(realIdx)} title="Remover"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >×</button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSaveMapping} disabled={saving}
              style={{ padding: '10px 28px', border: 'none', borderRadius: 8, background: saving ? '#94a3b8' : 'var(--ctg-navy)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}
            >{saving ? 'Salvando…' : '💾 Salvar Mapeamento'}</button>
          </div>
        </div>
      )}
    </div>
  );
}