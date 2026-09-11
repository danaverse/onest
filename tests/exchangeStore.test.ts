import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExchangeStore } from '../apps/mint-api/src/exchangeStore.js';

function order(id: string, expiresAt: number) {
  return {
    id,
    installId: 'install-1',
    address: 'ecash:qqbuyer',
    pawAtoms: '7',
    xecSats: '700',
    depositAddress: 'ecash:qqdesk',
    status: 'open' as const,
    createdAt: 1_000,
    expiresAt,
  };
}

describe('ExchangeStore', () => {
  let dir: string;
  let path: string;
  let store: ExchangeStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'onest-exchange-'));
    path = join(dir, 'orders.json');
    store = new ExchangeStore(path);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates, reads and updates orders durably', () => {
    store.create(order('a1'.repeat(16), 10_000));
    expect(store.get('A1'.repeat(16))?.pawAtoms).toBe('7');

    store.update('a1'.repeat(16), {
      status: 'fulfilled',
      fulfillmentTxid: 'cc'.repeat(32),
    });
    expect(store.get('a1'.repeat(16))?.status).toBe('fulfilled');

    const reloaded = new ExchangeStore(path);
    expect(reloaded.get('a1'.repeat(16))?.fulfillmentTxid).toBe('cc'.repeat(32));
    expect(reloaded.list()).toHaveLength(1);
  });

  it('tracks processed payment txids without duplicates', () => {
    expect(store.hasProcessedTx('AA'.repeat(32))).toBe(false);
    store.addProcessedTx('AA'.repeat(32));
    store.addProcessedTx('aa'.repeat(32));
    expect(store.hasProcessedTx('aa'.repeat(32))).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it('expires unpaid orders only', () => {
    store.create(order('b2'.repeat(16), 5_000));
    store.create(order('c3'.repeat(16), 50_000));
    store.update('c3'.repeat(16), { status: 'paid', paymentTxid: 'dd'.repeat(32) });

    expect(store.pruneExpired(9_000)).toBe(1);
    expect(store.get('b2'.repeat(16))?.status).toBe('expired');
    expect(store.get('c3'.repeat(16))?.status).toBe('paid');
  });

  it('returns null when updating an unknown order', () => {
    expect(store.update('ff'.repeat(16), { status: 'failed' })).toBeNull();
  });
});
