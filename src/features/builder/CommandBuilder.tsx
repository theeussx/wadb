// Command Builder (spec §16, §35): form per allowlisted op, preview, single execution.

import { useMemo, useState } from 'react';
import { DEVICE_ROOT } from '../../config/app';
import { getBridge } from '../../services/bridge';
import { act } from '../../services/deviceService';
import { useApp } from '../../stores/app';
import { Button } from '../../components/ui';
import { ErrorDialog } from '../../components/ConfirmDialog';
import type { AppError, DeviceOperation, OpResult } from '../../types';

type OpId =
  | 'get_props'
  | 'get_kernel'
  | 'get_meminfo'
  | 'get_disk_usage'
  | 'get_battery'
  | 'get_network'
  | 'get_resolv'
  | 'get_mac'
  | 'list_packages'
  | 'package_path'
  | 'package_dump'
  | 'open_package'
  | 'enable_package'
  | 'disable_package'
  | 'uninstall_for_user'
  | 'clear_package_data'
  | 'list_dir'
  | 'mkdir'
  | 'rename'
  | 'delete'
  | 'reboot';

const OPS: { id: OpId; group: string; labelKey: string }[] = [
  { id: 'get_props', group: 'devices.state.0', labelKey: 'builder.ops.get_props' },
  { id: 'get_kernel', group: 'devices.state.0', labelKey: 'builder.ops.get_kernel' },
  { id: 'get_meminfo', group: 'devices.state.0', labelKey: 'builder.ops.get_meminfo' },
  { id: 'get_disk_usage', group: 'devices.state.0', labelKey: 'builder.ops.get_disk_usage' },
  { id: 'get_battery', group: 'devices.state.0', labelKey: 'builder.ops.get_battery' },
  { id: 'get_network', group: 'devices.state.0', labelKey: 'builder.ops.get_network' },
  { id: 'get_resolv', group: 'devices.state.0', labelKey: 'builder.ops.get_resolv' },
  { id: 'get_mac', group: 'devices.state.0', labelKey: 'builder.ops.get_mac' },
  { id: 'list_packages', group: 'dash.apps', labelKey: 'builder.ops.list_packages' },
  { id: 'package_path', group: 'dash.apps', labelKey: 'builder.ops.package_path' },
  { id: 'package_dump', group: 'dash.apps', labelKey: 'builder.ops.package_dump' },
  { id: 'open_package', group: 'dash.apps', labelKey: 'builder.ops.open_package' },
  { id: 'enable_package', group: 'dash.apps', labelKey: 'builder.ops.enable_package' },
  { id: 'disable_package', group: 'dash.apps', labelKey: 'builder.ops.disable_package' },
  { id: 'uninstall_for_user', group: 'dash.apps', labelKey: 'builder.ops.uninstall_for_user' },
  { id: 'clear_package_data', group: 'dash.apps', labelKey: 'builder.ops.clear_package_data' },
  { id: 'list_dir', group: 'dash.files', labelKey: 'builder.ops.list_dir' },
  { id: 'mkdir', group: 'dash.files', labelKey: 'builder.ops.mkdir' },
  { id: 'rename', group: 'dash.files', labelKey: 'builder.ops.rename' },
  { id: 'delete', group: 'dash.files', labelKey: 'builder.ops.delete' },
  { id: 'reboot', group: 'nav.fastboot', labelKey: 'builder.ops.reboot' },
];

export function CommandBuilder() {
  const t = useApp((s) => s.t);
  const devices = useApp((s) => s.devices);
  const selectDevice = useApp((s) => s.selectDevice);
  const setNav = useApp((s) => s.setNav);

  const [opId, setOpId] = useState<OpId>('get_props');
  const [serial, setSerial] = useState<string>('');
  const [fields, setFields] = useState<Record<string, string>>({
    path: DEVICE_ROOT,
    pkg: '',
    iface: 'wlan0',
    from: '',
    to: '',
    target: 'system',
  });
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<OpResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [confirmWord, setConfirmWord] = useState<'' | 'APAGAR' | 'REMOVER' | 'REINICIAR'>('');

  const op = useMemo<DeviceOperation>(() => {
    const f = fields;
    switch (opId) {
      case 'get_disk_usage':
        return { op: 'get_disk_usage', path: f.path || DEVICE_ROOT };
      case 'get_mac':
        return { op: 'get_mac', iface: f.iface || 'wlan0' };
      case 'list_packages':
        return { op: 'list_packages', thirdParty: false, disabled: false };
      case 'package_path':
        return { op: 'package_path', pkg: f.pkg };
      case 'package_dump':
        return { op: 'package_dump', pkg: f.pkg };
      case 'open_package':
        return { op: 'open_package', pkg: f.pkg };
      case 'enable_package':
        return { op: 'enable_package', pkg: f.pkg };
      case 'disable_package':
        return { op: 'disable_package', pkg: f.pkg, user: 0 };
      case 'uninstall_for_user':
        return { op: 'uninstall_for_user', pkg: f.pkg, user: 0 };
      case 'clear_package_data':
        return { op: 'clear_package_data', pkg: f.pkg };
      case 'list_dir':
        return { op: 'list_dir', path: f.path || DEVICE_ROOT };
      case 'mkdir':
        return { op: 'mkdir', path: f.path || DEVICE_ROOT };
      case 'rename':
        return { op: 'rename', from: f.from, to: f.to };
      case 'delete':
        return { op: 'delete', path: f.path || DEVICE_ROOT };
      case 'reboot':
        return { op: 'reboot', target: (f.target as 'system' | 'bootloader' | 'recovery') || 'system' };
      default:
        return { op: opId } as DeviceOperation;
    }
  }, [opId, fields]);

  const needsConfirm: '' | 'APAGAR' | 'REMOVER' | 'REINICIAR' =
    opId === 'delete' || opId === 'clear_package_data'
      ? 'APAGAR'
      : opId === 'uninstall_for_user'
        ? 'REMOVER'
        : opId === 'reboot'
          ? 'REINICIAR'
          : '';

  const refreshPreview = async () => {
    setResult(null);
    const p = await getBridge().describeOperation(op, serial || null);
    setPreview(p);
  };

  const execute = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const confirmation = needsConfirm ? confirmWord : undefined;
    const r = await act(() => getBridge().executeOperation(serial || null, op, confirmation));
    if (r.ok) setResult(r.value);
    else setError(r.error);
    setBusy(false);
  };

  const goDashboard = () => {
    if (serial) {
      selectDevice(serial);
      setNav('devices');
    }
  };

  const groups = Array.from(new Set(OPS.map((o) => o.group)));
  const setField = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>{t('builder.title')}</h3>
        <label className="field">
          {t('builder.device')}
          <select
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            onBlur={refreshPreview}
          >
            <option value="">{t('builder.noDevice')}</option>
            {devices
              .filter((d) => d.state === 'connected')
              .map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.model ?? d.serial} — {d.serial}
                </option>
              ))}
          </select>
        </label>

        <label className="field mt-12">
          {t('builder.operation')}
          <select value={opId} onChange={(e) => setOpId(e.target.value as OpId)}>
            {groups.map((g) => (
              <optgroup key={g} label={t(g)}>
                {OPS.filter((o) => o.group === g).map((o) => (
                  <option key={o.id} value={o.id}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {['get_disk_usage', 'list_dir', 'mkdir', 'delete'].includes(opId) && (
          <label className="field mt-12">
            {t('builder.path')}
            <input type="text" value={fields.path} onChange={(e) => setField('path', e.target.value)} className="mono" />
          </label>
        )}
        {['package_path', 'package_dump', 'open_package', 'enable_package', 'disable_package', 'uninstall_for_user', 'clear_package_data'].includes(opId) && (
          <label className="field mt-12">
            {t('builder.package')}
            <input type="text" value={fields.pkg} onChange={(e) => setField('pkg', e.target.value)} className="mono" placeholder="com.example.app" />
          </label>
        )}
        {opId === 'get_mac' && (
          <label className="field mt-12">
            {t('builder.iface')}
            <input type="text" value={fields.iface} onChange={(e) => setField('iface', e.target.value)} className="mono" />
          </label>
        )}
        {opId === 'rename' && (
          <div className="grid cols-2 mt-12">
            <label className="field">
              {t('builder.from')}
              <input type="text" value={fields.from} onChange={(e) => setField('from', e.target.value)} className="mono" />
            </label>
            <label className="field">
              {t('builder.to')}
              <input type="text" value={fields.to} onChange={(e) => setField('to', e.target.value)} className="mono" />
            </label>
          </div>
        )}
        {opId === 'reboot' && (
          <label className="field mt-12">
            {t('builder.rebootTarget')}
            <select value={fields.target} onChange={(e) => setField('target', e.target.value)}>
              <option value="system">{t('builder.reboot.system')}</option>
              <option value="bootloader">{t('builder.reboot.bootloader')}</option>
              <option value="recovery">{t('builder.reboot.recovery')}</option>
            </select>
          </label>
        )}

        {needsConfirm && (
          <label className="field mt-12">
            {t('builder.confirmField', { word: needsConfirm })}
            <input
              type="text"
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value as '' | 'APAGAR' | 'REMOVER' | 'REINICIAR')}
              placeholder={needsConfirm}
            />
          </label>
        )}

        <div className="row mt-16">
          <Button
            variant="primary"
            onClick={execute}
            disabled={busy || !serial || (needsConfirm !== '' && confirmWord !== needsConfirm)}
          >
            {t('builder.execute')}
          </Button>
          <Button variant="ghost" onClick={goDashboard} disabled={!serial}>
            {t('builder.openDashboard')}
          </Button>
        </div>
        {needsConfirm && confirmWord !== needsConfirm && (
          <div className="dim small mt-8">{t('builder.confirmRequired', { word: needsConfirm })}</div>
        )}
      </div>

      <div className="card">
        <h3>{t('builder.preview')}</h3>
        <div className="row">
          <Button size="small" variant="ghost" onClick={refreshPreview}>
            {t('builder.refreshPreview')}
          </Button>
        </div>
        <pre className="cmd-box mt-12" style={{ minHeight: 80 }}>
          {preview || '—'}
        </pre>
        {result && (
          <>
            <h3 className="mt-12">{t('builder.result')}</h3>
            <pre className="cmd-box">
              {result.stdout || result.stderr || t('builder.emptyOutput')}
              {result.code != null && `\n[${result.code}]`}
            </pre>
          </>
        )}
        <div className="dim small mt-12">{t('builder.hint')}</div>
        {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
      </div>
    </div>
  );
}
