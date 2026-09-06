export const REMINT_FUEL_SATS = 4_000n;
export const REMINT_FUEL_MAX_SATS = REMINT_FUEL_SATS + 1_000n;

export const BURN_POSTAGE_SATS = 2_500n;
export const BURN_POSTAGE_MIN_SATS = 1_500n;
export const BURN_POSTAGE_MAX_SATS = 3_500n;

export const OFFERING_PAIR_SATS = REMINT_FUEL_SATS + BURN_POSTAGE_SATS;
export const REMINT_FUEL_SPLIT_MIN_SATS = OFFERING_PAIR_SATS + 2_000n;
export const DESK_TOPUP_RESERVE_SATS = 10_000n;

export interface PureUtxoLike {
  outpoint: { txid: string; outIdx: number };
  sats: bigint;
  token?: unknown;
}

export function isSizedFuelSats(sats: bigint): boolean {
  return sats >= REMINT_FUEL_SATS && sats <= REMINT_FUEL_MAX_SATS;
}

export function isBurnPostageSats(sats: bigint): boolean {
  return sats >= BURN_POSTAGE_MIN_SATS && sats <= BURN_POSTAGE_MAX_SATS;
}

export function isOversizedFuelSats(sats: bigint): boolean {
  return sats > REMINT_FUEL_MAX_SATS;
}

function utxoKey(u: PureUtxoLike): string {
  return `${u.outpoint.txid}:${u.outpoint.outIdx}`;
}

export function pickBurnPostageUtxo<T extends PureUtxoLike>(
  utxos: T[],
  blocked: ReadonlySet<string> = new Set(),
): T | null {
  const postage = utxos
    .filter(
      u => !u.token && isBurnPostageSats(u.sats) && !blocked.has(utxoKey(u)),
    )
    .sort((a, b) => (a.sats < b.sats ? -1 : a.sats > b.sats ? 1 : 0));
  return postage[0] ?? null;
}

export function pickSizedFuelUtxo<T extends PureUtxoLike>(
  utxos: T[],
  blocked: ReadonlySet<string> = new Set(),
): T | null {
  const sized = utxos
    .filter(
      u => !u.token && isSizedFuelSats(u.sats) && !blocked.has(utxoKey(u)),
    )
    .sort((a, b) => (a.sats < b.sats ? -1 : a.sats > b.sats ? 1 : 0));
  return sized[0] ?? null;
}

export function pickSplitSourceUtxo<T extends PureUtxoLike>(
  utxos: T[],
  minSats = REMINT_FUEL_SPLIT_MIN_SATS,
): T | null {
  const candidates = utxos
    .filter(u => !u.token && u.sats >= minSats)
    .sort((a, b) => (a.sats < b.sats ? -1 : a.sats > b.sats ? 1 : 0));
  return candidates[0] ?? null;
}

export function pureXecBalance<T extends PureUtxoLike>(utxos: T[]): bigint {
  return utxos
    .filter(u => !u.token)
    .reduce((sum, u) => sum + u.sats, 0n);
}

export function tipFeeAccountNumber(tipIndex: number): number {
  if (!Number.isInteger(tipIndex) || tipIndex < 0) {
    throw new Error(`tipIndex must be a non-negative integer: ${tipIndex}`);
  }
  return tipIndex + 1;
}
