import {
  BATON_RESERVE_MS_DEFAULT,
  batonKey,
  BatonReservations,
} from '../src/mint/batonReservation.js';

const KEY_A = batonKey('AA'.repeat(32), 1);
const KEY_B = batonKey('bb'.repeat(32), 26);

describe('baton reservations', () => {
  it('reserves a baton for one install and blocks others', () => {
    const res = new BatonReservations(60_000);
    const now = 1_000_000;
    expect(res.reserve(KEY_A, 'install-1', now).ok).toBe(true);
    const blocked = res.reserve(KEY_A, 'install-2', now + 1_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBe(59_000);
    expect(res.isReserved(KEY_A, now + 1_000)).toBe(true);
    expect(res.activeCount(now)).toBe(1);
  });

  it('is idempotent for the same install and releases on demand', () => {
    const res = new BatonReservations(60_000);
    const first = res.reserve(KEY_A, 'install-1', 0);
    const again = res.reserve(KEY_A, 'install-1', 5_000);
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) {
      expect(again.reservation.reservedAt).toBe(first.reservation.reservedAt);
    }
    res.release(KEY_A, 'install-2');
    expect(res.isReserved(KEY_A, 5_000)).toBe(true);
    res.release(KEY_A, 'install-1');
    expect(res.isReserved(KEY_A, 5_000)).toBe(false);
  });

  it('expires reservations after the TTL', () => {
    const res = new BatonReservations(30_000);
    expect(res.reserve(KEY_B, 'install-1', 0).ok).toBe(true);
    expect(res.reserve(KEY_B, 'install-2', 29_999).ok).toBe(false);
    expect(res.reserve(KEY_B, 'install-2', 30_001).ok).toBe(true);
    expect(res.activeCount(30_001)).toBe(1);
  });

  it('defaults to a 10 minute reservation', () => {
    expect(BATON_RESERVE_MS_DEFAULT).toBe(600_000);
    expect(batonKey('AB'.repeat(32), 3)).toBe(`${'ab'.repeat(32)}:3`);
  });
});
