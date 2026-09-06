import { MINT_API_BASE, getOrCreateInstallId } from './config.js';

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
}

export interface BurnOk {
  ok: true;
  remintTxid: string;
  burnTxid: string;
  tokenId: string;
  deskAtomsKept: number;
  explorerRemint: string;
  explorerBurn: string;
}

export interface StatusOk {
  tokenId: string | null;
  mintAtoms: string | null;
  ticker: string;
  maxOffersPerDay: number;
  remainingToday: number | null;
  baseZeroBits?: number | null;
  clientPow?: boolean;
}

export async function fetchStatus(): Promise<StatusOk> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${MINT_API_BASE}/api/status?installId=${encodeURIComponent(installId)}`);
  if (!res.ok) throw new Error(`Status HTTP ${res.status}`);
  return res.json();
}

export async function fetchChallenge(opts: {
  note?: string;
  parentBurnTxid?: string;
}): Promise<ChallengeOk> {
  const installId = getOrCreateInstallId();
  const res = await fetch(`${MINT_API_BASE}/api/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      note: opts.note,
      parentBurnTxid: opts.parentBurnTxid,
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Burn HTTP ${res.status}`);
  }
  return res.json();
}
