import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * AppCombobox - drop-in replacement for `<input list="x" /><datalist id="x">`,
 * styled to match the app instead of the browser's native suggestion popup.
 * Free text entry is still allowed, exactly like a native datalist.
 *
 * Props: value, onChange(e), options (string[]), placeholder, style, disabled
 */
export default function AppCombobox({ value, onChange, options = [], placeholder, style, disabled, name, id }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const [pos, setPos] = useState(null);

  const filtered = options.filter(o =>
    !value || String(o).toLowerCase().includes(String(value).toLowerCase())
  );

  const handleOpen = useCallback(() => {
    if (disabled) return;
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const maxHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < maxHeight && rect.top > spaceBelow;
      setPos({
        top: openUp ? undefined : rect.bottom + 4,
        bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      const popup = document.querySelector('[data-app-combobox]');
      if (popup && popup.contains(e.target)) return;
      if (inputRef.current && inputRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const handleEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    document.addEventListener('keydown', handleEscape);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selectOption = (opt) => {
    if (onChange) onChange({ target: { value: opt, name, id } });
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value || ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => { onChange && onChange(e); if (!open) handleOpen(); }}
        onFocus={handleOpen}
        style={style}
        autoComplete="off"
      />

      {open && pos && filtered.length > 0 && createPortal(
        <div
          data-app-combobox
          style={{
            position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width,
            maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #E2E8F0',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 99999, padding: 4,
          }}
          onMouseDown={e => e.preventDefault()}
          onClick={e => e.stopPropagation()}
        >
          {filtered.map((opt, i) => {
            const isSelected = opt === value;
            return (
              <div
                key={`${opt}-${i}`}
                onClick={() => selectOption(opt)}
                style={{
                  padding: '7px 10px', borderRadius: 6, fontSize: '0.82rem', cursor: 'pointer',
                  color: isSelected ? '#0066B3' : '#1E293B',
                  background: isSelected ? '#EFF6FF' : 'transparent',
                  fontWeight: isSelected ? 700 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                {opt}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
