/**
 * OpenTimeBadge - Badge de tempo de abertura em meses
 * 
 * Props:
 * - openingDate: string|Date - data de abertura
 * 
 * Cores:
 * - < 5 meses: verde
 * - < 6 meses: laranja
 * - >= 6 meses: vermelho
 */
export default function OpenTimeBadge({ openingDate }) {
  if (!openingDate) {
    return <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>—</span>;
  }

  const opened = new Date(openingDate);
  const now = new Date();
  const diffTime = now - opened;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const months = Math.floor(diffDays / 30);

  let color, bg, border;
  if (months < 5) {
    color = '#065F46';
    bg = '#D1FAE5';
    border = '#6EE7B7';
  } else if (months < 6) {
    color = '#92400E';
    bg = '#FEF3C7';
    border = '#FDE68A';
  } else {
    color = '#991B1B';
    bg = '#FEE2E2';
    border = '#FECACA';
  }

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: '0.68rem',
      fontWeight: 700,
      background: bg,
      color,
      border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
    }}>
      {months}m
    </span>
  );
}
