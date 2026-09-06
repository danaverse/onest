/**
 * Live and known Onest PAW token ids.
 */

export const DEFAULT_PAW_TOKEN_ID =
  process.env.TOKEN_ID?.trim() ||
  process.env.VITE_PRAYER_TOKEN_ID?.trim() ||
  '';

export function isTokenId(raw: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(raw.trim());
}

export function assertDeskTokenId(tokenId: string): void {
  if (!isTokenId(tokenId)) {
    throw new Error(`Invalid TOKEN_ID 64 hex: ${tokenId}`);
  }
}
