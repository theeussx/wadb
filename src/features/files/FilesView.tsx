// File Manager (spec §12, §20): browse, push/pull with progress, mkdir/rename/delete.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBridge } from '../../services/bridge';
import { act } from '../../services/deviceService';
import { useApp } from '../../stores/app';
import { Button, EmptyState, ProgressBar, Spinner, formatBytes } from '../../components/ui';
import { DestructiveConfirmDialog, ErrorDialog, type DestructiveConfig } from '../../components/ConfirmDialog';
import type { AppError, FileEntry, TransferEvent } from '../../types';

interface Xfer {
  id: string;
  kind: 'push' | 'pull';
  label: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number | null;
}

export function FilesView({ serial }: { serial: string }) {
  const t = useApp((s) => s.t);
  const toast = useApp((s) => s.toast);

  const [path, setPath] = useState('/sdcard');
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [xfer, setXfer] = useState<Xfer | null>(null);
  const [confirm, setConfirm] = useState<DestructiveConfig | null>(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const off = getBridge().on('file-progress', (payload) => {
      const p = payload as TransferEvent;
      setXfer((prev) => {
        if (!prev || prev.id !== p.id) return prev;
        return {
          ...prev,
          status: p.status,
          done: p.doneBytes,
          total: p.total,
        };
      });
      if (p.status === 'done') toast({ kind: 'success', title: t('files.transfer.done'), body: p.message || undefined });
      if (p.status === 'error') toast({ kind: 'error', title: t('files.transfer.error'), body: p.message || undefined });
    });
    return () => {
      mounted.current = false;
      off();
    };
  }, [toast, t]);

  const load = useCallback(
    async (p: string) => {
      setEntries(null);
      const r = await act(() => getBridge().fileList(serial, p));
      if (!mounted.current) return;
      if (r.ok) {
        setPath(p);
        setEntries(r.value);
      } else setError(r.error);
    },
    [serial],
  );

  useEffect(() => {
    void load('/sdcard');
  }, [load]);

  const crumb = path.split('/').filter(Boolean);

  const goto = (p: string) => void load(p);

  const openEntry = (e: FileEntry) => {
    if (e.isDir) goto(`${path === '/' ? '' : path}/${e.name}`);
    else void load(path); // selecting a file: no-op (keep simple)
  };

  const push = async () => {
    const local = await getBridge().pickPath('file');
    if (!local) return;
    const id = await getBridge().filePush(serial, local);
    setXfer({ id, kind: 'push', label: local, status: 'running', done: 0, total: null });
  };

  const pull = async () => {
    const entry = entries?.find((x) => !x.isDir);
    if (!entry) return;
    const dir = await getBridge().pickPath('directory');
    if (!dir) return;
    const id = await getBridge().filePull(serial, `${path === '/' ? '' : path}/${entry.name}`, dir);
    setXfer({ id, kind: 'pull', label: `${path}/${entry.name}`, status: 'running', done: 0, total: null });
  };

  const mkdir = async () => {
    const name = prompt(t('files.mkdir'), 'novo-diretorio');
    if (!name) return;
    const r = await act(() => getBridge().fileMkdir(serial, `${path === '/' ? '' : path}/${name}`), {
      title: t('files.mkdir'),
    });
    if (r.ok) void load(path);
    else setError(r.error);
  };

  const rename = async (entry: FileEntry) => {
    const name = prompt(t('files.rename'), entry.name);
    if (!name || name === entry.name) return;
    const from = `${path === '/' ? '' : path}/${entry.name}`;
    const to = `${path === '/' ? '' : path}/${name}`;
    const r = await act(() => getBridge().fileRename(serial, from, to));
    if (r.ok) void load(path);
    else setError(r.error);
  };

  const requestDelete = (entry: FileEntry) =>
    setConfirm({
      title: t('files.delete'),
      body: `${path === '/' ? '' : path}/${entry.name}`,
      word: 'APAGAR',
      onConfirm: async () => {
        const r = await act(() => getBridge().fileDelete(serial, `${path === '/' ? '' : path}/${entry.name}`, 'APAGAR'));
        if (r.ok) void load(path);
        else setError(r.error);
      },
      onCancel: () => setConfirm(null),
    });

  const indeterminate = xfer?.kind === 'push' && xfer.status === 'running';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 10 }}>
      <div className="row wrap">
        <div className="breadcrumb">
          <button onClick={() => goto('/')}>/</button>
          {crumb.map((seg, i) => {
            const p = '/' + crumb.slice(0, i + 1).join('/');
            return (
              <span key={p} className="row" style={{ gap: 0 }}>
                <span className="sep">/</span>
                {i === crumb.length - 1 ? (
                  <span className="cur">{seg}</span>
                ) : (
                  <button onClick={() => goto(p)}>{seg}</button>
                )}
              </span>
            );
          })}
        </div>
        <div className="spacer" />
        <Button size="small" onClick={push}>{t('files.push')}</Button>
        <Button size="small" onClick={pull}>{t('files.pull')}</Button>
        <Button size="small" onClick={mkdir}>{t('files.mkdir')}</Button>
        <Button size="small" onClick={() => load(path)}>{t('nav.refresh')}</Button>
      </div>

      {xfer && (
        <div className="card" style={{ padding: 10 }}>
          <div className="row small">
            <span className="mono" title={xfer.label}>
              {xfer.kind === 'push' ? '⬆' : '⬇'} {xfer.label}
            </span>
            <div className="spacer" />
            <span className="muted">
              {formatBytes(xfer.done)} / {xfer.total != null ? formatBytes(xfer.total) : '…'}
            </span>
            {xfer.status === 'running' && (
              <Button size="small" variant="ghost" onClick={() => void getBridge().transferCancel(xfer.id)}>
                {t('common.cancel')}
              </Button>
            )}
          </div>
          <div className="mt-8">
            <ProgressBar
              value={xfer.total ? (xfer.done / xfer.total) * 100 : 0}
              indeterminate={indeterminate}
            />
          </div>
          <div className="dim small mt-8">
            {xfer.kind === 'push' && xfer.status === 'running' ? t('files.push.hint') : xfer.status}
          </div>
        </div>
      )}

      {entries === null ? (
        <div className="card">
          <Spinner label={t('files.loading')} />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon="🗀" title={t('files.empty')} />
      ) : (
        <div className="table-wrap" style={{ flex: 1 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t('files.col.name')}</th>
                <th>{t('files.col.size')}</th>
                <th>{t('files.col.modified')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries
                .slice()
                .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
                .map((e) => (
                  <tr key={e.name} className="clickable" onClick={() => openEntry(e)}>
                    <td>
                      <span style={{ marginRight: 8 }} aria-hidden>
                        {e.isDir ? '▸' : e.isLink ? '∞' : '·'}
                      </span>
                      {e.name}
                    </td>
                    <td>{e.isDir ? '—' : formatBytes(e.size)}</td>
                    <td className="dim">{e.modified}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button size="small" variant="ghost" onClick={() => void rename(e)}>
                        {t('files.rename')}
                      </Button>
                      <Button size="small" variant="ghost" onClick={() => requestDelete(e)}>
                        {t('files.delete')}
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
      {confirm && <DestructiveConfirmDialog cfg={confirm} />}
    </div>
  );
}
