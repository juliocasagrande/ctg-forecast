import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import ColumnFilterDropdown from '../components/ui/ColumnFilterDropdown.jsx';
import StatusDot from '../components/ui/StatusDot.jsx';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const AREAS = ['Confiabilidade', 'Elétrica', 'Mecânica'];
const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const UHE_LIST = [
  'Geral',
  'PCH Palmeiras', 'PCH Retiro',
  'UHE Canoas I', 'UHE Canoas II', 'UHE Capivara', 'UHE Chavantes',
  'UHE Garibaldi', 'UHE Ilha Solteira', 'UHE Jupiá', 'UHE Jurumirim',
  'UHE Rosana', 'UHE Salto', 'UHE Salto Grande', 'UHE Taquaruçu',
];

// UHE color mapping for badges (pastel)
const UHE_COLORS = {
  'Geral':               { bg: '#F1F5F9', text: '#475569' },
  'PCH Palmeiras':       { bg: '#D1FAE5', text: '#065F46' },
  'PCH Retiro':          { bg: '#CCFBF1', text: '#0F766E' },
  'UHE Canoas I':        { bg: '#DBEAFE', text: '#1D4ED8' },
  'UHE Canoas II':       { bg: '#EFF6FF', text: '#1E40AF' },
  'UHE Capivara':        { bg: '#EDE9FE', text: '#5B21B6' },
  'UHE Chavantes':       { bg: '#F3E8FF', text: '#7E22CE' },
  'UHE Garibaldi':       { bg: '#FCE7F3', text: '#9D174D' },
  'UHE Ilha Solteira':   { bg: '#FFE4E6', text: '#9F1239' },
  'UHE Jupiá':           { bg: '#FEE2E2', text: '#991B1B' },
  'UHE Jurumirim':       { bg: '#FFEDD5', text: '#9A3412' },
  'UHE Rosana':          { bg: '#FEF3C7', text: '#92400E' },
  'UHE Salto':           { bg: '#FEF9C3', text: '#854D0E' },
  'UHE Salto Grande':    { bg: '#ECFCCB', text: '#3F6212' },
  'UHE Taquaruçu':       { bg: '#DCFCE7', text: '#166534' },
};

// CTG blue gradient for bar charts (dark → light by rank)
const CTG_BAR_COLORS = [
  '#001F5B','#003A8C','#0050B3','#0066B3','#0070CC',
  '#0082E6','#0091EA','#00AEEF','#29BAF0','#64CCF4',
  '#7ECEF5','#97DDF7','#AEEAF9','#BFECFA',
];

const STATUS_OPTIONS = [
  { value: 'Em andamento',          color: '#0EA5E9', bg: '#E0F2FE', text: '#0369A1' },
  { value: 'Em fase de encerramento', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { value: 'Encerrado',             color: '#94A3B8', bg: '#F1F5F9', text: '#475569' },
  { value: 'Paralisado',            color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
  { value: 'Capitalizado Parcialmente', color: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
  { value: 'Capitalizado Integralmente', color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
];
const STATUS_META = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]));

const NATUREZA_OPTIONS = ['CAPEX', 'OPEX', 'Guarda-chuva'];

const EMPTY_PROJECT = {
  area: 'Elétrica',
  uhe: 'Geral',
  pp_contrato: '',
  projeto_atividade: '',
  projeto: '',
  status: 'Em andamento',
  gestor: '',
  resumo: '',
  empresa: '',
  vencimento: '',
  cronograma: '',
  aditivos: '',
  reajustes: '',
  valor_contrato: '',
  realizado_contrato: '',
  saldo_contrato: '',
  valor_si: '',
  realizado_si: '',
  saldo_si: '',
  fornecedor: '',
  natureza: 'OPEX',
  aditivo_em_andamento: 'NÃO',
};

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  // Se já é número, formata direto
  if (typeof v === 'number') {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  }
  const s = String(v).replace(/[^\d.,]/g, '');
  // Se tem vírgula → formato brasileiro (pontos = milhar, vírgula = decimal)
  if (s.includes(',')) {
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(normalized);
    if (isNaN(n)) return v;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  }
  // Sem vírgula → formato numérico simples
  const n = parseFloat(s);
  if (isNaN(n)) return v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

function parseNum(v) {
  if (!v && v !== 0) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  
  const raw = String(v).trim();
  if (!raw) return 0;

  // Detect negative sign
  const isNegative = raw.startsWith('-') || raw.includes('(');
  const s = raw.replace(/^[+-]/, '').replace(/[^\d.,]/g, '');
  if (!s) return 0;

  // Brazilian format: has comma as decimal separator
  if (s.includes(',')) {
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const result = parseFloat(normalized);
    return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
  }

  // No comma — check if dot is decimal or thousand separator
  if (s.includes('.')) {
    const parts = s.split('.');
    // "1234567.89" → dot is decimal (followed by ≤2 digits)
    if (parts.length === 2 && parts[1].length <= 2) {
      const result = parseFloat(s);
      return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
    }
    // "1.234.567" → dots are thousand separators
    const normalized = s.replace(/\./g, '');
    const result = parseFloat(normalized);
    return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
  }

  // Plain integer string: "117334" → 117334
  const result = parseFloat(s);
  return (isNegative ? -1 : 1) * (isNaN(result) ? 0 : result);
}

function getAreaColor(area) {
  if (area === 'Elétrica')       return { bg: '#8a832e', text: '#fff' };
  if (area === 'Confiabilidade') return { bg: '#244fcf', text: '#fff' };
  if (area === 'Mecânica')       return { bg: '#B45309', text: '#fff' };
  return { bg: '#64748B', text: '#fff' };
}

/* ─── Badges ────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: '#94A3B8', bg: '#F1F5F9', text: '#475569' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
      background: m.bg, color: m.text, border: `1px solid ${m.color}33`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function AreaBadge({ area }) {
  const c = getAreaColor(area);
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
      fontSize: '0.7rem', fontWeight: 700, background: c.bg, color: c.text,
      whiteSpace: 'nowrap',
    }}>{area}</span>
  );
}

function NaturezaBadge({ value }) {
  const colors = {
    CAPEX: { bg: '#DBEAFE', text: '#1D4ED8', border: '#BFDBFE' },
    OPEX:  { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
    'Guarda-chuva': { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  };
  const c = colors[value] || { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>{value || '—'}</span>
  );
}

function UheBadge({ uhe }) {
  const c = UHE_COLORS[uhe] || UHE_COLORS['Geral'];
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
      background: c.bg, color: c.text, whiteSpace: 'nowrap',
    }}>{uhe || 'Geral'}</span>
  );
}

/* ─── UHE Siglas ────────────────────────────────────────────────────────────── */
const UHE_SIGLAS = {
  'PCH Palmeiras': 'PLM', 'PCH Retiro': 'RET',
  'UHE Canoas I': 'CN1', 'UHE Canoas II': 'CN2',
  'UHE Capivara': 'CPV', 'UHE Chavantes': 'CHV',
  'UHE Garibaldi': 'GAR', 'UHE Ilha Solteira': 'ILS',
  'UHE Jupiá': 'JUP', 'UHE Jurumirim': 'JUR',
  'UHE Rosana': 'ROS', 'UHE Salto': 'STO',
  'UHE Salto Grande': 'SAG', 'UHE Taquaruçu': 'TAQ',
  'Geral': 'Geral',
};

/* ─── DonutChart (Natureza) ──────────────────────────────────────────────────── */
function DonutChart({ data, uheData = [], filteredItems = [] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 46, cx = 55, cy = 55, circ = 2 * Math.PI * r;
  let off = 0;
  const slices = data.filter(d => d.value > 0).map(d => { const dash = (d.value / total) * circ; const s = { ...d, dash, offset: off }; off += dash; return s; });

  const [hoveredLabel, setHoveredLabel] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Rank mapping: UHE → index in bar chart (sorted by valor_contrato desc)
  const uheRankMap = useMemo(() => {
    const ranked = uheData.filter(d => d.uhe !== 'Geral').sort((a, b) => b.valor_contrato - a.valor_contrato);
    const m = {};
    ranked.forEach((d, i) => { m[d.uhe] = i; });
    return m;
  }, [uheData]);

  // Per-slice UHE breakdown
  const sliceBreakdown = useMemo(() => {
    if (!hoveredLabel) return [];
    const byUhe = {};
    filteredItems
      .filter(item => item.natureza === hoveredLabel && item.uhe && item.uhe !== 'Geral')
      .forEach(item => { byUhe[item.uhe] = (byUhe[item.uhe] || 0) + 1; });
    return Object.entries(byUhe)
      .map(([uhe, count]) => ({ uhe, count }))
      .sort((a, b) => (uheRankMap[a.uhe] ?? 99) - (uheRankMap[b.uhe] ?? 99));
  }, [hoveredLabel, filteredItems, uheRankMap]);

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '6px 10px', borderTop: '3px solid #0b5cab', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {total === 0 ? <div style={{ fontSize: '0.78rem', color: '#CBD5E1', textAlign: 'center', padding: '12px 0' }}>Sem dados</div>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width={90} height={90} viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={14} />
              {slices.map((s, i) => <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={14} strokeDasharray={`${s.dash} ${circ - s.dash}`} strokeDashoffset={-s.offset + circ / 4} />)}
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '0.95rem', fontWeight: 700, fill: '#1E293B' }}>{total}</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
              {slices.map((s, i) => (
                <div key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'default' }}
                  onMouseEnter={e => { setHoveredLabel(s.label); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                  onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredLabel(null)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.7rem', color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E293B', flexShrink: 0 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>}
      {hoveredLabel && sliceBreakdown.length > 0 && createPortal(
        <div style={{ position: 'fixed', left: tooltipPos.x, top: tooltipPos.y + 14, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#0b5cab', fontSize: '0.78rem' }}>{hoveredLabel} — por Usina</div>
            {sliceBreakdown.map((d) => {
              const colorIdx = uheRankMap[d.uhe] ?? 0;
              return (
                <div key={d.uhe} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: '0.62rem', fontWeight: 700, background: CTG_BAR_COLORS[colorIdx % CTG_BAR_COLORS.length], color: '#fff', flexShrink: 0 }}>
                    {UHE_SIGLAS[d.uhe] || d.uhe.replace('UHE ', '').replace('PCH ', '')}
                  </span>
                  <span style={{ fontWeight: 700, color: '#1E293B' }}>{d.count}</span>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── UHE Bar Chart with tooltip and click filter ────────────────────────────────────────────── */
function UheBarChart({ data, height = 120, filterUHE, onFilterUHE }) {
  const getSigla = (uhe) => UHE_SIGLAS[uhe] || uhe.replace('UHE ', '').replace('PCH ', '');
  const filteredData = data.sort((a, b) => getSigla(a.uhe).localeCompare(getSigla(b.uhe), 'pt-BR'));
  const nonGeralData = data.filter(d => d.uhe !== 'Geral');
  const maxVal = Math.max(...nonGeralData.map(d => d.valor_contrato || 0), 1);
  const totalBar = filteredData.reduce((acc, d) => ({
    valor_contrato: acc.valor_contrato + (d.valor_contrato || 0),
    saldo_contrato: acc.saldo_contrato + (d.saldo_contrato || 0),
    count: acc.count + (d.count || 0),
  }), { valor_contrato: 0, saldo_contrato: 0, count: 0 });
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [hoveredTotal, setHoveredTotal] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const handleBarHover = useCallback((e, idx) => {
    setHoveredIdx(idx);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const fmtM = (v) => {
    if (!v) return '0';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return String(v);
  };

  const barWidth = 42;
  const gap = 14;
  const totalWidth = filteredData.length * (barWidth + gap) + 40 + gap + barWidth + 16;
  const totalBarX = filteredData.length * (barWidth + gap) + 20 + gap + 16;

  return (
    <div ref={containerRef} style={{ overflowX: 'auto', position: 'relative' }}>
      <svg viewBox={`0 0 ${totalWidth} ${height + 28}`} style={{ width: '100%', height: height + 28 }}>
        {filteredData.map((d, i) => {
          const x = i * (barWidth + gap) + 20;
          const maxBarH = height - 20;
          const powerScale = maxVal > 0 && d.valor_contrato > 0 ? Math.pow(d.valor_contrato / maxVal, 0.35) : 0;
          const barH = Math.max(10, Math.min(maxBarH, Math.round(maxBarH * powerScale)));
          const remaining = d.valor_contrato > 0 ? d.saldo_contrato / d.valor_contrato : 0;
          const usedH = barH * remaining;
          const sigla = UHE_SIGLAS[d.uhe] || d.uhe.replace('UHE ', '').replace('PCH ', '');
          const isActive = filterUHE === d.uhe;
          return (
            <g
              key={d.uhe}
              onMouseMove={(e) => handleBarHover(e, i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onFilterUHE(isActive ? '' : d.uhe)}
              style={{ cursor: 'pointer' }}
            >
              {/* Value label above bar */}
              <text x={x + barWidth / 2} y={height - barH - 6} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="700">
                {fmtM(d.valor_contrato)}
              </text>
              {/* Full bar (total contract value) */}
              <rect x={x} y={height - barH} width={barWidth} height={barH} fill="#E8ECF0" rx={3} opacity={!filterUHE || isActive ? 1 : 0.3} />
              {/* Used portion */}
              <rect x={x} y={height - usedH} width={barWidth} height={usedH} fill={CTG_BAR_COLORS[i % CTG_BAR_COLORS.length]} rx={3} opacity={!filterUHE || isActive ? 1 : 0.3} />
              {/* Active indicator */}
              {isActive && <rect x={x - 2} y={height - barH - 2} width={barWidth + 4} height={barH + 4} fill="none" stroke={CTG_BAR_COLORS[i % CTG_BAR_COLORS.length]} strokeWidth={2.5} rx={4} />}
              {/* Label */}
              <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" fontSize="11" fill={isActive ? '#0b5cab' : '#475569'} fontWeight={isActive ? '700' : '600'}>
                {sigla}
              </text>
            </g>
          );
        })}
        {/* Separator line before total bar */}
        <line
          x1={totalBarX - gap - 2} y1={10} x2={totalBarX - gap - 2} y2={height}
          stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 3"
        />
        {/* Total bar */}
        {(() => {
          const maxBarH = height - 20;
          const totalRemaining = totalBar.valor_contrato > 0
            ? totalBar.saldo_contrato / totalBar.valor_contrato
            : 0;
          const totalUsedH = maxBarH * totalRemaining;
          return (
            <g
              onMouseMove={(e) => { setHoveredTotal(true); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
              onMouseLeave={() => setHoveredTotal(false)}
              style={{ cursor: 'default' }}
            >
              <text x={totalBarX + barWidth / 2} y={height - maxBarH - 6} textAnchor="middle" fontSize="10" fill="#059669" fontWeight="700">
                {fmtM(totalBar.valor_contrato)}
              </text>
              {/* Background */}
              <rect x={totalBarX} y={height - maxBarH} width={barWidth} height={maxBarH} fill="rgba(16,185,129,0.15)" rx={3} />
              {/* Used portion */}
              <rect x={totalBarX} y={height - totalUsedH} width={barWidth} height={totalUsedH} fill="rgba(16,185,129,0.55)" rx={3} />
              <text x={totalBarX + barWidth / 2} y={height + 16} textAnchor="middle" fontSize="11" fill="#059669" fontWeight="700">
                Total
              </text>
            </g>
          );
        })()}
      </svg>
      {/* Tooltip via portal */}
      {hoveredIdx !== null && filteredData[hoveredIdx] && createPortal(
        <div style={{
          position: 'fixed', left: tooltipPos.x, top: tooltipPos.y + 14,
          transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999,
        }}>
          <div style={{
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8,
            padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            fontSize: '0.72rem', whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#0b5cab', fontSize: '0.78rem' }}>
              {filteredData[hoveredIdx].uhe}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
              <span style={{ color: '#64748B' }}>Projetos:</span>
              <span style={{ fontWeight: 700 }}>{filteredData[hoveredIdx].count || 0}</span>
            </div>
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 3, marginTop: 3 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#0b5cab', textTransform: 'uppercase', marginBottom: 2 }}>Contrato</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#64748B' }}>Total:</span>
                <span style={{ fontWeight: 600 }}>{fmtBRL(filteredData[hoveredIdx].valor_contrato)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#64748B' }}>Saldo:</span>
                <span style={{ fontWeight: 600, color: '#065F46' }}>{fmtBRL(filteredData[hoveredIdx].saldo_contrato)}</span>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 3, marginTop: 3 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', marginBottom: 2 }}>SI</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#64748B' }}>Total:</span>
                <span style={{ fontWeight: 600 }}>{fmtBRL(filteredData[hoveredIdx].valor_si)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#64748B' }}>Saldo:</span>
                <span style={{ fontWeight: 600, color: '#065F46' }}>{fmtBRL(filteredData[hoveredIdx].saldo_si)}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {hoveredTotal && createPortal(
        <div style={{
          position: 'fixed', left: tooltipPos.x, top: tooltipPos.y + 14,
          transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999,
        }}>
          <div style={{
            background: '#fff', border: '1px solid #D1FAE5', borderRadius: 8,
            padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            fontSize: '0.72rem', whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#059669', fontSize: '0.78rem' }}>
              Total Geral
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
              <span style={{ color: '#64748B' }}>Projetos:</span>
              <span style={{ fontWeight: 700 }}>{totalBar.count}</span>
            </div>
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 3, marginTop: 3 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: 2 }}>Contrato</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#64748B' }}>Total:</span>
                <span style={{ fontWeight: 600 }}>{fmtBRL(totalBar.valor_contrato)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: '#64748B' }}>Saldo:</span>
                <span style={{ fontWeight: 600, color: '#065F46' }}>{fmtBRL(totalBar.saldo_contrato)}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── Form helpers (DocumentsPage style) ─────────────────────────────────────── */
const fS = {
  padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 6,
  fontSize: '0.85rem', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  color: '#1E293B', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
};

function Field({ label, required, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

/* ─── Field Row (2-col) ─────────────────────────────────────────────────────── */
function FieldRow({ label, children, required }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'start', marginBottom: 12 }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: 9 }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      <div>{children}</div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1.5px solid #E2E8F0', fontSize: '0.86rem', color: '#0F172A',
  background: '#F8FAFC', outline: 'none', boxSizing: 'border-box',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'inherit', lineHeight: 1.5 };

/* ─── Date helper ───────────────────────────────────────────────────────────── */
function toDateInput(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/* ─── Project Modal (restyled to match DocumentsPage) ───────────────────────── */
function ProjectModal({ item, onClose, onSave, onDelete, isNew, saving, deleting, allUsers }) {
  const initForm = (src) => src ? { ...src, vencimento: toDateInput(src.vencimento) } : { ...EMPTY_PROJECT };
  const [form, setForm] = useState(() => initForm(item));

  useEffect(() => { setForm(initForm(item)); }, [item]);
  const [checkedIn, setCheckedIn] = useState(false);
  const [lastEdited, setLastEdited] = useState(null);
  const toast = useToast().toast;
  const { user } = useAuth();
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Auto-calculate saldo when valor or realized changes (only on blur)
  const calcSaldo = useCallback(() => {
    setForm(prev => {
      const vc = parseNum(prev.valor_contrato);
      const rc = parseNum(prev.realizado_contrato);
      const vs = parseNum(prev.valor_si);
      const rs = parseNum(prev.realizado_si);
      const newSaldoC = vc > 0 || rc > 0 ? (vc - rc).toFixed(2) : '';
      const newSaldoSI = vs > 0 || rs > 0 ? (vs - rs).toFixed(2) : '';
      return {
        ...prev,
        saldo_contrato: newSaldoC,
        saldo_si: newSaldoSI,
      };
    });
  }, []);

  // Fetch last viewed and last edited info
  useEffect(() => {
    if (isNew || !item?.id) return;
    // Fetch last viewed by me
    api.get(`/lists/projects-tracking/${item.id}/viewed-by-me`)
      .then(r => { if (r.data?.viewed_at) setCheckedIn(true); })
      .catch(() => {});
    // Fetch last edited
    api.get(`/lists/projects-tracking/${item.id}/alert-info`)
      .then(r => { if (r.data?.updated_at) setLastEdited(new Date(r.data.updated_at)); })
      .catch(() => {});
  }, [item?.id, isNew]);

  const handleCheckin = async () => {
    if (!item?.id || checkedIn) return;
    try {
      await api.post(`/lists/projects-tracking/${item.id}/viewed`);
      setCheckedIn(true);
      toast('Check-in registrado!', 'success');
    } catch {
      toast('Erro ao registrar check-in', 'error');
    }
  };

  const formatLastEdited = () => {
    if (!lastEdited) return '';
    const now = new Date();
    const diff = Math.floor((now - lastEdited) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff < 7) return `${diff} dias atrás`;
    return lastEdited.toLocaleDateString('pt-BR');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: '95vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="modal-title">{isNew ? '📁 Novo Projeto' : `✏️ ${form.pp_contrato || form.projeto || 'Editar Projeto'}`}</span>
            {!isNew && (
              <>
                {/* Last edited info */}
                {lastEdited && (
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                    Editado {formatLastEdited()}
                  </span>
                )}
                {/* Check-in button */}
                <button
                  onClick={handleCheckin}
                  disabled={checkedIn}
                  style={{
                    padding: '3px 10px', borderRadius: 20, border: 'none',
                    background: checkedIn ? '#15803D' : 'rgba(255,255,255,0.15)',
                    color: checkedIn ? '#fff' : 'rgba(255,255,255,0.7)',
                    fontSize: '0.7rem', fontWeight: 600, cursor: checkedIn ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  title={checkedIn ? 'Você já visitou este projeto' : 'Marcar como visitado'}
                >
                  {checkedIn ? '✓ Visitado' : '✓ Check-in'}
                </button>
              </>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Identificação */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Área" required>
              <select value={form.area} onChange={e => set('area', e.target.value)} style={fS}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="UHE">
              <select value={form.uhe} onChange={e => set('uhe', e.target.value)} style={fS}>
                {UHE_LIST.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>

          <Field label="PP/Contrato" required>
            <input value={form.pp_contrato || ''} onChange={e => set('pp_contrato', e.target.value)} placeholder="Ex: 4600000404" style={fS} />
          </Field>
          <Field label="Projeto/Atividade" required>
            <textarea value={form.projeto_atividade || ''} onChange={e => set('projeto_atividade', e.target.value)} placeholder="Descrição completa..." style={{ ...fS, resize: 'vertical', minHeight: 60 }} rows={2} />
          </Field>
          <Field label="Projeto">
            <input value={form.projeto || ''} onChange={e => set('projeto', e.target.value)} placeholder="Nome curto" style={fS} />
          </Field>
          <Field label="Status" required>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(s => (
                <label key={s.value} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                  border: `1.5px solid ${form.status === s.value ? s.color : '#E2E8F0'}`,
                  borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem',
                  background: form.status === s.value ? s.bg : '#fff',
                  color: form.status === s.value ? s.text : '#64748B',
                  fontWeight: form.status === s.value ? 700 : 400, userSelect: 'none',
                }}>
                  <input type="radio" name="pt_status" value={s.value} checked={form.status === s.value}
                    onChange={() => set('status', s.value)} style={{ display: 'none' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  {s.value}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Gestor">
            <select
              value={form.gestor_user_id || ''}
              onChange={e => {
                const uid = e.target.value ? parseInt(e.target.value) : null;
                const u = allUsers.find(x => x.id === uid);
                setForm(prev => ({ ...prev, gestor_user_id: uid || null, gestor: u?.name || '' }));
              }}
              style={fS}
            >
              <option value="">— Selecionar —</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>

          <div style={{ borderTop: '1px solid #F1F5F9', margin: '4px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Fornecedor">
              <input value={form.fornecedor || ''} onChange={e => set('fornecedor', e.target.value)} placeholder="Nome" style={fS} />
            </Field>
            <Field label="Empresa">
              <input value={form.empresa || ''} onChange={e => set('empresa', e.target.value)} placeholder="Empresa(s)" style={fS} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Natureza">
              <select value={form.natureza} onChange={e => set('natureza', e.target.value)} style={fS}>
                {NATUREZA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Aditivo em And.">
              <select value={form.aditivo_em_andamento} onChange={e => set('aditivo_em_andamento', e.target.value)} style={fS}>
                {['SIM', 'NÃO'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Vencimento">
              <input type="date" value={form.vencimento || ''} onChange={e => set('vencimento', e.target.value)} style={fS} />
            </Field>
            <Field label="Cronograma">
              <textarea value={form.cronograma || ''} onChange={e => set('cronograma', e.target.value)} placeholder="Detalhes do cronograma..." style={{ ...fS, resize: 'vertical', minHeight: 180 }} rows={6} />
            </Field>
          </div>
          <Field label="Aditivos">
            <textarea value={form.aditivos || ''} onChange={e => set('aditivos', e.target.value)} placeholder="Descrição dos aditivos..." style={{ ...fS, resize: 'vertical', minHeight: 50 }} rows={2} />
          </Field>
          <Field label="Reajustes">
            <textarea value={form.reajustes || ''} onChange={e => set('reajustes', e.target.value)} placeholder="Descrição dos reajustes..." style={{ ...fS, resize: 'vertical', minHeight: 50 }} rows={2} />
          </Field>

          <div style={{ borderTop: '1px solid #F1F5F9', margin: '4px 0' }} />
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' }}>Valores Financeiros</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { key: 'valor_contrato', label: 'Valor Contrato' },
              { key: 'realizado_contrato', label: 'Realizado Contrato' },
              { key: 'saldo_contrato', label: 'Saldo Contrato', readOnly: true },
              { key: 'valor_si', label: 'Valor SI' },
              { key: 'realizado_si', label: 'Realizado SI' },
              { key: 'saldo_si', label: 'Saldo SI', readOnly: true },
            ].map(f => {
              // Check if saldo is negative for styling
              const isNegativeSaldo = f.readOnly && parseNum(form[f.key]) < 0;

              return (
                <Field key={f.key} label={f.label}>
                  <input
                    value={form[f.key] || ''}
                    onChange={e => {
                      if (!f.readOnly) set(f.key, e.target.value);
                    }}
                    onBlur={e => {
                      if (f.readOnly) return;
                      // Format on blur: convert to plain number for storage
                      const raw = e.target.value.replace(/[^\d.,]/g, '');
                      if (raw) {
                        const num = parseNum(raw);
                        if (num > 0) {
                          set(f.key, num.toFixed(2));
                        } else {
                          set(f.key, '');
                        }
                      } else {
                        set(f.key, '');
                      }
                      // Recalculate saldo after any financial field loses focus
                      calcSaldo();
                    }}
                    onFocus={e => {
                      if (!f.readOnly) e.target.select();
                    }}
                    placeholder={f.readOnly ? 'Calculado automaticamente' : 'Ex: 2903969.35 ou 2.903.969,35'}
                    style={{
                      ...fS,
                      ...(f.readOnly
                        ? {
                            background: '#F8FAFC',
                            color: isNegativeSaldo ? '#DC2626' : '#64748B',
                            fontWeight: isNegativeSaldo ? 700 : 400,
                          }
                        : {}),
                    }}
                    readOnly={f.readOnly}
                  />
                </Field>
              );
            })}
          </div>

          <Field label="Resumo">
            <textarea value={form.resumo || ''} onChange={e => set('resumo', e.target.value)} placeholder="Resumo das atividades recentes..." style={{ ...fS, resize: 'vertical', minHeight: 180 }} rows={6} />
          </Field>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          {!isNew && (
            <button onClick={() => onDelete(form.id)} disabled={deleting} style={{
              padding: '8px 18px', borderRadius: 8, border: '1.5px solid #FCA5A5',
              background: '#FEF2F2', color: '#DC2626', fontSize: '0.82rem',
              fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1,
              marginRight: 'auto',
            }}>{deleting ? 'Excluindo...' : 'Excluir'}</button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving} style={{
            opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Report Source Modal ───────────────────────────────────────────────────── */
function ReportSourceModal({ onClose, onGenerate }) {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const MESES = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
  ];
  const ANOS = [currentYear - 1, currentYear, currentYear + 1].map(String);

  const [source, setSource] = useState('db'); // 'db' or 'excel'
  const [mes, setMes] = useState(MESES[currentMonth]);
  const [ano, setAno] = useState(String(currentYear));
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(f) {
    if (!f) return;
    const ext = f.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setError('Apenas arquivos Excel (.xlsx ou .xls) são aceitos.');
      return;
    }
    setError(null);
    setFile(f);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function handleConfirm() {
    if (source === 'excel' && !file) {
      setError('Selecione um arquivo Excel.');
      return;
    }
    onGenerate({ source, mes, ano, file });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{
          flexShrink: 0,
          background: 'linear-gradient(135deg, #001F5B 0%, #0b5cab 100%)',
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span className="modal-title" style={{ fontSize: '1.15rem' }}>📊 Gerar Relatório HTML</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem', padding: '4px',
          }}>✕</button>
        </div>

        <div className="modal-body" style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          gap: 18, padding: '20px 24px',
        }}>
          {/* Período */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0b5cab', marginBottom: 10, letterSpacing: '0.05em' }}>
              Período do Relatório
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mês</label>
                <select value={mes} onChange={e => setMes(e.target.value)} style={{
                  padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 6,
                  fontSize: '0.88rem', fontFamily: 'var(--font-body)', color: '#1E293B',
                  background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
                }}>
                  {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ano</label>
                <select value={ano} onChange={e => setAno(e.target.value)} style={{
                  padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 6,
                  fontSize: '0.88rem', fontFamily: 'var(--font-body)', color: 'var(--text-primary)',
                  background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
                }}>
                  {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Source Selection */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0b5cab', marginBottom: 10, letterSpacing: '0.05em' }}>
              Fonte de Dados
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Database option */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderRadius: 10, border: source === 'db' ? '2px solid #0b5cab' : '2px solid #E2E8F0',
                background: source === 'db' ? '#EFF6FF' : '#fff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <input type="radio" name="report-source" value="db" checked={source === 'db'}
                  onChange={() => setSource('db')}
                  style={{ accentColor: '#0b5cab', width: 18, height: 18 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1E293B' }}>
                    🗄️ Dados da Aplicação
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                    Gera o relatório usando os projetos cadastrados no banco de dados
                  </div>
                </div>
              </label>

              {/* Excel option */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderRadius: 10, border: source === 'excel' ? '2px solid #0b5cab' : '2px solid #E2E8F0',
                background: source === 'excel' ? '#EFF6FF' : '#fff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <input type="radio" name="report-source" value="excel" checked={source === 'excel'}
                  onChange={() => setSource('excel')}
                  style={{ accentColor: '#0b5cab', width: 18, height: 18 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1E293B' }}>
                    📁 Arquivo Excel
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                    Envia um arquivo Excel externo para gerar o relatório
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Excel Upload Area (only if source === 'excel') */}
          {source === 'excel' && (
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0b5cab', marginBottom: 10, letterSpacing: '0.05em' }}>
                Arquivo Excel
              </div>
              <div
                onClick={() => document.getElementById('report-file-input')?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                style={{
                  border: `2px dashed ${dragging ? '#0b5cab' : error ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: 10, padding: '24px 16px', textAlign: 'center',
                  background: dragging ? '#EFF6FF' : '#F8FAFC',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <input id="report-file-input" type="file" accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files?.[0])} />
                {file ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="28" height="28" style={{ color: '#10B981' }}>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1E293B' }}>{file.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="28" height="28" style={{ color: '#94A3B8' }}>
                      <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                    </svg>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#475569' }}>
                      Clique ou arraste o arquivo aqui
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>.xlsx ou .xls</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '10px 14px', borderRadius: 8, fontSize: '0.82rem', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{
          flexShrink: 0, padding: '16px 24px',
          borderTop: '1px solid #E2E8F0', background: '#FAFAFA',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
            </svg>
            Gerar Relatório
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Import Preview Modal ──────────────────────────────────────────────────── */
function ImportPreviewModal({ preview, onClose, onConfirm, loading }) {
  if (!preview) return null;
  const { totalRows, skipped, newCount, updateCount, areas, statuses, naturezas, totalContrato, previewRows } = preview;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <span className="modal-title">📊 Preview da Importação</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#15803D' }}>Linhas</div>
              <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.5rem', fontWeight: 700, color: '#15803D' }}>{totalRows}</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#1D4ED8' }}>Novos</div>
              <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.5rem', fontWeight: 700, color: '#1D4ED8' }}>{newCount}</div>
            </div>
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#92400E' }}>Atualizar</div>
              <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.5rem', fontWeight: 700, color: '#92400E' }}>{updateCount}</div>
            </div>
            {skipped > 0 && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#991B1B' }}>Pulados</div>
                <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.5rem', fontWeight: 700, color: '#991B1B' }}>{skipped}</div>
              </div>
            )}
          </div>

          {/* By area */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 6 }}>Por Área</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(areas).map(([area, count]) => {
                const c = getAreaColor(area);
                return (
                  <span key={area} style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                    background: c.bg, color: c.text,
                  }}>{area}: {count}</span>
                );
              })}
            </div>
          </div>

          {/* By natureza */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 6 }}>Por Natureza</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(naturezas).filter(([, v]) => v > 0).map(([nat, count]) => (
                <span key={nat} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                  background: nat === 'CAPEX' ? '#DBEAFE' : nat === 'OPEX' ? '#D1FAE5' : '#FEF3C7',
                  color: nat === 'CAPEX' ? '#1D4ED8' : nat === 'OPEX' ? '#065F46' : '#92400E',
                }}>{nat}: {count}</span>
              ))}
            </div>
          </div>

          {/* By status */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 6 }}>Por Status</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(statuses).map(([status, count]) => {
                const m = STATUS_META[status] || STATUS_OPTIONS[0];
                return (
                  <span key={status} style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                    background: m.bg, color: m.text,
                  }}>{status}: {count}</span>
                );
              })}
            </div>
          </div>

          {/* Total contrato */}
          <div style={{ background: 'linear-gradient(135deg, #001F5B, #0b5cab)', borderRadius: 8, padding: '12px 16px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8 }}>Total Contratos</span>
            <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '1.3rem', fontWeight: 700 }}>
              {totalContrato.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            </span>
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 6 }}>
                Primeiros registros (mostrando {previewRows.length} de {totalRows})
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      {['PP/Contrato', 'Área', 'Status', 'Natureza', 'Valor', 'Fornecedor'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700,
                          textTransform: 'uppercase', color: '#64748B', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: i < previewRows.length - 1 ? '1px solid #F1F5F9' : 'none', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.pp_contrato}</td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{r.area}</td>
                        <td style={{ padding: '7px 10px' }}><StatusBadge status={r.status} /></td>
                        <td style={{ padding: '7px 10px' }}><NaturezaBadge value={r.natureza} /></td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.valor_contrato ? fmtBRL(r.valor_contrato) : '—'}</td>
                        <td style={{ padding: '7px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fornecedor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={loading} style={{
            opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
          }}>{loading ? 'Importando...' : '📥 Confirmar Importação'}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function ProjectsTrackingPage() {
  const { toast: addToast } = useToast();
  const { user } = useAuth();
  const [items, setItems]             = useState([]);
  const [allUsers, setAllUsers]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterNatureza, setFilterNatureza] = useState('');
  const [filterUHE, setFilterUHE] = useState('');
  const [activeTab, setActiveTab]     = useState('Todos');
  const [showMyContracts, setShowMyContracts] = useState(false);
  const [selected, setSelected]       = useState(null);
  const [isNew, setIsNew]             = useState(false);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile]   = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Column filters
  const [colFilterUHE, setColFilterUHE] = useState([]);
  const [colFilterStatus, setColFilterStatus] = useState([]);
  const [colFilterGestor, setColFilterGestor] = useState([]);
  const [colFilterNatureza, setColFilterNatureza] = useState([]);
  const [colFilterAditivo, setColFilterAditivo] = useState([]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const r = await api.get('/lists/projects-tracking');
      setItems(r.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // Fetch all users for gestor dropdown (exclude admins)
    api.get('/users/for-delegation').then(r => setAllUsers(r.data.filter(u => u.role !== 'admin'))).catch(() => setAllUsers([]));

    const handleNew = () => { setIsNew(true); setSelected(EMPTY_PROJECT); };
    window.addEventListener('new-project', handleNew);

    // Check if user can import: gestor, coordenador, planejador, or julio.casagrande@ctgbr.com.br
    const canImport = ['gestor', 'coordenador', 'planejador'].includes(user?.role) ||
      user?.email === 'julio.casagrande@ctgbr.com.br';

    const handleImport = () => {
      if (!canImport) {
        addToast('Você não tem permissão para importar dados.', 'error');
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImportFile(file);
        setSaving(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await api.post('/lists/projects-tracking/import/preview', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setImportPreview(res.data);
        } catch (err) {
          addToast(err.response?.data?.error || 'Erro ao ler planilha', 'error');
        } finally {
          setSaving(false);
        }
        document.body.removeChild(input);
      };
      input.oncancel = () => { document.body.removeChild(input); };
      input.click();
    };
    window.addEventListener('import-projects', handleImport);

    // Open report source modal
    const handleGenerateHtmlReport = () => {
      window.dispatchEvent(new CustomEvent('open-report-modal'));
    };
    window.addEventListener('generate-html-report', handleGenerateHtmlReport);

    // Open modal handler
    const handleOpenReportModal = () => {
      setShowReportModal(true);
    };
    window.addEventListener('open-report-modal', handleOpenReportModal);

    return () => {
      window.removeEventListener('new-project', handleNew);
      window.removeEventListener('import-projects', handleImport);
      window.removeEventListener('generate-html-report', handleGenerateHtmlReport);
      window.removeEventListener('open-report-modal', handleOpenReportModal);
    };
  }, []);

  // Export to Excel
  const handleExport = async () => {
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${base}/export/projects-tracking`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `CTG_Acompanhamento_Projetos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      addToast('Exportação realizada com sucesso!', 'success');
    } catch {
      addToast('Erro ao exportar', 'error');
    }
  };

  // Expose handleExport globally so App.jsx can trigger it
  useEffect(() => {
    window._exportProjectsTracking = handleExport;
    return () => { delete window._exportProjectsTracking; };
  }, [items]);

  const handleConfirmImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await api.post('/lists/projects-tracking/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast(`Importado: ${res.data.inserted} novos, ${res.data.updated} atualizados, ${res.data.skipped} pulados`, 'success');
      setImportPreview(null);
      setImportFile(null);
      await fetchItems();
    } catch (err) {
      addToast(err.response?.data?.error || 'Erro ao importar', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  // Data filtered by main filters (before column filters) — used to compute unique values for column filter dropdowns
  const preFiltered = useMemo(() => {
    let data = [...items];
    if (showMyContracts) {
      const myId = user?.id;
      const myName = user?.name?.toLowerCase();
      data = data.filter(i =>
        (myId && i.gestor_user_id === myId) ||
        (i.gestor_user_id == null && i.gestor && i.gestor.toLowerCase().includes(myName))
      );
    }
    if (activeTab !== 'Todos' && activeTab !== 'Meus Contratos' && AREAS.includes(activeTab)) {
      data = data.filter(i => i.area === activeTab);
    }
    if (filterUHE) data = data.filter(i => i.uhe === filterUHE);
    if (filterStatus) data = data.filter(i => i.status === filterStatus);
    if (filterNatureza) data = data.filter(i => i.natureza === filterNatureza);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(i =>
        (i.pp_contrato || '').toLowerCase().includes(q) ||
        (i.projeto_atividade || '').toLowerCase().includes(q) ||
        (i.projeto || '').toLowerCase().includes(q) ||
        (i.gestor || '').toLowerCase().includes(q) ||
        (i.fornecedor || '').toLowerCase().includes(q)
      );
    }
    return data;
  }, [items, search, filterStatus, filterNatureza, filterUHE, activeTab, showMyContracts, user]);

  // Unique values for column filters — only show values that exist in current data
  const colFilterUHEValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.uhe).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterStatusValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.status).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterGestorValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.gestor).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterNaturezaValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.natureza).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterAditivoValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => (i.aditivo_em_andamento || 'NÃO')).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const filtered = useMemo(() => {
    let data = [...items];
    if (showMyContracts) {
      const myId = user?.id;
      const myName = user?.name?.toLowerCase();
      data = data.filter(i =>
        (myId && i.gestor_user_id === myId) ||
        (i.gestor_user_id == null && i.gestor && i.gestor.toLowerCase().includes(myName))
      );
    }
    // Only filter by area if it's a real area tab (not "Meus Contratos")
    if (activeTab !== 'Todos' && activeTab !== 'Meus Contratos' && AREAS.includes(activeTab)) {
      data = data.filter(i => i.area === activeTab);
    }
    if (filterUHE) data = data.filter(i => i.uhe === filterUHE);
    if (filterStatus) data = data.filter(i => i.status === filterStatus);
    if (filterNatureza) data = data.filter(i => i.natureza === filterNatureza);
    // Column filters
    if (colFilterUHE.length > 0 && colFilterUHE.length < UHE_LIST.length) {
      data = data.filter(i => colFilterUHE.includes(i.uhe));
    }
    if (colFilterStatus.length > 0) {
      data = data.filter(i => colFilterStatus.includes(i.status));
    }
    if (colFilterGestor.length > 0) {
      data = data.filter(i => colFilterGestor.includes(i.gestor));
    }
    if (colFilterNatureza.length > 0 && colFilterNatureza.length < NATUREZA_OPTIONS.length) {
      data = data.filter(i => colFilterNatureza.includes(i.natureza));
    }
    if (colFilterAditivo.length > 0) {
      data = data.filter(i => colFilterAditivo.includes(i.aditivo_em_andamento || 'NÃO'));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(i =>
        (i.pp_contrato || '').toLowerCase().includes(q) ||
        (i.projeto_atividade || '').toLowerCase().includes(q) ||
        (i.projeto || '').toLowerCase().includes(q) ||
        (i.gestor || '').toLowerCase().includes(q) ||
        (i.fornecedor || '').toLowerCase().includes(q)
      );
    }
    return data;
  }, [items, search, filterStatus, filterNatureza, filterUHE, activeTab, showMyContracts, user, colFilterUHE, colFilterStatus, colFilterGestor, colFilterNatureza, colFilterAditivo]);

  const grouped = useMemo(() => {
    const map = {};
    for (const item of filtered) {
      const k = item.area || 'Outros';
      if (!map[k]) map[k] = [];
      map[k].push(item);
    }
    return map;
  }, [filtered]);

  const groupedKeys = useMemo(() =>
    ['Confiabilidade', 'Elétrica', 'Mecânica', 'Outros'].filter(k => grouped[k]?.length > 0),
  [grouped]);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      // Parse financial fields before saving
      const financialKeys = ['valor_contrato', 'realizado_contrato', 'saldo_contrato', 'valor_si', 'realizado_si', 'saldo_si'];
      const parsedForm = { ...form };
      for (const key of financialKeys) {
        parsedForm[key] = parseNum(form[key]);
      }
      
      let saved;
      if (isNew) {
        const r = await api.post('/lists/projects-tracking', parsedForm);
        saved = r.data;
        setItems(prev => [saved, ...prev]);
        addToast('Projeto criado com sucesso!', 'success');
      } else {
        const r = await api.put(`/lists/projects-tracking/${form.id}`, parsedForm);
        saved = r.data;
        setItems(prev => prev.map(i => i.id === form.id ? saved : i));
        addToast('Projeto atualizado com sucesso!', 'success');
      }
      // Close modal and reset state
      setSelected(null);
      setIsNew(false);
      setSaving(false);
    } catch {
      addToast('Erro ao salvar.', 'error');
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este projeto?')) return;
    setDeleting(true);
    try {
      await api.delete(`/lists/projects-tracking/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      setSelected(null);
      addToast('Projeto excluído.', 'success');
    } catch {
      addToast('Erro ao excluir.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Handle report generation from modal
  const handleReportGenerate = async ({ source, mes, ano, file }) => {
    setShowReportModal(false);
    const mesNum = MESES_PT.indexOf(mes) + 1;
    if (!mesNum || !ano) {
      addToast('Mês e ano são obrigatórios.', 'error');
      return;
    }

    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      let res;

      if (source === 'db') {
        res = await fetch(`${base}/monthly-report/generate-from-db?mes=${mesNum}&ano=${ano}`, { credentials: 'include' });
      } else {
        const formData = new FormData();
        formData.append('excel', file);
        formData.append('mes', mes);
        formData.append('ano', ano);
        res = await fetch(`${base}/monthly-report/generate`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro ao gerar relatório' }));
        return addToast(err.error || 'Erro ao gerar relatório', 'error');
      }

      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Relatorio_Acompanhamento_${mes}_${ano}.html`;
      link.click();
      URL.revokeObjectURL(link.href);
      addToast('Relatório HTML gerado com sucesso!', 'success');
    } catch (err) {
      console.error('[Report] Erro:', err);
      addToast('Erro ao gerar relatório', 'error');
    }
  };

  const tabs = ['Todos', 'Meus Contratos', ...AREAS];
  const counts = useMemo(() => {
    const m = { Todos: items.length };
    if (user?.id || user?.name) {
      const myId = user.id;
      const myName = user.name?.toLowerCase();
      m['Meus Contratos'] = items.filter(i =>
        (myId && i.gestor_user_id === myId) ||
        (i.gestor_user_id == null && myName && i.gestor && i.gestor.toLowerCase().includes(myName))
      ).length;
    } else {
      m['Meus Contratos'] = 0;
    }
    for (const a of AREAS) m[a] = items.filter(i => i.area === a).length;
    return m;
  }, [items, user]);

  // Helper: calculate saldo dynamically
  // Saldo = valor - realizado (realizado defaults to 0 if empty/null)
  const getSaldoContrato = useCallback((item) => {
    const vc = parseNum(item.valor_contrato);
    const rc = parseNum(item.realizado_contrato);
    return vc - rc;
  }, []);

  const getSaldoSI = useCallback((item) => {
    const vs = parseNum(item.valor_si);
    const rs = parseNum(item.realizado_si);
    return vs - rs;
  }, []);

  // Computed values for summary cards (based on filtered data)
  const totalContrato = useMemo(() =>
    filtered.reduce((acc, i) => acc + (parseNum(i.valor_contrato) || 0), 0),
  [filtered]);

  const totalSaldo = useMemo(() =>
    filtered.reduce((acc, i) => acc + getSaldoContrato(i), 0),
  [filtered, getSaldoContrato]);

  const totalSI = useMemo(() =>
    filtered.reduce((acc, i) => (acc + (parseNum(i.valor_si) || 0)), 0),
  [filtered]);

  const totalSISaldo = useMemo(() =>
    filtered.reduce((acc, i) => acc + getSaldoSI(i), 0),
  [filtered, getSaldoSI]);

  // UHE chart data
  const uheData = useMemo(() => {
    const map = {};
    for (const item of filtered) {
      const uhe = item.uhe || 'Geral';
      if (!map[uhe]) map[uhe] = { uhe, valor_contrato: 0, saldo_contrato: 0, valor_si: 0, saldo_si: 0, count: 0 };
      map[uhe].valor_contrato += parseNum(item.valor_contrato) || 0;
      map[uhe].saldo_contrato += getSaldoContrato(item);
      map[uhe].valor_si += parseNum(item.valor_si) || 0;
      map[uhe].saldo_si += getSaldoSI(item);
      map[uhe].count += 1;
    }
    return Object.values(map).sort((a, b) => b.valor_contrato - a.valor_contrato);
  }, [filtered, getSaldoContrato, getSaldoSI]);

  // When switching to "Meus Contratos" tab, set showMyContracts
  const handleTabClick = (tab) => {
    if (tab === 'Meus Contratos') {
      setShowMyContracts(true);
      setActiveTab('Meus Contratos');
    } else {
      setShowMyContracts(false);
      setActiveTab(tab);
    }
  };

  return (
    <div style={{ padding: '12px 16px 16px 0' }}>

      {/* Summary cards - redesigned layout */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'nowrap', alignItems: 'stretch', minHeight: 170 }}>
        {/* Left: Status (2x2) */}
        <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 4 }}>Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1 }}>
            {[
              { label: 'Total', value: filtered.length, color: '#0b5cab' },
              { label: 'Em Andamento', value: filtered.filter(i => i.status === 'Em andamento').length, color: '#0EA5E9' },
              { label: 'Encerramento', value: filtered.filter(i => i.status === 'Em fase de encerramento').length, color: '#F59E0B' },
              { label: 'Encerrados', value: filtered.filter(i => i.status === 'Encerrado').length, color: '#94A3B8' },
            ].map(c => (
              <div key={c.label} style={{
                background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
                borderTop: `3px solid ${c.color}`, padding: '8px 10px',
              }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' }}>{c.label}</div>
                <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '2rem', fontWeight: 700, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Center-left: Totals */}
        <div style={{ flex: '0 0 200px', borderLeft: '2px solid #E2E8F0', paddingLeft: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 4 }}>Valores</div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, borderTop: '3px solid #0b5cab', padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            {[
              { section: 'Contrato', color: '#0b5cab', valorTotal: totalContrato, valorSaldo: totalSaldo },
              { section: 'SI', color: '#7C3AED', valorTotal: totalSI, valorSaldo: totalSISaldo },
            ].map(({ section, color, valorTotal, valorSaldo }, idx) => (
              <div key={section} style={{ ...(idx > 0 ? { borderTop: '1px solid #F1F5F9', paddingTop: 6 } : {}) }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{section}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4, marginBottom: 2 }}>
                  <span style={{ fontSize: '0.62rem', color: '#94A3B8' }}>Total</span>
                  <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>{fmtBRL(valorTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: '0.62rem', color: '#94A3B8' }}>Saldo</span>
                  <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '0.88rem', fontWeight: 700, color: '#065F46' }}>{fmtBRL(valorSaldo)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center-right: Natureza (Donut Chart) */}
        <div style={{ flex: '0 0 220px', borderLeft: '2px solid #E2E8F0', paddingLeft: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 4 }}>Natureza</div>
          <DonutChart
            data={[
              { label: 'CAPEX', value: filtered.filter(i => i.natureza === 'CAPEX').length, color: '#0050B3' },
              { label: 'OPEX', value: filtered.filter(i => i.natureza === 'OPEX').length, color: '#00AEEF' },
              { label: 'Guarda-chuva', value: filtered.filter(i => i.natureza === 'Guarda-chuva').length, color: '#97DDF7' },
            ]}
            uheData={uheData}
            filteredItems={filtered}
          />
        </div>

        {/* Right: Chart (last — aligns with table) */}
        <div style={{ flex: 1, borderLeft: '2px solid #E2E8F0', paddingLeft: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 2 }}>
            Por Usina
            {filterUHE && (
              <span style={{ background: '#EFF6FF', color: '#0b5cab', borderRadius: 10, padding: '1px 7px', fontSize: '0.62rem', marginLeft: 6, fontWeight: 700 }}>
                Filtrado ×
              </span>
            )}
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, borderTop: '3px solid #0b5cab', padding: '5px 0px', flex: 1, minHeight: 158 }}>
            <UheBarChart data={uheData} height={130} filterUHE={filterUHE} onFilterUHE={setFilterUHE} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #F1F5F9' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => handleTabClick(tab)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: activeTab === tab ? 700 : 500,
            color: activeTab === tab ? '#0b5cab' : '#64748B',
            borderBottom: activeTab === tab ? '2px solid #0b5cab' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.15s',
          }}>
            {tab} <span style={{
              fontSize: '0.68rem', background: activeTab === tab ? '#EFF6FF' : '#F1F5F9',
              color: activeTab === tab ? '#0b5cab' : '#94A3B8',
              borderRadius: 10, padding: '1px 6px', marginLeft: 4,
            }}>{counts[tab] || 0}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <svg viewBox="0 0 20 20" fill="#94A3B8" width="14" height="14" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar PP/Contrato, projeto, gestor, fornecedor..."
            style={{ ...inputStyle, paddingLeft: 30, background: '#fff', border: '1px solid #E2E8F0' }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ ...selectStyle, flex: '0 1 190px', minWidth: 150, background: '#fff', border: '1px solid #E2E8F0' }}>
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
        </select>
        <select value={filterNatureza} onChange={e => setFilterNatureza(e.target.value)}
          style={{ ...selectStyle, flex: '0 1 140px', minWidth: 110, background: '#fff', border: '1px solid #E2E8F0' }}>
          <option value="">Natureza</option>
          {NATUREZA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {(filterStatus || filterNatureza || filterUHE || search || activeTab !== 'Todos') && (
          <button onClick={() => { setFilterStatus(''); setFilterNatureza(''); setFilterUHE(''); setSearch(''); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', fontSize: '0.82rem', cursor: 'pointer' }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8' }}>
          <div style={{ fontSize: '0.88rem' }}>Carregando...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: '0.9rem', color: '#94A3B8' }}>Nenhum projeto encontrado</div>
        </div>
      ) : (
        <div>
          {groupedKeys.map(areaKey => (
            <div key={areaKey} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <AreaBadge area={areaKey} />
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600 }}>
                  {grouped[areaKey].length} {grouped[areaKey].length === 1 ? 'projeto' : 'projetos'}
                </span>
              </div>
              <div style={{
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}>
                <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", tableLayout: 'fixed', minWidth: 2200 }}>
                  <colgroup>
                    <col style={{ width: 40 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 280 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 170 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 90 }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                      <th style={{
                        padding: '10px 12px', textAlign: 'center',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>●</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>
                        UHE
                        <ColumnFilterDropdown
                          column="UHE"
                          uniqueValues={colFilterUHEValues}
                          selectedValues={colFilterUHE}
                          onChange={setColFilterUHE}
                        />
                      </th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>PP/Contrato</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Projeto/Atividade</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Projeto</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>
                        Status
                        <ColumnFilterDropdown
                          column="Status"
                          uniqueValues={colFilterStatusValues}
                          selectedValues={colFilterStatus}
                          onChange={setColFilterStatus}
                        />
                      </th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>
                        Gestor
                        <ColumnFilterDropdown
                          column="Gestor"
                          uniqueValues={colFilterGestorValues}
                          selectedValues={colFilterGestor}
                          onChange={setColFilterGestor}
                        />
                      </th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Resumo</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Vencimento</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Val. Contrato</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Realizado</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Saldo</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Val. SI</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Real. SI</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Saldo SI</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>Fornecedor</th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>
                        Natureza
                        <ColumnFilterDropdown
                          column="Natureza"
                          uniqueValues={colFilterNaturezaValues}
                          selectedValues={colFilterNatureza}
                          onChange={setColFilterNatureza}
                        />
                      </th>
                      <th style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap',
                      }}>
                        Aditivo
                        <ColumnFilterDropdown
                          column="Aditivo"
                          uniqueValues={colFilterAditivoValues}
                          selectedValues={colFilterAditivo}
                          onChange={setColFilterAditivo}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[areaKey].map((item, idx) => (
                      <tr key={item.id} onClick={() => { setSelected(item); setIsNew(false); }}
                        style={{
                          cursor: 'pointer',
                          background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                          borderBottom: idx < grouped[areaKey].length - 1 ? '1px solid #F1F5F9' : 'none',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'}
                      >
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <StatusDot updatedAt={item.updated_at} />
                        </td>
                        <td style={{ padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <UheBadge uhe={item.uhe} />
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.pp_contrato || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.projeto_atividade || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.projeto || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <StatusBadge status={item.status} />
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {item.gestor || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {item.resumo || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {item.vencimento ? new Date(item.vencimento).toLocaleDateString('pt-BR') : (item.vencimento_txt || '—')}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#0F172A', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {fmtBRL(item.valor_contrato)}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {fmtBRL(item.realizado_contrato)}
                        </td>
                        <td style={{ padding: '10px 12px', color: getSaldoContrato(item) < 0 ? '#DC2626' : '#065F46', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {fmtBRL(getSaldoContrato(item))}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#0F172A', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {fmtBRL(item.valor_si)}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {fmtBRL(item.realizado_si)}
                        </td>
                        <td style={{ padding: '10px 12px', color: getSaldoSI(item) < 0 ? '#DC2626' : '#065F46', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {fmtBRL(getSaldoSI(item))}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {item.fornecedor || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <NaturezaBadge value={item.natureza} />
                        </td>
                        <td style={{ padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: item.aditivo_em_andamento === 'SIM' ? '#D1FAE5' : '#F1F5F9',
                            color: item.aditivo_em_andamento === 'SIM' ? '#065F46' : '#64748B',
                            border: `1px solid ${item.aditivo_em_andamento === 'SIM' ? '#6EE7B7' : '#E2E8F0'}`,
                          }}>{item.aditivo_em_andamento || 'NÃO'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {selected && (
        <ProjectModal
          item={isNew ? null : selected}
          isNew={isNew}
          onClose={() => { setSelected(null); setIsNew(false); }}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          deleting={deleting}
          allUsers={allUsers}
        />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onClose={() => { setImportPreview(null); setImportFile(null); }}
          onConfirm={handleConfirmImport}
          loading={importLoading}
        />
      )}

      {showReportModal && (
        <ReportSourceModal
          onClose={() => setShowReportModal(false)}
          onGenerate={handleReportGenerate}
        />
      )}
    </div>
  );
}
