import { useEffect, useState } from 'react';
import { AppShell } from './app/AppShell';
import { getBridge, asAppError } from './services/bridge';
import { refreshDevices } from './services/deviceService';
import { checkForUpdate, type UpdateInfo } from './services/updateService';
import { applyHtmlClasses, perfTweaks, useApp } from './stores/app';

export default function App() {
  const settings = useApp((s) => s.settings);
  const applySettings = useApp((s) => s.applySettings);
  const setDemo = useApp((s) => s.setDemo);
  const setTools = useApp((s) => s.setTools);
  const toast = useApp((s) => s.toast);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  // Bootstrap: environment, settings, tools, devices.
  useEffect(() => {
    const demo = getBridge().isDemo;
    setDemo(demo);
    if (!demo) {
      getBridge()
        .getSettings()
        .then((s) => applySettings(s))
        .catch(() => applySettings(useApp.getState().settings));
    }
    applyHtmlClasses(useApp.getState().settings);

    getBridge()
      .detectTools()
      .then(setTools)
      .catch(() => setTools([]));

    void refreshDevices();
  }, [applySettings, setDemo, setTools]);

  // Release metadata only; failures are silent so offline use is unaffected.
  useEffect(() => {
    if (getBridge().isDemo) return;
    void checkForUpdate().then(setUpdate).catch(() => undefined);
  }, []);

  // Auto refresh (only when enabled by the user — spec §40: no metrics by default).
  const refreshSecs = settings.autoRefreshSecs;
  const perf = perfTweaks(settings.performanceMode);
  useEffect(() => {
    const ms = refreshSecs ? refreshSecs * 1000 : perf.refreshIntervalMs;
    if (!ms) return;
    const id = setInterval(() => {
      void refreshDevices();
    }, ms);
    return () => clearInterval(id);
  }, [refreshSecs, perf.refreshIntervalMs]);

  // Ctrl+Shift+S (screenshot) dispatches an event; the dashboard listens.
  useEffect(() => {
    const onShot = () => {
      const { selectedSerial, toast } = useApp.getState();
      if (!selectedSerial) {
        toast({ kind: 'info', title: useApp.getState().t('errors.NO_DEVICE') });
        return;
      }
      getBridge()
        .screenshot(selectedSerial, false)
        .then((r) => toast({ kind: 'success', title: useApp.getState().t('dash.screenshot.saved'), body: r.path }))
        .catch((e) => { const error = asAppError(e); toast({ kind: 'error', title: error.code, body: error.details }); });
    };
    window.addEventListener('zittodb:screenshot', onShot);
    return () => window.removeEventListener('zittodb:screenshot', onShot);
  }, [toast]);

  return <AppShell update={update} onDismissUpdate={() => setUpdate(null)} />;
}
