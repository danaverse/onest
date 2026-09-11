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

  it('lists pet profiles created (root burn sent) by a wallet address', () => {
    const store = new BurnStore(testStorePath);
    const mine = '3'.repeat(64);
    const sponsored = '4'.repeat(64);
    const other = '5'.repeat(64);

    const noteFor = (name: string) =>
      encodeAnimalProfileNote({
        species: 'cat',
        name,
        note: '',
        breed: '',
        birthDate: '',
        passingDate: '',
        location: '',
        memorialPlace: '',
        relationshipType: '',
        relatedTxid: '',
        relationships: [],
        kind: 'memorial',
        dateCalendar: 'solar',
      });

    store.insert({
      burnTxid: mine,
      tokenId: 't'.repeat(64),
      note: noteFor('Mine'),
      offeringId: 'paw',
      version: 1,
      originalBurnTxid: mine,
      blockHeight: 1,
      blockTimestamp: 1700000000,
      timeFirstSeen: new Date().toISOString(),
      senderAddress: 'ecash:qqwallet',
    });
    store.insert({
      burnTxid: sponsored,
      tokenId: 't'.repeat(64),
      note: noteFor('Sponsored'),
      offeringId: 'paw',
      version: 1,
      originalBurnTxid: sponsored,
      blockHeight: 2,
      blockTimestamp: 1700000001,
      timeFirstSeen: new Date().toISOString(),
      senderAddress: 'ecash:qqdesk',
    });
    store.insert({
      burnTxid: other,
      tokenId: 't'.repeat(64),
      note: noteFor('Tribute'),
      offeringId: 'paw',
      version: 1,
      originalBurnTxid: sponsored,
      blockHeight: 3,
      blockTimestamp: 1700000002,
      timeFirstSeen: new Date().toISOString(),
      senderAddress: 'ecash:qqwallet',
    });

    const pets = store.petsForSender('ECASH:QQWALLET');
    expect(pets.map(g => g.originalBurnTxid)).toEqual([mine]);
    expect(pets[0]!.totalBurns).toBe(1);
    expect(store.petsForSender('ecash:qqnobody')).toHaveLength(0);
    expect(store.petsForSender('')).toHaveLength(0);
  });

  it('attributes desk-paid profiles to the creator and can backfill', () => {
    const store = new BurnStore(testStorePath);
    const rootTxid = '6'.repeat(64);
    const note = encodeAnimalProfileNote({
      species: 'cat',
      name: 'Luna',
      note: '',
      breed: '',
      birthDate: '',
      passingDate: '',
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
      note,
      offeringId: 'paw',
      version: 1,
      originalBurnTxid: rootTxid,
      blockHeight: 9,
      blockTimestamp: 1700000009,
      timeFirstSeen: new Date().toISOString(),
      senderAddress: 'ecash:qqdesk',
    });

    /* Desk-sent burn: not visible to the creator yet. */
    expect(store.petsForSender('ecash:qqcreator')).toHaveLength(0);

    /* Backfill from the notify (installId + verified payer address). */
    expect(
      store.update(rootTxid, {
        creatorInstallId: 'install-luna',
        creatorAddress: 'ecash:qqcreator',
      }),
    ).not.toBeNull();

    expect(store.petsForSender('ECASH:QQCREATOR').map(g => g.originalBurnTxid)).toEqual([
      rootTxid,
    ]);
    expect(store.petsForSender('', 'install-luna')).toHaveLength(1);
    expect(store.petsForSender('', 'install-other')).toHaveLength(0);
    expect(store.update('ff'.repeat(64), { creatorAddress: 'x' })).toBeNull();
  });
});
