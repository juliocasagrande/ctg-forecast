import { useState, useRef, useCallback } from 'react';

// Temporary column widths for a table — resettable by drag, never persisted (resets on remount/reload).
export default function useColumnWidths(defaultWidths) {
  const [widths, setWidths] = useState(defaultWidths);
  const dragRef = useRef(null);

  const handleResizeStart = useCallback((index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { index, startX: e.clientX, startWidth: widths[index] };

    const onMouseMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const newWidth = Math.max(40, d.startWidth + (ev.clientX - d.startX));
      setWidths(prev => {
        const next = [...prev];
        next[d.index] = newWidth;
        return next;
      });
    };
    const onMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [widths]);

  return { widths, handleResizeStart };
}
