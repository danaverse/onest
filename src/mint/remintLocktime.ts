/**
 * Remint locktime selection.
 *
 * Consensus finality is strict: a tx with nLockTime >= the tip's median time
 * past (MTP) is non-final and rejected by the mempool
 * (`bad-txns-nonfinal`). Setting nLockTime exactly to MTP fails.
 *
 * The covenant only requires locktime >= the baton's tip locktime, so we back
 * off from MTP by a safety buffer (block propagation between Chronik nodes)
 * while never going below the baton floor.
 */
export const REMINT_LOCKTIME_FINALITY_BUFFER_SECONDS = 120;

export function resolveRemintLocktime(
  batonCreatingLockTime: number,
  mtp: number,
  bufferSeconds = REMINT_LOCKTIME_FINALITY_BUFFER_SECONDS,
): number {
  const floor = Number.isFinite(batonCreatingLockTime)
    ? Math.max(0, Math.floor(batonCreatingLockTime))
    : 0;
  const safeMtp = Number.isFinite(mtp) ? Math.floor(mtp) : floor;
  const buffered = safeMtp - Math.max(0, Math.floor(bufferSeconds));
  return Math.max(floor, buffered);
}
