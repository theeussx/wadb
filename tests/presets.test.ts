import { describe, expect, it } from 'vitest';
import {
  BITRATE_OPTIONS,
  DEVICE_ROOT,
  FPS_OPTIONS,
  LOGCAT_LEVELS,
  ORIENTATIONS,
  SCRCPY_PRESETS,
  SHORTCUTS,
  SIZE_OPTIONS,
} from '../src/config/app';

describe('scrcpy presets (spec §14: presets only fill gaps; low = 720p/30/2M)', () => {
  it('low preset targets weak computers', () => {
    const p = SCRCPY_PRESETS.low;
    expect(p.maxSize).toBe(1280); // 720p-class
    expect(p.maxFps).toBe(30);
    expect(p.bitrate).toBe('2M');
  });

  it('high preset is unrestricted quality', () => {
    const p = SCRCPY_PRESETS.high;
    expect(p.maxSize).toBeNull(); // native
    expect(p.maxFps).toBe(120);
    expect(p.bitrate).toBe('8M');
  });

  it('custom leaves everything to the user', () => {
    const p = SCRCPY_PRESETS.custom;
    expect(p.maxSize).toBeNull();
    expect(p.maxFps).toBeNull();
    expect(p.bitrate).toBeNull();
  });

  it('bitrates and sizes are plausible', () => {
    expect(BITRATE_OPTIONS).toContain('2M');
    expect(SIZE_OPTIONS).toContain(1280);
    expect(FPS_OPTIONS).toContain(30);
    expect(ORIENTATIONS).toEqual(['auto', 'portrait', 'landscape']);
  });
});

describe('defaults (spec §70)', () => {
  it('logcat buffer capped at 5000 lines by default', () => {
    expect(LOGCAT_LEVELS).toEqual(['E', 'W', 'I', 'D', 'V']);
    expect(DEVICE_ROOT).toBe('/sdcard');
  });

  it('shortcuts match the spec set', () => {
    expect(SHORTCUTS.shell).toBe('Ctrl+Shift+A');
    expect(SHORTCUTS.screenshot).toBe('Ctrl+Shift+S');
    expect(SHORTCUTS.files).toBe('Ctrl+Shift+F');
    expect(SHORTCUTS.devices).toBe('Ctrl+Shift+D');
    expect(SHORTCUTS.logs).toBe('Ctrl+Shift+L');
  });
});
