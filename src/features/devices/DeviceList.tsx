// Device Manager (spec §10–11): discovery, states, selection, Wi-Fi connect.

import { useState } from 'react';
import { getBridge, asAppError } from '../../services/bridge';
import { refreshDevices } from '../../services/deviceService';
import { useApp, stateLabel } from '../../stores/app';
import { Badge, Button, EmptyState, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { ErrorDialog } from '../../components/ConfirmDialog';
import type { AppError, Device } from '../../types';

function DeviceCard({ device }: { device: Device }) {
  const t = useApp((s) => s.t);
  const selected = useApp((s) => s.selectedSerial) === device.serial;
  const selectDevice = useApp((s) => s.selectDevice);
  const setDevices = useApp((s) => s.setDevices);
  const toast = useApp((s) => s.toast);
  const [error, setError] = useState<AppError | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const icon =
    device.connection === 'emulator' ? '🖥' : device.connection === 'wifi' ? '📶' : '📱';

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const [host, port] = device.serial.split(':');
      const msg = await getBridge().adbDisconnect(host, Number(port));
      toast({ kind: 'info', title: msg });
      const list = await getBridge().listDevices();
      setDevices(list);
    } catch (e) {
      setError(asAppError(e));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className={`device-card ${selected ? 'selected' : ''}`}>
      <div className="d-head">
        <div className="d-icon" aria-hidden>
          {icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="d-name">{device.model ?? device.serial}</div>
          <div className="d-serial" title={device.serial}>
            {device.serial}
          </div>
        </div>
        <Badge tone={device.state === 'connected' ? 'ok' : device.state === 'unauthorized' ? 'warn' : 'default'}>
          <span className={`state-dot ${device.state}`} aria-hidden />
          {stateLabel(device.state)}
        </Badge>
      </div>

      <div className="row small">
        <span className="muted">
          {t(`devices.conn.${device.connection}`)}
          {device.model && (
            <>
              {' · '}
              {t('devices.android')}
            </>
          )}
        </span>
        <div className="spacer" />
        {device.state === 'connected' && (
          <Button size="small" variant={selected ? 'primary' : 'default'} onClick={() => selectDevice(device.serial)}>
            {selected ? t('devices.selected') : t('devices.select')}
          </Button>
        )}
      </div>

      {device.state === 'unauthorized' && <div className="d-hint">{t('devices.unauthorized.hint')}</div>}
      {device.state === 'offline' && <div className="d-hint">{t('devices.offline.hint')}</div>}

      {device.connection === 'wifi' && device.state === 'connected' && (
        <div className="row">
          <Button size="small" variant="ghost" onClick={disconnect} disabled={disconnecting}>
            {t('devices.disconnect')}
          </Button>
        </div>
      )}

      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
    </div>
  );
}

function WifiConnectModal({ onClose }: { onClose: () => void }) {
  const t = useApp((s) => s.t);
  const setDevices = useApp((s) => s.setDevices);
  const toast = useApp((s) => s.toast);
  const [host, setHost] = useState('192.168.1.');
  const [port, setPort] = useState('5555');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const connect = async () => {
    setBusy(true);
    try {
      const msg = await getBridge().adbConnect(host.trim(), Number(port) || 5555);
      if (msg.toLowerCase().startsWith('failed')) {
        toast({ kind: 'error', title: msg });
      } else {
        toast({ kind: 'success', title: msg });
        const list = await getBridge().listDevices();
        setDevices(list);
        onClose();
      }
    } catch (e) {
      setError(asAppError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('wifi.title')} onClose={onClose}>
      <div className="m-body">
        <div className="small muted">{t('wifi.hint')}</div>
        <div className="grid cols-2">
          <label className="field">
            {t('wifi.ip')}
            <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.100" />
          </label>
          <label className="field">
            {t('wifi.port')}
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} min={1} max={65535} />
          </label>
        </div>
        {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
      </div>
      <div className="m-actions">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={connect} disabled={busy || !host.trim()}>
          {busy ? t('wifi.connecting') : t('wifi.connect')}
        </Button>
      </div>
    </Modal>
  );
}

export function DeviceList() {
  const t = useApp((s) => s.t);
  const devices = useApp((s) => s.devices);
  const loading = useApp((s) => s.devicesLoading);
  const [wifiOpen, setWifiOpen] = useState(false);

  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Button onClick={() => void refreshDevices()}>
          {loading ? t('nav.refreshing') : t('nav.refresh')}
        </Button>
        <Button variant="ghost" onClick={() => setWifiOpen(true)}>
          {t('nav.connectWifi')}
        </Button>
        <div className="spacer" />
        <span className="dim small">{devices.length > 0 ? `${devices.length} ▣` : ''}</span>
      </div>

      {loading && devices.length === 0 ? (
        <Spinner />
      ) : devices.length === 0 ? (
        <EmptyState
          icon="▢"
          title={t('devices.empty')}
          hint={t('devices.empty.hint')}
        />
      ) : (
        <div className="device-grid">
          {devices.map((d) => (
            <DeviceCard key={d.serial} device={d} />
          ))}
        </div>
      )}

      {wifiOpen && <WifiConnectModal onClose={() => setWifiOpen(false)} />}
    </div>
  );
}
