// Tiny i18n layer (spec §69): translations live in dedicated files,
// components call t(key, params) — no hardcoded UI strings.

import ptBR from './pt-BR';
import enUS from './en-US';
import type { Language } from '../types';

const dictionaries: Record<Exclude<Language, 'auto'>, Record<string, string>> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

export function detectLanguage(): 'pt-BR' | 'en-US' {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of langs) {
    if (typeof l === 'string' && l.toLowerCase().startsWith('pt')) return 'pt-BR';
  }
  return 'en-US';
}

export function resolveLanguage(setting: Language): 'pt-BR' | 'en-US' {
  return setting === 'auto' ? detectLanguage() : setting;
}

export function translate(
  lang: 'pt-BR' | 'en-US',
  key: string,
  params?: Record<string, string | number>,
): string {
  let text = dictionaries[lang][key] ?? ptBR[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export type { Language };
