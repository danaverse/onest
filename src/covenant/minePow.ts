import { sha256, sha256d } from 'ecash-lib';
import { meetsPowBits } from '../lib/powBits.js';

export interface MinePowResult {
  nonce: Uint8Array;
  hash: Uint8Array;
  attempts: number;
}

export type PowCommit = 'preimage' | 'sha256-preimage';

export function minePowBits(opts: {
  preimage: Uint8Array;
  bits: number;
  nonceLength?: number;
  maxAttempts?: number;
  commit?: PowCommit;
}): MinePowResult {
  const nonceLen = opts.nonceLength ?? 4;
  const max = opts.maxAttempts ?? 5_000_000;
  const nonce = new Uint8Array(nonceLen);
  const bits = opts.bits;
  const commit = opts.commit ?? 'preimage';
  const prefix =
    commit === 'sha256-preimage' ? sha256(opts.preimage) : opts.preimage;

  for (let attempts = 1; attempts <= max; attempts++) {
    for (let i = 0; i < nonceLen; i++) {
      nonce[i] = (nonce[i] + 1) & 0xff;
      if (nonce[i] !== 0) break;
    }
    const buf = new Uint8Array(prefix.length + nonceLen);
    buf.set(prefix, 0);
    buf.set(nonce, prefix.length);
    const hash = sha256d(buf);
    if (meetsPowBits(hash, bits)) {
      return { nonce: nonce.slice(), hash, attempts };
    }
  }
  throw new Error(`PoW not found after ${max} attempts (target ${bits} bits)`);
}

export function verifyPowBits(
  optsOrPreimage:
    | {
        preimage: Uint8Array;
        nonce: Uint8Array;
        bits: number;
        commit?: PowCommit;
      }
    | Uint8Array,
  nonce?: Uint8Array,
  bits?: number,
  commit?: PowCommit,
): boolean {
  let p: Uint8Array;
  let n: Uint8Array;
  let b: number;
  let c: PowCommit;
  if (optsOrPreimage instanceof Uint8Array) {
    p = optsOrPreimage;
    n = nonce!;
    b = bits!;
    c = commit ?? 'preimage';
  } else {
    p = optsOrPreimage.preimage;
    n = optsOrPreimage.nonce;
    b = optsOrPreimage.bits;
    c = optsOrPreimage.commit ?? 'preimage';
  }
  const prefix = c === 'sha256-preimage' ? sha256(p) : p;
  const buf = new Uint8Array(prefix.length + n.length);
  buf.set(prefix, 0);
  buf.set(n, prefix.length);
  const hash = sha256d(buf);
  return meetsPowBits(hash, b);
}
