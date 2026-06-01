import { useCallback, useEffect, useState } from 'react';

let _add = null;
let _confirm = null;
let _id = 0;

function normalizeDialog(input, fallback = {}) {
  if (typeof input === 'string') return { ...fallback, message: input };
  return { ...fallback, ...(input || {}) };
}

export function useToast() {
  const toast = useCallback((message, type = 'success', duration = 3000) => {
    _add?.(message, type, duration);
  }, []);

  toast.success = (message, duration) => toast(message, 'success', duration);
  toast.error = (message, duration) => toast(message, 'error', duration);
  toast.info = (message, duration) => toast(message, 'info', duration);
  toast.warning = (message, duration) => toast(message, 'warning', duration);

  const confirm = useCallback((options) => (
    _confirm?.(normalizeDialog(options, { title: 'Confirmar acao' })) ?? Promise.resolve(false)
  ), []);

  const alert = useCallback((options) => (
    _confirm?.(normalizeDialog(options, {
      title: 'Aviso',
      confirmLabel: 'Entendi',
      cancelLabel: null,
      variant: 'info',
    })) ?? Promise.resolve(false)
  ), []);

  return {
    toast,
    success: toast.success,
    error: toast.error,
    info: toast.info,
    warning: toast.warning,
    confirm,
    alert,
  };
}

export function ToastProvider() {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    _add = (message, type = 'success', duration = 3000) => {
      const id = ++_id;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    };

    _confirm = (options) => new Promise(resolve => {
      setDialog({
        title: 'Confirmar acao',
        message: '',
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        variant: 'danger',
        ...options,
        resolve,
      });
    });

    return () => {
      _add = null;
      _confirm = null;
    };
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const handler = event => {
      if (event.key === 'Escape') closeDialog(false);
    };
    document.addEventListener('keydown', handler);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [dialog]);

  const closeDialog = (result) => {
    setDialog(current => {
      current?.resolve?.(result);
      return null;
    });
  };

  const icons = { success: 'OK', error: '!', info: 'i', warning: '!' };

  return (
    <>
      <div className="toast-container" aria-live="polite" aria-relevant="additions">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type || 'info'}`}>
            <span className="toast-icon">{icons[t.type] || icons.info}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="app-dialog-overlay" onClick={event => event.target === event.currentTarget && closeDialog(false)}>
          <div className={`app-dialog app-dialog-${dialog.variant || 'info'}`} role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
            <div className="app-dialog-header">
              <span className="app-dialog-icon">{icons[dialog.variant] || icons.info}</span>
              <h2 id="app-dialog-title">{dialog.title}</h2>
            </div>
            <div className="app-dialog-body">
              {String(dialog.message || '').split('\n').map((line, index) => (
                <p key={index}>{line || '\u00a0'}</p>
              ))}
            </div>
            <div className="app-dialog-footer">
              {dialog.cancelLabel && (
                <button className="btn btn-secondary" type="button" onClick={() => closeDialog(false)}>
                  {dialog.cancelLabel}
                </button>
              )}
              <button className={`btn ${dialog.variant === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`} type="button" onClick={() => closeDialog(true)} autoFocus>
                {dialog.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
