import {
  REMINT_LOCKTIME_FINALITY_BUFFER_SECONDS,
  resolveRemintLocktime,
} from '../src/mint/remintLocktime.js';

describe('remint locktime', () => {
  it('backs off from MTP so the tx is final', () => {
    // mtp = 1,000,000; baton floor far below
    expect(resolveRemintLocktime(500_000, 1_000_000)).toBe(
      1_000_000 - REMINT_LOCKTIME_FINALITY_BUFFER_SECONDS,
    );
    expect(REMINT_LOCKTIME_FINALITY_BUFFER_SECONDS).toBeGreaterThanOrEqual(60);
  });

  it('never goes below the baton creating locktime', () => {
    expect(resolveRemintLocktime(999_950, 1_000_000)).toBe(999_950);
    expect(resolveRemintLocktime(1_000_000, 1_000_000)).toBe(1_000_000);
  });

  it('handles junk inputs safely', () => {
    expect(resolveRemintLocktime(Number.NaN, 1_000)).toBe(880);
    expect(resolveRemintLocktime(100, Number.NaN)).toBe(100);
    expect(resolveRemintLocktime(0, 0, 0)).toBe(0);
  });
});
