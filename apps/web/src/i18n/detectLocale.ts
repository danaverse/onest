import { LOCALES, LOCALE_STORAGE_KEY, type Locale } from './types.js';

function isLocale(v: string | null | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)?.trim().toLowerCase();
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function localeFromNavigator(): Locale {
  const languages = navigator.languages ?? [navigator.language];
  for (const raw of languages) {
    const tag = (raw || '').toLowerCase();
    if (tag.startsWith('vi')) return 'vi';
    if (tag.startsWith('zh')) return 'zh';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}
