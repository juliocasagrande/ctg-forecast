import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AlertBell from '../components/ui/AlertBell.jsx';
import ColumnFilterDropdown from '../components/ui/ColumnFilterDropdown.jsx';
import ColumnResizeHandle from '../components/ui/ColumnResizeHandle.jsx';
import StatusDot from '../components/ui/StatusDot.jsx';
import OpenTimeBadge from '../components/ui/OpenTimeBadge.jsx';
import { isIacOpenedInYear } from '../utils/iacDates.js';
import { formatActivityLine, formatRemainingTime, getCheckinRemainingMs } from '../utils/listActivity.js';
import useColumnWidths from '../hooks/useColumnWidths.js';

const IACS_COL_WIDTHS = [40, 40, 140, 90, 110, 90, 105, 60, 90, 220, 180, 130, 130, 110, 80, 110, 100, 120, 130, 140, 100];

/* ─── Constants ────────────────────────────────────────────────────────────── */
const AREAS = ['Confiabilidade', 'Elétrica', 'Mecânica'];
const AREA_COLORS = { 'Elétrica': '#0EA5E9', 'Mecânica': '#F59E0B', 'Confiabilidade': '#94A3B8' };
const TAB_DOT_COLORS = {
  'Todos': '#0b5cab',
  'Meus IACs': '#7C3AED',
  'Confiabilidade': '#2563EB',
  'Elétrica': '#B45309',
  'Mecânica': '#059669',
};

// Compara nome de um campo (requester/team_leader/organizer/supervisor) com o nome do
// usuário logado. Usa includes() nos dois sentidos e, como esses campos às vezes guardam
// o nome completo (com nome do meio) enquanto o cadastro do usuário usa uma forma curta
// (ex.: "Victor Henrique Pedraci" vs "Victor Pedraci"), também compara por primeiro+último nome.
function personMatchesUser(fieldVal, userName) {
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const a = norm(fieldVal), b = norm(userName);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const edges = (s) => { const w = s.split(/\s+/).filter(Boolean); return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : s; };
  return edges(a) === edges(b);
}

const STATUS_OPTIONS = [
  { value: '0 - Not started yet',       color: '#94A3B8', bg: '#F1F5F9', text: '#475569' },
  { value: '1 - IA and PDs',            color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { value: '2 - Invitation letter',     color: '#8B5CF6', bg: '#F5F3FF', text: '#5B21B6' },
  { value: '3 - Proposal received',     color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { value: '4 - Clarification',         color: '#F97316', bg: '#FFF7ED', text: '#9A3412' },
  { value: '5 - Negotiation',           color: '#0EA5E9', bg: '#E0F2FE', text: '#0369A1' },
  { value: '6 - ER/DM Review/Approval', color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { value: '8 - Draft Contract',        color: '#22C55E', bg: '#DCFCE7', text: '#14532D' },
  { value: '9 - Contract signed',       color: '#16A34A', bg: '#BBF7D0', text: '#14532D' },
  { value: '91 - Hired 2025',           color: '#64748B', bg: '#F1F5F9', text: '#334155' },
  { value: '10 - Cancelado',            color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
];
const STATUS_META = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]));

const PRIORITY_OPTIONS = ['Priority', 'Non Priority', 'Hired'];
const PRIORITY_COLORS = {
  'Priority':     { color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  'Non Priority': { color: '#64748B', bg: '#F1F5F9', text: '#475569' },
  'Hired':        { color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
};
const SIM_NAO = ['Sim', 'Não'];
const VALIDITY_OPTIONS = ['Dez/2025', 'Dez/2026', 'Dez/2027', 'Dez/2028', 'Dez/2029'];
const TYPE_OPTIONS = ['New', 'Transfer', 'Waiver', 'Hired 2025'];

// Helper to get status label without code (e.g., "0 - Not started yet" → "Not started yet")
function getStatusLabel(status) {
  return (status || '').split(' - ').slice(1).join(' - ') || status;
}

function getAreaColor(area) {
  // Pastel colors matching ProjectsTrackingPage style
  if (area === 'Elétrica')       return { bg: '#DBEAFE', text: '#1D4ED8' };
  if (area === 'Confiabilidade') return { bg: '#EDE9FE', text: '#5B21B6' };
  if (area === 'Mecânica')       return { bg: '#FFEDD5', text: '#9A3412' };
  return { bg: '#F1F5F9', text: '#475569' };
}

const EMPTY_IAC = {
  iac_code: '', type_line: 'New', area: 'Elétrica',
  qty_pp_line_26_priority: '', qty_pp_line_26_no_priority: '',
  opening_date: '', when_open: '', acceptance_letter_signed: '', project: '', comments: '',
  requester: '', team_leader: '', chinese_work_staff: '',
  status_current: '0 - Not started yet', apresentado_work_team: 'Não',
  organizer: '', supervisor: '', evaluation_team: '',
  priority: 'Non Priority', validity: 'Dez/2027', continuidade: 'Sim', link_path: '',
};

function externalLink(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^[A-Za-z]:[\\/]/.test(value)) return `file:///${value.replace(/\\/g, '/')}`;
  if (value.startsWith('\\')) return `file:${value.replace(/\\/g, '/')}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  if (/^(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#]|$)/i.test(value)) return `https://${value}`;
  return value;
}

/* ─── Badges ─────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: '#94A3B8', bg: '#F1F5F9', text: '#475569' };
  const label = getStatusLabel(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
      background: m.bg, color: m.text, border: `1px solid ${m.color}33`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function AreaBadge({ area }) {
  const c = getAreaColor(area);
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
      fontSize: '0.7rem', fontWeight: 700, background: c.bg, color: c.text, whiteSpace: 'nowrap',
    }}>{area}</span>
  );
}

function PriorityBadge({ value }) {
  const c = PRIORITY_COLORS[value] || PRIORITY_COLORS['Non Priority'];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      fontSize: '0.68rem', fontWeight: 700,
      background: c.bg, color: c.text, border: `1px solid ${c.color}44`,
    }}>{value || '—'}</span>
  );
}

function PillBadge({ value }) {
  const isYes = value === 'Sim';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      fontSize: '0.68rem', fontWeight: 700,
      background: isYes ? '#D1FAE5' : '#FEE2E2',
      color: isYes ? '#065F46' : '#991B1B',
      border: `1px solid ${isYes ? '#6EE7B7' : '#FECACA'}`,
    }}>{value || '—'}</span>
  );
}

function TypeBadge({ value }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      fontSize: '0.68rem', fontWeight: 700,
      background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD',
    }}>{value || 'New'}</span>
  );
}

/* ─── Status Bar Chart (clickable, vertical) ──────────────────────────────────── */
function IacSummaryCards({ cards, activeArea, onFilterArea }) {
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const tooltipRow = (label, value, color = '#1E293B') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, lineHeight: 1.55 }}>
      <span style={{ color: '#64748B' }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, flex: 1 }}>
      {cards.map(card => {
        const isDimmed = activeArea && card.area && activeArea !== card.area;
        const isActive = activeArea && card.area === activeArea;
        return (
          <button
            key={card.label}
            type="button"
            onClick={() => onFilterArea?.(card.area && activeArea !== card.area ? card.area : '')}
            onMouseEnter={e => { setHovered(card); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
            onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
              borderTop: '3px solid ' + card.color, padding: '8px 10px',
              textAlign: 'left', cursor: 'pointer',
              opacity: isDimmed ? 0.5 : 1,
              boxShadow: isActive ? '0 0 0 2px ' + card.color + '22' : 'none',
              transition: 'opacity 0.15s, box-shadow 0.15s',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.label}</div>
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: '2rem', fontWeight: 700, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
          </button>
        );
      })}
      {hovered && createPortal(
        <div style={{ position: 'fixed', left: tooltipPos.x, top: tooltipPos.y + 14, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: '0.72rem', whiteSpace: 'nowrap', minWidth: 230 }}>
            <div style={{ fontWeight: 800, marginBottom: 5, color: hovered.color, fontSize: '0.78rem' }}>{hovered.tooltipTitle}</div>
            {tooltipRow('IACs', hovered.value, hovered.color)}
            {tooltipRow('Participa\u00e7\u00e3o', hovered.baseTotal ? `${((hovered.value / hovered.baseTotal) * 100).toFixed(1).replace('.', ',')}%` : '0,0%')}
            <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 5, paddingTop: 4 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 3 }}>Por status</div>
              {STATUS_OPTIONS.map(status => {
                const count = hovered.statusCounts?.[status.value] || 0;
                if (!count) return null;
                const meta = STATUS_META[status.value] || { color: hovered.color };
                return tooltipRow(getStatusLabel(status.value), count, meta.color);
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
function StatusBarChart({ data, onFilter, activeFilter, height = 100 }) {
  const visible = data.filter(d => d.count > 0);
  const maxCount = Math.max(...visible.map(d => d.count), 1);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleHover = useCallback((e, idx) => {
    setHoveredIdx(idx);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const barWidth = 32;
  const gap = 10;
  const totalWidth = visible.length * (barWidth + gap) + 20;

  return (
    <div style={{ overflowX: 'auto', position: 'relative' }}>
      <svg viewBox={`0 0 ${totalWidth} ${height + 28}`} style={{ width: '100%', height: height + 28 }}>
        {visible.map((d, i) => {
          const x = i * (barWidth + gap) + 10;
          const barH = Math.max(2, (d.count / maxCount) * (height - 20));
          const isActive = activeFilter === d.status;
          // CTG blue gradient colors based on index
          const barColors = ['#001F5B', '#003A8C', '#0050B3', '#0066B3', '#0070CC', '#0082E6', '#0091EA', '#00AEEF', '#29BAF0', '#64CCF4'];
          const barColor = barColors[i % barColors.length];
          const shortLabel = d.status.split(' - ')[0];
          return (
            <g key={d.status}
              onMouseMove={e => handleHover(e, i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onFilter(isActive ? '' : d.status)}
              style={{ cursor: 'pointer' }}
            >
              <text x={x + barWidth / 2} y={height - barH - 4} textAnchor="middle" fontSize="9" fill="#475569" fontWeight="700">
                {d.count}
              </text>
              <rect x={x} y={20} width={barWidth} height={height - 20} fill="#E8ECF0" rx={3} />
              <rect x={x} y={height - barH} width={barWidth} height={barH}
                fill={barColor} rx={3} opacity={!activeFilter || isActive ? 1 : 0.3} />
              {isActive && <rect x={x - 1} y={19} width={barWidth + 2} height={height - 19}
                fill="none" stroke={barColor} strokeWidth={2} rx={4} />}
              <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" fontSize="10"
                fill={isActive ? barColor : '#475569'} fontWeight={isActive ? '700' : '600'}>
                {shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
      {hoveredIdx !== null && visible[hoveredIdx] && createPortal(
        <div style={{ position: 'fixed', left: tooltipPos.x, top: tooltipPos.y + 14, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, color: '#0050B3', marginBottom: 5, fontSize: '0.78rem' }}>
              {visible[hoveredIdx].status}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
              <span style={{ color: '#64748B' }}>IACs neste status:</span>
              <span style={{ fontWeight: 700 }}>{visible[hoveredIdx].count}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#64748B' }}>Participação:</span>
              <span style={{ fontWeight: 700, color: '#0050B3' }}>{data.reduce((s,d)=>s+d.count,0) > 0 ? Math.round((visible[hoveredIdx].count / data.reduce((s,d)=>s+d.count,0)) * 100) : 0}%</span>
            </div>
            <div style={{ fontSize: '0.62rem', color: '#94A3B8', marginTop: 4, borderTop: '1px solid #F1F5F9', paddingTop: 3 }}>Clique para filtrar</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── Priority Donut Chart ──────────────────────────────────────────────────── */
function PriorityDonutChart({ data, filterPriority, onFilterPriority }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const visible = data.filter(d => d.value > 0);

  // CTG blue gradient colors
  const priorityColors = {
    'Priority':     '#001F5B',
    'Non Priority': '#0066B3',
    'Hired':        '#00AEEF',
  };

  const r = 46, cx = 55, cy = 55, circ = 2 * Math.PI * r;
  let off = 0;
  const slices = visible.map((d) => {
    const dash = (d.value / total) * circ;
    const s = { ...d, dash, offset: off, color: priorityColors[d.label] || '#64CCF4' };
    off += dash;
    return s;
  });

  const [hoveredLabel, setHoveredLabel] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '6px 10px', borderTop: '3px solid #0b5cab', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {total === 0 ? <div style={{ fontSize: '0.78rem', color: '#CBD5E1', textAlign: 'center', padding: '12px 0' }}>Sem dados</div>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width={90} height={90} viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={14} />
              {slices.map((s, i) => (
                <circle
                  key={i}
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke={s.color} strokeWidth={14}
                  strokeDasharray={`${s.dash} ${circ - s.dash}`}
                  strokeDashoffset={-s.offset + circ / 4}
                  opacity={!filterPriority || filterPriority === s.label ? 1 : 0.3}
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => { setHoveredLabel(s); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                  onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredLabel(null)}
                  onClick={() => onFilterPriority(filterPriority === s.label ? '' : s.label)}
                />
              ))}
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '0.95rem', fontWeight: 700, fill: '#1E293B' }}>{total}</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
              {slices.map((s, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                  onMouseEnter={e => { setHoveredLabel(s); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                  onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredLabel(null)}
                  onClick={() => onFilterPriority(filterPriority === s.label ? '' : s.label)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, opacity: !filterPriority || filterPriority === s.label ? 1 : 0.3 }} />
                  <span style={{ fontSize: '0.7rem', color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: !filterPriority || filterPriority === s.label ? 1 : 0.4 }}>{s.label}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E293B', flexShrink: 0 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>}
      {hoveredLabel && createPortal(
        <div style={{ position: 'fixed', left: tooltipPos.x, top: tooltipPos.y + 14, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, color: hoveredLabel.color, marginBottom: 5, fontSize: '0.78rem' }}>
              {hoveredLabel.label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
              <span style={{ color: '#64748B' }}>IACs:</span>
              <span style={{ fontWeight: 700 }}>{hoveredLabel.value}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#64748B' }}>Participação:</span>
              <span style={{ fontWeight: 700, color: hoveredLabel.color }}>{total > 0 ? Math.round((hoveredLabel.value / total) * 100) : 0}%</span>
            </div>
            <div style={{ fontSize: '0.62rem', color: '#94A3B8', marginTop: 4, borderTop: '1px solid #F1F5F9', paddingTop: 3 }}>Clique para filtrar</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── Priority Bar Chart (horizontal) with tooltip ───────────────────────────────────────── */
function PriorityChart({ data }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // CTG blue gradient for priority bars
  const priorityBarColors = {
    'Priority':     '#001F5B',
    'Non Priority': '#0066B3',
    'Hired':        '#00AEEF',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0', position: 'relative' }}>
      {data.map((d, i) => {
        const barColor = priorityBarColors[d.label] || '#64CCF4';
        return (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
            onMouseEnter={e => { setHoveredIdx(i); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
            onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#475569', width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <div style={{ flex: 1, background: '#E8ECF0', borderRadius: 4, height: 14, overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: barColor, borderRadius: 4, minWidth: d.value > 0 ? 6 : 0, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E293B', width: 22, textAlign: 'right', flexShrink: 0 }}>{d.value}</span>
          </div>
        );
      })}
      {hoveredIdx !== null && data[hoveredIdx] && createPortal(
        <div style={{ position: 'fixed', left: tooltipPos.x, top: tooltipPos.y + 14, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, color: priorityBarColors[data[hoveredIdx].label] || '#0b5cab', marginBottom: 5, fontSize: '0.78rem' }}>
              {data[hoveredIdx].label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
              <span style={{ color: '#64748B' }}>IACs:</span>
              <span style={{ fontWeight: 700 }}>{data[hoveredIdx].value}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#64748B' }}>Participação:</span>
              <span style={{ fontWeight: 700, color: priorityBarColors[data[hoveredIdx].label] || '#0b5cab' }}>{data.reduce((s,d)=>s+d.value,0) > 0 ? Math.round((data[hoveredIdx].value / data.reduce((s,d)=>s+d.value,0)) * 100) : 0}%</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── Field helper ───────────────────────────────────────────────────────────── */
const fS = {
  padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 6,
  fontSize: '0.85rem', fontFamily: 'var(--font-body)', color: '#1E293B',
  background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
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

/* ─── Import Preview Modal ───────────────────────────────────────────────────── */
function ImportPreviewModal({ preview, onClose, onConfirm, loading }) {
  if (!preview) return null;
  const { totalRows, skipped, newCount, updateCount, areas, statuses, priorities, previewRows } = preview;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{
          flexShrink: 0,
          background: 'linear-gradient(135deg, #001F5B 0%, #0b5cab 100%)',
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span className="modal-title" style={{ fontSize: '1.15rem' }}>📊 Preview da Importação</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem', padding: '4px',
          }}>✕</button>
        </div>
        <div className="modal-body" style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          gap: 16, padding: '20px 24px',
        }}>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#15803D' }}>Linhas</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: '#15803D' }}>{totalRows}</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#1D4ED8' }}>Novos</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: '#1D4ED8' }}>{newCount}</div>
            </div>
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#92400E' }}>Atualizar</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: '#92400E' }}>{updateCount}</div>
            </div>
            {skipped > 0 && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: '#991B1B' }}>Pulados</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: '#991B1B' }}>{skipped}</div>
              </div>
            )}
          </div>

          {/* By area */}
          {areas && Object.keys(areas).length > 0 && (
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
          )}

          {/* By priority */}
          {priorities && Object.keys(priorities).length > 0 && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 6 }}>Por Prioridade</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(priorities).map(([priority, count]) => {
                  const c = PRIORITY_COLORS[priority] || PRIORITY_COLORS['Non Priority'];
                  return (
                    <span key={priority} style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                      background: c.bg, color: c.text,
                    }}>{priority}: {count}</span>
                  );
                })}
              </div>
            </div>
          )}

          {/* By status */}
          {statuses && Object.keys(statuses).length > 0 && (
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
          )}

          {/* Preview table */}
          {previewRows && previewRows.length > 0 && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 6 }}>
                Primeiros registros (mostrando {previewRows.length} de {totalRows})
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      {['IAC', 'Área', 'Tipo', 'Status', 'Prioridade'].map(h => (
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
                        <td style={{ padding: '7px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.iac_code || '—'}</td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}><AreaBadge area={r.area} /></td>
                        <td style={{ padding: '7px 10px' }}><TypeBadge value={r.type_line} /></td>
                        <td style={{ padding: '7px 10px' }}><StatusBadge status={r.status_current} /></td>
                        <td style={{ padding: '7px 10px' }}><PriorityBadge value={r.priority} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{
          flexShrink: 0, padding: '16px 24px',
          borderTop: '1px solid #E2E8F0', background: '#FAFAFA',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={loading} style={{
            opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {loading ? (
              <>Importando...</>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                </svg>
                Confirmar Importação
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Date helper ────────────────────────────────────────────────────────────── */
function toDateInput(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
function fmtDateBR(val) {
  const iso = toDateInput(val);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* ─── IAC Modal ──────────────────────────────────────────────────────────────── */
function IACModal({ item, onClose, onSave, onDelete, onCheckinSaved, isNew, saving, deleting, allUsers, allRequesters, allChineseStaff, allOrganizers, allSupervisors }) {
  const initForm = (src) => src
    ? { ...src, opening_date: toDateInput(src.opening_date), when_open: toDateInput(src.when_open), acceptance_letter_signed: toDateInput(src.acceptance_letter_signed) }
    : { ...EMPTY_IAC };
  const [form, setForm] = useState(() => initForm(item));

  useEffect(() => { setForm(initForm(item)); }, [item]);
  const [checkedIn, setCheckedIn] = useState(false);
  const [lastEdited, setLastEdited] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const toast = useToast().toast;
  const { user } = useAuth();
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Fetch last viewed and last edited info
  useEffect(() => {
    if (isNew || !item?.id) return;
    // Fetch last viewed by me
    api.get(`/lists/iacs/${item.id}/viewed-by-me`)
      .then(r => { if (r.data?.viewed_at) setCheckedIn(true); })
      .catch(() => {});
    // Fetch last edited
    api.get(`/lists/iacs/${item.id}/alert-info`)
      .then(r => { if (r.data?.updated_at) setLastEdited(new Date(r.data.updated_at)); })
      .catch(() => {});
  }, [item?.id, isNew]);

  useEffect(() => {
    if (isNew || !item?.id) return undefined;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [item?.id, isNew]);

  const activityItem = form?.id ? form : item;
  const checkinRemainingMs = getCheckinRemainingMs(activityItem, nowMs);
  const checkinLocked = checkinRemainingMs > 0;
  const activityLine = formatActivityLine(activityItem);
  const checkinTitle = checkinLocked
    ? `Check-in liberado em ${formatRemainingTime(checkinRemainingMs)}`
    : (checkedIn ? 'Registrar novo check-in' : 'Marcar como visitado');

  const handleCheckin = async () => {
    if (!item?.id) return;
    if (checkinLocked) {
      toast(`Check-in liberado em ${formatRemainingTime(checkinRemainingMs)}`, 'info');
      return;
    }
    try {
      const r = await api.post(`/lists/iacs/${item.id}/viewed`);
      const updatedItem = r.data?.item;
      const fallbackItem = { ...item, updated_at: new Date().toISOString(), last_activity_type: 'checkin', last_activity_at: new Date().toISOString(), last_activity_user_name: user?.name || 'usuario nao identificado' };
      const nextItem = updatedItem || fallbackItem;
      setCheckedIn(true);
      setNowMs(Date.now());
      setForm(prev => initForm({ ...prev, ...nextItem }));
      if (nextItem?.updated_at) setLastEdited(new Date(nextItem.updated_at));
      onCheckinSaved?.(nextItem);
      window.dispatchEvent(new Event('alerts-refresh'));
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
      <div className="modal" style={{ maxWidth: 780, width: '95vw', maxHeight: '93vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{
          flexShrink: 0,
          background: 'linear-gradient(135deg, #001F5B 0%, #0b5cab 100%)',
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="modal-title" style={{ fontSize: '1.15rem' }}>
              {isNew ? '📋 Novo IAC' : `✏️ ${form.iac_code || 'Editar IAC'}`}
            </span>
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
                  disabled={checkinLocked}
                  style={{
                    padding: '3px 10px', borderRadius: 20, border: 'none',
                    background: checkinLocked ? 'rgba(255,255,255,0.10)' : (checkedIn ? '#15803D' : 'rgba(255,255,255,0.15)'),
                    color: checkinLocked ? 'rgba(255,255,255,0.45)' : (checkedIn ? '#fff' : 'rgba(255,255,255,0.7)'),
                    fontSize: '0.7rem', fontWeight: 600, cursor: checkinLocked ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  title={checkinTitle}
                >
                  {checkinLocked ? formatRemainingTime(checkinRemainingMs) : (checkedIn ? 'Visitado' : 'Check-in')}
                </button>
                {activityLine && (
                  <span title={activityLine} style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.48)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
                    {activityLine}
                  </span>
                )}
              </>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem', padding: '4px',
          }}>✕</button>
        </div>

        <div className="modal-body" style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          gap: 16, padding: '20px 24px',
        }}>

          {/* Identificação */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0b5cab', marginBottom: 10, letterSpacing: '0.05em' }}>
              Identificação
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Código IAC" required>
                <input value={form.iac_code || ''} onChange={e => set('iac_code', e.target.value)} placeholder="IAC202600XXX" style={fS} />
              </Field>
              <Field label="Tipo" required>
                <select value={form.type_line} onChange={e => set('type_line', e.target.value)} style={fS}>
                  {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Área" required>
              <select value={form.area} onChange={e => set('area', e.target.value)} style={fS}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Projeto">
              <textarea value={form.project || ''} onChange={e => set('project', e.target.value)}
                placeholder="Descrição do projeto..." style={{ ...fS, resize: 'vertical', minHeight: 64 }} rows={2} />
            </Field>
          </div>

          <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }} />

          {/* Datas e Quantidades */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0b5cab', marginBottom: 10, letterSpacing: '0.05em' }}>
              Datas e Quantidades
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Data de Abertura">
                <input type="date" value={form.opening_date || ''} onChange={e => set('opening_date', e.target.value)} style={fS} />
              </Field>
              <Field label="When Open">
                <input type="date" value={form.when_open || ''} onChange={e => set('when_open', e.target.value)} style={fS} />
              </Field>
              <Field label="Acceptance Letter Signed">
                <input type="date" value={form.acceptance_letter_signed || ''} onChange={e => set('acceptance_letter_signed', e.target.value)} style={fS} />
              </Field>
              <Field label="Qtde Priority (PP 26)">
                <input type="number" min="0" value={form.qty_pp_line_26_priority || ''} onChange={e => set('qty_pp_line_26_priority', e.target.value)} style={fS} />
              </Field>
              <Field label="Qtde No Priority (PP 26)">
                <input type="number" min="0" value={form.qty_pp_line_26_no_priority || ''} onChange={e => set('qty_pp_line_26_no_priority', e.target.value)} style={fS} />
              </Field>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }} />

          {/* Status & Prioridade */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0b5cab', marginBottom: 10, letterSpacing: '0.05em' }}>
              Status e Prioridade
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Status Atual" required>
                <select value={form.status_current} onChange={e => set('status_current', e.target.value)} style={fS}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                </select>
              </Field>
              <Field label="Prioridade">
                <select value={form.priority} onChange={e => set('priority', e.target.value)} style={fS}>
                  {PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <Field label="Ap. Work Team">
                <select value={form.apresentado_work_team} onChange={e => set('apresentado_work_team', e.target.value)} style={fS}>
                  {SIM_NAO.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Validade">
                <select value={form.validity} onChange={e => set('validity', e.target.value)} style={fS}>
                  {VALIDITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Continuidade">
                <select value={form.continuidade} onChange={e => set('continuidade', e.target.value)} style={fS}>
                  {SIM_NAO.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }} />

          {/* Responsáveis */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#0b5cab', marginBottom: 10, letterSpacing: '0.05em' }}>
              Responsáveis
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Solicitante">
                <input list="requesters-list" value={form.requester || ''} onChange={e => set('requester', e.target.value)} placeholder="Nome" style={fS} />
                <datalist id="requesters-list">
                  {allRequesters.map((r, i) => <option key={i} value={r} />)}
                </datalist>
              </Field>
              <Field label="Team Leader">
                <select
                  value={form.team_leader_user_id || ''}
                  onChange={e => {
                    const uid = e.target.value ? parseInt(e.target.value) : null;
                    const u = allUsers.find(x => x.id === uid);
                    setForm(prev => ({ ...prev, team_leader_user_id: uid || null, team_leader: u?.name || '' }));
                  }}
                  style={fS}
                >
                  <option value="">— Selecionar —</option>
                  {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Chinese Work Staff">
                <input list="chinese-staff-list" value={form.chinese_work_staff || ''} onChange={e => set('chinese_work_staff', e.target.value)} placeholder="Nome" style={fS} />
                <datalist id="chinese-staff-list">
                  {allChineseStaff.map((r, i) => <option key={i} value={r} />)}
                </datalist>
              </Field>
              <Field label="Organizador">
                <input list="organizers-list" value={form.organizer || ''} onChange={e => set('organizer', e.target.value)} placeholder="Nome" style={fS} />
                <datalist id="organizers-list">
                  {allOrganizers.map((r, i) => <option key={i} value={r} />)}
                </datalist>
              </Field>
              <Field label="Supervisor">
                <input list="supervisors-list" value={form.supervisor || ''} onChange={e => set('supervisor', e.target.value)} placeholder="Nome" style={fS} />
                <datalist id="supervisors-list">
                  {allSupervisors.map((r, i) => <option key={i} value={r} />)}
                </datalist>
              </Field>
              <Field label="Eq. de Avaliação">
                <input value={form.evaluation_team || ''} onChange={e => set('evaluation_team', e.target.value)} placeholder="Membros" style={fS} />
              </Field>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }} />

          {/* Link / Caminho */}
          <Field label="Link / Caminho do Arquivo">
            <input value={form.link_path || ''} onChange={e => set('link_path', e.target.value)}
              placeholder="https://... ou \\servidor\pasta" style={fS} />
          </Field>

          {/* Comentários */}
          <Field label="Comentários">
            <textarea value={form.comments || ''} onChange={e => set('comments', e.target.value)}
              placeholder="Observações, histórico de andamento..." style={{ ...fS, resize: 'vertical', minHeight: 80 }} rows={3} />
          </Field>
        </div>

        <div className="modal-footer" style={{
          flexShrink: 0, padding: '16px 24px',
          borderTop: '1px solid #E2E8F0', background: '#FAFAFA',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {!isNew && (
            <button onClick={() => onDelete(form.id)} disabled={deleting} style={{
              padding: '8px 18px', borderRadius: 8, border: '1.5px solid #FCA5A5',
              background: '#FEF2F2', color: '#DC2626', fontSize: '0.82rem',
              fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1,
              marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving} style={{ opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
            {saving ? (
              <>Salvando...</>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z"/>
                </svg>
                Salvar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function IACsPage() {
  const { toast: addToast, confirm } = useToast();
  const { user } = useAuth();
  const [items, setItems]               = useState([]);
  const [allUsers, setAllUsers]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [hoveredStatusCard, setHoveredStatusCard] = useState(null);
  const [statusTooltipPos, setStatusTooltipPos] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab]       = useState('Todos');
  const [showMyIACs, setShowMyIACs]     = useState(false);
  const [selected, setSelected]         = useState(null);
  const [isNew, setIsNew]               = useState(false);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importFile, setImportFile]     = useState(null);

  // Column filters
  const [colFilterArea, setColFilterArea] = useState([]);
  const [colFilterType, setColFilterType] = useState([]);
  const [colFilterPriority, setColFilterPriority] = useState([]);
  const [colFilterStatus2, setColFilterStatus2] = useState([]);
  const [colFilterApresentado, setColFilterApresentado] = useState([]);

  // Temporary column widths (drag-to-resize), reset on reload/navigation — never persisted
  const { widths: colWidths, handleResizeStart } = useColumnWidths(IACS_COL_WIDTHS);

  // Data filtered by main filters (before column filters) — used to compute unique values for column filter dropdowns
  const preFiltered = useMemo(() => {
    let data = [...items];
    if (showMyIACs) {
      const myId = user?.id;
      const myName = user?.name;
      data = data.filter(i =>
        (myId && i.team_leader_user_id === myId) ||
        (i.requester && personMatchesUser(i.requester, myName)) ||
        (i.team_leader_user_id == null && i.team_leader && personMatchesUser(i.team_leader, myName)) ||
        (i.organizer && personMatchesUser(i.organizer, myName)) ||
        (i.supervisor && personMatchesUser(i.supervisor, myName))
      );
    }
    if (activeTab !== 'Todos' && activeTab !== 'Meus IACs') data = data.filter(i => i.area === activeTab);
    if (filterStatus) data = data.filter(i => i.status_current === filterStatus);
    if (filterPriority) data = data.filter(i => i.priority === filterPriority);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(i =>
        (i.iac_code || '').toLowerCase().includes(q) ||
        (i.project || '').toLowerCase().includes(q) ||
        (i.requester || '').toLowerCase().includes(q) ||
        (i.team_leader || '').toLowerCase().includes(q)
      );
    }
    return data;
  }, [items, search, filterStatus, filterPriority, activeTab, showMyIACs, user]);

  // Unique values for column filters — only show values that exist in current data
  const colFilterAreaValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.area).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterTypeValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.type_line).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterPriorityValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.priority).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterStatus2Values = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.status_current).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const colFilterApresentadoValues = useMemo(() => {
    const values = [...new Set(preFiltered.map(i => i.apresentado_work_team).filter(Boolean))];
    return values.sort();
  }, [preFiltered]);

  const fetchItems = async () => {
    setLoading(true);
    try { const r = await api.get('/lists/iacs'); setItems(r.data || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchItems();
    // Fetch all users for responsible dropdowns (exclude admins)
    api.get('/users/for-delegation').then(r => setAllUsers(r.data.filter(u => u.role !== 'admin'))).catch(() => setAllUsers([]));

    const handleNew = () => { setIsNew(true); setSelected({ ...EMPTY_IAC }); };
    window.addEventListener('new-iac', handleNew);

    const canImport = ['gestor', 'coordenador', 'planejador', 'admin'].includes(user?.role) ||
      user?.email === 'julio.casagrande@ctgbr.com.br';

    const handleImport = () => {
      if (!canImport) { addToast('Sem permissão para importar.', 'error'); return; }
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.xlsx,.xls'; input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) { document.body.removeChild(input); return; }
        setImportFile(file); setSaving(true);
        try {
          const fd = new FormData(); fd.append('file', file);
          const res = await api.post('/lists/iacs/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          setImportPreview(res.data);
        } catch (err) { addToast(err.response?.data?.error || 'Erro ao ler planilha', 'error'); }
        finally { setSaving(false); document.body.removeChild(input); }
      };
      input.oncancel = () => { document.body.removeChild(input); };
      input.click();
    };
    window.addEventListener('import-iacs', handleImport);

    return () => {
      window.removeEventListener('new-iac', handleNew);
      window.removeEventListener('import-iacs', handleImport);
    };
  }, [user]);

  const handleExport = async () => {
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${base}/export/iacs`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'iacs.xlsx';
      link.click();
      URL.revokeObjectURL(link.href);
      addToast('Exportação realizada!', 'success');
    } catch { addToast('Erro ao exportar', 'error'); }
  };

  useEffect(() => {
    window._exportIACs = handleExport;
    return () => { delete window._exportIACs; };
  }, [items]);

  const handleConfirmImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
      const fd = new FormData(); fd.append('file', importFile);
      const res = await api.post('/lists/iacs/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      addToast(`Importado: ${res.data.inserted} novos, ${res.data.updated} atualizados`, 'success');
      setImportPreview(null); setImportFile(null);
      await fetchItems();
    } catch (err) { addToast(err.response?.data?.error || 'Erro ao importar', 'error'); }
    finally { setImportLoading(false); }
  };

  /* ── Derived state ── */
  // Aplica todos os filtros, exceto a dimensão de gráfico indicada em `skip` — assim o
  // próprio gráfico clicado continua mostrando todas as categorias (para dar pra trocar a
  // seleção), enquanto os demais elementos da página (tabela, KPIs, outro gráfico) refletem
  // o cruzamento.
  const applyFilters = useCallback((skip) => {
    let data = [...items];
    if (showMyIACs) {
      const myId = user?.id;
      const myName = user?.name;
      data = data.filter(i =>
        (myId && i.team_leader_user_id === myId) ||
        (i.requester && personMatchesUser(i.requester, myName)) ||
        (i.team_leader_user_id == null && i.team_leader && personMatchesUser(i.team_leader, myName)) ||
        (i.organizer && personMatchesUser(i.organizer, myName)) ||
        (i.supervisor && personMatchesUser(i.supervisor, myName))
      );
    }
    if (skip !== 'area' && activeTab !== 'Todos' && activeTab !== 'Meus IACs') data = data.filter(i => i.area === activeTab);
    if (skip !== 'status' && filterStatus) data = data.filter(i => i.status_current === filterStatus);
    if (skip !== 'priority' && filterPriority) data = data.filter(i => i.priority === filterPriority);
    // Column filters
    if (skip !== 'area' && colFilterArea.length > 0 && colFilterArea.length < AREAS.length) {
      data = data.filter(i => colFilterArea.includes(i.area));
    }
    if (colFilterType.length > 0) {
      data = data.filter(i => colFilterType.includes(i.type_line));
    }
    if (colFilterPriority.length > 0 && colFilterPriority.length < PRIORITY_OPTIONS.length) {
      data = data.filter(i => colFilterPriority.includes(i.priority));
    }
    if (colFilterStatus2.length > 0) {
      data = data.filter(i => colFilterStatus2.includes(i.status_current));
    }
    if (colFilterApresentado.length > 0) {
      data = data.filter(i => colFilterApresentado.includes(i.apresentado_work_team));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(i =>
        (i.iac_code || '').toLowerCase().includes(q) ||
        (i.project || '').toLowerCase().includes(q) ||
        (i.requester || '').toLowerCase().includes(q) ||
        (i.team_leader || '').toLowerCase().includes(q)
      );
    }
    return data;
  }, [items, search, filterStatus, filterPriority, activeTab, showMyIACs, user, colFilterArea, colFilterType, colFilterPriority, colFilterStatus2, colFilterApresentado]);

  const filtered = useMemo(() => {
    const data = applyFilters(null);
    // Sort alphabetically by status, then by iac_code
    data.sort((a, b) => {
      const statusA = (a.status_current || '').toLowerCase();
      const statusB = (b.status_current || '').toLowerCase();
      if (statusA !== statusB) return statusA.localeCompare(statusB);
      return (a.iac_code || '').localeCompare(b.iac_code || '');
    });
    return data;
  }, [applyFilters]);

  const summaryItems       = useMemo(() => applyFilters('area'),     [applyFilters]);
  const statusChartItems   = useMemo(() => applyFilters('status'),   [applyFilters]);
  const priorityChartItems = useMemo(() => applyFilters('priority'), [applyFilters]);

  const grouped = useMemo(() => {
    const map = {};
    for (const item of filtered) {
      const k = item.status_current || '0 - Not started yet';
      if (!map[k]) map[k] = [];
      map[k].push(item);
    }
    return map;
  }, [filtered]);

  // Ordenar chaves conforme ordem definida em STATUS_OPTIONS (always show all statuses)
  const groupedKeys = useMemo(() =>
    STATUS_OPTIONS.map(s => s.value),
  []);

  const tabs = ['Todos', ...AREAS, 'Meus IACs'];
  const counts = useMemo(() => {
    const m = { Todos: items.length };
    for (const a of AREAS) m[a] = items.filter(i => i.area === a).length;
    // Count "Meus IACs"
    const myId = user?.id;
    const myName = user?.name;
    m['Meus IACs'] = items.filter(i =>
      (myId && i.team_leader_user_id === myId) ||
      (myName && (
        (i.requester && personMatchesUser(i.requester, myName)) ||
        (i.team_leader_user_id == null && i.team_leader && personMatchesUser(i.team_leader, myName)) ||
        (i.organizer && personMatchesUser(i.organizer, myName)) ||
        (i.supervisor && personMatchesUser(i.supervisor, myName))
      ))
    ).length;
    return m;
  }, [items, user]);

  // Extract unique values for dynamic dropdowns
  const allRequesters = useMemo(() =>
    [...new Set(items.map(i => i.requester).filter(Boolean))].sort(),
  [items]);

  const allChineseStaff = useMemo(() =>
    [...new Set(items.map(i => i.chinese_work_staff).filter(Boolean))].sort(),
  [items]);

  const allOrganizers = useMemo(() =>
    [...new Set(items.map(i => i.organizer).filter(Boolean))].sort(),
  [items]);

  const allSupervisors = useMemo(() =>
    [...new Set(items.map(i => i.supervisor).filter(Boolean))].sort(),
  [items]);

  const statusBarData = useMemo(() =>
    STATUS_OPTIONS.map(s => {
      const itemsForStatus = statusChartItems.filter(i => i.status_current === s.value);
      const areaCounts = AREAS.reduce((acc, area) => {
        acc[area] = itemsForStatus.filter(i => i.area === area).length;
        return acc;
      }, {});
      return { status: s.value, count: itemsForStatus.length, areaCounts };
    }),
  [statusChartItems]);

  const priorityData = useMemo(() =>
    PRIORITY_OPTIONS.map(p => {
      const c = PRIORITY_COLORS[p] || PRIORITY_COLORS['Non Priority'];
      return { label: p, value: priorityChartItems.filter(i => i.priority === p).length, ...c };
    }),
  [priorityChartItems]);

  /* ── CRUD ── */
  const handleCheckinSaved = (updatedItem) => {
    if (!updatedItem?.id) return;
    setItems(prev => prev.map(i => i.id === updatedItem.id ? { ...i, ...updatedItem } : i));
    setSelected(prev => prev?.id === updatedItem.id ? { ...prev, ...updatedItem } : prev);
  };

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (isNew) {
        const r = await api.post('/lists/iacs', form);
        setItems(prev => [r.data, ...prev]);
        addToast('IAC criado!', 'success');
      } else {
        const r = await api.put(`/lists/iacs/${form.id}`, form);
        setItems(prev => prev.map(i => i.id === form.id ? r.data : i));
        addToast('IAC atualizado!', 'success');
      }
      setSelected(null); setIsNew(false);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao salvar.';
      addToast(msg, 'error');
      console.error('[IAC SAVE ERROR]', err);
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!await confirm({
      title: 'Excluir IAC',
      message: 'Excluir este IAC?',
      confirmLabel: 'Excluir',
    })) return;
    setDeleting(true);
    try {
      await api.delete(`/lists/iacs/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      setSelected(null);
      addToast('IAC excluído.', 'success');
    } catch { addToast('Erro ao excluir.', 'error'); }
    finally { setDeleting(false); }
  };

  /* ── Render ── */
  return (
    <div style={{ padding: '12px 16px 16px 0' }}>

      {/* ── Summary row ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'nowrap', alignItems: 'stretch', height: 170 }}>

        {/* Status cards 2x2 - pastel blue tones matching UHE style */}
        <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 4 }}>
            Resumo
            {activeTab !== 'Todos' && activeTab !== 'Meus IACs' && (
              <span style={{ background: '#EFF6FF', color: '#0050B3', borderRadius: 10, padding: '1px 7px', fontSize: '0.62rem', marginLeft: 6, fontWeight: 700, cursor: 'pointer' }} onClick={() => setActiveTab('Todos')}>
                ×
              </span>
            )}
          </div>
          <IacSummaryCards
            activeArea={AREAS.includes(activeTab) ? activeTab : ''}
            onFilterArea={area => { setShowMyIACs(false); setActiveTab(area || 'Todos'); }}
            cards={(() => {
              const statusCountsFor = predicate => STATUS_OPTIONS.reduce((acc, status) => {
                acc[status.value] = summaryItems.filter(i => predicate(i) && i.status_current === status.value).length;
                return acc;
              }, {});
              const makeCard = ({ label, tooltipTitle, area, color }) => {
                const predicate = item => item.area === area;
                const value = summaryItems.filter(predicate).length;
                return { label, tooltipTitle, area, color, value, baseTotal: summaryItems.length, statusCounts: statusCountsFor(predicate) };
              };
              return [
                { label: 'Total', tooltipTitle: 'Total', area: '', color: '#0b5cab', value: summaryItems.length, baseTotal: summaryItems.length, statusCounts: statusCountsFor(() => true) },
                makeCard({ label: 'El\u00e9trica', tooltipTitle: 'El\u00e9trica', area: 'El\u00e9trica', color: '#0EA5E9' }),
                makeCard({ label: 'Mec\u00e2nica', tooltipTitle: 'Mec\u00e2nica', area: 'Mec\u00e2nica', color: '#F59E0B' }),
                makeCard({ label: 'Confiabilidade', tooltipTitle: 'Confiabilidade', area: 'Confiabilidade', color: '#94A3B8' }),
              ];
            })()}
          />
        </div>

        {/* Priority donut chart */}
        <div style={{ flex: '0 0 220px', borderLeft: '2px solid #E2E8F0', paddingLeft: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 4 }}>
            Prioridade
            {filterPriority && (
              <span style={{ background: '#EFF6FF', color: '#0050B3', borderRadius: 10, padding: '1px 7px', fontSize: '0.62rem', marginLeft: 6, fontWeight: 700 }}>
                Filtrado ×
              </span>
            )}
          </div>
          <PriorityDonutChart data={priorityData} filterPriority={filterPriority} onFilterPriority={setFilterPriority} />
        </div>

        {/* Status table only (no bar chart) */}
        <div style={{ flex: 1, borderLeft: '2px solid #E2E8F0', paddingLeft: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 4 }}>
            Por Status
            {filterStatus && (
              <span style={{ background: '#EFF6FF', color: '#0050B3', borderRadius: 10, padding: '1px 7px', fontSize: '0.62rem', marginLeft: 6, fontWeight: 700 }}>
                Filtrado ×
              </span>
            )}
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, borderTop: '3px solid #0b5cab', padding: '10px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {(() => {
              // Always show all statuses from STATUS_OPTIONS (even with count 0)
              const visibleData = statusBarData;
              const maxCount = Math.max(...visibleData.map(d => d.count), 1);
              return (
                <div style={{ columnCount: 4, columnGap: 8 }}>
                  {visibleData.map((d, i) => {
                    const m = STATUS_META[d.status] || { color: '#94A3B8', bg: '#F1F5F9', text: '#475569' };
                    const isActive = filterStatus === d.status;
                    const statusLabel = getStatusLabel(d.status);
                    const barWidth = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                    return (
                      <div
                        key={d.status}
                        onClick={() => setFilterStatus(isActive ? '' : d.status)}
                        onMouseEnter={e => { setHoveredStatusCard(d); setStatusTooltipPos({ x: e.clientX, y: e.clientY }); }}
                        onMouseMove={e => setStatusTooltipPos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredStatusCard(null)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                          marginBottom: 6,
                          background: isActive ? m.bg : (i % 2 === 0 ? '#FAFAFA' : '#fff'),
                          border: isActive ? `1.5px solid ${m.color}55` : '1.5px solid transparent',
                          transition: 'all 0.15s',
                          breakInside: 'avoid',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Barra translúcida de fundo */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${barWidth}%`,
                            background: m.color,
                            opacity: 0.12,
                            transition: 'width 0.3s ease',
                            pointerEvents: 'none',
                          }}
                        />
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0, position: 'relative', zIndex: 1 }} />
                        <span style={{ fontSize: '0.82rem', color: '#1E293B', flex: 1, fontWeight: 600, lineHeight: 1.3, position: 'relative', zIndex: 1 }}>{statusLabel}</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: m.text, flexShrink: 0, position: 'relative', zIndex: 1 }}>{d.count}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {hoveredStatusCard && createPortal(
              <div style={{ position: 'fixed', left: statusTooltipPos.x, top: statusTooltipPos.y + 14, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 99999 }}>
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: '0.72rem', whiteSpace: 'nowrap', minWidth: 200 }}>
                  <div style={{ fontWeight: 800, marginBottom: 5, color: (STATUS_META[hoveredStatusCard.status] || {}).text || '#1E293B', fontSize: '0.78rem' }}>
                    {getStatusLabel(hoveredStatusCard.status)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, lineHeight: 1.55 }}>
                    <span style={{ color: '#64748B' }}>Total</span>
                    <span style={{ color: '#1E293B', fontWeight: 700 }}>{hoveredStatusCard.count}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 5, paddingTop: 4 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 3 }}>Por área</div>
                    {AREAS.map(area => {
                      const count = hoveredStatusCard.areaCounts?.[area] || 0;
                      if (!count) return null;
                      return (
                        <div key={area} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, lineHeight: 1.55 }}>
                          <span style={{ color: '#64748B' }}>{area}</span>
                          <span style={{ color: AREA_COLORS[area] || '#1E293B', fontWeight: 700 }}>{count}</span>
                        </div>
                      );
                    })}
                    {!AREAS.some(area => hoveredStatusCard.areaCounts?.[area]) && (
                      <div style={{ color: '#94A3B8' }}>Sem IACs</div>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        </div>

      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: '#F1F5F9', borderRadius: 12, padding: 4 }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab;
          const dotColor = TAB_DOT_COLORS[tab] || '#94A3B8';
          return (
            <button key={tab} onClick={() => {
              if (tab === 'Meus IACs') {
                setShowMyIACs(true);
                setActiveTab('Meus IACs');
              } else {
                setShowMyIACs(false);
                setActiveTab(tab);
              }
            }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', border: 'none', cursor: 'pointer',
              borderRadius: 8, transition: 'all 0.15s',
              background: isActive ? '#fff' : 'transparent',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              fontSize: '0.82rem', fontWeight: isActive ? 700 : 500,
              color: isActive ? '#1E293B' : '#64748B',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
              {tab}
              <span style={{
                fontSize: '0.72rem', fontWeight: isActive ? 700 : 400,
                color: isActive ? '#64748B' : '#94A3B8',
              }}>{counts[tab] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => { setFilterStatus(''); setFilterPriority(''); setSearch(''); setActiveTab('Todos'); }}
          disabled={!(filterStatus || filterPriority || search || activeTab !== 'Todos')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            border: '1.5px solid #FCA5A5', borderRadius: 8, background: '#FEE2E2', color: '#DC2626',
            fontSize: '0.82rem', fontWeight: 700,
            cursor: (filterStatus || filterPriority || search || activeTab !== 'Todos') ? 'pointer' : 'not-allowed',
            opacity: (filterStatus || filterPriority || search || activeTab !== 'Todos') ? 1 : 0.5, flexShrink: 0,
          }}>
          Limpar filtros
        </button>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <svg viewBox="0 0 20 20" fill="#94A3B8" width="14" height="14" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar IAC, projeto, solicitante..."
            style={{ padding: '8px 12px 8px 30px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '0.86rem', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '0.86rem', color: '#0F172A', background: '#fff', outline: 'none', flex: '0 1 220px', minWidth: 160, cursor: 'pointer' }}>
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{getStatusLabel(o.value)}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8', fontSize: '0.88rem' }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: '0.9rem', color: '#94A3B8' }}>Nenhum IAC encontrado</div>
        </div>
      ) : (
        <div>
          {groupedKeys.map(statusKey => {
            const items = grouped[statusKey] || [];
            // Skip empty status sections to avoid showing empty tables
            if (items.length === 0) return null;
            return (
            <div key={statusKey} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <StatusBadge status={statusKey} />
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600 }}>
                  {items.length} {items.length === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'var(--font-body)', tableLayout: 'fixed', minWidth: 2150 }}>
                    <colgroup>
                      {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>●<ColumnResizeHandle onResizeStart={handleResizeStart(0)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>🔗<ColumnResizeHandle onResizeStart={handleResizeStart(1)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>
                          IAC
                          <ColumnResizeHandle onResizeStart={handleResizeStart(2)} />
                        </th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>
                          Tipo
                          <ColumnFilterDropdown
                            column="Tipo"
                            uniqueValues={colFilterTypeValues}
                            selectedValues={colFilterType}
                            onChange={setColFilterType}
                          />
                          <ColumnResizeHandle onResizeStart={handleResizeStart(3)} />
                        </th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>
                          Área
                          <ColumnFilterDropdown
                            column="Área"
                            uniqueValues={colFilterAreaValues}
                            selectedValues={colFilterArea}
                            onChange={setColFilterArea}
                          />
                          <ColumnResizeHandle onResizeStart={handleResizeStart(4)} />
                        </th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Abertura<ColumnResizeHandle onResizeStart={handleResizeStart(5)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Fechamento<ColumnResizeHandle onResizeStart={handleResizeStart(6)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>META<ColumnResizeHandle onResizeStart={handleResizeStart(7)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>When Open<ColumnResizeHandle onResizeStart={handleResizeStart(8)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Projeto<ColumnResizeHandle onResizeStart={handleResizeStart(9)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Comentários<ColumnResizeHandle onResizeStart={handleResizeStart(10)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Solicitante<ColumnResizeHandle onResizeStart={handleResizeStart(11)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Team Leader<ColumnResizeHandle onResizeStart={handleResizeStart(12)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Chinese Staff<ColumnResizeHandle onResizeStart={handleResizeStart(13)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>
                          Ap. WT
                          <ColumnFilterDropdown
                            column="Apresentado WT"
                            uniqueValues={colFilterApresentadoValues}
                            selectedValues={colFilterApresentado}
                            onChange={setColFilterApresentado}
                          />
                          <ColumnResizeHandle onResizeStart={handleResizeStart(14)} />
                        </th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Organizador<ColumnResizeHandle onResizeStart={handleResizeStart(15)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Supervisor<ColumnResizeHandle onResizeStart={handleResizeStart(16)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>
                          Prioridade
                          <ColumnFilterDropdown
                            column="Prioridade"
                            uniqueValues={colFilterPriorityValues}
                            selectedValues={colFilterPriority}
                            onChange={setColFilterPriority}
                          />
                          <ColumnResizeHandle onResizeStart={handleResizeStart(17)} />
                        </th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Qtde Priority<ColumnResizeHandle onResizeStart={handleResizeStart(18)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Qtde No Priority<ColumnResizeHandle onResizeStart={handleResizeStart(19)} /></th>
                        <th style={{ position: 'relative', padding: '10px 12px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748B', whiteSpace: 'nowrap' }}>Validade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[statusKey].map((item, idx) => (
                        <tr key={item.id}
                          onClick={() => { setSelected(item); setIsNew(false); }}
                          style={{ cursor: 'pointer', background: idx % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: idx < grouped[statusKey].length - 1 ? '1px solid #F1F5F9' : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                          onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'}
                        >
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <StatusDot updatedAt={item.updated_at} />
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {item.link_path && (
                              <a
                                href={externalLink(item.link_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir arquivo"
                                onClick={e => e.stopPropagation()}
                                style={{ color: '#0b5cab', textDecoration: 'none', fontSize: '0.9rem' }}
                              >🔗</a>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>{item.iac_code || '—'}</td>
                          <td style={{ padding: '10px 12px' }}><TypeBadge value={item.type_line} /></td>
                          <td style={{ padding: '10px 12px' }}><AreaBadge area={item.area} /></td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                            {item.opening_date ? fmtDateBR(item.opening_date) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                            {item.acceptance_letter_signed ? fmtDateBR(item.acceptance_letter_signed) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {isIacOpenedInYear(item, 2026)
                              ? <OpenTimeBadge openingDate={item.opening_date} acceptanceLetterSigned={item.acceptance_letter_signed} />
                              : <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                            {item.when_open ? fmtDateBR(item.when_open) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', maxWidth: 260 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.project || '—'}</div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', maxWidth: 200, fontSize: '0.75rem' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.comments || '—'}</div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{item.requester || '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{item.team_leader || '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{item.chinese_work_staff || '—'}</td>
                          <td style={{ padding: '10px 12px' }}><PillBadge value={item.apresentado_work_team} /></td>
                          <td title={item.organizer || '—'} style={{ padding: '10px 12px', color: '#475569', fontSize: '0.75rem', maxWidth: 130 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.organizer || '—'}</div>
                          </td>
                          <td title={item.supervisor || '—'} style={{ padding: '10px 12px', color: '#475569', fontSize: '0.75rem', maxWidth: 140 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.supervisor || '—'}</div>
                          </td>
                          <td style={{ padding: '10px 12px' }}><PriorityBadge value={item.priority} /></td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#0F172A' }}>{item.qty_pp_line_26_priority ?? '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#0F172A' }}>{item.qty_pp_line_26_no_priority ?? '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{item.validity || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {selected && (
        <IACModal
          item={isNew ? null : selected}
          isNew={isNew}
          onClose={() => { setSelected(null); setIsNew(false); }}
          onSave={handleSave}
          onDelete={handleDelete}
          onCheckinSaved={handleCheckinSaved}
          saving={saving}
          deleting={deleting}
          allUsers={allUsers}
          allRequesters={allRequesters}
          allChineseStaff={allChineseStaff}
          allOrganizers={allOrganizers}
          allSupervisors={allSupervisors}
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
    </div>
  );
}
