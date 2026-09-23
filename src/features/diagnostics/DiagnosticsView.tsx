// Diagnostics (spec §13, §27): read-only info panels via allowlisted operations.

import { useCallback, useState } from 'react';
import { getBridge } from '../../services/bridge';
import { act } from '../../services/deviceService';
import { useApp } from '../../stores/app';
import { Button, Spinner, formatMb } from '../../components/ui';
import { ErrorDialog } from '../../components/ConfirmDialog';
import type { AppError, DeviceOperation, NetworkInfo, OpResult } from '../../types';

interface Diag {
  id: string;
  icon: string;
  op: DeviceOperation;
}

const DIAGS: Diag[] = [
  { id: 'props', icon: '🏷', op: { op: 'get_props' } },
  { id: 'memory', icon: '🧠', op: { op: 'get_meminfo' } },
  { id: 'disk', icon: '💾', op: { op: 'get_disk_usage', path: '/data' } },
  { id: 'battery', icon: '🔋', op: { op: 'get_battery' } },
  { id: 'network', icon: '📶', op: { op: 'get_network' } },
];

export function DiagnosticsView({ serial }: { serial: string }) {
  const t = useApp((s) => s.t);
  const [results, setResults] = useState<Record<string, OpResult | 'loading'>>({});
  const [error, setError] = useState<AppError | null>(null);

  const run = useCallback(
    async (id: string, op: DeviceOperation) => {
      setResults((prev) => ({ ...prev, [id]: 'loading' }));
      const r = await act(() => getBridge().executeOperation(serial, op));
      setResults((prev) => {
        const next = { ...prev };
        if (r.ok) next[id] = r.value;
        else delete next[id];
        return next;
      });
      if (!r.ok) setError(r.error);
    },
    [serial],
  );

  const runAll = () => {
    for (const d of DIAGS) void run(d.id, d.op);
  };

  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="action-tiles" style={{ flex: 1 }}>
          {DIAGS.map((d) => (
            <button
              key={d.id}
              className="action-tile"
              onClick={() => void run(d.id, d.op)}
              disabled={results[d.id] === 'loading'}
            >
              <span className="t-icon" aria-hidden>
                {d.icon}
              </span>
              {t(`diag.${d.id}`)}
              <span className="t-sub">{results[d.id] === 'loading' ? t('common.loading') : t('diag.run')}</span>
            </button>
          ))}
        </div>
      </div>
      <Button variant="primary" onClick={runAll}>
        {t('diag.runAll')}
      </Button>

      <div className="grid cols-2 mt-12">
        {DIAGS.map((d) => {
          const r = results[d.id];
          return (
            <div key={d.id} className="card">
              <h3>{t(`diag.${d.id}`)}</h3>
              {r === 'loading' ? (
                <Spinner />
              ) : r ? (
                <pre className="cmd-box" style={{ maxHeight: 260, overflow: 'auto' }}>
                  {r.stdout || r.stderr || '—'}
                </pre>
              ) : (
                <div className="dim small">{t('diag.idle')}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card mt-12">
        <h3>{t('diag.netInfo')}</h3>
        <NetInfo serial={serial} />
      </div>

      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
    </div>
  );
}

function NetInfo({ serial }: { serial: string }) {
  const t = useApp((s) => s.t);
  const [net, setNet] = useState<NetworkInfo | null>(null);
  const [storage, setStorage] = useState<{ totalMb: number; usedMb: number; availMb: number } | null>(null);

  const load = useCallback(async () => {
    const [n, st] = await Promise.all([
      act(() => getBridge().getNetworkInfo(serial)),
      act(() => getBridge().getStorage(serial)),
    ]);
    if (n.ok) setNet(n.value);
    if (st.ok) setStorage(st.value);
  }, [serial]);

  return (
    <>
      <div className="row">
        <Button size="small" onClick={load}>
          {t('nav.refresh')}
        </Button>
      </div>
      <div className="grid cols-3 mt-8">
        <div className="kv">
          <span className="k">IP</span>
          <span className="v mono">{net?.interfaces?.[0]?.ip ?? '—'}</span>
        </div>
        <div className="kv">
          <span className="k">Gateway</span>
          <span className="v mono">{net?.gateway ?? '—'}</span>
        </div>
        <div className="kv">
          <span className="k">DNS</span>
          <span className="v mono">{net?.dns?.join(', ') ?? '—'}</span>
        </div>
        {storage && (
          <>
            <div className="kv">
              <span className="k">{t('dash.used')}</span>
              <span className="v">{formatMb(storage.usedMb)}</span>
            </div>
            <div className="kv">
              <span className="k">{t('dash.free')}</span>
              <span className="v">{formatMb(storage.availMb)}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
