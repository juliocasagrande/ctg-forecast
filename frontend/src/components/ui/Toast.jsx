// Toast.jsx
import { useState, useEffect } from 'react';

let _add = null;
let _id = 0;

export function useToast() {
  return {
    toast: (message, type = 'success', duration = 3000) => _add?.(message, type, duration)
  };
}

export function ToastProvider() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _add = (message, type, duration) => {
      const id = ++_id;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    };
    return () => { _add = null; };
  }, []);
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{icons[t.type]}</span> {t.message}
        </div>
      ))}
    </div>
  );
}
