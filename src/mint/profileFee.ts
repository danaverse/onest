/**
 * Flat XEC fee for desk-built pet profiles.
 *
 * When the wallet has no PAW, the user pays a flat XEC fee and the desk spends
 * 12 PAW from inventory — 6 atoms burned for the memorial (rebirth), 6 atoms
 * listing fee retained. No remint. Default: 20 XEC = 2,000 sats.
 *
 * Margin math (per profile, atoms valued at the 1 XEC/atom reference):
 *   income             2,000 sats (20 XEC)
 *   12 PAW atoms       -1,200 sats (12 XEC: 6 burned + 6 listing retained)
 *   burn tx fee        ~300–600 sats at 1 sat/byte (token input + postage + OP_RETURN)
 *   -> desk margin     ~200–500 sats (~10–25% of revenue)
 */

export const DEFAULT_PROFILE_XEC_FEE = 20n;
export const PROFILE_FEE_MIN_XEC = 1n;
export const PROFILE_FEE_MAX_XEC = 10_000n;

/**
 * Flat XEC fee for desk-built votes (and other no-listing actions).
 *
 * A vote burns exactly 1 PAW and keeps nothing, so there is no listing fee.
 * Default: 6 XEC = 600 sats ≈ 1–2 XEC network fees + ≈ 4–5 XEC for the atom.
 * (Compare the 20 XEC profile fee, which includes 7 atoms: 1 burn + 6 listing.)
 */
export const DEFAULT_VOTE_XEC_FEE = 6n;

export function resolveVoteXecFee(
  raw: string | number | bigint | null | undefined,
): bigint {
  if (raw == null || String(raw).trim() === '') return DEFAULT_VOTE_XEC_FEE;
  try {
    const n = BigInt(String(raw).trim());
    if (n < PROFILE_FEE_MIN_XEC) return DEFAULT_VOTE_XEC_FEE;
    return n > PROFILE_FEE_MAX_XEC ? PROFILE_FEE_MAX_XEC : n;
  } catch {
    return DEFAULT_VOTE_XEC_FEE;
  }
}

export function resolveProfileXecFee(
  raw: string | number | bigint | null | undefined,
): bigint {
  if (raw == null || String(raw).trim() === '') return DEFAULT_PROFILE_XEC_FEE;
  try {
    const n = BigInt(String(raw).trim());
    if (n < PROFILE_FEE_MIN_XEC) return DEFAULT_PROFILE_XEC_FEE;
    return n > PROFILE_FEE_MAX_XEC ? PROFILE_FEE_MAX_XEC : n;
  } catch {
    return DEFAULT_PROFILE_XEC_FEE;
  }
}

export function xecToSats(xec: bigint): bigint {
  return xec * 100n;
}

/** Human XEC string (1 XEC = 100 sats). */
export function xecFromSats(sats: bigint): string {
  const whole = sats / 100n;
  const frac = sats % 100n;
  return frac === 0n
    ? whole.toString()
    : `${whole}.${frac.toString().padStart(2, '0')}`.replace(/0+$/, '');
}

export interface TxOutputLike {
  sats: bigint;
  outputScript: string;
}

/** Sum outputs paying a specific locking script (hex, case-insensitive). */
export function sumOutputsToScript(
  outputs: readonly TxOutputLike[],
  scriptHex: string,
): bigint {
  const want = scriptHex.trim().toLowerCase();
  let sum = 0n;
  for (const out of outputs) {
    if (out.outputScript?.toLowerCase() === want) sum += out.sats;
  }
  return sum;
}
