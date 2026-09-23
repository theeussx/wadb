// Small, dependency-free UI primitives (spec §5: componentes pequenos).

import type { ReactNode } from 'react';
import { useApp } from '../stores/app';

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'default',
  disabled,
  title,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'danger-solid' | 'ghost';
  size?: 'default' | 'small';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
}) {
  const cls = [
    'btn',
    variant === 'primary' ? 'primary' : '',
    variant === 'danger' ? 'danger' : '',
    variant === 'danger-solid' ? 'danger solid' : '',
    variant === 'ghost' ? 'ghost' : '',
    size === 'small' ? 'small' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'info';
}) {
  return <span className={`badge ${tone === 'default' ? '' : tone}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  const t = useApp((s) => s.t);
  return (
    <div className="row" style={{ gap: 8, color: 'var(--text-muted)' }}>
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          border: '2px solid var(--border-strong)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span className="small">{label ?? t('common.loading')}</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function EmptyState({
  icon = '▢',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="e-icon" aria-hidden>
        {icon}
      </div>
      <div className="e-title">{title}</div>
      {hint && <div className="small">{hint}</div>}
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  indeterminate,
}: {
  /** 0..100 */
  value: number;
  indeterminate?: boolean;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`progress ${indeterminate ? 'indeterminate' : ''}`}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : safe}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="bar" style={indeterminate ? undefined : { width: `${safe}%` }} />
    </div>
  );
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatMb(mb: number | null | undefined): string {
  if (mb == null) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function formatBytesPerSec(n: number): string {
  return `${formatBytes(n)}/s`;
}
