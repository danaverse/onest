import { pwaReloadGate } from './pwaReloadGate.js';

export { setOfferingBlocksPwaReload } from './pwaReloadGate.js';

function reloadOnce(state: { refreshing: boolean }): void {
  if (state.refreshing) return;
  state.refreshing = true;
  window.location.reload();
}

export function registerPwaAutoUpdate(): void {
  if (!('serviceWorker' in navigator)) return;

  const state = { refreshing: false };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pwaReloadGate.onControllerChange() === 'reload') {
      reloadOnce(state);
    }
  });

  const buildId = typeof __ONEST_BUILD_ID__ !== 'undefined' ? __ONEST_BUILD_ID__ : Date.now().toString(36);
  const swUrl = `/sw.js?v=${buildId}`;

  navigator.serviceWorker
    .register(swUrl, { scope: '/', type: 'classic' })
    .then(registration => {
      const check = () => {
        const action = pwaReloadGate.onCheck();
        if (action === 'reload') {
          reloadOnce(state);
          return;
        }
        if (action === 'check') void registration.update();
      };
      setInterval(check, 5 * 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
      (window as any).__onestUpdateSW = async () => {
        await registration.update();
      };
    })
    .catch(() => {
      /* SW registration failed — app still works online */
    });
}
