/**
 * ONEST consensus and token parameters.
 *
 * Token: PAW (name "Onest", URL "https://onest.pet")
 * App: animal profile / paw-print tribute
 */

export const PAW_TICKER = 'PAW';
export const PAW_NAME = 'Onest';
export const PAW_URL = 'https://onest.pet';

export const TOKEN_TICKER = PAW_TICKER;
export const TOKEN_NAME = PAW_NAME;
export const TOKEN_URL = PAW_URL;

export const TOKEN_DECIMALS = 0;
export const POW_LEADING_ZERO_BYTES = 1;

/** Default PoW difficulty bits for phone / client mine (~15-30s) */
export const POW_PAW_BASE_ZERO_BITS = 22;

export const BASE_MINT_ATOMS = 100n;
export const PAW_MINT_ATOMS = 100n;

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

/** Default days per extra bit on the Moore clock */
export const MOORE_DAYS_PER_EXTRA_BIT = 500;

export function resolveMooreDaysPerExtraBit(raw?: string): number {
  const n = Number(raw?.trim() || MOORE_DAYS_PER_EXTRA_BIT);
  if (!Number.isFinite(n) || n < 1) return MOORE_DAYS_PER_EXTRA_BIT;
  return Math.floor(n);
}
