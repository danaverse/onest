import type { Locale } from './types.js';

export type Appearance = 'light' | 'dark';
export type DocumentTheme = 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = 'onest.appearance';

export function defaultAppearance(): Appearance {
  return 'dark';
}

export function readStoredAppearance(): Appearance | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)?.trim().toLowerCase();
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    /* ignore */
  }
}
