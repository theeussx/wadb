// Settings (spec §29, §30, §39, §40): local-first, persisted, no cloud.

import { useCallback, useEffect, useState } from 'react';
import { getBridge } from '../../services/bridge';
import { act } from '../../services/deviceService';
import { useApp } from '../../stores/app';
import { Button, Spinner } from '../../components/ui';
import { ErrorDialog } from '../../components/ConfirmDialog';
import type { AppError, AppInfo, AppPaths, Settings as SettingsDto, ToolName } from '../../types';

function ToolRow({
  tool,
  value,
  onBrowse,
  onClear,
  busy,
}: {
  tool: ToolName;
  value: string | null;
  onBrowse: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  const t = useApp((s) => s.t);
  return (
    <div className="row">
      <span className="mono small" style={{ width: 70, flex: 'none' }}>
        {tool}
      </span>
      <input
        type="text"
        className="mono"
        value={value ?? ''}
        placeholder={t('settings.tools.manualHint', { tool })}
        onChange={(e) => {
          const v = e.target.value;
          void act(() => getBridge().setToolPath(tool, v || null));
        }}
      />
      <Button size="small" variant="ghost" onClick={onBrowse} disabled={busy}>
        {t('settings.tools.browse')}
      </Button>
      <Button size="small" variant="ghost" onClick={onClear} disabled={busy || !value}>
        {t('common.clear')}
      </Button>
    </div>
  );
}

export function SettingsView() {
  const t = useApp((s) => s.t);
  const settings = useApp((s) => s.settings);
  const refreshTools = useApp((s) => s.refreshTools);
  const tools = useApp((s) => s.tools);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appPaths, setAppPaths] = useState<AppPaths | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  const persist = useCallback(
    async (patch: Partial<SettingsDto>) => {
      const next = { ...useApp.getState().settings, ...patch };
      const r = await act(() => getBridge().saveSettings(next));
      if (r.ok) {
        useApp.getState().applySettings(r.value);
      } else {
        setError(r.error);
      }
    },
    [],
  );

  useEffect(() => {
    void getBridge()
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => {});
    void getBridge()
      .getAppPaths()
      .then(setAppPaths)
      .catch(() => {});
  }, []);

  const browseTool = async (tool: 'adb' | 'scrcpy' | 'fastboot') => {
    setBusy(true);
    const path = await getBridge().pickPath('file');
    setBusy(false);
    if (!path) return;
    const r = await act(() => getBridge().setToolPath(tool, path), undefined);
    if (r.ok) void refreshTools();
    else setError(r.error);
  };

  const pickDir = async (key: 'screenshotDir' | 'recordingDir' | 'downloadDir') => {
    const dir = await getBridge().pickPath('directory');
    if (!dir) return;
    await persist({ [key]: dir });
  };

  const status = (n: string) => tools.find((x) => x.name === n);

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>{t('settings.appearance')}</h3>
        <label className="field">
          {t('settings.theme')}
          <select
            value={settings.theme}
            onChange={(e) => void persist({ theme: e.target.value as SettingsDto['theme'] })}
          >
            <option value="dark">{t('settings.theme.dark')}</option>
            <option value="light">{t('settings.theme.light')}</option>
            <option value="system">{t('settings.theme.system')}</option>
          </select>
        </label>
        <label className="field mt-12">
          {t('settings.language')}
          <select
            value={settings.language}
            onChange={(e) => void persist({ language: e.target.value as SettingsDto['language'] })}
          >
            <option value="auto">{t('settings.language.auto')}</option>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en-US">English (US)</option>
          </select>
        </label>
        <label className="field mt-12">
          {t('settings.perfMode')}
          <select
            value={settings.performanceMode}
            onChange={(e) => void persist({ performanceMode: e.target.value as SettingsDto['performanceMode'] })}
          >
            <option value="normal">{t('settings.perf.normal')}</option>
            <option value="low">{t('settings.perf.low')}</option>
            <option value="ultra">{t('settings.perf.ultra')}</option>
          </select>
          <span className="dim small">{t('settings.perf.hint')}</span>
        </label>
      </div>

      <div className="card">
        <h3>{t('settings.tools')}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ToolRow
            tool="adb"
            value={settings.adbPath}
            onBrowse={() => void browseTool('adb')}
            onClear={() => void persist({ adbPath: null })}
            busy={busy}
          />
          <div className="dim small" style={{ margin: '-4px 0 0 70px' }}>
            {status('adb')?.found
              ? `✓ ${status('adb')?.path} — ${status('adb')?.version ?? ''}`
              : `✗ ${t('tools.missing', { tool: 'adb' })}`}
          </div>
          <ToolRow
            tool="scrcpy"
            value={settings.scrcpyPath}
            onBrowse={() => void browseTool('scrcpy')}
            onClear={() => void persist({ scrcpyPath: null })}
            busy={busy}
          />
          <div className="dim small" style={{ margin: '-4px 0 0 70px' }}>
            {status('scrcpy')?.found
              ? `✓ ${status('scrcpy')?.path} — ${status('scrcpy')?.version ?? ''}`
              : `✗ ${t('tools.missing', { tool: 'scrcpy' })}`}
          </div>
          <ToolRow
            tool="fastboot"
            value={settings.fastbootPath}
            onBrowse={() => void browseTool('fastboot')}
            onClear={() => void persist({ fastbootPath: null })}
            busy={busy}
          />
          <div className="dim small" style={{ margin: '-4px 0 0 70px' }}>
            {status('fastboot')?.found
              ? `✓ ${status('fastboot')?.path} — ${status('fastboot')?.version ?? ''}`
              : `✗ ${t('tools.missing', { tool: 'fastboot' })}`}
          </div>
        </div>
        <div className="dim small mt-8">{t('settings.tools.hint')}</div>
      </div>

      <div className="card">
        <h3>{t('settings.directories')}</h3>
        <label className="field">
          {t('settings.screenshotDir')}
          <div className="row">
            <input
              type="text"
              className="mono"
              value={settings.screenshotDir ?? ''}
              placeholder="~/Pictures/ADB Studio"
              onChange={(e) => void persist({ screenshotDir: e.target.value || null })}
            />
            <Button size="small" variant="ghost" onClick={() => void pickDir('screenshotDir')}>
              {t('settings.tools.browse')}
            </Button>
          </div>
        </label>
        <label className="field mt-12">
          {t('settings.recordingDir')}
          <div className="row">
            <input
              type="text"
              className="mono"
              value={settings.recordingDir ?? ''}
              placeholder="~/Videos/ADB Studio"
              onChange={(e) => void persist({ recordingDir: e.target.value || null })}
            />
            <Button size="small" variant="ghost" onClick={() => void pickDir('recordingDir')}>
              {t('settings.tools.browse')}
            </Button>
          </div>
        </label>
        <label className="field mt-12">
          {t('settings.downloadDir')}
          <div className="row">
            <input
              type="text"
              className="mono"
              value={settings.downloadDir ?? ''}
              placeholder="~/Downloads/ADB Studio"
              onChange={(e) => void persist({ downloadDir: e.target.value || null })}
            />
            <Button size="small" variant="ghost" onClick={() => void pickDir('downloadDir')}>
              {t('settings.tools.browse')}
            </Button>
          </div>
        </label>
      </div>

      <div className="card">
        <h3>{t('settings.behavior')}</h3>
        <label className="field">
          {t('settings.autoRefresh')}
          <select
            value={settings.autoRefreshSecs == null ? '' : String(settings.autoRefreshSecs)}
            onChange={(e) =>
              void persist({ autoRefreshSecs: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">{t('settings.autoRefresh.off')}</option>
            <option value="30">30 {t('settings.seconds')}</option>
            <option value="60">60 {t('settings.seconds')}</option>
            <option value="300">5 {t('settings.minutes')}</option>
          </select>
        </label>
        <label className="field mt-12">
          {t('settings.logcatLines')}
          <input
            type="number"
            min={500}
            max={50000}
            step={500}
            value={settings.logcatMaxLines}
            onChange={(e) => void persist({ logcatMaxLines: Math.max(500, Number(e.target.value) || 5000) })}
          />
        </label>
        <label className="check mt-12">
          <input
            type="checkbox"
            checked={settings.auditEnabled}
            onChange={(e) => void persist({ auditEnabled: e.target.checked })}
          />
          {t('settings.audit')}
        </label>
        <div className="dim small mt-8">{t('settings.privacy')}</div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h3>{t('settings.about')}</h3>
        {appInfo === null ? (
          <Spinner />
        ) : (
          <div className="grid cols-4">
            <div className="kv">
              <span className="k">{t('settings.version')}</span>
              <span className="v">{appInfo.version}</span>
            </div>
            <div className="kv">
              <span className="k">Tauri</span>
              <span className="v mono">{appInfo.tauriVersion}</span>
            </div>
            <div className="kv">
              <span className="k">{t('settings.platform')}</span>
              <span className="v">{appInfo.platform}</span>
            </div>
            {appPaths && (
              <>
                <div className="kv">
                  <span className="k">{t('settings.logFile')}</span>
                  <span className="v mono" title={appPaths.logFile}>
                    {appPaths.logFile}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">{t('settings.auditFile')}</span>
                  <span className="v mono" title={appPaths.auditFile}>
                    {appPaths.auditFile}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">{t('settings.configDir')}</span>
                  <span className="v mono" title={appPaths.configDir}>
                    {appPaths.configDir}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}
    </div>
  );
}
