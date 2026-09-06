import { useLocale } from '../i18n/LocaleContext.js';
import { LOCALE_OPTIONS, type Locale } from '../i18n/types.js';

export function Header() {
  const { locale, setLocale, appearance, setAppearance } = useLocale();

  return (
    <div className="header-actions">
      <div className="locale-switch">
        {LOCALE_OPTIONS.map(opt => (
          <button
            key={opt.locale}
            type="button"
            className={`btn-lang ${locale === opt.locale ? 'is-active' : ''}`}
            onClick={() => setLocale(opt.locale)}
          >
            {opt.label}
          </button>
        ))}
      </div>
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
