import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api.js';

/* ── Color palette by usina (full names) ─────────────────────────────────── */
const USINA_COLORS = {
  'UHE Capivara':     { accent: '#0066B3', light: '#E8F2FB', border: '#BAD6EF' },
  'UHE Canoas 1':     { accent: '#BE185D', light: '#FCE7F3', border: '#F9A8D4' },
  'UHE Canoas 2':     { accent: '#9D174D', light: '#FDF2F8', border: '#F0ABFC' },
  'UHE Chavantes':    { accent: '#B45309', light: '#FFFBEB', border: '#FDE68A' },
  'UHE Garibaldi':    { accent: '#059669', light: '#D1FAE5', border: '#6EE7B7' },
  'UHE Ilha Solteira':{ accent: '#7C3AED', light: '#EDE9FE', border: '#C4B5FD' },
  'UHE Jupiá':        { accent: '#0F766E', light: '#CCFBF1', border: '#99F6E4' },
  'UHE Jurumirim':    { accent: '#6D28D9', light: '#F5F3FF', border: '#DDD6FE' },
  'UHE Rosana':       { accent: '#D97706', light: '#FEF3C7', border: '#FCD34D' },
  'UHE Salto Grande': { accent: '#0891B2', light: '#CFFAFE', border: '#67E8F9' },
  'UHE Salto':        { accent: '#0284C7', light: '#E0F2FE', border: '#7DD3FC' },
  'UHE Taquaruçu':    { accent: '#DC2626', light: '#FEE2E2', border: '#FCA5A5' },
  'PCH Palmeiras':    { accent: '#166534', light: '#F0FDF4', border: '#BBF7D0' },
  'PCH Retiro':       { accent: '#065F46', light: '#ECFDF5', border: '#A7F3D0' },
  'default':          { accent: '#475569', light: '#F1F5F9', border: '#CBD5E1' },
};

function getUsinaColor(usina) {
  return USINA_COLORS[usina] || USINA_COLORS.default;
}

const USINA_POLES = [
  {
    label: 'Rio Paraná',
    color: '#0070B8',
    bg: '#EFF6FF',
    usinas: ['UHE Ilha Solteira', 'UHE Jupiá', 'UHE Salto'],
  },
  {
    label: 'Polo Chavantes',
    color: '#10B981',
    bg: '#ECFDF5',
    usinas: ['UHE Canoas 1', 'UHE Canoas 2', 'UHE Chavantes', 'UHE Salto Grande', 'UHE Jurumirim', 'PCH Retiro', 'PCH Palmeiras'],
  },
  {
    label: 'Polo Capivara',
    color: '#6366F1',
    bg: '#EEF2FF',
    usinas: ['UHE Capivara', 'UHE Rosana', 'UHE Taquaruçu', 'UHE Garibaldi'],
  },
];

/* ── Icons ───────────────────────────────────────────────────────────────── */
const ChevronRight = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconPlant = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
    <path d="M11 17a1 1 0 001 1h2a1 1 0 100-2h-2a1 1 0 00-1 1zM10 4a6 6 0 00-6 6c0 1.65.67 3.15 1.76 4.24A1 1 0 007.17 13H10V4zM12 4v9h2.83a1 1 0 00.71-.29A5.98 5.98 0 0018 10a6 6 0 00-6-6z"/>
  </svg>
);
const IconTable = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
    <path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd"/>
  </svg>
);
const IconEquip = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
  </svg>
);
const IconUG = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
    <path d="M13 7H7v6h6V7z"/>
    <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd"/>
  </svg>
);
const IconTag = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
    <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
  </svg>
);
const IconLink = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/>
  </svg>
);

/* ── Column Item ─────────────────────────────────────────────────────────── */
function ColumnItem({ label, sublabel, isSelected, onClick, color, icon, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        padding: '10px 12px', border: 'none', borderRadius: 8,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
        background: isSelected ? (color?.accent || 'var(--ctg-blue)') : 'transparent',
        color: isSelected ? '#fff' : 'var(--text-primary)',
        transition: 'all 0.12s', marginBottom: 2,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = color?.light || '#F1F5F9'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 7,
        background: isSelected ? 'rgba(255,255,255,0.20)' : (color?.light || '#F1F5F9'),
        color: isSelected ? '#fff' : (color?.accent || 'var(--ctg-blue)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
        }}>
          {label}
        </div>
        {sublabel && (
          <div style={{
            fontSize: '0.68rem',
            color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', marginTop: 1,
          }}>
            {sublabel}
          </div>
        )}
      </div>
      {count !== undefined && (
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          background: isSelected ? 'rgba(255,255,255,0.25)' : (color?.border || '#CBD5E1'),
          color: isSelected ? '#fff' : (color?.accent || 'var(--ctg-blue)'),
          borderRadius: 20, padding: '2px 7px', flexShrink: 0,
        }}>
          {count}
        </span>
      )}
      {isSelected && (
        <span style={{ color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>
          <ChevronRight />
        </span>
      )}
    </button>
  );
}

/* ── Column wrapper ──────────────────────────────────────────────────────── */
function Column({ title, icon, children, color }) {
  const hasColor = Boolean(color?.accent);
  return (
    <div style={{
      flex: '1 1 0', minWidth: 170, height: 460,
      background: 'var(--bg-card)', borderRadius: 12,
      border: `1px solid ${hasColor ? color.border : 'var(--border)'}`,
      boxShadow: hasColor ? `0 1px 6px ${color.accent}22` : '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 12px 9px',
        background: hasColor
          ? `linear-gradient(135deg, ${color.accent}, ${color.accent}CC)`
          : 'var(--ctg-navy)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{ color: '#fff', opacity: 0.85, display: 'flex' }}>{icon}</span>
        <span style={{
          fontSize: '0.67rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.09em', color: '#fff', opacity: 0.9,
        }}>
          {title}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {children}
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyColumn({ message }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: 100, color: 'var(--text-muted)', gap: 8,
    }}>
      <svg viewBox="0 0 20 20" fill="currentColor" width="24" height="24" style={{ opacity: 0.2 }}>
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
      </svg>
      <span style={{ fontSize: '0.72rem', textAlign: 'center', opacity: 0.7 }}>{message}</span>
    </div>
  );
}

/* ── Detail Table (rendered below columns) ───────────────────────────────── */
function DetailTable({ equip, color }) {
  if (!equip) return null;

  const fields = [
    { label: 'Fabricante',         value: equip.fabricante },
    { label: 'Modelo',             value: equip.modelo },
    { label: 'Nº de Série',        value: equip.num_serie },
    { label: 'Tem sobressalente?', value: equip.tem_sobressalente },
    { label: 'Quantos?',           value: equip.quantos !== null && equip.quantos !== undefined ? String(equip.quantos) : null },
    { label: 'Ano',                value: equip.ano ? String(equip.ano) : null },
  ];

  return (
    <div style={{
      marginTop: 16,
      background: 'var(--bg-card)',
      borderRadius: 12,
      border: `1.5px solid ${color?.border || 'var(--border)'}`,
      boxShadow: `0 4px 16px ${color?.accent || '#0066B3'}18`,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '12px 18px',
        background: color?.accent
          ? `linear-gradient(135deg, ${color.accent}, ${color.accent}CC)`
          : 'var(--ctg-navy)',
        color: '#fff',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.7, marginBottom: 2 }}>
            TAG selecionada
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1 }}>
            {equip.tag}
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.20)' }} />
        <div style={{ fontSize: '0.82rem', opacity: 0.85 }}>
          <span style={{ fontWeight: 600 }}>{equip.equipamento}</span>
          <span style={{ opacity: 0.7 }}> · {equip.ug}</span>
        </div>
        {equip.url_imagem && (
          <a
            href={equip.url_imagem}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              fontSize: '0.78rem', fontWeight: 600,
              textDecoration: 'none',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          >
            <IconLink />
            Abrir arquivo
          </a>
        )}
      </div>

      {/* Fields row */}
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        padding: '14px 18px', gap: '12px 32px',
      }}>
        {fields.map(({ label, value }) => (
          <div key={label} style={{ minWidth: 140 }}>
            <div style={{
              fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 3,
            }}>
              {label}
            </div>
            <div style={{
              fontSize: '0.85rem',
              color: value ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: value ? 500 : 400,
            }}>
              {value || <span style={{ fontStyle: 'italic', opacity: 0.45 }}>—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Summary Chart (contextual bar chart) ────────────────────────────────── */
function SummaryChart({ data, selUsina, selTabela, selEquip, selUG, color }) {
  const chartInfo = useMemo(() => {
    if (!selTabela) return null;

    let rows, groupKey, chartTitle;
    if (!selEquip) {
      rows = data.filter(d => d.usina === selUsina && d.tipo_tabela === selTabela);
      groupKey = 'equipamento';
      chartTitle = 'Distribuição por Tipo';
    } else if (!selUG) {
      rows = data.filter(d => d.usina === selUsina && d.tipo_tabela === selTabela && d.equipamento === selEquip);
      groupKey = 'ug';
      chartTitle = 'Distribuição por Localização';
    } else {
      rows = data.filter(d => d.usina === selUsina && d.tipo_tabela === selTabela && d.equipamento === selEquip && d.ug === selUG);
      groupKey = 'fabricante';
      chartTitle = 'Distribuição por Fabricante';
    }

    const counts = {};
    rows.forEach(d => { const k = d[groupKey] || 'Não informado'; counts[k] = (counts[k] || 0) + 1; });
    const bars = Object.entries(counts).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 10);

    const simCount = rows.filter(d => d.tem_sobressalente === 'Sim').length;
    const naoCount = rows.length - simCount;

    return { bars, chartTitle, total: rows.length, simCount, naoCount };
  }, [data, selUsina, selTabela, selEquip, selUG]);

  if (!chartInfo || chartInfo.bars.length === 0) return null;

  const max = Math.max(...chartInfo.bars.map(d => d.value), 1);
  const accent = color?.accent || '#0066B3';
  const light  = color?.light  || '#E8F2FB';

  return (
    <div style={{
      marginTop: 16,
      background: 'var(--bg-card)', borderRadius: 12,
      border: '1px solid var(--border)',
      boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
      overflow: 'hidden',
    }}>
      {/* Chart header */}
      <div style={{
        padding: '10px 18px',
        borderBottom: '1px solid var(--border)',
        background: `${accent}0C`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: '0.67rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.09em', color: accent,
        }}>
          {chartInfo.chartTitle}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {chartInfo.total} registros
        </span>
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Bar chart */}
        <div style={{ flex: 1, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {chartInfo.bars.map(({ name, value }) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 150, fontSize: '0.73rem', color: 'var(--text-secondary)',
                textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {name}
              </div>
              <div style={{
                flex: 1, height: 22, background: 'var(--bg-app)',
                borderRadius: 5, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(value / max) * 100}%`, height: '100%',
                  background: `linear-gradient(90deg, ${accent}, ${accent}AA)`,
                  borderRadius: 5, minWidth: value > 0 ? 6 : 0,
                  display: 'flex', alignItems: 'center', paddingLeft: 6,
                  transition: 'width 0.5s ease',
                }}>
                  {value / max > 0.18 && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff' }}>{value}</span>
                  )}
                </div>
              </div>
              {value / max <= 0.18 && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: accent, width: 24, flexShrink: 0 }}>{value}</span>
              )}
            </div>
          ))}
        </div>

        {/* Sobressalente panel */}
        <div style={{
          width: 160, flexShrink: 0, borderLeft: '1px solid var(--border)',
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12,
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 4 }}>
            Sobressalente
          </div>

          {/* Sim */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669' }}>Sim</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>{chartInfo.simCount}</span>
            </div>
            <div style={{ height: 8, background: '#D1FAE5', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${chartInfo.total ? (chartInfo.simCount / chartInfo.total) * 100 : 0}%`, height: '100%', background: '#059669', borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
          </div>

          {/* Não */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B' }}>Não</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{chartInfo.naoCount}</span>
            </div>
            <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${chartInfo.total ? (chartInfo.naoCount / chartInfo.total) * 100 : 0}%`, height: '100%', background: '#94A3B8', borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
          </div>

          {/* Donut-style ratio */}
          {chartInfo.total > 0 && (
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>
                {Math.round((chartInfo.simCount / chartInfo.total) * 100)}%
              </span>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>com sobressalente</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function EquipamentosPage() {
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [selUsina, setSelUsina]   = useState(null);
  const [selTabela, setSelTabela] = useState(null);
  const [selEquip, setSelEquip]   = useState(null);
  const [selUG, setSelUG]         = useState(null);
  const [selTag, setSelTag]       = useState(null);
  const [search, setSearch]       = useState('');

  useEffect(() => {
    api.get('/equipamentos')
      .then(r => {
        setData(r.data);
        setLoading(false);
        window.dispatchEvent(new CustomEvent('equipamentos-stats', { detail: {
          usinas:    [...new Set(r.data.map(d => d.usina))].length,
          funcoes:   [...new Set(r.data.map(d => d.tipo_tabela))].length,
          tipos:     [...new Set(r.data.map(d => d.equipamento))].length,
          registros: r.data.length,
        }}));
      })
      .catch(() => { setError('Erro ao carregar dados'); setLoading(false); });
  }, []);

  /* ── Derived lists ─────────────────────────────────────────────────────── */
  const ALL_USINAS = USINA_POLES.flatMap(p => p.usinas);

  const usinas = useMemo(() => {
    return ALL_USINAS.map(u => ({ name: u, count: data.filter(d => d.usina === u).length }));
  }, [data]);

  const tabelas = useMemo(() => {
    if (!selUsina) return [];
    const filtered = data.filter(d => d.usina === selUsina);
    const set = [...new Set(filtered.map(d => d.tipo_tabela))].sort();
    return set.map(t => ({ name: t, count: filtered.filter(d => d.tipo_tabela === t).length }));
  }, [data, selUsina]);

  const equipamentos = useMemo(() => {
    if (!selUsina || !selTabela) return [];
    const filtered = data.filter(d => d.usina === selUsina && d.tipo_tabela === selTabela);
    const set = [...new Set(filtered.map(d => d.equipamento))].sort();
    return set.map(e => ({ name: e, count: filtered.filter(d => d.equipamento === e).length }));
  }, [data, selUsina, selTabela]);

  const ugs = useMemo(() => {
    if (!selUsina || !selTabela || !selEquip) return [];
    const filtered = data.filter(d => d.usina === selUsina && d.tipo_tabela === selTabela && d.equipamento === selEquip);
    const set = [...new Set(filtered.map(d => d.ug))].sort();
    return set.map(u => ({ name: u, count: filtered.filter(d => d.ug === u).length }));
  }, [data, selUsina, selTabela, selEquip]);

  const tags = useMemo(() => {
    if (!selUsina || !selTabela || !selEquip || !selUG) return [];
    const filtered = data.filter(
      d => d.usina === selUsina && d.tipo_tabela === selTabela && d.equipamento === selEquip && d.ug === selUG
    );
    if (search.trim()) {
      const q = search.toLowerCase();
      return filtered.filter(d =>
        d.tag.toLowerCase().includes(q) ||
        (d.fabricante || '').toLowerCase().includes(q) ||
        (d.modelo || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [data, selUsina, selTabela, selEquip, selUG, search]);

  const selectedDetail = selTag ? data.find(d => d.id === selTag) : null;
  const usinaColor = selUsina ? getUsinaColor(selUsina) : null;

  const handleUsinaSelect = (u) => { setSelUsina(u); setSelTabela(null); setSelEquip(null); setSelUG(null); setSelTag(null); setSearch(''); };
  const handleTabelaSelect = (t) => { setSelTabela(t); setSelEquip(null); setSelUG(null); setSelTag(null); setSearch(''); };
  const handleEquipSelect  = (e) => { setSelEquip(e); setSelUG(null); setSelTag(null); setSearch(''); };
  const handleUGSelect     = (u) => { setSelUG(u); setSelTag(null); setSearch(''); };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="spinner" />
    </div>
  );

  if (error) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>{error}</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10, overflow: 'hidden' }}>

      {/* ── Column view ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        alignItems: 'stretch', flexShrink: 0,
      }}>

        {/* COLUMN 1: Usinas */}
        <Column title="Usinas" icon={<IconPlant />} color={usinaColor}>
          {USINA_POLES.map((pole, pi) => {
            const poleUsinas = usinas.filter(u => pole.usinas.includes(u.name));
            return (
              <div key={pole.label}>
                <div style={{
                  fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: pole.color,
                  padding: pi === 0 ? '2px 4px 5px' : '10px 4px 5px',
                  borderBottom: `1px solid ${pole.color}33`,
                  marginBottom: 4,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: pole.color, flexShrink: 0, display: 'inline-block' }} />
                  {pole.label}
                </div>
                {poleUsinas.map(u => {
                  const c = getUsinaColor(u.name);
                  return (
                    <ColumnItem
                      key={u.name}
                      label={u.name}
                      count={u.count}
                      icon={<IconPlant />}
                      color={c}
                      isSelected={selUsina === u.name}
                      onClick={() => handleUsinaSelect(u.name)}
                    />
                  );
                })}
              </div>
            );
          })}
        </Column>

        {/* COLUMN 2: Função */}
        {selUsina && (
          <Column title="Função" icon={<IconTable />} color={usinaColor}>
            {tabelas.length === 0 ? (
              <EmptyColumn message="Nenhuma tabela" />
            ) : (
              tabelas.map(t => (
                <ColumnItem
                  key={t.name}
                  label={t.name}
                  count={t.count}
                  icon={<IconTable />}
                  color={usinaColor}
                  isSelected={selTabela === t.name}
                  onClick={() => handleTabelaSelect(t.name)}
                />
              ))
            )}
          </Column>
        )}

        {/* COLUMN 3: Tipo */}
        {selTabela && (
          <Column title="Tipo" icon={<IconEquip />} color={usinaColor}>
            {equipamentos.length === 0 ? (
              <EmptyColumn message="Nenhum equipamento" />
            ) : (
              equipamentos.map(e => (
                <ColumnItem
                  key={e.name}
                  label={e.name}
                  count={e.count}
                  icon={<IconEquip />}
                  color={usinaColor}
                  isSelected={selEquip === e.name}
                  onClick={() => handleEquipSelect(e.name)}
                />
              ))
            )}
          </Column>
        )}

        {/* COLUMN 4: Localização */}
        {selEquip && (
          <Column title="Localização" icon={<IconUG />} color={usinaColor}>
            {ugs.length === 0 ? (
              <EmptyColumn message="Nenhuma UG" />
            ) : (
              ugs.map(u => (
                <ColumnItem
                  key={u.name}
                  label={u.name}
                  count={u.count}
                  icon={<IconUG />}
                  color={usinaColor}
                  isSelected={selUG === u.name}
                  onClick={() => handleUGSelect(u.name)}
                />
              ))
            )}
          </Column>
        )}

        {/* COLUMN 5: Tags */}
        {selUG && (
          <Column title="Tags" icon={<IconTag />} color={usinaColor}>
            <div style={{ marginBottom: 8 }}>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSelTag(null); }}
                placeholder="Buscar TAG..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 7,
                  border: '1px solid var(--border-strong)',
                  background: 'var(--bg-app)',
                  fontSize: '0.78rem', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            {tags.length === 0 ? (
              <EmptyColumn message="Nenhuma TAG encontrada" />
            ) : (
              tags.map(t => (
                <ColumnItem
                  key={t.id}
                  label={t.tag}
                  sublabel={t.fabricante ? `${t.fabricante}${t.modelo ? ' · ' + t.modelo : ''}` : undefined}
                  icon={<IconTag />}
                  color={usinaColor}
                  isSelected={selTag === t.id}
                  onClick={() => setSelTag(t.id)}
                />
              ))
            )}
          </Column>
        )}

        {/* Placeholder hint — only shown when nothing is selected yet */}
        {!selUsina && (
          <div style={{
            flex: '1 1 0', minWidth: 170, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.78rem',
            textAlign: 'center', padding: '40px 20px', opacity: 0.45,
            background: 'var(--bg-card)', borderRadius: 12,
            border: '1px dashed var(--border-strong)',
          }}>
            ← Selecione uma usina para continuar
          </div>
        )}
      </div>

      {/* ── Bottom panel: detail + chart ─────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {selectedDetail && (
          <DetailTable equip={selectedDetail} color={usinaColor} />
        )}
        <SummaryChart
          data={data}
          selUsina={selUsina}
          selTabela={selTabela}
          selEquip={selEquip}
          selUG={selUG}
          color={usinaColor}
        />
      </div>
    </div>
  );
}
