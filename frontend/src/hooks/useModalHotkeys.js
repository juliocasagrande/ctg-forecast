import { useEffect } from 'react';

/**
 * Standard modal keyboard shortcuts, shared by every modal in the app: Escape closes, Enter
 * saves. Enter is ignored while focus is on a <textarea> (so multi-line notes keep taking real
 * line breaks) or a <button> (so Cancel/other in-modal buttons keep their own native Enter
 * behavior instead of also triggering save).
 */
export default function useModalHotkeys(active, onClose, onSave) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key === 'Enter' && onSave) {
        const tag = document.activeElement?.tagName;
        if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
        e.preventDefault();
        onSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onClose, onSave]);
}
