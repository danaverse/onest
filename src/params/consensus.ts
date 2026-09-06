/**
 * ONEST consensus and token parameters.
 *
 * Token: PAW (name "Onest", URL "https://onest.pet")
 * App: animal profile / paw-print tribute
 *
 * Issuance and difficulty aligned 1:1 with live production WLotus:
 * - WLotus Token ID: a41bf9d03961a2be83f854c8cea0b3fddf7e275ff3695d9848046052d6db3df9
 * - WLotus Genesis Unix: 1788215242 (2026-08-31T22:27:22.000Z)
 * - Mint atoms: 108 (matching WLotus 108 atoms per remint)
 * - Base zero bits: 0 (starting baseline difficulty)
 * - Seconds per extra bit: 43200000 (500 days per bit)
 * - Batons: 28 (maximum ALP standard genesis batons)
 */

export const PAW_TICKER = 'PAW';
export const PAW_NAME = 'Onest';
export const PAW_URL = 'https://onest.pet';

export const TOKEN_TICKER = PAW_TICKER;
export const TOKEN_NAME = PAW_NAME;
export const TOKEN_URL = PAW_URL;

export const TOKEN_DECIMALS = 0;
export const POW_LEADING_ZERO_BYTES = 1;

/**
 * WLotus live production genesis timestamp baked into the PAW covenant.
 * August 31, 2026, 22:27:22 UTC (1788215242).
 */
export const WLOTUS_GENESIS_UNIX = 1788215242;
export const PAW_GENESIS_UNIX = WLOTUS_GENESIS_UNIX;

/** Base zero bits for the Moore difficulty clock (0, matching WLotus) */
export const POW_PAW_BASE_ZERO_BITS = 0;

export const BASE_MINT_ATOMS = 108n;
export const PAW_MINT_ATOMS = 108n;

/**
 * ALP mempool policy caps token outputs per tx at 29 (`ALP_POLICY_MAX_OUTPUTS`).
 * Genesis with one fungible mint output => at most 28 PoW batons.
 */
export const ALP_GENESIS_MAX_TOKEN_OUTPUTS = 29;
export const POW_BATON_COUNT_MAX = ALP_GENESIS_MAX_TOKEN_OUTPUTS - 1; // 28
export const POW_BATON_COUNT = POW_BATON_COUNT_MAX;

export const MOORE_NUM = 99918n;
export const MOORE_DEN = 100000n;

export const MOORE_DAY_BLOCKS = 144;
export const MOORE_DAY_SECONDS = 86_400;

/** Default days per extra bit on the Moore clock (500 days, matching WLotus) */
export const MOORE_DAYS_PER_EXTRA_BIT = 500;

export function resolveMooreDaysPerExtraBit(raw?: string): number {
  const n = Number(raw?.trim() || MOORE_DAYS_PER_EXTRA_BIT);
  if (!Number.isFinite(n) || n < 1) return MOORE_DAYS_PER_EXTRA_BIT;
  return Math.floor(n);
}
