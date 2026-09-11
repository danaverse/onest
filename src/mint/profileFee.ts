/**
 * Flat XEC fee for desk-built pet profiles.
 *
 * When the wallet has no PAW, the user pays a flat XEC fee and the desk burns
 * 1 PAW from inventory (no remint). Default: 20 XEC = 2,000 sats.
 *
 * Margin math (per profile):
 *   income          2,000 sats (20 XEC)
 *   burn tx fee     ~300–600 sats at 1 sat/byte (token input + postage + OP_RETURN)
 *   1 PAW atom      from desk inventory (issued by sponsored remints, no
 *                   marginal XEC cost on this action)
 *   -> desk margin  ~1,400–1,700 sats (~70–85%)
 */

export const DEFAULT_PROFILE_XEC_FEE = 20n;
export const PROFILE_FEE_MIN_XEC = 1n;
export const PROFILE_FEE_MAX_XEC = 10_000n;

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
