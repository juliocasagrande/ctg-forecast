import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';

const CATEGORIES = ['Contratos', 'Viagens', 'Desconsiderar'];

const CAT_COLORS = {
  Contratos:     { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  Viagens:       { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', dot: '#22c55e' },
  Desconsiderar: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', dot: '#ef4444' },
};

export default function SapMappingTab() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [newDescr, setNewDescr]   = useState('');
  const [newCat,   setNewCat]     = useState('Contratos');
  const [filter,   setFilter]     = useState('');
  const { toast } = useToast();

  useEffect(() => {
    api.get('/settings/sap-mapping')
      .then(r => setRows(r.data || []))
      .catch(() => toast('Erro ao carregar mapeamentos.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
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
    !filter || r.descr.toLowerCase().includes(filter.toLowerCase()) || r.category.toLowerCase().includes(filter.toLowerCase())
  );

  // Stats
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
          Defina como cada valor da coluna <strong>"Descr.classe custo"</strong> do arquivo SAP deve ser classificado.
          Apenas <strong>Contratos</strong> e <strong>Viagens</strong> são importados para o Realizado; os demais são desconsiderados.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {CATEGORIES.map(cat => (
          <div key={cat} style={{
            padding: '12px 16px', borderRadius: 10,
            background: CAT_COLORS[cat].bg, border: `1.5px solid ${CAT_COLORS[cat].border}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: CAT_COLORS[cat].dot, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: CAT_COLORS[cat].text, letterSpacing: '0.06em' }}>{cat}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: CAT_COLORS[cat].text }}>{stats[cat]}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div style={{
        background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10,
        padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Descrição da Classe de Custo
          </div>
          <input
            value={newDescr}
            onChange={e => setNewDescr(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Ex: MANUTENÇÃO DE EQUIPAMENTOS"
            style={{
              width: '100%', padding: '8px 12px', border: '1.5px solid #d1d5db',
              borderRadius: 8, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
              outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase',
            }}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Classificar como
          </div>
          <select
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', border: '1.5px solid #d1d5db',
              borderRadius: 8, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
              outline: 'none', background: '#fff', cursor: 'pointer',
            }}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={!newDescr.trim()}
          style={{
            padding: '8px 18px', border: 'none', borderRadius: 8,
            background: newDescr.trim() ? 'var(--ctg-navy)' : '#94a3b8',
            color: '#fff', fontWeight: 700, fontSize: '0.85rem',
            cursor: newDescr.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
          }}
        >
          + Adicionar
        </button>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 12 }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="🔍  Filtrar por descrição ou categoria…"
          style={{
            width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0',
            borderRadius: 8, fontSize: '0.85rem', fontFamily: 'var(--font-body)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 180px 44px',
          background: 'var(--ctg-navy)', padding: '8px 14px',
          fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'rgba(255,255,255,0.7)',
        }}>
          <span>Descr.classe custo (SAP)</span>
          <span>Classificação</span>
          <span></span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {filter ? 'Nenhum resultado para o filtro.' : 'Nenhum mapeamento cadastrado.'}
          </div>
        ) : filtered.map((row, idx) => {
          const realIdx = rows.indexOf(row);
          const cc = CAT_COLORS[row.category] || CAT_COLORS.Desconsiderar;
          return (
            <div key={`${row.descr}-${idx}`} style={{
              display: 'grid', gridTemplateColumns: '1fr 180px 44px',
              alignItems: 'center', padding: '9px 14px',
              borderBottom: '1px solid #e2e8f0',
              background: idx % 2 === 0 ? '#fff' : '#f8fafc',
              transition: 'background 0.1s',
            }}>
              <span style={{
                fontFamily: 'monospace', fontSize: '0.8rem',
                color: 'var(--text-primary)', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={row.descr}>
                {row.descr}
              </span>
              <select
                value={row.category}
                onChange={e => handleChangeCategory(realIdx, e.target.value)}
                style={{
                  padding: '5px 10px', border: `1.5px solid ${cc.border}`,
                  borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-body)',
                  background: cc.bg, color: cc.text, fontWeight: 600,
                  cursor: 'pointer', outline: 'none',
                }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={() => handleDelete(realIdx)}
                title="Remover"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#ef4444', fontSize: '1rem', padding: '4px 8px',
                  borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >×</button>
            </div>
          );
        })}
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 28px', border: 'none', borderRadius: 8,
            background: saving ? '#94a3b8' : 'var(--ctg-navy)',
            color: '#fff', fontWeight: 700, fontSize: '0.9rem',
            cursor: saving ? 'wait' : 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          {saving ? 'Salvando…' : '💾 Salvar Mapeamento'}
        </button>
      </div>
    </div>
  );
}
