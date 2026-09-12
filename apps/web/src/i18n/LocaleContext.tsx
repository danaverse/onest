import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { interpolate, MESSAGES, type MessageKey } from './messages.js';
import {
  readStoredLocale,
  writeStoredLocale,
  localeFromNavigator,
  resolveInitialLocale,
} from './detectLocale.js';
import { readStoredAppearance, writeStoredAppearance, type Appearance } from './appearance.js';
import { LOCALE_OPTIONS, type Locale } from './types.js';

interface LocaleCtx {
  locale: Locale;
  appearance: Appearance;
  setLocale: (locale: Locale) => void;
  setAppearance: (appearance: Appearance) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<LocaleCtx | null>(null);

function htmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-Hans' : locale;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale() || localeFromNavigator());
  const [appearance, setAppearanceState] = useState<Appearance>(() => readStoredAppearance() || 'dark');

  /* First load: refine the navigator guess with the visitor's IP country
     (VI/ZH only; everything else stays English). Skipped when the user has
     already picked a language, including while this lookup is in flight. */
  useEffect(() => {
    if (readStoredLocale()) return;
    const controller = new AbortController();
    void resolveInitialLocale(controller.signal).then(resolved => {
      if (controller.signal.aborted || readStoredLocale()) return;
      setLocaleState(resolved);
    });
    return () => controller.abort();
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    writeStoredLocale(l);
    document.documentElement.lang = htmlLang(l);
  };

  const setAppearance = (a: Appearance) => {
    setAppearanceState(a);
    writeStoredAppearance(a);
    document.documentElement.dataset.theme = a;
  };

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.documentElement.dataset.theme = appearance;
  }, [locale, appearance]);

  const t = (key: MessageKey, vars?: Record<string, string | number>): string => {
    const raw = MESSAGES[locale]?.[key] ?? MESSAGES.en[key] ?? key;
    return interpolate(raw, vars);
  };

  return (
    <Ctx.Provider value={{ locale, appearance, setLocale, setAppearance, t }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
