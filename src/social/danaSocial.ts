/**
 * DANA social wire payloads on top of the existing DANA lokad.
 *
 *   v1/v2  memorial / tribute        (see danaMemorial.ts)
 *   v3     vote burn                 DANA | 3 | direction | targetType | postHash
 *   v4     post content-hash stamp   DANA | 4 | len=32 | contentHash
 *
 * Every v3/v4 payload rides a PAW burn tx; XEC only covers network fees.
 * The vote sender is read from the tx inputs — never encoded here.
 */

export const DANA_VERSION_VOTE = 3;
export const DANA_VERSION_POST = 4;

export const VOTE_DIRECTION_UP = 1;
export const VOTE_DIRECTION_DOWN = 0;

/** Lixi `BurnForType.Post` — kept for family compatibility. */
export const VOTE_TARGET_TYPE_POST = 0x5f02;

export const POST_STAMP_HASH_LEN = 32;

export const VOTE_PAYLOAD_LEN = 4 + 1 + 1 + 2 + POST_STAMP_HASH_LEN; // 40
export const POST_STAMP_PAYLOAD_LEN = 4 + 1 + 1 + POST_STAMP_HASH_LEN; // 38

export type VoteDirection = typeof VOTE_DIRECTION_UP | typeof VOTE_DIRECTION_DOWN;

export const DANA_LOKAD_BYTES = new TextEncoder().encode('DANA');

/** Unit separator used by the profile packing and the post content hash. */
export const SOCIAL_FIELD_SEP = '\u001f';

const TXID_HEX_RE = /^[0-9a-f]{64}$/;

export function isHex64(raw: string | null | undefined): boolean {
  return TXID_HEX_RE.test(String(raw || '').trim().toLowerCase());
}

export function normalizeHex64(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim().toLowerCase();
  return TXID_HEX_RE.test(t) ? t : null;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

function lokadEquals(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  for (let i = 0; i < 4; i++) {
    if (data[i] !== DANA_LOKAD_BYTES[i]) return false;
  }
  return true;
}

export function normalizeVoteDirection(raw: unknown): VoteDirection | null {
  if (raw === VOTE_DIRECTION_UP || raw === '1' || raw === 'up' || raw === true) {
    return VOTE_DIRECTION_UP;
  }
  if (raw === VOTE_DIRECTION_DOWN || raw === '0' || raw === 'down' || raw === false) {
    return VOTE_DIRECTION_DOWN;
  }
  return null;
}

export function voteDirectionLabel(direction: VoteDirection): 'up' | 'down' {
  return direction === VOTE_DIRECTION_UP ? 'up' : 'down';
}

export interface VoteFields {
  version: typeof DANA_VERSION_VOTE;
  direction: VoteDirection;
  targetType: number;
  postHash: string;
  lokad: 'DANA';
}

export interface PostStampFields {
  version: typeof DANA_VERSION_POST;
  contentHash: string;
  lokad: 'DANA';
}

export function encodeVotePushdata(opts: {
  direction: VoteDirection;
  postHash: string;
  targetType?: number;
}): Uint8Array {
  const postHash = normalizeHex64(opts.postHash);
  if (!postHash) throw new Error('postHash must be 64 hex characters');
  const targetType = opts.targetType ?? VOTE_TARGET_TYPE_POST;
  if (!Number.isInteger(targetType) || targetType < 0 || targetType > 0xffff) {
    throw new Error(`targetType out of range: ${targetType}`);
  }
  const out = new Uint8Array(VOTE_PAYLOAD_LEN);
  out.set(DANA_LOKAD_BYTES, 0);
  out[4] = DANA_VERSION_VOTE;
  out[5] = opts.direction;
  out[6] = (targetType >> 8) & 0xff;
  out[7] = targetType & 0xff;
  out.set(hexToBytes(postHash), 8);
  return out;
}

export function encodePostStampPushdata(contentHash: string): Uint8Array {
  const hash = normalizeHex64(contentHash);
  if (!hash) throw new Error('contentHash must be 64 hex characters');
  const out = new Uint8Array(POST_STAMP_PAYLOAD_LEN);
  out.set(DANA_LOKAD_BYTES, 0);
  out[4] = DANA_VERSION_POST;
  out[5] = POST_STAMP_HASH_LEN;
  out.set(hexToBytes(hash), 6);
  return out;
}

export function parseVotePushdata(data: Uint8Array): VoteFields {
  if (!lokadEquals(data)) throw new Error('Pushdata does not start with DANA');
  if (data.length < VOTE_PAYLOAD_LEN) throw new Error('Truncated DANA vote payload');
  const version = data[4]!;
  if (version !== DANA_VERSION_VOTE) {
    throw new Error(`Not a DANA v3 vote payload (version ${version})`);
  }
  const directionByte = data[5]!;
  if (directionByte !== VOTE_DIRECTION_UP && directionByte !== VOTE_DIRECTION_DOWN) {
    throw new Error(`Invalid vote direction: ${directionByte}`);
  }
  const targetType = (data[6]! << 8) | data[7]!;
  const postHash = bytesToHex(data.slice(8, 8 + POST_STAMP_HASH_LEN));
  return {
    version: DANA_VERSION_VOTE,
    direction: directionByte,
    targetType,
    postHash,
    lokad: 'DANA',
  };
}

export function parsePostStampPushdata(data: Uint8Array): PostStampFields {
  if (!lokadEquals(data)) throw new Error('Pushdata does not start with DANA');
  if (data.length < POST_STAMP_PAYLOAD_LEN) throw new Error('Truncated DANA post stamp');
  const version = data[4]!;
  if (version !== DANA_VERSION_POST) {
    throw new Error(`Not a DANA v4 post stamp (version ${version})`);
  }
  const hashLen = data[5]!;
  if (hashLen !== POST_STAMP_HASH_LEN) {
    throw new Error(`Unsupported post hash length: ${hashLen}`);
  }
  const contentHash = bytesToHex(data.slice(6, 6 + POST_STAMP_HASH_LEN));
  return { version: DANA_VERSION_POST, contentHash, lokad: 'DANA' };
}
