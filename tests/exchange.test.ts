import {
  DEFAULT_XEC_SATS_PER_PAW_ATOM,
  quoteXecSats,
  resolveXecSatsPerPaw,
  xecFromSats,
} from '../src/mint/exchangeRate.js';
import {
  decodeExchangeMemoFromScriptHex,
  exchangeMemo,
  isExchangeOrderId,
  memoOpReturnScriptBytes,
} from '../src/mint/exchangeMemo.js';

const ORDER_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('exchange rate', () => {
  it('defaults to 1 XEC = 1 PAW atom (100 sats)', () => {
    expect(resolveXecSatsPerPaw(undefined)).toBe(100n);
    expect(DEFAULT_XEC_SATS_PER_PAW_ATOM).toBe(100n);
    expect(resolveXecSatsPerPaw('250')).toBe(250n);
    expect(resolveXecSatsPerPaw('0')).toBe(100n);
    expect(resolveXecSatsPerPaw('nope')).toBe(100n);
  });

  it('quotes atom prices and formats XEC', () => {
    expect(quoteXecSats(7n, 100n)).toBe(700n);
    expect(quoteXecSats(108n, 100n)).toBe(10_800n);
    expect(() => quoteXecSats(0n, 100n)).toThrow();
    expect(xecFromSats(700n)).toBe('7');
    expect(xecFromSats(10_850n)).toBe('108.5');
    expect(xecFromSats(101n)).toBe('1.01');
  });
});

describe('exchange memo', () => {
  it('roundtrips through an OP_RETURN script', () => {
    const memo = exchangeMemo(ORDER_ID.toUpperCase());
    expect(memo).toBe(`ONEX${ORDER_ID}`);
    const script = memoOpReturnScriptBytes(memo);
    expect(script[0]).toBe(0x6a);
    const hex = Buffer.from(script).toString('hex');
    expect(decodeExchangeMemoFromScriptHex(hex)).toBe(ORDER_ID);
  });

  it('rejects malformed order ids and scripts', () => {
    expect(isExchangeOrderId(ORDER_ID)).toBe(true);
    expect(isExchangeOrderId('short')).toBe(false);
    expect(() => exchangeMemo('short')).toThrow();
    expect(decodeExchangeMemoFromScriptHex('6a04deadbeef')).toBeNull();
    expect(decodeExchangeMemoFromScriptHex('76a914')).toBeNull();
    expect(decodeExchangeMemoFromScriptHex('')).toBeNull();
  });
});
