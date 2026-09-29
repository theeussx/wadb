import type { UpdateInfo } from '../services/updateService';
import { useApp } from '../stores/app';

export function UpdateBanner({ update, onDismiss }: { update: UpdateInfo; onDismiss: () => void }) {
  const t = useApp((s) => s.t);
  return (
    <div className="banner update-banner" role="status">
      <span aria-hidden>↻</span>
      <span>
        <strong>{t('updates.available', { version: update.version })}</strong>
        {update.name ? ` — ${update.name}` : ''}
        {' · '}
        <a href={update.url} target="_blank" rel="noreferrer">
          {t('updates.viewRelease')}
        </a>
      </span>
      <button className="btn ghost small" type="button" onClick={onDismiss} aria-label={t('updates.dismiss')}>
        {t('updates.dismiss')}
      </button>
    </div>
  );
}
