import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Tx } from 'chronik-client';
import { memorialPushdata, OFFERING_ID_PAW } from '../src/offering/danaMemorial.js';
import {
  encodePostStampPushdata,
  encodeVotePushdata,
  VOTE_DIRECTION_UP,
} from '../src/social/danaSocial.js';
import {
  classifyDanaPush,
  type DanaPush,
} from '../src/social/danaClassify.js';
import { BurnStore } from '../apps/dana-index/src/store.js';
import { openSocialDb } from '../apps/dana-index/src/social/db.js';
import { SocialStore } from '../apps/dana-index/src/social/socialStore.js';
import {
  routeDanaTx,
  txTimeMs,
} from '../apps/dana-index/src/social/txRouting.js';
import {
  DEFAULT_MIN_PRAY_SECONDS,
  MAX_MIN_PRAY_SECONDS,
  minPrayWaitUntilMs,
  parseMinPraySeconds,
  remainingMinPrayMs,
} from '../src/lib/minPray.js';

const TOKEN = 'a4'.repeat(32);
const POST_HASH = 'e1'.repeat(32);

function fakeTx(opts: {
  txid: string;
  token?: boolean;
  blockHeight?: number;
  blockTs?: number;
  firstSeen?: number;
}): Tx {
  return {
    txid: opts.txid,
    version: 2,
    inputs: [
      {
        prevOut: { txid: '00'.repeat(32), outIdx: 0 },
        inputScript: '',
        outputScript: '76a914' + '11'.repeat(20) + '88ac',
        sats: 1000n,
        sequenceNo: 0,
      },
    ],
    outputs: [{ sats: 0n, outputScript: '6a4c50' }],
    lockTime: 0,
    block:
      opts.blockHeight != null
        ? ({ height: opts.blockHeight, timestamp: opts.blockTs ?? 1_788_000_000 } as Tx['block'])
        : undefined,
    timeFirstSeen: opts.firstSeen ?? Math.floor(Date.now() / 1000),
    size: 200,
    isCoinbase: false,
    tokenEntries: opts.token
      ? ([{ tokenId: TOKEN, actualBurnAtoms: 1n }] as Tx['tokenEntries'])
      : [],
    tokenFailedParsings: [],
    tokenStatus: 0 as Tx['tokenStatus'],
    isFinal: true,
  } as unknown as Tx;
}

function pushOf(data: Uint8Array): DanaPush {
  const classified = classifyDanaPush(data);
  if (!classified) throw new Error('classification failed');
  return classified;
}

describe('tx routing', () => {
  let dir: string;
  let burns: BurnStore;
  let sqlite: ReturnType<typeof openSocialDb>['sqlite'];
  let social: SocialStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'onest-route-'));
    burns = new BurnStore(join(dir, 'burns.json'));
    const opened = openSocialDb(':memory:');
    sqlite = opened.sqlite;
    social = new SocialStore(opened.sqlite, opened.db);
  });

  afterEach(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('routes memorial pushes into the JSON burn store exactly once', () => {
    const tx = fakeTx({ txid: '11'.repeat(32), token: true, blockHeight: 10, blockTs: 1000 });
    const push = pushOf(memorialPushdata('Bella', OFFERING_ID_PAW));

    const first = routeDanaTx({
      tx,
      tokenId: TOKEN,
      push,
      burnStore: burns,
      burnedBy: 'ECASH:QQWallet',
    });
    expect(first.memorial).toBe(true);
    expect(burns.recent(10)).toHaveLength(1);
    expect(burns.recent(10)[0]!.senderAddress).toBe('ecash:qqwallet');

    const second = routeDanaTx({ tx, tokenId: TOKEN, push, burnStore: burns });
    expect(second.memorial).toBe(false);
    expect(burns.recent(10)).toHaveLength(1);
  });

  it('backfills creator attribution on an already-indexed memorial', () => {
    const tx = fakeTx({ txid: '12'.repeat(32), token: true, blockHeight: 11, blockTs: 1001 });
    const push = pushOf(memorialPushdata('Luna', OFFERING_ID_PAW));
    expect(routeDanaTx({ tx, tokenId: TOKEN, push, burnStore: burns }).memorial).toBe(true);
    expect(burns.get(tx.txid)?.creatorAddress).toBeUndefined();

    const again = routeDanaTx({
      tx,
      tokenId: TOKEN,
      push,
      burnStore: burns,
      creatorInstallId: 'install-luna',
      creatorAddress: 'ECASH:QQCreator',
    });
    expect(again.memorial).toBe(true);
    const stored = burns.get(tx.txid);
    expect(stored?.creatorInstallId).toBe('install-luna');
    expect(stored?.creatorAddress).toBe('ecash:qqcreator');
  });

  it('ignores txs that do not touch the PAW token', () => {
    const tx = fakeTx({ txid: '22'.repeat(32), token: false });
    const push = pushOf(memorialPushdata('Bella', OFFERING_ID_PAW));
    const result = routeDanaTx({ tx, tokenId: TOKEN, push, burnStore: burns, social });
    expect(result).toEqual({ memorial: false, post: false, vote: false });
    expect(burns.recent(10)).toHaveLength(0);
  });

  it('verifies a pending post when its v4 stamp lands', () => {
    const createdAt = 1_788_000_000_000;
    social.createPost({
      id: POST_HASH,
      petRootTxid: 'aa'.repeat(32),
      authorInstall: 'install-1',
      caption: 'Luna at the beach',
      createdAt,
    });
    const tx = fakeTx({ txid: '33'.repeat(32), token: true, blockHeight: 55, blockTs: 1_788_000_100 });
    const push = pushOf(encodePostStampPushdata(POST_HASH));

    const result = routeDanaTx({ tx, tokenId: TOKEN, push, burnStore: burns, social });
    expect(result.post).toBe(true);

    const post = social.getPost(POST_HASH);
    expect(post?.status).toBe('verified');
    expect(post?.anchorTxid).toBe('33'.repeat(32));
    expect(post?.anchoredAt).toBe(1_788_000_100 * 1000);

    const again = routeDanaTx({ tx, tokenId: TOKEN, push, burnStore: burns, social });
    expect(again.post).toBe(false);
  });

  it('records vote burns once and tallies the matching post', () => {
    social.createPost({
      id: POST_HASH,
      petRootTxid: 'aa'.repeat(32),
      authorInstall: 'install-1',
      caption: 'Vote target',
      createdAt: 1,
    });
    social.verifyPost(POST_HASH, 'ab'.repeat(32), 2);

    const tx = fakeTx({ txid: '44'.repeat(32), token: true, blockHeight: 60, blockTs: 1_788_000_200 });
    const push = pushOf(
      encodeVotePushdata({ direction: VOTE_DIRECTION_UP, postHash: POST_HASH }),
    );

    const first = routeDanaTx({
      tx,
      tokenId: TOKEN,
      push,
      burnStore: burns,
      social,
      burnedBy: 'ecash:qqsender',
      voterInstall: 'install-2',
    });
    expect(first.vote).toBe(true);
    expect(social.getPost(POST_HASH)?.upvoteAtoms).toBe(1);

    const second = routeDanaTx({ tx, tokenId: TOKEN, push, burnStore: burns, social });
    expect(second.vote).toBe(false);
    expect(social.getPost(POST_HASH)?.upvoteAtoms).toBe(1);
  });

  it('drops votes for unknown posts', () => {
    const tx = fakeTx({ txid: '55'.repeat(32), token: true });
    const push = pushOf(
      encodeVotePushdata({ direction: VOTE_DIRECTION_UP, postHash: 'ff'.repeat(32) }),
    );
    const result = routeDanaTx({ tx, tokenId: TOKEN, push, burnStore: burns, social });
    expect(result.vote).toBe(false);
  });

  it('prefers block time over first-seen for vote timestamps', () => {
    const tx = fakeTx({
      txid: '66'.repeat(32),
      token: true,
      blockHeight: 70,
      blockTs: 1_700_000_000,
      firstSeen: 1_600_000_000,
    });
    expect(txTimeMs(tx)).toBe(1_700_000_000_000);
  });
});

describe('minPray', () => {
  it('parses and clamps the configured soft wait', () => {
    expect(parseMinPraySeconds(undefined)).toBe(DEFAULT_MIN_PRAY_SECONDS);
    expect(DEFAULT_MIN_PRAY_SECONDS).toBe(54);
    expect(parseMinPraySeconds('54')).toBe(54);
    expect(parseMinPraySeconds('0')).toBe(0);
    expect(parseMinPraySeconds('9999')).toBe(MAX_MIN_PRAY_SECONDS);
    expect(parseMinPraySeconds('-5')).toBe(DEFAULT_MIN_PRAY_SECONDS);
    expect(parseMinPraySeconds('nope')).toBe(DEFAULT_MIN_PRAY_SECONDS);
  });

  it('computes the wait deadline and remaining time', () => {
    const started = 1_000_000;
    const until = minPrayWaitUntilMs(started, 54);
    expect(until).toBe(started + 54_000);
    expect(remainingMinPrayMs(started, 54_000, started + 4_000)).toBe(50_000);
    expect(remainingMinPrayMs(started, 54_000, started + 60_000)).toBe(0);
    expect(remainingMinPrayMs(started, 0, started + 1)).toBe(0);
  });
});
