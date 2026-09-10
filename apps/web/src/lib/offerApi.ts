import { MINT_API_BASE, getOrCreateInstallId } from './config.js';

export type BurnKind = 'memorial' | 'post' | 'vote';

export interface ChallengeOk {
  ok: true;
  challengeId: string;
  expiresAt: string;
  tokenId: string;
  bits: number;
  commit: string;
  nonceLength: number;
  preimageHex: string;
  powPrefixHex: string;
  locktime: number;
  tipLocktime: number;
  tipKey?: string;
  tipEpoch?: string;
  tipIndex?: number;
  mintAtoms: string;
  note: string;
  parentBurnTxid?: string;
  kind?: BurnKind;
  contentHash?: string;
  postHash?: string;
  direction?: 0 | 1;
  targetType?: number;
  minPraySeconds?: number;
}

export interface OfferOk {
  ok: true;
  remintTxid: string;
  burnTxid: string;
  burnPending: boolean;
  burnToken?: string;
  tokenId: string;
  bits: number;
  powAttempts: number;
  powMs: number;
  hashrateHps: number;
  deskAtomsKept: number;
  explorerRemint: string;
  explorerBurn: string;
  kind?: BurnKind;
  /** ISO time before which the desk rejects the burn (server-enforced soft wait). */
  waitUntil?: string;
  minPraySeconds?: number;
}

export interface BurnOk {
  ok: true;
  remintTxid: string;
  burnTxid: string;
  tokenId: string;
  deskAtomsKept: number;
  explorerRemint: string;
  explorerBurn: string;
  kind?: BurnKind;
}

export interface StatusOk {
  tokenId: string | null;
  mintAtoms: string | null;
  ticker: string;
  maxOffersPerDay: number;
  remainingToday: number | null;
  baseZeroBits?: number | null;
  clientPow?: boolean;
  minPraySeconds?: number;
}

/** Thrown by /api/burn while the server-enforced soft wait is pending (HTTP 425). */
export class BurnWaitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number, message = 'Soft wait not elapsed') {
    super(message);
    this.name = 'BurnWaitError';
    this.retryAfterMs = Math.max(0, Math.ceil(retryAfterMs));
  }
}

export async function fetchStatus(): Promise<StatusOk> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${MINT_API_BASE}/api/status?installId=${encodeURIComponent(installId)}`);
  if (!res.ok) throw new Error(`Status HTTP ${res.status}`);
  return res.json();
}

export async function fetchChallenge(opts: {
  kind?: BurnKind;
  note?: string;
  parentBurnTxid?: string;
  contentHash?: string;
  postHash?: string;
  direction?: 0 | 1;
  targetType?: number;
}): Promise<ChallengeOk> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${MINT_API_BASE}/api/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      kind: opts.kind,
      note: opts.note,
      parentBurnTxid: opts.parentBurnTxid,
      contentHash: opts.contentHash,
      postHash: opts.postHash,
      direction: opts.direction,
      targetType: opts.targetType,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Challenge HTTP ${res.status}`);
  }
  return res.json();
}

export async function submitMinedOffer(opts: {
  challengeId: string;
  nonceHex: string;
  powMs?: number;
  powAttempts?: number;
}): Promise<OfferOk> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${MINT_API_BASE}/api/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      challengeId: opts.challengeId,
      nonceHex: opts.nonceHex,
      powMs: opts.powMs,
      powAttempts: opts.powAttempts,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Submit HTTP ${res.status}`);
  }
  return res.json();
}

export async function completeOfferBurn(opts: {
  remintTxid: string;
  burnToken: string;
}): Promise<BurnOk> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${MINT_API_BASE}/api/burn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      remintTxid: opts.remintTxid,
      burnToken: opts.burnToken,
    }),
  });
  if (res.status === 425) {
    const err = await res.json().catch(() => ({}));
    throw new BurnWaitError(
      Number(err.retryAfterMs ?? 1000),
      err.error || 'Soft wait not elapsed',
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Burn HTTP ${res.status}`);
  }
  return res.json();
}
