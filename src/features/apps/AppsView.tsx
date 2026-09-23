// Apps panel (spec §9, §19): system apps on user 0, per-app actions, APK extraction.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBridge } from '../../services/bridge';
import { act } from '../../services/deviceService';
import { useApp } from '../../stores/app';
import { Badge, Button, EmptyState, Spinner } from '../../components/ui';
import { DestructiveConfirmDialog, ErrorDialog, type DestructiveConfig } from '../../components/ConfirmDialog';
import type { AppError, PackageMeta, PackageRow } from '../../types';

type Filter = 'all' | 'system' | 'user';

export function AppsView({ serial }: { serial: string }) {
  const t = useApp((s) => s.t);
  const toast = useApp((s) => s.toast);

  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [meta, setMeta] = useState<PackageMeta | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<DestructiveConfig | null>(null);
  const [installing, setInstalling] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    const r = await act(() => getBridge().listPackages(serial), {
      title: t('apps.loaded'),
    });
    if (!mounted.current) return;
    if (r.ok) setRows(r.value);
    else setError(r.error);
  }, [serial, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setMeta(null);
      return;
    }
    let cancel = false;
    act(() => getBridge().packageInfo(serial, selected)).then((r) => {
      if (!cancel && r.ok) setMeta(r.value);
    });
    return () => {
      cancel = true;
    };
  }, [selected, serial]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = query.toLowerCase();
    return rows
      .filter((r) => (filter === 'system' ? r.isSystem : filter === 'user' ? !r.isSystem : true))
      .filter((r) => r.name.includes(q))
      .sort((a, b) => (a.isSystem === b.isSystem ? a.name.localeCompare(b.name) : a.isSystem ? -1 : 1));
  }, [rows, query, filter]);

  const runAction = async (
    pkg: string,
    action: 'open' | 'enable' | 'disable' | 'uninstall_for_user' | 'clear_data' | 'reinstall',
    confirmation?: string,
  ) => {
    setBusyAction(action);
    const r = await act(
      () => getBridge().packageAction(serial, pkg, action, 0, confirmation),
      { title: t('apps.actionDone', { action: action.replace('_', ' ') }) },
    );
    if (!r.ok) setError(r.error);
    setBusyAction(null);
    if (r.ok) {
      const rl = await act(() => getBridge().listPackages(serial));
      if (rl.ok) setRows(rl.value);
    }
  };

  const requestDisable = (pkg: string) =>
    setConfirm({
      title: t('apps.disable'),
      body: t('apps.disable.confirm.body', { pkg }),
      word: 'APAGAR',
      onConfirm: () => runAction(pkg, 'disable'),
      onCancel: () => setConfirm(null),
    });

  const requestUninstall = (pkg: string) =>
    setConfirm({
      title: t('apps.uninstallForUser'),
      body: t('apps.uninstallForUser.confirm.body', { pkg }),
      word: 'REMOVER',
      onConfirm: () => runAction(pkg, 'uninstall_for_user'),
      onCancel: () => setConfirm(null),
    });

  const requestClear = (pkg: string) =>
    setConfirm({
      title: t('apps.clearData'),
      body: t('apps.clearData.confirm.body', { pkg }),
      word: 'APAGAR',
      onConfirm: () => runAction(pkg, 'clear_data'),
      onCancel: () => setConfirm(null),
    });

  const installApk = async () => {
    const local = await getBridge().pickPath('apk');
    if (!local) return;
    setInstalling(true);
    const r = await act(() => getBridge().installApk(serial, local), {
      title: t('apps.installDone'),
    });
    if (r.ok) toast({ kind: 'success', title: t('apps.installDone'), body: local });
    else setError(r.error);
    setInstalling(false);
  };

  const extract = async (pkg: string) => {
    setBusyAction('extract');
    const r = await act(() => getBridge().packageExtract(serial, pkg), {
      title: t('apps.extract.done'),
    });
    if (r.ok) toast({ kind: 'success', title: t('apps.extract.done'), body: r.value });
    else setError(r.error);
    setBusyAction(null);
  };

  const selRow = rows?.find((r) => r.name === selected) ?? null;

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 12, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <Button size="small" variant="primary" onClick={installApk} disabled={installing}>
            ⬇ {installing ? t('apps.installing') : t('apps.installApk')}
          </Button>
          <input
            type="text"
            placeholder={t('apps.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          {(['all', 'system', 'user'] as Filter[]).map((f) => (
            <Button key={f} size="small" variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)}>
              {t(`apps.filter.${f}`)}
            </Button>
          ))}
          <div className="spacer" />
          <Button size="small" onClick={load} disabled={rows === null}>
            {t('nav.refresh')}
          </Button>
          <Badge>{rows ? `${rows.length} ${t('apps.count', { n: rows.length })}` : ''}</Badge>
        </div>

        {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
        {rows === null ? (
          <div className="card">
            <Spinner label={t('apps.loading')} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon="⬢" title={t('apps.empty')} />
        ) : (
          <div className="table-wrap" style={{ flex: 1 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t('apps.col.package')}</th>
                  <th>{t('apps.col.version')}</th>
                  <th>{t('apps.col.type')}</th>
                  <th>{t('apps.col.state')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.name}
                    className={`clickable ${selected === r.name ? 'selected' : ''}`}
                    onClick={() => setSelected(r.name)}
                  >
                    <td className="mono">{r.name}</td>
                    <td>{r.version || '—'}</td>
                    <td>
                      <Badge tone={r.isSystem ? 'default' : 'info'}>{t(`apps.type.${r.isSystem ? 'system' : 'user'}`)}</Badge>
                    </td>
                    <td>
                      <Badge tone={r.isDisabled ? 'warn' : 'ok'}>{t(`apps.state.${r.isDisabled ? 'disabled' : 'enabled'}`)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ alignSelf: 'start', overflowY: 'auto', maxHeight: '100%' }}>
        {!selRow ? (
          <div className="dim small">{t('apps.detailsHint')}</div>
        ) : (
          <>
            <h3>{selRow.name}</h3>
            <div className="grid" style={{ gap: 8 }}>
              <div className="kv">
                <span className="k">{t('apps.col.version')}</span>
                <span className="v mono">{meta?.versionName ?? selRow.version ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="k">uid</span>
                <span className="v mono">{selRow.uid || '—'}</span>
              </div>
              <div className="kv">
                <span className="k">{t('apps.col.path')}</span>
                <span className="v mono" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
                  {meta?.codePath ?? selRow.path}
                </span>
              </div>
              {meta?.lastUpdate && (
                <div className="kv">
                  <span className="k">{t('apps.col.updated')}</span>
                  <span className="v">{new Date(meta.lastUpdate).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>

            <div className="grid mt-12" style={{ gap: 8 }}>
              <Button
                size="small"
                variant="primary"
                disabled={selRow.isDisabled || busyAction != null}
                onClick={() => runAction(selRow.name, 'open')}
              >
                {t('apps.open')}
              </Button>
              {selRow.isDisabled ? (
                <Button size="small" disabled={busyAction != null} onClick={() => runAction(selRow.name, 'enable')}>
                  {t('apps.enable')}
                </Button>
              ) : (
                <Button size="small" disabled={busyAction != null} onClick={() => requestDisable(selRow.name)}>
                  {t('apps.disable')}
                </Button>
              )}
              <Button size="small" disabled={busyAction != null} onClick={() => requestClear(selRow.name)}>
                {t('apps.clearData')}
              </Button>
              <Button
                size="small"
                variant="danger"
                disabled={busyAction != null}
                onClick={() => requestUninstall(selRow.name)}
              >
                {t('apps.uninstallForUser')}
              </Button>
              <Button
                size="small"
                variant="ghost"
                disabled={busyAction != null}
                onClick={() => extract(selRow.name)}
                title={t('apps.extract.hint')}
              >
                ⬇ {t('apps.extract')}
              </Button>
            </div>
          </>
        )}
      </div>

      {confirm && <DestructiveConfirmDialog cfg={confirm} />}
    </div>
  );
}
