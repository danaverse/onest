/**
 * Share / deep-link helpers for profile roots, mirroring WLotus.
 *
 * Share links always use HTTPS: `https://onest.pet/<burn-txid>`. When the
 * sender's app locale is known, `?lang=` is appended so the Open Graph card
 * renders in the sharer's language — messengers cache one card per URL and
 * crawlers lie in Accept-Language (usually `en-*`).
 */

export const SHARE_LOCALES = ['en', 'vi', 'zh'] as const;
export type ShareLocale = (typeof SHARE_LOCALES)[number];

export function normalizeBurnTxid(
  raw: string | null | undefined,
): string | null {
  const hex = String(raw || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

/** `en` | `vi` | `zh` for share / OG; null if unknown. */
export function normalizeShareLang(
  raw: string | null | undefined,
): ShareLocale | null {
  if (!raw) return null;
  const primary = raw.trim().toLowerCase().split(/[,;_-]/)[0]?.trim() ?? '';
  return (SHARE_LOCALES as readonly string[]).includes(primary)
    ? (primary as ShareLocale)
    : null;
}

/**
 * Public share URL for a profile root. `lang` is the sender's app locale;
 * unknown values are dropped so the OG resolver falls back to its default.
 */
export function profileShareUrl(
  burnTxid: string,
  origin?: string | null,
  lang?: string | null,
): string {
  const id = normalizeBurnTxid(burnTxid);
  if (!id) throw new Error('invalid burn txid');
  const base = (
    origin || (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');
  const locale = normalizeShareLang(lang);
  return locale ? `${base}/${id}?lang=${locale}` : `${base}/${id}`;
}
