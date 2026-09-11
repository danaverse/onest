import {
  memorialPushdata,
  memorialPushdataWithCreator,
  parseMemorialPushdata,
  OFFERING_ID_PAW,
  DANA_VERSION,
  DANA_VERSION_CREATOR,
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

  it('carries the creator hash160 on-chain (v5, rebuild-safe ownership)', () => {
    const creatorHash = 'ab'.repeat(20);
    const note = 'species\u001fLuna\u001f\u001f\u001f\u001f\u001f\u001f\u001f\u001fmemorial\u001fsolar';
    const data = memorialPushdataWithCreator(note, creatorHash.toUpperCase());

    const parsed = parseMemorialPushdata(data);
    expect(parsed.version).toBe(DANA_VERSION_CREATOR);
    expect(parsed.note).toBe(note);
    expect(parsed.creatorHash160).toBe(creatorHash);
    expect(parsed.parentBurnTxid).toBeUndefined();

    const withParent = memorialPushdataWithCreator(note, creatorHash, OFFERING_ID_PAW, 'b'.repeat(64));
    const parsedParent = parseMemorialPushdata(withParent);
    expect(parsedParent.creatorHash160).toBe(creatorHash);
    expect(parsedParent.parentBurnTxid).toBe('b'.repeat(64));
  });

  it('rejects malformed v5 creator hashes', () => {
    expect(() => memorialPushdataWithCreator('note', 'short')).toThrow(/hash160/i);
  });
});
