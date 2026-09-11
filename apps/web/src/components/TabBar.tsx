import { createPortal } from 'react-dom';
import { useLocale } from '../i18n/LocaleContext.js';

export type AppTab = 'home' | 'mypets';

/** Floating liquid-glass bottom nav, adapted from the WLotus TabBar. */
export function TabBar(props: {
  tab: AppTab;
  onTab: (tab: AppTab) => void;
}) {
  const { t } = useLocale();
  const nav = (
    <nav className="glass-nav" aria-label={t('tabHome')}>
      <div className={`glass-nav-shell glass-nav-shell--${props.tab}`}>
        <span className="glass-nav-blob" aria-hidden="true" />
        <button
          type="button"
          className={`glass-nav-btn${props.tab === 'home' ? ' is-active' : ''}`}
          aria-current={props.tab === 'home' ? 'page' : undefined}
          onClick={() => props.onTab('home')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              d="M4 11.2 12 4.5l8 6.7V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z"
            />
          </svg>
          <span>{t('tabHome')}</span>
        </button>
        <button
          type="button"
          className={`glass-nav-btn${props.tab === 'mypets' ? ' is-active' : ''}`}
          aria-current={props.tab === 'mypets' ? 'page' : undefined}
          onClick={() => props.onTab('mypets')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="7" cy="8" r="1.9" fill="currentColor" />
            <circle cx="12" cy="6.4" r="1.9" fill="currentColor" />
            <circle cx="17" cy="8" r="1.9" fill="currentColor" />
            <path
              fill="currentColor"
              d="M12 10.6c-2.6 0-5.2 2.6-5.2 5.1 0 1.7 1.3 2.9 3 2.9 1 0 1.5-.4 2.2-.4s1.2.4 2.2.4c1.7 0 3-1.2 3-2.9 0-2.5-2.6-5.1-5.2-5.1z"
            />
          </svg>
          <span>{t('tabMyPets')}</span>
        </button>
      </div>
    </nav>
  );
  /* Body portal: iOS treats position:fixed inside #root as in-flow when a
     descendant uses backdrop-filter. */
  return createPortal(nav, document.body);
}
