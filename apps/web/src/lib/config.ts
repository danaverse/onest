export const PAW_TOKEN_ID =
  (import.meta.env.VITE_PRAYER_TOKEN_ID as string | undefined)?.trim() ||
  (import.meta.env.VITE_PAW_TOKEN_ID as string | undefined)?.trim() ||
  '';

export const PAW_TICKER =
  (import.meta.env.VITE_PAW_TICKER as string | undefined)?.trim() ||
  'PAW';

export const MINT_API_BASE =
  (import.meta.env.VITE_MINT_API_BASE as string | undefined)?.trim() || '';

export const DANA_INDEX_BASE =
  (import.meta.env.VITE_DANA_INDEX_BASE as string | undefined)?.trim() || '';

export const CHRONIK_URLS: string[] =
  (import.meta.env.VITE_CHRONIK_URLS as string | undefined)
    ?.split(',')
    .map(s => s.trim())
    .filter(Boolean) ?? [];

export const INSTALL_ID_KEY = 'onest.installId';

export function getOrCreateInstallId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_ID_KEY)?.trim();
    if (existing && existing.length >= 8) return existing;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      s += bytes[i]!.toString(16).padStart(2, '0');
    }
    localStorage.setItem(INSTALL_ID_KEY, s);
    return s;
  } catch {
    return '0123456789abcdef0123456789abcdef';
  }
}
