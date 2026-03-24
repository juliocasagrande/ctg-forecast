import { useState, useRef, useEffect } from 'react';

/**
 * EngineerBadge — circle with initials + styled tooltip on hover.
 * Props: name (full name), initials (2-char), size (px, default 26)
 */
export default function EngineerBadge({ name, initials, size = 26 }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  useEffect(() => {
    if (!show || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });
  }, [show]);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, borderRadius: '50%',
          background: '#166534', color: '#fff',
          fontSize: size * 0.22, fontWeight: 700,
          cursor: 'default', flexShrink: 0,
          transition: 'transform 0.12s',
          transform: show ? 'scale(1.12)' : 'scale(1)',
        }}
      >
        {initials}
      </span>
      {show && (
        <div style={{
          position: 'fixed', zIndex: 9999, pointerEvents: 'none',
          top: pos.top, left: pos.left,
          transform: 'translateX(-50%)',
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{
              fontSize: '0.78rem', fontWeight: 600, color: 'var(--ctg-navy)',
              fontFamily: 'var(--font-body)',
            }}>
              {name}
            </div>
            <div style={{
              fontSize: '0.62rem', color: 'var(--text-muted)',
              fontWeight: 500, marginTop: 1,
            }}>
              Engenheiro responsável
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * EngineerBadges — renders multiple badges from comma-separated strings.
 * Props: engineers (string), engineerInitials (string), size (px)
 */
export function EngineerBadges({ engineers, engineerInitials, size = 26 }) {
  if (!engineers) return <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>;

  const names = engineers.split(', ');
  const inits = engineerInitials ? engineerInitials.split(', ') : [];

  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {names.map((name, i) => {
        const initials = inits[i] || name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return <EngineerBadge key={i} name={name} initials={initials} size={size} />;
      })}
    </div>
  );
}