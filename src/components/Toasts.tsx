import { useApp } from '../stores/app';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const t = useApp((s) => s.t);

  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <div className="t-title">
            {toast.title}
            <button
              className="btn ghost small"
              style={{ float: 'right', padding: 0 }}
              onClick={() => dismiss(toast.id)}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
          {toast.body && <div className="t-body">{toast.body}</div>}
        </div>
      ))}
    </div>
  );
}
