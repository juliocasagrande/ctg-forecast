import { formatBRL } from '../../utils/format.js';

// Friendly labels
const SERIES_LABELS = {
  Budget:        'Budget',
  Forecast:      'Forecast',
  Realizado:     'Realizado',
  Meta:          'Meta',
  Pool:          'Pool',
  BudgetAcum:    'Budget',
  ForecastAcum:  'Forecast',
  RealizadoAcum: 'Realizado',
  MetaAcum:      'Meta',
  PoolAcum:      'Pool',
};

const MONTHLY_KEYS = ['Budget', 'Forecast', 'Realizado', 'Meta', 'Pool'];
const ACUM_KEYS    = ['BudgetAcum', 'ForecastAcum', 'RealizadoAcum', 'MetaAcum', 'PoolAcum'];

function fmtTooltipLabel(label, period) {
  if (!label) return label;
  if (String(label).includes('/')) return label;
  const yr = period?.start || period?.year || new Date().getFullYear();
  return `${label}/${yr}`;
}

function renderRow(p) {
  return (
    <div key={p.name} style={{
      display: 'flex', gap: 10, justifyContent: 'space-between',
      marginBottom: 2, fontSize: '0.76rem',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color ?? p.stroke ?? p.fill, flexShrink: 0 }} />
        <span style={{ opacity: 0.85, whiteSpace: 'nowrap' }}>{SERIES_LABELS[p.name] || p.name}</span>
      </span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: p.value === 0 ? 'var(--text-muted)' : undefined }}>
        {p.value === 0 ? '—' : formatBRL(p.value)}
      </span>
    </div>
  );
}

function sectionHeader(title) {
  return (
    <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 6, marginBottom: 3, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
      {title}
    </div>
  );
}

/**
 * Grouped chart tooltip — used on all charts across the app.
 * Automatically detects monthly keys, accumulated keys, and variation.
 * 
 * Props:
 *   period  — { start, end } or { year }  (for label formatting)
 *   year    — single year (shortcut for period)
 */
export default function ChartTooltip({ active, payload, label, period, year }) {
  if (!active || !payload?.length) return null;

  const effectivePeriod = period || (year ? { start: year } : null);

  const dataMap = {};
  payload.forEach(p => { dataMap[p.dataKey || p.name] = p; });

  const monthlyEntries = MONTHLY_KEYS.map(k => dataMap[k]).filter(Boolean);
  const acumEntries    = ACUM_KEYS.map(k => dataMap[k]).filter(Boolean);

  // Entries that don't fit monthly/acum (e.g. category charts)
  const knownKeys = new Set([...MONTHLY_KEYS, ...ACUM_KEYS, 'GapMax', 'GapMin']);
  const otherEntries = payload.filter(p => !knownKeys.has(p.dataKey || p.name));

  const forecastAcum  = dataMap['ForecastAcum']?.value  ?? 0;
  const realizadoAcum = dataMap['RealizadoAcum']?.value ?? 0;
  const variation     = forecastAcum - realizadoAcum;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      fontSize: '0.8rem', minWidth: 200, maxWidth: 280, zIndex: 9999, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--ctg-navy)',
        fontSize: '0.85rem', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>
        {fmtTooltipLabel(label, effectivePeriod)}
      </div>

      {/* Monthly values */}
      {monthlyEntries.length > 0 && (
        <>
          {sectionHeader('Valores Mensais')}
          {monthlyEntries.map(renderRow)}
        </>
      )}

      {/* Accumulated values */}
      {acumEntries.length > 0 && (
        <>
          {sectionHeader('Acumulado')}
          {acumEntries.map(renderRow)}
        </>
      )}

      {/* Variation */}
      {(forecastAcum > 0 || realizadoAcum > 0) && (
        <>
          {sectionHeader('Variação')}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '0.76rem', fontWeight: 700,
            color: variation > 0 ? '#0369A1' : variation < 0 ? '#DC2626' : 'var(--text-muted)',
          }}>
            <span style={{ opacity: 0.85 }}>Forecast − Realizado:</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {variation === 0 ? '—' : `${variation > 0 ? '+' : ''}${formatBRL(variation)}`}
            </span>
          </div>
        </>
      )}

      {/* Other entries (category charts, project charts, etc.) */}
      {otherEntries.length > 0 && monthlyEntries.length === 0 && acumEntries.length === 0 && (
        <>
          {otherEntries.map(renderRow)}
        </>
      )}

      {/* Mixed: other entries alongside grouped ones */}
      {otherEntries.length > 0 && (monthlyEntries.length > 0 || acumEntries.length > 0) && (
        <>
          {sectionHeader('Detalhe')}
          {otherEntries.map(renderRow)}
        </>
      )}
    </div>
  );
}

// Re-export for legend formatter
export { SERIES_LABELS, fmtTooltipLabel };
