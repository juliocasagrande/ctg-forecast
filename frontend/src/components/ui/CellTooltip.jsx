import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const DWELL_MS = 1000;
const TOOLTIP_MAX_WIDTH = 320;

/**
 * CellTooltip — trunca o conteúdo de uma célula de tabela (1 linha, ellipsis) e,
 * após o mouse ficar parado 1s sobre ela, mostra um tooltip flutuante com o texto
 * completo (quebrando linha conforme necessário).
 *
 * Só exibe o tooltip se o conteúdo estiver de fato cortado (scrollWidth > clientWidth).
 *
 * Props:
 * - text: string — texto completo (usado no tooltip). Se omitido, usa `children`.
 * - children: conteúdo a renderizar na célula (string ou nó simples)
 * - style: estilos extras para o span truncado
 * - as: tag do wrapper truncado (default 'span', use 'div' se precisar de block)
 */
export default function CellTooltip({ text, children, style, as: Tag = 'span' }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const timerRef = useRef(null);

  const content = text ?? children;

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const handleEnter = useCallback(() => {
    clear();
    timerRef.current = setTimeout(() => {
      const el = ref.current;
      if (!el || !content) return;
      if (el.scrollWidth <= el.clientWidth + 1) return; // não truncado, não precisa de tooltip
      const r = el.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - TOOLTIP_MAX_WIDTH - 16);
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
      setShow(true);
    }, DWELL_MS);
  }, [clear, content]);

  const handleLeave = useCallback(() => {
    clear();
    setShow(false);
  }, [clear]);

  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [show]);

  useEffect(() => clear, [clear]);

  return (
    <Tag
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        display: 'block',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        ...style,
      }}
    >
      {content}
      {show && pos && createPortal(
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          maxWidth: TOOLTIP_MAX_WIDTH,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--ctg-navy)', fontWeight: 700,
          zIndex: 9999, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          pointerEvents: 'none',
        }}>
          {content}
        </div>,
        document.body
      )}
    </Tag>
  );
}
