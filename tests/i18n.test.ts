import { describe, expect, it } from 'vitest';
import ptBR from '../src/i18n/pt-BR';
import enUS from '../src/i18n/en-US';
import { resolveLanguage, translate, detectLanguage } from '../src/i18n';

const keys = (d: Record<string, string>) => Object.keys(d).sort();

describe('i18n dictionaries', () => {
  it('pt-BR and en-US have identical key sets', () => {
    expect(keys(ptBR)).toEqual(keys(enUS));
  });

  it('has no duplicate-ish empty values', () => {
    for (const [k, v] of Object.entries(ptBR)) {
      expect(v.trim().length, `key ${k} empty`).toBeGreaterThan(0);
    }
  });

  it('contains the security-critical confirmation strings', () => {
    // The typed-confirmation words must be exact (case-sensitive, no typos).
    expect(ptBR['errors.CONFIRMATION_REQUIRED']).toContain('{word}');
    expect(enUS['errors.CONFIRMATION_REQUIRED']).toContain('{word}');
    expect(ptBR['common.confirmDestructive.body']).toContain('{word}');
    expect(enUS['common.confirmDestructive.body']).toContain('{word}');
  });

  it('covers all app-level screens', () => {
    const required = [
      'nav.devices',
      'nav.builder',
      'nav.fastboot',
      'nav.history',
      'nav.settings',
      'devices.empty',
      'dash.overview',
      'dash.screen',
      'dash.apps',
      'dash.files',
      'dash.shell',
      'dash.logs',
      'dash.diagnostics',
      'dash.debloat',
      'screen.start',
      'screen.stop',
      'shell.placeholder',
      'logs.start',
      'logs.stop',
      'files.push',
      'files.pull',
      'fb.devices',
      'history.audit',
      'settings.tools',
      'settings.about',
      'errors.NO_DEVICE',
      'errors.CONFIRMATION_REQUIRED',
      'errors.FILE_EXISTS',
      'errors.ALREADY_RUNNING',
    ];
    for (const k of required) {
      expect(ptBR[k], `missing ${k} in pt-BR`).toBeTruthy();
      expect(enUS[k], `missing ${k} in en-US`).toBeTruthy();
    }
  });
});

describe('translate()', () => {
  it('substitutes {params}', () => {
    expect(translate('pt-BR', 'tools.missing', { tool: 'adb' })).toBe('adb não encontrado');
  });

  it('returns the key when unknown (visible bug, not a crash)', () => {
    expect(translate('pt-BR', 'no.such.key')).toBe('no.such.key');
  });

  it('replaces all occurrences of a param', () => {
    const text = translate('pt-BR', 'debloat.batchBody', { n: 2, pkgs: 'a, b' });
    expect(text).toBe('Desativar 2 pacote(s)?: a, b');
  });
});

describe('language resolution', () => {
  it('auto → navigator (pt → pt-BR)', () => {
    Object.defineProperty(navigator, 'language', { value: 'pt-BR', configurable: true });
    Object.defineProperty(navigator, 'languages', { value: ['pt-BR', 'en-US'], configurable: true });
    expect(detectLanguage()).toBe('pt-BR');
    expect(resolveLanguage('auto')).toBe('pt-BR');
    expect(resolveLanguage('en-US')).toBe('en-US');
  });

  it('auto → non-pt → en-US', () => {
    Object.defineProperty(navigator, 'language', { value: 'de-DE', configurable: true });
    Object.defineProperty(navigator, 'languages', { value: ['de-DE'], configurable: true });
    expect(detectLanguage()).toBe('en-US');
  });
});
