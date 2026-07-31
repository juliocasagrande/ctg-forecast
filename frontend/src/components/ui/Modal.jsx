import useModalHotkeys from '../../hooks/useModalHotkeys.js';

export default function Modal({ open, onClose, onSave, title, children, footer, maxWidth = 560 }) {
  useModalHotkeys(open, onClose, onSave);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'rgba(255,255,255,0.7)' }}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
