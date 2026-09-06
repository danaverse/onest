export {
  MOORE_DAY_SECONDS,
  MOORE_DAYS_PER_EXTRA_BIT,
  resolveMooreDaysPerExtraBit,
} from '../params/consensus.js';

export const DANA_LOKAD = new TextEncoder().encode('DANA');
export const DANA_TIP_VERSION = 4;

export const PROD_SECONDS_PER_EXTRA_BIT =
  500 * 86_400;

export function resolveProdSecondsPerExtraBit(raw?: string): number {
  return (
    (raw ? Number(raw) : 500) * 86_400
  );
}

export function resolveFeltSecondsPerExtraBit(raw?: string): number {
  return (
    (raw ? Number(raw) : 500) * 86_400
  );
}

export const MOORE_TIP_MAX_BITS = 128;

export interface MooreTipParams {
  genesisUnix: number;
  baseZeroBits: number;
  secondsPerExtraBit: number;
  tipLocktime: number;
}

export interface MooreTipState {
  locktime: number;
  extraBits: number;
  bits: number;
}

export function computeMooreTipState(
  locktime: number,
  params: MooreTipParams,
): MooreTipState {
  if (locktime < params.genesisUnix) {
    throw new Error(
      `locktime ${locktime} < genesisUnix ${params.genesisUnix}`,
    );
  }
  if (locktime < params.tipLocktime) {
    throw new Error(
      `locktime ${locktime} < tipLocktime ${params.tipLocktime} (anti-rewind)`,
    );
  }
  const elapsed = locktime - params.genesisUnix;
  const extraBits = Math.floor(elapsed / params.secondsPerExtraBit);
  const bits = params.baseZeroBits + extraBits;
  if (bits > MOORE_TIP_MAX_BITS) {
    throw new Error(
      `bits ${bits} exceeds maximum ${MOORE_TIP_MAX_BITS}`,
    );
  }
  return { locktime, extraBits, bits };
}

export function wlptV4Pushdata(state: MooreTipState): Uint8Array {
  const out = new Uint8Array(15);
  out.set(DANA_LOKAD, 0);
  out[4] = DANA_TIP_VERSION;
  out[5] = state.bits & 0xff;
  out[6] = (state.bits >>> 8) & 0xff;
  const eb = state.extraBits >>> 0;
  out[7] = eb & 0xff;
  out[8] = (eb >>> 8) & 0xff;
  out[9] = (eb >>> 16) & 0xff;
  out[10] = (eb >>> 24) & 0xff;
  const lt = state.locktime >>> 0;
  out[11] = lt & 0xff;
  out[12] = (lt >>> 8) & 0xff;
  out[13] = (lt >>> 16) & 0xff;
  out[14] = (lt >>> 24) & 0xff;
  return out;
}
