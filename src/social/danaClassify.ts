/**
 * Pure DANA push classifier — no heavyweight imports so it stays unit-testable.
 * Script/EMPP parsing lives in danaFromScript.ts.
 */
import {
  parseMemorialPushdata,
  type MemorialFields,
} from '../offering/danaMemorial.js';
import {
  parsePostStampPushdata,
  parseVotePushdata,
  type PostStampFields,
  type VoteFields,
} from './danaSocial.js';

export type DanaPush =
  | { kind: 'memorial'; memorial: MemorialFields }
  | { kind: 'vote'; vote: VoteFields }
  | { kind: 'post'; post: PostStampFields };

const DANA_MAGIC = [0x44, 0x41, 0x4e, 0x41]; // 'DANA'

function startsWithDana(push: Uint8Array): boolean {
  if (push.length < 5) return false;
  for (let i = 0; i < 4; i++) {
    if (push[i] !== DANA_MAGIC[i]) return false;
  }
  return true;
}

export function classifyDanaPush(push: Uint8Array): DanaPush | null {
  if (!startsWithDana(push)) return null;
  // ALP mint pushdata guard kept from the memorial parser.
  if (push.length === 15 && push[4] === 4) return null;

  const version = push[4]!;
  if (version === 1 || version === 2) {
    try {
      return { kind: 'memorial', memorial: parseMemorialPushdata(push) };
    } catch {
      return null;
    }
  }
  if (version === 3) {
    try {
      return { kind: 'vote', vote: parseVotePushdata(push) };
    } catch {
      return null;
    }
  }
  if (version === 4) {
    try {
      return { kind: 'post', post: parsePostStampPushdata(push) };
    } catch {
      return null;
    }
  }
  return null;
}

export function danaPushFromEmppPushes(pushes: Uint8Array[]): DanaPush | null {
  for (const push of pushes) {
    const classified = classifyDanaPush(push);
    if (classified) return classified;
  }
  return null;
}
