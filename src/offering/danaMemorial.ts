/**
 * Dana memorial EMPP payload (pure; no wallet deps).
 *
 * LOKAD: **DANA** (`44414e41`)
 * Memorial layout:
 *   v1: DANA | ver=1 | idLen | id | noteLen | note
 *   v2: DANA | ver=2 | idLen | id | noteLen | note | parentLen | parentTxid
 */

import {
  memorialNoteMaxBytes,
  truncateUtf8Bytes,
} from './animalProfileFields.js';

export const DANA_LOKAD = new TextEncoder().encode('DANA');

export const DANA_VERSION = 1;
export const DANA_VERSION_PARENT = 2;
export const DANA_PARENT_TXID_LEN = 32;

export const OFFERING_ID_PAW = 'paw' as const;
export const OFFERING_ID_ONEST = 'onest' as const;
export const OFFERING_ID = OFFERING_ID_PAW;

const TXID_HEX_RE = /^[0-9a-fA-F]{64}$/;

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

function lokadEquals(data: Uint8Array, lokad: Uint8Array): boolean {
  if (data.length < 4) return false;
  for (let i = 0; i < 4; i++) {
    if (data[i] !== lokad[i]) return false;
  }
  return true;
}

export function parseParentBurnTxidHex(
  raw: string | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  const hex = String(raw).trim().toLowerCase();
  if (!hex) return undefined;
  if (!TXID_HEX_RE.test(hex)) {
    throw new Error('parentBurnTxid must be 64 hex characters');
  }
  return hex;
}

export interface MemorialFields {
  version: number;
  offeringId: string;
  note: string;
  parentBurnTxid?: string;
  lokad: 'DANA';
}

export function memorialPushdata(
  note: string,
  offeringId: string = OFFERING_ID_PAW,
  parentBurnTxid?: string,
): Uint8Array {
  const enc = new TextEncoder();
  const idBytes = enc.encode(offeringId);
  if (idBytes.length > 32) {
    throw new Error(`offeringId exceeds 32 bytes: ${offeringId}`);
  }

  const parent = parseParentBurnTxidHex(parentBurnTxid);
  const version = parent ? DANA_VERSION_PARENT : DANA_VERSION;
  const maxBytes = memorialNoteMaxBytes(Boolean(parent));
  const cleanNote = truncateUtf8Bytes(note.trim(), maxBytes);
  const noteBytes = enc.encode(cleanNote);

  const parentExtra = parent ? 1 + DANA_PARENT_TXID_LEN : 0;
  const total = 4 + 1 + 1 + idBytes.length + 1 + noteBytes.length + parentExtra;
  const out = new Uint8Array(total);
  let o = 0;

  out.set(DANA_LOKAD, o);
  o += 4;
  out[o++] = version;
  out[o++] = idBytes.length;
  out.set(idBytes, o);
  o += idBytes.length;
  out[o++] = noteBytes.length;
  out.set(noteBytes, o);
  o += noteBytes.length;

  if (parent) {
    out[o++] = DANA_PARENT_TXID_LEN;
    out.set(hexToBytes(parent), o);
  }

  return out;
}

export function parseMemorialPushdata(data: Uint8Array): MemorialFields {
  if (!lokadEquals(data, DANA_LOKAD)) {
    throw new Error('Pushdata does not start with DANA');
  }
  let o = 4;
  if (data.length < o + 3) {
    throw new Error('Truncated DANA header');
  }
  const version = data[o++]!;
  if (version !== DANA_VERSION && version !== DANA_VERSION_PARENT) {
    throw new Error(`Unsupported DANA version: ${version}`);
  }
  const idLen = data[o++]!;
  if (data.length < o + idLen + 1) {
    throw new Error('Truncated offeringId');
  }
  const idBytes = data.slice(o, o + idLen);
  o += idLen;
  const dec = new TextDecoder();
  const offeringId = dec.decode(idBytes);

  const noteLen = data[o++]!;
  if (data.length < o + noteLen) {
    throw new Error('Truncated note');
  }
  const noteBytes = data.slice(o, o + noteLen);
  o += noteLen;
  const note = dec.decode(noteBytes);

  let parentBurnTxid: string | undefined;
  if (version === DANA_VERSION_PARENT) {
    if (data.length < o + 1) {
      throw new Error('Truncated parentBurnTxid length');
    }
    const parentLen = data[o++]!;
    if (parentLen === 0) {
      parentBurnTxid = undefined;
    } else if (parentLen === DANA_PARENT_TXID_LEN) {
      if (data.length < o + DANA_PARENT_TXID_LEN) {
        throw new Error('Truncated parentBurnTxid');
      }
      parentBurnTxid = bytesToHex(
        data.slice(o, o + DANA_PARENT_TXID_LEN),
      ).toLowerCase();
      o += DANA_PARENT_TXID_LEN;
    } else {
      throw new Error(`Invalid parentBurnTxid length: ${parentLen}`);
    }
  }

  return {
    version,
    offeringId,
    note,
    parentBurnTxid,
    lokad: 'DANA',
  };
}
