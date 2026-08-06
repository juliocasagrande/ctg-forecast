import { useState, useRef, useCallback, useEffect } from 'react';

// Temporary column widths for a table — resettable by drag, never persisted (resets on remount/reload).
export default function useColumnWidths(defaultWidths) {
  const [widths, setWidths] = useState(defaultWidths);
  const dragRef = useRef(null);
  // Guarda as referências dos listeners atualmente anexados a document, para que o
  // mesmo par de funções possa ser usado tanto no cleanup normal (mouseup) quanto no
  // cleanup de desmontagem do componente (caso o usuário solte o mouse fora dele).
  const listenersRef = useRef(null);

  const detachListeners = useCallback(() => {
    if (!listenersRef.current) return;
    const { onMouseMove, onMouseUp } = listenersRef.current;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    listenersRef.current = null;
  }, []);

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
      detachListeners();
    };
    detachListeners(); // segurança: remove qualquer par anterior antes de anexar um novo
    listenersRef.current = { onMouseMove, onMouseUp };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [widths, detachListeners]);

  // Se o componente desmontar durante um arraste (botão do mouse ainda pressionado),
  // onMouseUp nunca dispara — remove os listeners aqui para não vazá-los em document.
  useEffect(() => {
    return () => detachListeners();
  }, [detachListeners]);

  return { widths, handleResizeStart };
}
