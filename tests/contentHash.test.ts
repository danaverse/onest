import { createHash } from 'node:crypto';
import {
  canonicalPostContent,
  computePostContentHash,
  normalizeCaption,
  validatePostContentInput,
  POST_CONTENT_HASH_VERSION,
  type NormalizedPostContent,
} from '../src/social/contentHash.js';

const PET_ROOT = 'aa'.repeat(32);
const MEDIA_A = 'bb'.repeat(32);
const MEDIA_B = 'cc'.repeat(32);

const baseInput = {
  caption: 'Luna at the beach',
  mediaHashes: [MEDIA_A],
  petRootTxid: PET_ROOT,
  author: 'InstallAbC123',
  createdAt: 1_788_000_000_000,
};

describe('post content hash', () => {
  it('matches an independent sha256 of the canonical string', async () => {
    const normalized: NormalizedPostContent = {
      caption: 'Luna at the beach',
      mediaHashes: [MEDIA_A],
      petRootTxid: PET_ROOT,
      author: 'installabc123',
      createdAt: baseInput.createdAt,
    };
    const canonical = [
      POST_CONTENT_HASH_VERSION,
      normalized.caption,
      MEDIA_A,
      PET_ROOT,
      'installabc123',
      String(baseInput.createdAt),
    ].join('\u001f');
    const expected = createHash('sha256').update(canonical, 'utf8').digest('hex');

    await expect(computePostContentHash(baseInput)).resolves.toBe(expected);
    expect(canonicalPostContent(normalized)).toBe(canonical);
  });

  it('is deterministic for the same input', async () => {
    const a = await computePostContentHash(baseInput);
    const b = await computePostContentHash({ ...baseInput });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when caption, media order, root, author or time change', async () => {
    const a = await computePostContentHash(baseInput);
    const variants = [
      { ...baseInput, caption: 'Different' },
      { ...baseInput, mediaHashes: [MEDIA_B, MEDIA_A] },
      { ...baseInput, petRootTxid: 'dd'.repeat(32) },
      { ...baseInput, author: 'SomeoneElse' },
      { ...baseInput, createdAt: baseInput.createdAt + 1 },
    ];
    for (const v of variants) {
      await expect(computePostContentHash(v)).resolves.not.toBe(a);
    }
  });

  it('normalizes captions before hashing', async () => {
    const plain = await computePostContentHash({ ...baseInput, caption: 'Hello world' });
    const noisy = await computePostContentHash({
      ...baseInput,
      caption: '  Hello\u001fworld  ',
    });
    expect(noisy).toBe(plain);
    expect(normalizeCaption('  a\u001fb  ')).toBe('a b');
  });

  it('rejects invalid inputs with friendly errors', () => {
    expect(validatePostContentInput({ ...baseInput, mediaHashes: ['nope'] })).toEqual({
      ok: false,
      error: 'mediaHashes must be 64 hex characters each',
    });
    expect(
      validatePostContentInput({
        ...baseInput,
        mediaHashes: Array.from({ length: 5 }, (_, i) => String(i).repeat(64).slice(0, 64)),
      }).ok,
    ).toBe(false);
    expect(validatePostContentInput({ ...baseInput, petRootTxid: 'short' }).ok).toBe(false);
    expect(validatePostContentInput({ ...baseInput, author: '' }).ok).toBe(false);
    expect(validatePostContentInput({ ...baseInput, createdAt: 0 }).ok).toBe(false);
    expect(validatePostContentInput({ ...baseInput, caption: 'x'.repeat(501) }).ok).toBe(false);
  });
});
