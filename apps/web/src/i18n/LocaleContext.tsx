import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { interpolate, MESSAGES, type MessageKey } from './messages.js';
import { readStoredLocale, writeStoredLocale, localeFromNavigator } from './detectLocale.js';
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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale() || localeFromNavigator());
  const [appearance, setAppearanceState] = useState<Appearance>(() => readStoredAppearance() || 'dark');

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    writeStoredLocale(l);
    document.documentElement.lang = l;
  };

  const setAppearance = (a: Appearance) => {
    setAppearanceState(a);
    writeStoredAppearance(a);
    document.documentElement.dataset.theme = a;
  };

  useEffect(() => {
    document.documentElement.lang = locale;
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
