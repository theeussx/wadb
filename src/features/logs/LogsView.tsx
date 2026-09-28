import { useEffect, useRef, useState } from 'react';
import { asAppError, getBridge } from '../../services/bridge';
import { useApp } from '../../stores/app';
import { Button } from '../../components/ui';
import { ErrorDialog } from '../../components/ConfirmDialog';
import type { AppError } from '../../types';

// Remount on device changes so pending requests cannot affect another device.
export function LogsView({ serial }: { serial: string }) {
  return <DeviceLogs key={serial} serial={serial} />;
}

function DeviceLogs({ serial }: { serial: string }) {
  const t = useApp((s) => s.t);
  const cap = useApp((s) => s.settings.logcatMaxLines);
  const toast = useApp((s) => s.toast);
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [spec, setSpec] = useState('');
  const [search, setSearch] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState<AppError | null>(null);
  const session = useRef<string | null>(null);
  const mounted = useRef(false);
  const receiving = useRef(true);
  const limit = useRef(cap);
  receiving.current = !paused;
  limit.current = cap;

  useEffect(() => {
    mounted.current = true;
    const bridge = getBridge();
    const off = bridge.on('logcat-line', (payload) => {
      const p = payload as { session: string; line: string };
      if (p.session !== session.current || !receiving.current) return;
      setLines((prev) => [...prev, ...p.line.split('\n').filter(Boolean)].slice(-Math.max(1, limit.current)));
    });
    return () => {
      mounted.current = false;
      off();
      if (session.current) void bridge.logcatStop(session.current).catch(() => {});
      session.current = null;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (session.current) {
        await getBridge().logcatStop(session.current);
        session.current = null;
        if (mounted.current) setRunning(false);
      } else {
        const id = await getBridge().logcatStart(serial, spec.trim() || undefined);
        if (!mounted.current) {
          await getBridge().logcatStop(id);
          return;
        }
        session.current = id;
        setPaused(false);
        setRunning(true);
      }
    } catch (e) {
      if (mounted.current) setError(asAppError(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const save = async () => {
    try {
      await getBridge().saveLogFile(path.trim(), lines.join('\n'));
      if (mounted.current) toast({ kind: 'success', title: t('logs.saved'), body: path.trim() });
    } catch (e) {
      if (mounted.current) setError(asAppError(e));
    }
  };

  return (
    <div className="terminal" style={{ flex: 1, minHeight: 0 }}>
      <div className="row wrap" style={{ padding: 12 }}>
        <strong>{t('logs.title')}</strong>
        <input aria-label={t('logs.filter.tag')} placeholder={t('logs.tagPlaceholder')} value={spec} onChange={(e) => setSpec(e.target.value)} disabled={running || busy} />
        <Button onClick={toggle} disabled={busy}>{busy ? t('logs.starting') : t(running ? 'logs.stop' : 'logs.start')}</Button>
        <Button onClick={() => setPaused(!paused)} disabled={!running}>{t(paused ? 'logs.resume' : 'logs.pause')}</Button>
        <Button onClick={() => setLines([])}>{t('logs.clear')}</Button>
        <input aria-label={t('logs.filter.search')} placeholder={t('logs.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="small dim" style={{ padding: '0 12px' }}>{t('logs.limit', { cap })}{paused && ` · ${t('logs.paused.hint')}`}</div>
      <div className="term-body">
        {lines.length === 0 && <p className="dim">{t(running ? 'logs.waiting' : 'logs.empty')}</p>}
        {lines.filter((line) => line.toLowerCase().includes(search.toLowerCase())).map((line, i) => <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{line}</div>)}
      </div>
      <div className="row wrap" style={{ padding: 12 }}>
        <input aria-label={t('logs.save.path')} placeholder={t('logs.save.path')} value={path} onChange={(e) => setPath(e.target.value)} />
        <Button onClick={save} disabled={!path.trim() || !lines.length}>{t('logs.save')}</Button>
      </div>
      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
    </div>
  );
}
