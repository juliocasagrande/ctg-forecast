import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { formatBRL, formatBRLShort } from '../utils/format.js';

const SERIES = [
  { key: 'planejadoFisico', axis: 'pct', label: 'Físico previsto', color: '#0070B8', dash: '' },
  { key: 'realizadoFisico', axis: 'pct', label: 'Físico realizado', color: '#16A34A', dash: '' },
  { key: 'planejadoFinanceiro', axis: 'money', label: 'Financeiro previsto', color: '#F59E0B', dash: '6 3' },
  { key: 'realizadoFinanceiro', axis: 'money', label: 'Financeiro realizado', color: '#7C3AED', dash: '' },
];

const ALL_VISIBLE = { planejadoFisico: true, realizadoFisico: true, planejadoFinanceiro: true, realizadoFinanceiro: true };

// Reused by the print page, which has no interactive toggle chips and needs a plain color key.
const SCURVE_LEGEND = SERIES.map(({ key, label, color, dash }) => ({ key, label, color, dash }));

function fmtAxisMoney(v) {
  if (v === 0) return 'R$ 0';
  return formatBRLShort(v);
}

function DiamondDot({ cx, cy, fill }) {
  if (cx == null || cy == null) return null;
  const r = 5;
  return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={fill} stroke="#fff" strokeWidth={1} />;
}

function CheckDot({ cx, cy, fill }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill="#fff" stroke={fill} strokeWidth={2} />;
}

function SCurveTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: '0.78rem',
      minWidth: 200, maxWidth: 280, zIndex: 9999, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--ctg-navy)', fontSize: '0.84rem', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>
        {label}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#0070B8', fontWeight: 600 }}>Físico previsto</span>
        <span>{point.planejadoFisico}%</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: '#16A34A', fontWeight: 600 }}>Físico realizado</span>
        <span>{point.realizadoFisico == null ? '—' : `${point.realizadoFisico}%`}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#F59E0B', fontWeight: 600 }}>Financeiro previsto</span>
        <span>{formatBRL(point.planejadoFinanceiro)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#7C3AED', fontWeight: 600 }}>Financeiro realizado</span>
        <span>{point.realizadoFinanceiro == null ? '—' : formatBRL(point.realizadoFinanceiro)}</span>
      </div>
      {point.events?.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 3 }}>
            Eventos de pagamento
          </div>
          {point.events.map(event => {
            const isRealized = event._sCurveActualDate === point.date;
            const eventDate = isRealized ? event.actualDate : event.start;
            return (
              <div key={event.id} style={{ marginBottom: 2 }}>
                <strong>{event.name}</strong> — {formatBRL(event.value || 0)}
                {' '}({isRealized ? 'realizado' : 'previsto'} em {eventDate?.split('-').reverse().join('/')} + 30d)
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The actual chart element. Works both wrapped in <ResponsiveContainer> (which clones its
// direct child, injecting width/height — hence those must be pass-through props here) and
// standalone with explicit pixel width/height (used for the print page, where relying on
// ResizeObserver-based responsiveness is unreliable while the container is display:none).
export function SCurveComposedChart({ points, visibleSeries, width, height, interactive = true }) {
  return (
    <ComposedChart data={points} width={width} height={height} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6B7280' }} minTickGap={24} />
      <YAxis
        yAxisId="pct" orientation="left" domain={[0, 100]} tickFormatter={v => `${v}%`}
        tick={{ fontSize: 9, fill: '#6B7280' }} width={42}
        label={{ value: 'Físico (%)', angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 8, fill: '#9CA3AF' } }}
      />
      <YAxis
        yAxisId="money" orientation="right" tickFormatter={fmtAxisMoney}
        tick={{ fontSize: 9, fill: '#6B7280' }} width={64}
        label={{ value: 'Financeiro (R$)', angle: 90, position: 'insideRight', offset: 8, style: { fontSize: 8, fill: '#9CA3AF' } }}
      />
      {interactive && <Tooltip isAnimationActive={false} content={<SCurveTooltip />} wrapperStyle={{ zIndex: 9999 }} />}
      <ReferenceLine yAxisId="pct" x={points.find(p => p.isToday)?.label} stroke="#F59E0B" strokeDasharray="4 3" label={{ value: 'Hoje', fontSize: 9, fill: '#F59E0B' }} />

      {visibleSeries.planejadoFisico && (
        <Line yAxisId="pct" type="monotone" dataKey="planejadoFisico" name="Físico previsto" stroke="#0070B8" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={interactive} />
      )}
      {visibleSeries.realizadoFisico && (
        <Line yAxisId="pct" type="monotone" dataKey="realizadoFisico" name="Físico realizado" stroke="#16A34A" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={interactive} />
      )}
      {visibleSeries.planejadoFinanceiro && (
        <Line yAxisId="money" type="monotone" dataKey="planejadoFinanceiro" name="Financeiro previsto" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4 }} isAnimationActive={interactive} />
      )}
      {visibleSeries.realizadoFinanceiro && (
        <Line yAxisId="money" type="monotone" dataKey="realizadoFinanceiro" name="Financeiro realizado" stroke="#7C3AED" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={interactive} />
      )}
      {visibleSeries.planejadoFinanceiro && (
        <Scatter yAxisId="money" dataKey="eventPlanned" name="Evento previsto" fill="#F59E0B" shape={<DiamondDot fill="#F59E0B" />} legendType="none" isAnimationActive={interactive} />
      )}
      {visibleSeries.realizadoFinanceiro && (
        <Scatter yAxisId="money" dataKey="eventActual" name="Evento realizado" fill="#7C3AED" shape={<CheckDot fill="#7C3AED" />} legendType="none" isAnimationActive={interactive} />
      )}
    </ComposedChart>
  );
}

export default function ScheduleSCurveChart({ points, totals, visibleSeries, onToggleSeries, expanded, onToggleExpand }) {
  const hasData = points && points.length > 0;

  return (
    <div className="card schedule-scurve-card no-print" style={{ overflow: 'visible' }}>
      <div style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>Curva S — físico x financeiro</span>
          <button
            type="button"
            className="schedule-scurve-expand-btn"
            title={expanded ? 'Recolher curva S' : 'Expandir curva S'}
            onClick={onToggleExpand}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              {expanded ? (
                <path d="M13 3a1 1 0 011 1v3a1 1 0 11-2 0V5.41l-3.3 3.3a1 1 0 01-1.4-1.42L10.59 4H8a1 1 0 110-2h5zM3 17a1 1 0 01-1-1v-3a1 1 0 112 0v2.59l3.3-3.3a1 1 0 011.4 1.42L5.41 16H8a1 1 0 110 2H3a1 1 0 01-1-1z" />
              ) : (
                <path d="M3 3a1 1 0 00-1 1v4a1 1 0 002 0V5.41l3.3 3.3a1 1 0 001.4-1.42L5.41 4H8a1 1 0 000-2H3zm14 14a1 1 0 001-1v-4a1 1 0 00-2 0v2.59l-3.3-3.3a1 1 0 00-1.4 1.42L14.59 16H12a1 1 0 000 2h5z" />
              )}
            </svg>
          </button>
          <span className="schedule-scurve-expand-hint" onClick={onToggleExpand}>
            {expanded ? 'Clique aqui pra recolher' : 'Clique aqui pra expandir'}
          </span>
        </div>
        <div className="schedule-scurve-toggles">
          {SERIES.map(series => (
            <label key={series.key} className={`schedule-critical-toggle ${visibleSeries[series.key] ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={!!visibleSeries[series.key]}
                onChange={() => onToggleSeries(series.key)}
                style={{ accentColor: series.color }}
              />
              {series.label}
            </label>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="dash-kpi-grid schedule-scurve-kpis">
          <div className="stat-card">
            <div className="stat-label">Financeiro previsto</div>
            <div className="stat-value" style={{ fontSize: '1.05rem', color: '#F59E0B' }}>{formatBRL(totals?.plannedValue || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Financeiro realizado</div>
            <div className="stat-value" style={{ fontSize: '1.05rem', color: '#7C3AED' }}>{formatBRL(totals?.actualValue || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Físico previsto</div>
            <div className="stat-value" style={{ fontSize: '1.05rem', color: '#0070B8' }}>{totals?.plannedPhysical || 0}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Físico realizado (hoje)</div>
            <div className="stat-value" style={{ fontSize: '1.05rem', color: '#16A34A' }}>{totals?.actualPhysical || 0}%</div>
          </div>
        </div>
      )}

      <div className="schedule-scurve-body">
        {!hasData ? (
          <div className="empty-state schedule-empty" style={{ minHeight: 120 }}>
            <h3>Sem dados suficientes</h3>
            <p>Cadastre atividades com datas e/ou eventos de pagamento para ver a curva S.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <SCurveComposedChart points={points} visibleSeries={visibleSeries} />
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export { ALL_VISIBLE as SCURVE_ALL_VISIBLE, SCURVE_LEGEND };
