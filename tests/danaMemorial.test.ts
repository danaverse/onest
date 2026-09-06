import {
  memorialPushdata,
  parseMemorialPushdata,
  OFFERING_ID_PAW,
  DANA_VERSION,
  DANA_VERSION_PARENT,
} from '../src/offering/danaMemorial.js';

describe('danaMemorial', () => {
  it('encodes and parses a root paw memorial pushdata', () => {
    const note = 'In loving memory of Bella';
    const data = memorialPushdata(note, OFFERING_ID_PAW);

    const parsed = parseMemorialPushdata(data);
    expect(parsed.lokad).toBe('DANA');
    expect(parsed.version).toBe(DANA_VERSION);
    expect(parsed.offeringId).toBe(OFFERING_ID_PAW);
    expect(parsed.note).toBe(note);
    expect(parsed.parentBurnTxid).toBeUndefined();
  });

  it('encodes and parses a child paw tribute pushdata with parent txid', () => {
    const parentTxid = 'a'.repeat(64);
    const note = 'Thinking of you always';
    const data = memorialPushdata(note, OFFERING_ID_PAW, parentTxid);

    const parsed = parseMemorialPushdata(data);
    expect(parsed.lokad).toBe('DANA');
    expect(parsed.version).toBe(DANA_VERSION_PARENT);
    expect(parsed.offeringId).toBe(OFFERING_ID_PAW);
    expect(parsed.note).toBe(note);
    expect(parsed.parentBurnTxid).toBe(parentTxid);
  });
});
