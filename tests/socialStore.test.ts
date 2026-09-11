import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSocialDb } from '../apps/dana-index/src/social/db.js';
import {
  SocialStore,
  ftsQuery,
} from '../apps/dana-index/src/social/socialStore.js';
import { MediaStore } from '../apps/dana-index/src/social/mediaStore.js';

const PET_ROOT = 'aa'.repeat(32);
const CONTENT_HASH = 'e1'.repeat(32);
const MEDIA_SHA = 'b2'.repeat(32);

function freshStore(): { store: SocialStore; close: () => void } {
  const { sqlite, db } = openSocialDb(':memory:');
  return { store: new SocialStore(sqlite, db), close: () => sqlite.close() };
}

function seedMedia(store: SocialStore): void {
  store.insertMedia({
    sha256: MEDIA_SHA,
    mime: 'image/png',
    bytes: 128,
    objectKey: MEDIA_SHA,
    createdAt: Date.now(),
  });
}

describe('SocialStore', () => {
  it('creates posts, keeps them out of the feed until verified, then attaches media', () => {
    const { store, close } = freshStore();
    try {
      seedMedia(store);
      const created = store.createPost({
        id: CONTENT_HASH,
        petRootTxid: PET_ROOT,
        authorInstall: 'install-1',
        caption: 'Luna at the beach',
        createdAt: 1_788_000_000_000,
        mediaHashes: [MEDIA_SHA],
      });
      expect(created.ok).toBe(true);
      expect(store.createPost({
        id: CONTENT_HASH,
        petRootTxid: PET_ROOT,
        authorInstall: 'install-1',
        caption: 'duplicate',
        createdAt: 1,
      })).toEqual({ ok: false, error: 'duplicate' });

      expect(store.listFeed()).toHaveLength(0);

      expect(store.verifyPost(CONTENT_HASH, 'ab'.repeat(32), 1_788_000_100_000)).toBe(true);
      expect(store.verifyPost(CONTENT_HASH, 'ab'.repeat(32), 1_788_000_100_000)).toBe(false);
      expect(store.anchorExists('ab'.repeat(32))).toBe(true);

      const feed = store.listFeed();
      expect(feed).toHaveLength(1);
      expect(feed[0]!.caption).toBe('Luna at the beach');
      expect(feed[0]!.status).toBe('verified');
      expect(feed[0]!.media).toEqual([
        { sha256: MEDIA_SHA, mime: 'image/png', bytes: 128, width: null, height: null, position: 0 },
      ]);
    } finally {
      close();
    }
  });

  it('records votes once, tallies atoms in the same transaction and supports both directions', () => {
    const { store, close } = freshStore();
    try {
      store.createPost({
        id: CONTENT_HASH,
        petRootTxid: PET_ROOT,
        authorInstall: 'install-1',
        caption: 'Vote target',
        createdAt: 1_788_000_000_000,
      });
      store.verifyPost(CONTENT_HASH, 'ab'.repeat(32), 1_788_000_100_000);

      const vote = {
        txid: '11'.repeat(32),
        postId: CONTENT_HASH,
        direction: 1,
        atoms: 8,
        burnedBy: 'ecash:qqq',
        voterInstall: 'install-2',
        blockHeight: 100,
        votedAt: Date.now(),
      };
      expect(store.recordVote(vote)).toBe('inserted');
      expect(store.recordVote(vote)).toBe('duplicate');
      expect(store.recordVote({ ...vote, txid: '22'.repeat(32), direction: 0, atoms: 3 })).toBe(
        'inserted',
      );
      expect(
        store.recordVote({ ...vote, txid: '33'.repeat(32), postId: 'ff'.repeat(32) }),
      ).toBe('post-missing');

      const post = store.getPost(CONTENT_HASH);
      expect(post?.upvoteAtoms).toBe(8);
      expect(post?.downvoteAtoms).toBe(3);
      expect(store.countVotes(CONTENT_HASH)).toBe(2);
    } finally {
      close();
    }
  });

  it('adds, lists and removes comments', () => {
    const { store, close } = freshStore();
    try {
      store.createPost({
        id: CONTENT_HASH,
        petRootTxid: PET_ROOT,
        authorInstall: 'install-1',
        caption: 'Comment target',
        createdAt: 1,
      });
      store.addComment({
        id: 'c1',
        postId: CONTENT_HASH,
        authorInstall: 'install-2',
        body: 'Thinking of you',
        createdAt: 2,
      });
      store.addComment({
        id: 'c2',
        postId: CONTENT_HASH,
        authorInstall: 'install-3',
        body: 'Sorry for your loss',
        createdAt: 3,
      });
      expect(store.listComments(CONTENT_HASH)).toHaveLength(2);
      expect(store.removeComment('c2', 'install-3')).toBe(true);
      expect(store.removeComment('c1', 'someone-else')).toBe(false);
      expect(store.listComments(CONTENT_HASH)).toHaveLength(1);
      expect(store.commentCount(CONTENT_HASH)).toBe(1);
    } finally {
      close();
    }
  });

  it('searches verified captions via FTS5 and skips removed posts', () => {
    const { store, close } = freshStore();
    try {
      store.createPost({
        id: CONTENT_HASH,
        petRootTxid: PET_ROOT,
        authorInstall: 'install-1',
        caption: 'Golden retriever at the beach',
        createdAt: 1,
      });
      store.verifyPost(CONTENT_HASH, 'ab'.repeat(32), 2);
      expect(store.searchPostIds('beach')).toEqual([CONTENT_HASH]);
      expect(store.searchPostIds('retriev')).toEqual([CONTENT_HASH]);

      store.removePost(CONTENT_HASH, 'install-1');
      expect(store.searchPostIds('beach')).toEqual([]);
      expect(store.listFeed()).toHaveLength(0);
    } finally {
      close();
    }
  });

  it('ranks trending posts by atom-weighted gravity', () => {
    const { store, close } = freshStore();
    try {
      const now = Date.now();
      store.createPost({
        id: CONTENT_HASH,
        petRootTxid: PET_ROOT,
        authorInstall: 'install-1',
        caption: 'Older but heavier',
        createdAt: now - 86_400_000,
      });
      store.verifyPost(CONTENT_HASH, 'ab'.repeat(32), now - 86_400_000);
      store.createPost({
        id: 'f1'.repeat(32),
        petRootTxid: PET_ROOT,
        authorInstall: 'install-1',
        caption: 'Newer but light',
        createdAt: now - 1000,
      });
      store.verifyPost('f1'.repeat(32), 'ac'.repeat(32), now - 1000);

      store.recordVote({
        txid: '11'.repeat(32),
        postId: CONTENT_HASH,
        direction: 1,
        atoms: 108,
        burnedBy: 'ecash:qqq',
        votedAt: now - 86_400_000,
      });
      store.recordVote({
        txid: '22'.repeat(32),
        postId: 'f1'.repeat(32),
        direction: 1,
        atoms: 1,
        burnedBy: 'ecash:qqq',
        votedAt: now - 1000,
      });

      const ranked = store.listTrending(14, 10, now);
      expect(ranked[0]!.id).toBe(CONTENT_HASH);
    } finally {
      close();
    }
  });

  it('binds and looks up user profiles', () => {
    const { store, close } = freshStore();
    try {
      const bound = store.bindUser({ installId: 'install-1', address: 'ecash:QqAbC' });
      expect(bound.address).toBe('ecash:qqabc');
      expect(store.getUser('install-1')?.address).toBe('ecash:qqabc');
      expect(store.getUserByAddress('ECASH:QQABC')?.installId).toBe('install-1');
      expect(store.getUser('missing')).toBeNull();

      const rebound = store.bindUser({
        installId: 'install-1',
        address: 'ecash:newaddress',
      });
      expect(rebound.createdAt).toBe(bound.createdAt);
      expect(store.getUser('install-1')?.address).toBe('ecash:newaddress');
    } finally {
      close();
    }
  });

  it('persists the ingest cursor', () => {
    const { sqlite, db } = openSocialDb(':memory:');
    const store = new SocialStore(sqlite, db);
    try {
      expect(store.getIngestCursor()).toBeNull();
      store.setIngestCursor('ab'.repeat(32));
      expect(store.getIngestCursor()).toBe('ab'.repeat(32));
      store.setIngestCursor('cd'.repeat(32));
      expect(store.getIngestCursor()).toBe('cd'.repeat(32));
    } finally {
      sqlite.close();
    }
  });
});

describe('ftsQuery', () => {
  it('builds safe prefix terms and drops syntax noise', () => {
    expect(ftsQuery('luna beach')).toBe('"luna"* "beach"*');
    expect(ftsQuery('  ')).toBe('');
    expect(ftsQuery('a"b(c)*')).toBe('"a"* "b"* "c"*');
  });
});

describe('MediaStore', () => {
  let dir: string;
  let store: MediaStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'onest-media-'));
    store = new MediaStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function pngBytes(): Uint8Array {
    const bytes = new Uint8Array(64);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes.set([1, 2, 3, 4], 8);
    return bytes;
  }

  it('stores valid images under their sha256 key', () => {
    const bytes = pngBytes();
    const sha = createHash('sha256').update(bytes).digest('hex');
    const stored = store.put(bytes, sha);
    expect(stored).toEqual({ sha256: sha, mime: 'image/png', bytes: 64 });
    expect(store.has(sha)).toBe(true);
    expect(store.read(sha)?.length).toBe(64);
  });

  it('rejects hash mismatches, junk bytes and invalid keys', () => {
    const bytes = pngBytes();
    const sha = createHash('sha256').update(bytes).digest('hex');
    expect(() => store.put(bytes, 'ab'.repeat(32))).toThrow(/hash/i);
    expect(() => store.put(new TextEncoder().encode('<html></html>'.repeat(4)), sha)).toThrow(
      /unsupported|hash/i,
    );
    expect(() => store.put(bytes, 'not-hex')).toThrow(/sha256/);
  });
});
