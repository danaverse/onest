import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { BurnStore } from '../apps/dana-index/src/store.js';
import { encodeAnimalProfileNote } from '../src/offering/animalProfileFields.js';

describe('BurnStore', () => {
  const testStorePath = resolve(process.cwd(), 'data/test-store.json');

  afterEach(() => {
    try {
      rmSync(testStorePath, { force: true });
    } catch {
      // ignore
    }
  });

  it('stores and retrieves burns, grouping by originalBurnTxid', () => {
    const store = new BurnStore(testStorePath);
    const rootTxid = '1'.repeat(64);
    const tributeTxid = '2'.repeat(64);

    const rootNote = encodeAnimalProfileNote({
      species: 'dog',
      name: 'Rusty',
      note: 'Best boy',
      breed: 'Beagle',
      birthDate: '2016',
      passingDate: '2024',
      location: '',
      memorialPlace: '',
      relationshipType: '',
      relatedTxid: '',
      relationships: [],
      kind: 'memorial',
      dateCalendar: 'solar',
    });

    store.insert({
      burnTxid: rootTxid,
      tokenId: 't'.repeat(64),
      note: rootNote,
      offeringId: 'paw',
      version: 1,
      originalBurnTxid: rootTxid,
      blockHeight: 1000,
      blockTimestamp: 1700000000,
      timeFirstSeen: new Date().toISOString(),
      burnAtoms: '1',
    });

    store.insert({
      burnTxid: tributeTxid,
      tokenId: 't'.repeat(64),
      note: 'Rest in peace Rusty 🐾',
      offeringId: 'paw',
      version: 2,
      parentBurnTxid: rootTxid,
      originalBurnTxid: rootTxid,
      blockHeight: 1001,
      blockTimestamp: 1700000100,
      timeFirstSeen: new Date().toISOString(),
      burnAtoms: '1',
    });

    expect(store.get(rootTxid)?.note).toBe(rootNote);
    expect(store.get(tributeTxid)?.parentBurnTxid).toBe(rootTxid);

    const group = store.groupForRoot(rootTxid);
    expect(group).toBeDefined();
    expect(group?.totalBurns).toBe(2);
    expect(group?.latestBurnTxid).toBe(tributeTxid);

    // Can also query group by child tribute txid
    const groupByChild = store.groupForRoot(tributeTxid);
    expect(groupByChild).toBeDefined();
    expect(groupByChild?.originalBurnTxid).toBe(rootTxid);

    const searchRes = store.search('Rusty');
    expect(searchRes.length).toBe(1);
    expect(searchRes[0]!.originalBurnTxid).toBe(rootTxid);
  });
});
