/**
 * Desk PAW exchange rate. Default: 1 XEC = 1 PAW atom
 * (1 XEC = 100 sats, so 100 sats per atom).
 */
export const DEFAULT_XEC_SATS_PER_PAW_ATOM = 100n;

export function resolveXecSatsPerPaw(
  raw: string | number | bigint | null | undefined,
): bigint {
  if (raw == null || String(raw).trim() === '') {
    return DEFAULT_XEC_SATS_PER_PAW_ATOM;
  }
  try {
    const n = BigInt(String(raw).trim());
    return n > 0n ? n : DEFAULT_XEC_SATS_PER_PAW_ATOM;
  } catch {
    return DEFAULT_XEC_SATS_PER_PAW_ATOM;
  }
}

export function quoteXecSats(pawAtoms: bigint, satsPerAtom: bigint): bigint {
  if (pawAtoms <= 0n) throw new Error('pawAtoms must be > 0');
  if (satsPerAtom <= 0n) throw new Error('rate must be > 0');
  return pawAtoms * satsPerAtom;
}

/** Human XEC string (1 XEC = 100 sats). */
export function xecFromSats(sats: bigint): string {
  const whole = sats / 100n;
  const frac = sats % 100n;
  return frac === 0n
    ? whole.toString()
    : `${whole}.${frac.toString().padStart(2, '0')}`.replace(/0+$/, '');
}
