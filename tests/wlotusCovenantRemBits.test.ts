import { meetsPowBits } from '../src/lib/powBits.js';

/** LE 2-byte remBits limits baked in WLotusCovenant.spedn. */
const WLOTUS_COVENANT_REM_LIMITS = Buffer.from(
  '00018000400020001000080004000200',
  'hex',
);

function wlotusCovenantNextByteLimit(remBits: number): number {
  return WLOTUS_COVENANT_REM_LIMITS.readUInt16LE(remBits * 2);
}

describe('WLotusCovenant remBits flat table', () => {
  test('thresholds match 2^(8-remBits), remBits=0 → 256', () => {
    expect(wlotusCovenantNextByteLimit(0)).toBe(256);
    for (let r = 1; r <= 7; r++) {
      expect(wlotusCovenantNextByteLimit(r)).toBe(1 << (8 - r));
    }
  });

  test('padded next-byte < limit matches meetsPowBits', () => {
    const hash = new Uint8Array(32);
    hash[0] = 0;
    hash[1] = 40;
    expect(meetsPowBits(hash, 8)).toBe(true);
    expect(40 < wlotusCovenantNextByteLimit(0)).toBe(true);
    expect(meetsPowBits(hash, 9)).toBe(true);
    expect(40 < wlotusCovenantNextByteLimit(1)).toBe(true);
    expect(meetsPowBits(hash, 10)).toBe(true);
    expect(40 < wlotusCovenantNextByteLimit(2)).toBe(true);
    hash[1] = 200;
    expect(meetsPowBits(hash, 9)).toBe(false);
    expect(200 < wlotusCovenantNextByteLimit(1)).toBe(false);
  });
});
