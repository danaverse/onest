import {
  createDailyCounter,
  createRollingWindowCounter,
  normalizeClientIp,
} from '../src/lib/rateLimit.js';

describe('rateLimit', () => {
  describe('DailyCounter', () => {
    it('allows consuming up to limit and throws on excess', () => {
      let nowMs = 1700000000000;
      const counter = createDailyCounter(3, max => `Limit ${max}`, () => nowMs);

      expect(counter.remaining('user1')).toBe(3);
      counter.consume('user1');
      expect(counter.remaining('user1')).toBe(2);
      counter.consume('user1');
      counter.consume('user1');
      expect(counter.remaining('user1')).toBe(0);

      expect(() => counter.consume('user1')).toThrow('Limit 3');

      // Next day resets
      nowMs += 86_400_000;
      expect(counter.remaining('user1')).toBe(3);
      expect(() => counter.consume('user1')).not.toThrow();
    });
  });

  describe('RollingWindowCounter', () => {
    it('limits sliding window requests', () => {
      let nowMs = 10000;
      const counter = createRollingWindowCounter(2, 5000, max => `Max ${max}`, () => nowMs);

      counter.consume('ip1');
      expect(counter.used('ip1')).toBe(1);
      counter.consume('ip1');
      expect(counter.used('ip1')).toBe(2);

      expect(() => counter.consume('ip1')).toThrow('Max 2');

      // Advance past window
      nowMs += 6000;
      expect(counter.used('ip1')).toBe(0);
      expect(() => counter.consume('ip1')).not.toThrow();
    });
  });

  describe('normalizeClientIp', () => {
    it('preserves IPv4 addresses', () => {
      expect(normalizeClientIp('192.168.1.1')).toBe('192.168.1.1');
    });

    it('masks IPv6 addresses to /64', () => {
      expect(normalizeClientIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
        '2001:0db8:85a3:0000',
      );
    });

    it('returns unknown for undefined', () => {
      expect(normalizeClientIp(undefined)).toBe('unknown');
    });
  });
});
