import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIso(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBR(date) {
  if (!date) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildMonthGrid(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    cells.push(day);
  }
  return cells;
}

/**
 * WorkdayDatePicker - custom calendar dropdown that blocks selection of
 * non-working days (weekends/holidays) instead of only validating after the fact.
 *
 * Props:
 * - value: string (ISO yyyy-mm-dd) or ''
 * - onChange: (isoValue: string) => void
 * - isDateDisabled?: (date: Date) => boolean — return true to grey out/block a day
 * - placeholder?: string
 */
export default function WorkdayDatePicker({ value, onChange, isDateDisabled, placeholder = 'dd/mm/aaaa' }) {
  const selected = parseIso(value);
  const today = startOfDay(new Date());
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selected || today);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (open) setViewDate(selected || today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const disabledCheck = useCallback((date) => (
    typeof isDateDisabled === 'function' ? !!isDateDisabled(date) : false
  ), [isDateDisabled]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const width = 260;
      setPos({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - width - 16),
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      const popup = document.querySelector('[data-workday-datepicker]');
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

  const selectDay = (day) => {
    if (disabledCheck(day)) return;
    onChange(toIso(day));
    setOpen(false);
  };

  const goToday = () => {
    setViewDate(today);
    if (!disabledCheck(today)) {
      onChange(toIso(today));
      setOpen(false);
    }
  };

  const clear = () => {
    onChange('');
    setOpen(false);
  };

  const cells = buildMonthGrid(viewDate);
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="form-input"
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, cursor: 'pointer', textAlign: 'left', background: '#fff',
        }}
      >
        <span style={{ color: selected ? 'inherit' : '#94A3B8' }}>
          {selected ? formatBR(selected) : placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="#64748B" style={{ flexShrink: 0 }}>
          <path d="M6 2a1 1 0 011 1v1h6V3a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1zM4 8v8h12V8H4z" />
        </svg>
      </button>

      {open && createPortal(
        <div
          data-workday-datepicker
          style={{
            position: 'fixed', top: pos?.top || 0, left: pos?.left || 0,
            width: 260, background: '#fff', border: '1px solid #E2E8F0',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            zIndex: 99999, padding: 12,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 4 }}>
              ‹
            </button>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>
              {monthLabel}
            </span>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 4 }}>
              ›
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {WEEKDAY_LETTERS.map((letter, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#94A3B8', padding: '2px 0' }}>
                {letter}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              const inMonth = day.getMonth() === viewDate.getMonth();
              const isDisabled = disabledCheck(day);
              const isSelected = sameDay(day, selected);
              const isToday = sameDay(day, today);
              return (
                <button
                  type="button"
                  key={i}
                  disabled={isDisabled}
                  onClick={() => selectDay(day)}
                  title={isDisabled ? 'Data indisponível (fim de semana ou feriado)' : undefined}
                  style={{
                    aspectRatio: '1', border: isToday && !isSelected ? '1px solid #94A3B8' : 'none',
                    borderRadius: 6, fontSize: '0.76rem',
                    background: isSelected ? '#0066B3' : 'transparent',
                    color: isDisabled ? '#CBD5E1' : (isSelected ? '#fff' : (inMonth ? '#1E293B' : '#CBD5E1')),
                    fontWeight: isSelected ? 700 : 400,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    textDecoration: isDisabled && inMonth ? 'line-through' : 'none',
                  }}
                  onMouseEnter={e => { if (!isDisabled && !isSelected) e.currentTarget.style.background = '#F0F7FF'; }}
                  onMouseLeave={e => { if (!isDisabled && !isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
            <button type="button" onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '0.78rem', fontWeight: 600 }}>
              Limpar
            </button>
            <button type="button" onClick={goToday} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0066B3', fontSize: '0.78rem', fontWeight: 600 }}>
              Hoje
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
