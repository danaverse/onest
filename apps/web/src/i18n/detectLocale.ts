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

/** Map ISO country code → app locale (VN → vi, CN/TW/HK/MO/SG → zh). */
export function localeFromCountryCode(cc: string | null | undefined): Locale | null {
  if (!cc) return null;
  const c = cc.trim().toUpperCase();
  if (c === 'VN') return 'vi';
  if (c === 'CN' || c === 'TW' || c === 'HK' || c === 'MO' || c === 'SG') {
    return 'zh';
  }
  return null;
}

export function localeFromNavigator(
  languages: readonly string[] = navigator.languages ?? [navigator.language],
): Locale {
  for (const raw of languages) {
    const tag = (raw || '').toLowerCase();
    if (tag.startsWith('vi')) return 'vi';
    if (tag.startsWith('zh')) return 'zh';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * Best-effort country from the visitor's public IP, similar to WLotus:
 * ipwho.is first, ipapi.co/country as fallback, both time-boxed. Returns
 * null on any failure so callers can fall through to navigator / English.
 */
export async function detectCountryCode(
  signal?: AbortSignal,
): Promise<string | null> {
  const controllers: AbortController[] = [];
  const withTimeout = (ms: number) => {
    const ac = new AbortController();
    controllers.push(ac);
    const t = setTimeout(() => ac.abort(), ms);
    signal?.addEventListener('abort', () => ac.abort(), { once: true });
    return { signal: ac.signal, clear: () => clearTimeout(t) };
  };

  try {
    const a = withTimeout(3_500);
    try {
      const res = await fetch('https://ipwho.is/', {
        signal: a.signal,
        headers: { Accept: 'application/json' },
      });
      a.clear();
      if (res.ok) {
        const body = (await res.json()) as {
          success?: boolean;
          country_code?: string;
        };
        if (body.success !== false && body.country_code) {
          return body.country_code;
        }
      }
    } catch {
      a.clear();
    }

    const b = withTimeout(3_500);
    try {
      const res = await fetch('https://ipapi.co/country/', {
        signal: b.signal,
      });
      b.clear();
      if (res.ok) {
        const text = (await res.text()).trim();
        if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
      }
    } catch {
      b.clear();
    }
  } finally {
    for (const ac of controllers) {
      try {
        ac.abort();
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/**
 * Locale for a first load: explicit choice → IP country → browser → en.
 * An unmapped IP country defaults to English (only VI/ZH are auto-selected);
 * navigator is used only when the geo lookup itself fails. The auto-detected
 * value is not persisted — only an explicit setLocale writes storage.
 */
export async function resolveInitialLocale(
  signal?: AbortSignal,
): Promise<Locale> {
  const stored = readStoredLocale();
  if (stored) return stored;

  const cc = await detectCountryCode(signal);
  if (cc) return localeFromCountryCode(cc) ?? 'en';

  return localeFromNavigator();
}
