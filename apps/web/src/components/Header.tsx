import { useLocale } from '../i18n/LocaleContext.js';
import { LOCALE_OPTIONS, type Locale } from '../i18n/types.js';

export function Header() {
  const { locale, setLocale, appearance, setAppearance } = useLocale();

  return (
    <div className="header-actions">
      <select
        className="locale-select"
        value={locale}
        aria-label="Language"
        onChange={e => setLocale(e.target.value as Locale)}
      >
        {LOCALE_OPTIONS.map(opt => (
          <option key={opt.locale} value={opt.locale}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn-theme"
        onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle theme"
      >
        {appearance === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
