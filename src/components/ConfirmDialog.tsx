// Confirmation dialogs (spec §22, §53).
//
// Destructive operations require the user to TYPE the exact word —
// a single click is never enough.

import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';
import { useApp } from '../stores/app';
import type { AppError } from '../types';

export function ErrorDialog({
  error,
  onClose,
}: {
  error: AppError;
  onClose: () => void;
}) {
  const t = useApp((s) => s.t);
  const title = t('common.error');
  const msgKey = `errors.${error.code}`;
  const translated = t(msgKey);
  const known = translated !== msgKey;
  const message = known ? translated : t('errors.UNEXPECTED');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="m-body">
        <div>
          {message}
          {error.code === 'CONFIRMATION_REQUIRED' && <div className="dim small mt-8">{error.details}</div>}
        </div>
        <details className="tech">
          <summary>{t('common.details')}</summary>
          <pre>
            {`code: ${error.code}\n${error.details}`}
          </pre>
        </details>
      </div>
      <div className="m-actions">
        <Button variant="primary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Modal>
  );
}

export interface DestructiveConfig {
  /** Title override (defaults to i18n). */
  title?: string;
  /** Extra warning lines (e.g. the exact operation preview). */
  body: string;
  /** Word the user must type. */
  word: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function DestructiveConfirmDialog({ cfg }: { cfg: DestructiveConfig }) {
  const t = useApp((s) => s.t);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = useMemo(() => typed === cfg.word, [typed, cfg.word]);

  return (
    <Modal title={cfg.title ?? t('common.confirmDestructive.title')} onClose={busy ? () => undefined : cfg.onCancel}>
      <div className="m-body">
        <div className="banner" style={{ margin: 0 }}>
          <span aria-hidden>⚠</span>
          <div>{cfg.body}</div>
        </div>
        <label className="field">
          {t('common.confirmDestructive.body', { word: cfg.word })}
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('common.confirmDestructive.placeholder', { word: cfg.word })}
            autoFocus
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && ok && !busy) {
                setBusy(true);
                try {
                  await cfg.onConfirm();
                } finally {
                  setBusy(false);
                }
              }
            }}
          />
        </label>
      </div>
      <div className="m-actions">
        <Button variant="ghost" onClick={cfg.onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="danger-solid"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await cfg.onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {cfg.confirmLabel ?? t('common.confirm')}
        </Button>
      </div>
    </Modal>
  );
}

export function SimpleConfirmDialog({
  title,
  body,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useApp((s) => s.t);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="m-body">
        <div>{body}</div>
      </div>
      <div className="m-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('common.confirm')}
        </Button>
      </div>
    </Modal>
  );
}
