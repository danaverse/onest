import {
  localeFromCountryCode,
  localeFromNavigator,
  resolveInitialLocale,
} from '../apps/web/src/i18n/detectLocale.js';

describe('web locale detect', () => {
  it('maps VN to vi, CN/TW/HK/MO/SG to zh, everything else to null', () => {
    expect(localeFromCountryCode('VN')).toBe('vi');
    expect(localeFromCountryCode('vn')).toBe('vi');
    expect(localeFromCountryCode('CN')).toBe('zh');
    expect(localeFromCountryCode('TW')).toBe('zh');
    expect(localeFromCountryCode('HK')).toBe('zh');
    expect(localeFromCountryCode('MO')).toBe('zh');
    expect(localeFromCountryCode('SG')).toBe('zh');
    expect(localeFromCountryCode('US')).toBeNull();
    expect(localeFromCountryCode('')).toBeNull();
    expect(localeFromCountryCode(null)).toBeNull();
  });

  it('reads navigator language tags', () => {
    expect(localeFromNavigator(['vi-VN', 'en'])).toBe('vi');
    expect(localeFromNavigator(['zh-CN'])).toBe('zh');
    expect(localeFromNavigator(['fr-FR'])).toBe('en');
    expect(localeFromNavigator([])).toBe('en');
  });

  it('resolves the first-load locale from the IP country', async () => {
    const originalFetch = global.fetch;
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const originalLocalStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage',
    );
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { languages: ['vi-VN'] },
        configurable: true,
      });
      Object.defineProperty(globalThis, 'localStorage', {
        value: { getItem: () => null, setItem: () => {} },
        configurable: true,
      });

      /* IP country wins over the browser language: non-VI/ZH → English. */
      global.fetch = (async () => ({
        ok: true,
        json: async () => ({ success: true, country_code: 'US' }),
      })) as unknown as typeof fetch;
      await expect(resolveInitialLocale()).resolves.toBe('en');

      global.fetch = (async () => ({
        ok: true,
        json: async () => ({ success: true, country_code: 'VN' }),
      })) as unknown as typeof fetch;
      await expect(resolveInitialLocale()).resolves.toBe('vi');

      /* Geo lookup failure falls back to the browser languages. */
      global.fetch = (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch;
      await expect(resolveInitialLocale()).resolves.toBe('vi');
    } finally {
      global.fetch = originalFetch;
      if (originalNavigator) {
        Object.defineProperty(globalThis, 'navigator', originalNavigator);
      } else {
        delete (globalThis as { navigator?: unknown }).navigator;
      }
      if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});
