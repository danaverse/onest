/**
 * Soft wait ("min pray") between challenge issue and the memorial burn.
 *
 * Onest enforces this **server-side** in mint-api (stronger than WLotus's
 * client-only floor); the web countdown is UX only.
 * Default 54s, clamp 0–600, `0` disables.
 */

export const DEFAULT_MIN_PRAY_SECONDS = 54;
export const MAX_MIN_PRAY_SECONDS = 600;

export function parseMinPraySeconds(
  raw: string | number | null | undefined,
): number {
  const s = String(raw ?? '').trim();
  if (s === '') return DEFAULT_MIN_PRAY_SECONDS;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MIN_PRAY_SECONDS;
  if (n === 0) return 0;
  return Math.min(MAX_MIN_PRAY_SECONDS, Math.round(n));
}

export function minPraySecondsToMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round(seconds * 1000);
}

export function minPrayWaitUntilMs(startedAtMs: number, seconds: number): number {
  return startedAtMs + minPraySecondsToMs(seconds);
}

export function remainingMinPrayMs(
  startedAtMs: number,
  minPrayMs: number,
  nowMs = Date.now(),
): number {
  if (minPrayMs <= 0) return 0;
  return Math.max(0, minPrayMs - (nowMs - startedAtMs));
}
