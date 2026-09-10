/**
 * Post content hash — canonical, versioned, shared by web + indexer.
 *
 *   sha256( 'onest-post-v1' \x1f caption \x1f mediaHashes \x1f
 *           petRootTxid \x1f author \x1f createdAt )
 *
 * The indexer recomputes this from the hosted row before trusting a v4 stamp.
 * Editing a caption requires a new stamp: the hash commits to content + author.
 */
import { utf8ByteLength } from '../offering/animalProfileFields.js';
import { isHex64, normalizeHex64, SOCIAL_FIELD_SEP } from './danaSocial.js';

export const POST_CONTENT_HASH_VERSION = 'onest-post-v1';

export const CAPTION_MAX_CHARS = 500;
export const CAPTION_MAX_BYTES = 2000;
export const MAX_POST_MEDIA = 4;

export function normalizeCaption(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replaceAll(SOCIAL_FIELD_SEP, ' ')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function validateCaption(
  raw: string | null | undefined,
): { ok: true; caption: string } | { ok: false; error: string } {
  const caption = normalizeCaption(raw);
  if (caption.length > CAPTION_MAX_CHARS) {
    return { ok: false, error: `caption exceeds ${CAPTION_MAX_CHARS} characters` };
  }
  if (utf8ByteLength(caption) > CAPTION_MAX_BYTES) {
    return { ok: false, error: `caption exceeds ${CAPTION_MAX_BYTES} bytes` };
  }
  return { ok: true, caption };
}

export interface PostContentHashInput {
  caption: string;
  mediaHashes: readonly string[];
  petRootTxid: string;
  author: string;
  createdAt: number;
}

export interface NormalizedPostContent {
  caption: string;
  mediaHashes: string[];
  petRootTxid: string;
  author: string;
  createdAt: number;
}

export function validatePostContentInput(
  input: PostContentHashInput,
): { ok: true; value: NormalizedPostContent } | { ok: false; error: string } {
  const captionCheck = validateCaption(input.caption);
  if (!captionCheck.ok) return captionCheck;

  const mediaHashes: string[] = [];
  for (const raw of input.mediaHashes ?? []) {
    const hash = normalizeHex64(raw);
    if (!hash) return { ok: false, error: 'mediaHashes must be 64 hex characters each' };
    mediaHashes.push(hash);
  }
  if (mediaHashes.length > MAX_POST_MEDIA) {
    return { ok: false, error: `at most ${MAX_POST_MEDIA} media items per post` };
  }

  const petRootTxid = normalizeHex64(input.petRootTxid);
  if (!petRootTxid) return { ok: false, error: 'petRootTxid must be 64 hex characters' };

  const author = String(input.author ?? '').trim();
  if (!author || author.length > 128) {
    return { ok: false, error: 'author required (1–128 chars)' };
  }

  const createdAt = Math.floor(Number(input.createdAt));
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) {
    return { ok: false, error: 'createdAt must be a positive unix ms integer' };
  }

  return {
    ok: true,
    value: {
      caption: captionCheck.caption,
      mediaHashes,
      petRootTxid,
      author: author.toLowerCase(),
      createdAt,
    },
  };
}

export function canonicalPostContent(
  value: NormalizedPostContent,
  version = POST_CONTENT_HASH_VERSION,
): string {
  return [
    version,
    value.caption,
    value.mediaHashes.join(','),
    value.petRootTxid.toLowerCase(),
    value.author.toLowerCase(),
    String(value.createdAt),
  ].join(SOCIAL_FIELD_SEP);
}

async function sha256Hex(raw: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  );
  let out = '';
  for (const b of new Uint8Array(digest)) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Compute the canonical content hash. Throws when input is invalid —
 * callers should use `validatePostContentInput` first for friendly errors.
 */
export async function computePostContentHash(input: PostContentHashInput): Promise<string> {
  const check = validatePostContentInput(input);
  if (!check.ok) throw new Error(check.error);
  return sha256Hex(canonicalPostContent(check.value));
}

export { isHex64, normalizeHex64 };
