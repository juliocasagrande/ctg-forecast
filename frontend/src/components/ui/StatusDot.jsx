import { useState, useEffect } from 'react';

export const STATUS_DOT_FILTER_OPTIONS = [
  'Desatualizado',
  'Atualizado',
  'Inativo/sem atualização',
];

const STATUS_DOT_FILTER_COLORS = {
  [STATUS_DOT_FILTER_OPTIONS[0]]: '#EF4444',
  [STATUS_DOT_FILTER_OPTIONS[1]]: '#10B981',
  [STATUS_DOT_FILTER_OPTIONS[2]]: '#94A3B8',
};

export function StatusDotFilterValue({ value }) {
  const color = STATUS_DOT_FILTER_COLORS[value] || '#94A3B8';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 4px ${color}60`,
          flexShrink: 0,
        }}
      />
      <span>{value}</span>
    </span>
  );
}

export function getStatusDotFilterValue(updatedAt, thresholdDays = 6, inactive = false) {
  if (inactive || !updatedAt) return STATUS_DOT_FILTER_OPTIONS[2];

  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return STATUS_DOT_FILTER_OPTIONS[2];

  const diffDays = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > thresholdDays
    ? STATUS_DOT_FILTER_OPTIONS[0]
    : STATUS_DOT_FILTER_OPTIONS[1];
}

/**
 * StatusDot - Indicador visual de status (atualizado/desatualizado)
 * 
 * Props:
 * - updatedAt: string|Date - data da última edição
 * - thresholdDays: number - dias para considerar desatualizado (padrão: 6)
 * - inactive: boolean - exibe um indicador neutro, sem animação
 */
export default function StatusDot({ updatedAt, thresholdDays = 6, inactive = false }) {
  const [blink, setBlink] = useState(false);
  const filterValue = getStatusDotFilterValue(updatedAt, thresholdDays, inactive);
  const isOutdated = filterValue === STATUS_DOT_FILTER_OPTIONS[0];
  const isNeutral = filterValue === STATUS_DOT_FILTER_OPTIONS[2];

  useEffect(() => {
    if (isOutdated) {
      const interval = setInterval(() => setBlink(b => !b), 1200);
      return () => clearInterval(interval);
    }
    setBlink(false);
  }, [isOutdated]);

  if (isNeutral) {
    return (
      <span style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: '#94A3B8',
        opacity: 0.45,
        flexShrink: 0,
        boxShadow: 'none',
      }} title={inactive ? 'Acompanhamento de atualização encerrado' : 'Sem informação de edição'} />
    );
  }

  const updated = new Date(updatedAt);
  const now = new Date();
  const diffDays = (now - updated) / (1000 * 60 * 60 * 24);

  const color = isOutdated ? '#EF4444' : '#10B981';
  const opacity = isOutdated ? (blink ? 0.3 : 1) : 1;

  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        opacity,
        transition: 'opacity 0.6s ease',
        flexShrink: 0,
        boxShadow: `0 0 4px ${color}60`,
      }}
      title={isOutdated
        ? `Desatualizado há ${Math.floor(diffDays)} dias`
        : `Atualizado há ${Math.floor(diffDays)} dias`
      }
    />
  );
}
