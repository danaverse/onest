/**
 * Live and known Onest PAW token ids.
 */

/** Production WLotus token — must never be used by Onest mint/burn. */
export const WLOTUS_TOKEN_ID =
  'a41bf9d03961a2be83f854c8cea0b3fddf7e275ff3695d9848046052d6db3df9';

export const DEFAULT_PAW_TOKEN_ID =
  process.env.TOKEN_ID?.trim() ||
  process.env.VITE_PAW_TOKEN_ID?.trim() ||
  process.env.VITE_PRAYER_TOKEN_ID?.trim() ||
  '';

export function isTokenId(raw: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(raw.trim());
}

export function assertDeskTokenId(tokenId: string): void {
  if (!isTokenId(tokenId)) {
    throw new Error(`Invalid TOKEN_ID 64 hex: ${tokenId}`);
  }
  if (tokenId.toLowerCase() === WLOTUS_TOKEN_ID) {
    throw new Error(
      'TOKEN_ID is the live WLotus token. Onest must use tPAW (test) or PAW (prod). Set TEST_DESK_SEEDS and run scripts/provision-test-tpaw.sh.',
    );
  }
}
