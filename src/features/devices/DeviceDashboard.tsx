// Device dashboard (spec §13): info on demand + action tiles + sub-panels.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBridge } from '../../services/bridge';
import { act } from '../../services/deviceService';
import { useApp, type DeviceTab } from '../../stores/app';
import { Badge, Button, Spinner, formatMb } from '../../components/ui';
import { ErrorDialog } from '../../components/ConfirmDialog';
import { ScreenPanel } from '../screen/ScreenPanel';
import { AppsView } from '../apps/AppsView';
import { FilesView } from '../files/FilesView';
import { ShellView } from '../shell/ShellView';
import { LogsView } from '../logs/LogsView';
import { DiagnosticsView } from '../diagnostics/DiagnosticsView';
import { DebloatView } from '../debloat/DebloatView';
import type { AppError, BatteryInfo, DeviceInfo, DiskUsage } from '../../types';

function KV({ k, v, mono }: { k: string; v: string | number | null | undefined; mono?: boolean }) {
  return (
    <div className="kv" title={v == null ? '' : String(v)}>
      <span className="k">{k}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{v == null || v === '' ? '—' : v}</span>
    </div>
  );
}

function OverviewPanel({ serial }: { serial: string }) {
  const t = useApp((s) => s.t);
  const toast = useApp((s) => s.toast);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [storage, setStorage] = useState<DiskUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [shotOpen, setShotOpen] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [i, b, st] = await Promise.all([
      act(() => getBridge().getDeviceInfo(serial)),
      act(() => getBridge().getBattery(serial)),
      act(() => getBridge().getStorage(serial)),
    ]);
    if (!mounted.current) return;
    if (i.ok) setInfo(i.value);
    else setError(i.error);
    if (b.ok) setBattery(b.value);
    if (st.ok) setStorage(st.value);
    setLoading(false);
  }, [serial]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const screenshot = async (force: boolean) => {
    const r = await act(
      () => getBridge().screenshot(serial, force),
      { title: t('dash.screenshot.saved'), body: undefined },
    );
    if (!r.ok) {
      if (r.error.code === 'FILE_EXISTS' && !force) {
        setShotOpen(true);
      } else {
        setError(r.error);
      }
    } else {
      toast({ kind: 'success', title: t('dash.screenshot.saved'), body: r.value.path });
      setShotOpen(false);
    }
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <div className="card">
        <h3>{t('dash.overview')}</h3>
        {loading && !info ? (
          <Spinner label={t('dash.loading')} />
        ) : (
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KV k={t('dash.model')} v={info?.model} />
            <KV k={t('dash.manufacturer')} v={info?.manufacturer} />
            <KV k="Android" v={info?.androidVersion} />
            <KV k="SDK" v={info?.sdkVersion} />
            <KV k={t('dash.kernel')} v={info?.kernel} mono />
            <KV k={t('dash.build')} v={info?.buildDisplay} mono />
            <KV k={t('dash.platform')} v={info?.boardPlatform} mono />
            <KV k={t('dash.abi')} v={info?.cpuAbis} mono />
            <KV k={t('dash.securityPatch')} v={info?.securityPatch} mono />
            <KV k={t('dash.ram')} v={info?.totalRamMb != null ? formatMb(info.totalRamMb) : null} />
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t('dash.battery')}</h3>
        {battery ? (
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KV
              k={t('dash.battery')}
              v={battery.level != null ? `${battery.level}%` : null}
            />
            <KV
              k={t('dash.temperature')}
              v={battery.temperatureC != null ? `${Math.round(battery.temperatureC)}°C` : null}
            />
            <KV k={t('dash.health')} v={battery.health} />
            <KV
              k={t('dash.charging')}
              v={battery.plugged ? (battery.plugged === '1' ? 'USB' : battery.plugged === '2' ? 'AC' : battery.plugged) : null}
            />
            <KV k="Voltagem" v={battery.voltageMv != null ? `${battery.voltageMv} mV` : null} />
            <KV k="Tecnologia" v={battery.technology} />
          </div>
        ) : (
          <Spinner />
        )}
      </div>

      <div className="card">
        <h3>{t('dash.storage')}</h3>
        {storage ? (
          <>
            <div className="kv">
              <span className="k">{t('dash.internal')}</span>
              <span className="v">{formatMb(storage.totalMb)}</span>
            </div>
            <div className="progress mt-8" role="progressbar" aria-label={t('dash.storage')}>
              <div
                className="bar"
                style={{ width: storage.totalMb > 0 ? `${(storage.usedMb / storage.totalMb) * 100}%` : 0 }}
              />
            </div>
            <div className="grid mt-8" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <KV k={t('dash.used')} v={formatMb(storage.usedMb)} />
              <KV k={t('dash.free')} v={formatMb(storage.availMb)} />
            </div>
          </>
        ) : (
          <Spinner />
        )}
        <div className="row mt-12">
          <Button variant="primary" size="small" onClick={() => screenshot(false)}>
            📷 {t('dash.screenshot')}
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={async () => {
              const r = await act(() => getBridge().copyImageToClipboard(''));
              if (r.ok) toast({ kind: 'success', title: t('dash.screenshot.copied') });
              else setError(r.error);
            }}
          >
            {t('dash.screenshot.copied')}
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={async () => {
              const dir = (await getBridge().getAppPaths());
              void dir;
              toast({ kind: 'info', title: t('dash.screenshot.openFolder'), body: '~/Pictures/ADB Studio' });
            }}
          >
            {t('dash.screenshot.openFolder')}
          </Button>
        </div>
      </div>

      <div className="card">
        <h3>&nbsp;</h3>
        <p className="small dim" style={{ margin: 0 }}>
          {t('dash.overview.hint')}
        </p>
        <div className="row mt-12">
          <Button
            size="small"
            onClick={load}
            disabled={loading}
          >
            {t('nav.refresh')}
          </Button>
          <Badge tone="info">
            <span className="mono">{serial}</span>
          </Badge>
        </div>
      </div>

      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}

      {shotOpen && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{t('dash.screenshot.existing')}</h2>
            <div className="m-actions">
              <Button variant="ghost" onClick={() => setShotOpen(false)}>
                {t('common.no')}
              </Button>
              <Button variant="primary" onClick={() => screenshot(true)}>
                {t('common.yes')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS: { id: DeviceTab; key: string; icon: string }[] = [
  { id: 'overview', key: 'dash.overview', icon: '▦' },
  { id: 'screen', key: 'dash.screen', icon: '🖥' },
  { id: 'apps', key: 'dash.apps', icon: '⬢' },
  { id: 'files', key: 'dash.files', icon: '🗀' },
  { id: 'shell', key: 'dash.shell', icon: '>_' },
  { id: 'logs', key: 'dash.logs', icon: '≡' },
  { id: 'diagnostics', key: 'dash.diagnostics', icon: '✚' },
  { id: 'debloat', key: 'dash.debloat', icon: '✂' },
];

export function DeviceDashboard() {
  const t = useApp((s) => s.t);
  const devices = useApp((s) => s.devices);
  const serial = useApp((s) => s.selectedSerial)!;
  const tab = useApp((s) => s.deviceTab);
  const setTab = useApp((s) => s.setDeviceTab);
  const selectDevice = useApp((s) => s.selectDevice);

  const device = devices.find((d) => d.serial === serial);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <div className="brand-logo" aria-hidden style={{ width: 34, height: 34 }}>
          {device?.connection === 'emulator' ? '🖥' : device?.connection === 'wifi' ? '📶' : '📱'}
        </div>
        <div>
          <div style={{ fontWeight: 650, fontSize: 14 }}>
            {device?.model ?? '—'} <span className="dim mono small">· {serial}</span>
          </div>
          {device?.model && <div className="dim small">Android {device.model.split(' ')[0]}</div>}
        </div>
        <div className="spacer" />
        <Button size="small" variant="ghost" onClick={() => selectDevice(null)}>
          ← {t('nav.devices')}
        </Button>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            className={`tab ${tab === x.id ? 'active' : ''}`}
            onClick={() => setTab(x.id)}
          >
            <span aria-hidden style={{ marginRight: 6 }}>
              {x.icon}
            </span>
            {t(x.key)}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'overview' && <OverviewPanel serial={serial} />}
        {tab === 'screen' && <ScreenPanel serial={serial} />}
        {tab === 'apps' && <AppsView serial={serial} />}
        {tab === 'files' && <FilesView serial={serial} />}
        {tab === 'shell' && <ShellView serial={serial} />}
        {tab === 'logs' && <LogsView serial={serial} />}
        {tab === 'diagnostics' && <DiagnosticsView serial={serial} />}
        {tab === 'debloat' && <DebloatView serial={serial} />}
      </div>
    </div>
  );
}
