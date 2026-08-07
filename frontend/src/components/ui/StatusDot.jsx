import { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (inactive || !updatedAt) return;
    const updated = new Date(updatedAt);
    const now = new Date();
    const diffDays = (now - updated) / (1000 * 60 * 60 * 24);
    const isOutdated = diffDays > thresholdDays;

    if (isOutdated) {
      const interval = setInterval(() => setBlink(b => !b), 1200);
      return () => clearInterval(interval);
    }
  }, [updatedAt, thresholdDays, inactive]);

  if (inactive) {
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
      }} title="Contrato assinado — acompanhamento de atualização encerrado" />
    );
  }

  if (!updatedAt) {
    return (
      <span style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: '#CBD5E1',
        flexShrink: 0,
      }} title="Sem informação de edição" />
    );
  }

  const updated = new Date(updatedAt);
  const now = new Date();
  const diffDays = (now - updated) / (1000 * 60 * 60 * 24);
  const isOutdated = diffDays > thresholdDays;

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
