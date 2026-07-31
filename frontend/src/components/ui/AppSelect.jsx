import { useState, useRef, useEffect, useCallback, Children, isValidElement } from 'react';
import { createPortal } from 'react-dom';

/**
 * AppSelect - drop-in replacement for the native <select>, styled to match
 * the app instead of the OS/browser dropdown list.
 *
 * Usage is intentionally identical to <select>: pass <option> children and an
 * onChange that reads e.target.value, so existing call sites only need the
 * tag renamed from `select` to `AppSelect`.
 *
 * Props: value, onChange(e), children (<option> elements), style, disabled, placeholder
 */
export default function AppSelect({ value, onChange, children, style, className, disabled, placeholder, name, id }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);

  const options = Children.toArray(children)
    .filter(child => isValidElement(child) && child.type === 'option')
    .map(child => ({
      value: child.props.value,
      label: child.props.children,
      disabled: !!child.props.disabled,
    }));

  const current = options.find(o => String(o.value) === String(value));

  const handleOpen = useCallback(() => {
    if (disabled) return;
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const width = rect.width;
      const maxHeight = 260;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < maxHeight && rect.top > spaceBelow;
      setPos({
        top: openUp ? undefined : rect.bottom + 4,
        bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
        left: rect.left,
        width,
      });
    }
    setOpen(true);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      const popup = document.querySelector('[data-app-select]');
      if (popup && popup.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
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
    if (opt.disabled) return;
    if (onChange) onChange({ target: { value: opt.value, name, id } });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={className}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        style={{
          ...style,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{
          color: current && current.value !== '' ? 'inherit' : '#94A3B8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {current ? current.label : (placeholder || '')}
        </span>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="#64748B" style={{ flexShrink: 0 }}>
          <path d="M5.5 7.5l4.5 5 4.5-5z" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          data-app-select
          style={{
            position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width,
            maxHeight: 260, overflowY: 'auto', background: '#fff', border: '1px solid #E2E8F0',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 99999, padding: 4,
          }}
          onClick={e => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center' }}>Sem opções</div>
          ) : options.map((opt, i) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <div
                key={`${opt.value}-${i}`}
                onClick={() => selectOption(opt)}
                style={{
                  padding: '7px 10px', borderRadius: 6, fontSize: '0.82rem', cursor: opt.disabled ? 'default' : 'pointer',
                  color: opt.disabled ? '#CBD5E1' : (isSelected ? '#0066B3' : '#1E293B'),
                  background: isSelected ? '#EFF6FF' : 'transparent',
                  fontWeight: isSelected ? 700 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => { if (!opt.disabled && !isSelected) e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseLeave={e => { if (!opt.disabled && !isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
