import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { LocaleProvider } from './i18n/LocaleContext.js';
import { registerPwaAutoUpdate } from './lib/pwaUpdate.js';
import './styles.css';

registerPwaAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
