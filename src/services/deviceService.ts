// Small shared helpers for data fetching (UI stays thin, spec §42).

import { asAppError, getBridge } from './bridge';
import { useApp } from '../stores/app';
import type { AppError } from '../types';

export async function refreshDevices(): Promise<void> {
  const app = useApp.getState();
  app.setDevicesLoading(true);
  try {
    const list = await getBridge().listDevices();
    useApp.getState().setDevices(list);
  } catch (e) {
    const err = asAppError(e);
    useApp.getState().toast({ kind: 'error', title: err.code, body: err.details });
  } finally {
    useApp.getState().setDevicesLoading(false);
  }
}

/** Runs an async action, toasts errors, returns {error} when it fails. */
export async function act<T>(
  fn: () => Promise<T>,
  successToast?: { title: string; body?: string },
): Promise<{ ok: true; value: T } | { ok: false; error: AppError }> {
  const app = useApp.getState();
  try {
    const value = await fn();
    if (successToast) {
      app.toast({ kind: 'success', ...successToast });
    }
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: asAppError(e) };
  }
}
