// Global keyboard shortcuts (spec §67).
// Ctrl+Shift+A shell · S screenshot · F files · D devices · L logs

import { useEffect } from 'react';
import { SHORTCUTS } from '../config/app';
import { useApp } from '../stores/app';

function parseCombo(combo: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean } | null {
  const parts = combo.split('+').map((p) => p.trim());
  const key = parts[parts.length - 1]?.toUpperCase();
  if (!key) return null;
  return {
    key,
    ctrl: parts.includes('CTRL'),
    shift: parts.includes('SHIFT'),
    alt: parts.includes('ALT'),
  };
}

export function useShortcuts() {
  const { setNav, setDeviceTab, settings } = useApp();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Do not hijack typing inside inputs.
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) {
        return;
      }
      const combos: Record<string, () => void> = {
        [SHORTCUTS.shell]: () => {
          setNav('devices');
          setDeviceTab('shell');
        },
        [SHORTCUTS.screenshot]: () => {
          setNav('devices');
          setDeviceTab('overview');
          window.dispatchEvent(new CustomEvent('zittodb:screenshot'));
        },
        [SHORTCUTS.files]: () => {
          setNav('devices');
          setDeviceTab('files');
        },
        [SHORTCUTS.devices]: () => setNav('devices'),
        [SHORTCUTS.logs]: () => {
          setNav('devices');
          setDeviceTab('logs');
        },
      };
      for (const [combo, fn] of Object.entries(combos)) {
        const parsed = parseCombo(combo);
        if (!parsed) continue;
        if (
          e.key.toUpperCase() === parsed.key &&
          e.ctrlKey === parsed.ctrl &&
          e.shiftKey === parsed.shift &&
          e.altKey === parsed.alt
        ) {
          e.preventDefault();
          fn();
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setNav, setDeviceTab, settings]);
}
