import { iacElapsedMonths } from '../../utils/iacDates.js';

/**
 * OpenTimeBadge - Badge de tempo em meses entre abertura e assinatura, ou hoje.
 */
export default function OpenTimeBadge({ openingDate, acceptanceLetterSigned }) {
  const months = iacElapsedMonths({
    opening_date: openingDate,
    acceptance_letter_signed: acceptanceLetterSigned,
  });

  if (months === null) {
    return <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>—</span>;
  }

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
