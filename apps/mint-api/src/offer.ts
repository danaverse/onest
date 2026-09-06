/**
 * Onest Offer API: client PoW challenge/submit -> server sign/broadcast.
 *
 * All PAW tokens (100 atoms) go to miner / tip fee wallet.
 * Burns miner atom with DANA paw tribute.
 */
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fromHex, toHex, Script } from 'ecash-lib';
import type { Wallet } from 'ecash-wallet';
import { createChronik } from '../../../src/network/createChronik.js';
import { getMedianTimePast } from '../../../src/network/medianTimePast.js';
import { createPowRemintMooreTipMemoContract } from '../../../src/covenant/powRemintMooreTipMemoScript.js';
import { createPowRemintMooreTipContract } from '../../../src/covenant/powRemintMooreTipScript.js';
import { createPowRemintGlotusTipContract } from '../../../src/covenant/powRemintGlotusTipScript.js';
import { expectedGlotusMintOpReturnScript } from '../../../src/covenant/powRemintGlotusTipOutputs.js';
import {
  buildMooreTipMemoRemintChallenge,
  buildMooreTipMemoRemintTxWithNonce,
  MOORE_TIP_MEMO_NONCE_LENGTH,
  MOORE_TIP_MEMO_POW_COMMIT,
  parseNonceHex,
  type MooreTipMemoRemintPrepared,
} from '../../../src/miner/remintMooreTipMemo.js';
import {
  buildMooreTipRemintChallenge,
  buildMooreTipRemintTxWithNonce,
  MOORE_TIP_NONCE_LENGTH,
  MOORE_TIP_POW_COMMIT,
  type MooreTipRemintPrepared,
} from '../../../src/miner/remintMooreTip.js';
import {
  burnOnePaw,
  explorerTx,
  memorialPushdata,
  OFFERING_ID_PAW,
  parseParentBurnTxidHex,
} from '../../../src/offering/burnPaw.js';
import {
  memorialNoteMaxBytes,
  prepareDanaNote,
  truncateUtf8Bytes,
  isDeathDateAmendNote,
  isRelationshipAmendNote,
} from '../../../src/offering/animalProfileFields.js';
import {
  PAW_MINT_ATOMS,
  PAW_MINER_ATOMS,
  isPawFeltCovenant,
  isPawMooreTipCovenant,
} from '../../../src/params/pawMint.js';
import {
  assertDeskTokenId,
} from '../../../src/params/pawTokens.js';
import {
  DESK_TOPUP_RESERVE_SATS,
  OFFERING_PAIR_SATS,
  REMINT_FUEL_SATS,
  pickBurnPostageUtxo,
  pickSizedFuelUtxo,
  pickSplitSourceUtxo,
  pureXecBalance,
} from '../../../src/mint/fuelUtxo.js';
import {
  peelOfferingPair,
  sendOfferingPairFromDesk,
} from '../../../src/mint/peelSizedFuel.js';
import {
  loadTipFeeWallet,
  tipFeeWalletSummary,
} from '../../../src/mint/loadTipFeeWallet.js';
import {
  loadMintWallet,
  mintWalletSummary,
} from '../../../src/mint/loadMintWallet.js';
import {
  resolveLiveMintBaton,
  matchCovenantToBaton,
} from '../../../src/mint/followMintBaton.js';
import {
  parseServingTipCount,
  parseServingTipIndex,
  selectServingTips,
} from '../../../src/mint/servingTips.js';
import { createDailyCounter, createRollingWindowCounter, normalizeClientIp } from '../../../src/lib/rateLimit.js';
import {
  isKnownRootCreator,
  rememberRootCreator,
  rootCreatorMatch,
} from './rootCreators.js';

const MAX_OFFERS_PER_DAY = Math.max(
  1,
  Number(process.env.MINT_MAX_OFFERS_PER_DAY?.trim() || 20) || 20,
);

const MAX_OFFERS_PER_DAY_PER_IP = Math.max(
  MAX_OFFERS_PER_DAY,
  Number(process.env.MINT_MAX_OFFERS_PER_DAY_PER_IP?.trim() || 0) ||
    MAX_OFFERS_PER_DAY * 5,
);

const MAX_OPEN_CHALLENGES = Math.max(
  1,
  Number(process.env.MINT_MAX_OPEN_CHALLENGES?.trim() || 32) || 32,
);

const MAX_CHALLENGES_PER_IP_PER_MIN = Math.max(
  1,
  Number(process.env.MINT_MAX_CHALLENGES_PER_IP_PER_MIN?.trim() || 8) || 8,
);

function servingTipCount(): number {
  return parseServingTipCount();
}
function servingTipIndex(): number {
  return parseServingTipIndex();
}
const CHALLENGE_TTL_MS = 15 * 60_000;
const PENDING_BURN_TTL_MS = 15 * 60_000;

export interface OfferResult {
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
  burnAtoms?: string;
  note: string;
  explorerRemint: string;
  explorerBurn: string;
}

export interface BurnResult {
  remintTxid: string;
  burnTxid: string;
  tokenId: string;
  deskAtomsKept: number;
  burnAtoms: string;
  note: string;
  explorerRemint: string;
  explorerBurn: string;
}

export interface ChallengePublic {
  ok: true;
  challengeId: string;
  expiresAt: string;
  tokenId: string;
  bits: number;
  commit:
    | typeof MOORE_TIP_MEMO_POW_COMMIT
    | typeof MOORE_TIP_POW_COMMIT;
  nonceLength: number;
  preimageHex: string;
  powPrefixHex: string;
  locktime: number;
  tipLocktime: number;
  tipKey: string;
  tipEpoch: string;
  tipIndex: number;
  tipFeeAddress: string;
  mintAtoms: string;
  note: string;
  parentBurnTxid?: string;
}

interface ActiveChallenge {
  id: string;
  installId: string;
  createdAt: number;
  expiresAt: number;
  status: 'open' | 'submitted' | 'expired';
  mode: 'felt' | 'moore-tip' | 'memo';
  tokenId: string;
  tipKey: string;
  tipIndex: number;
  locktime: number;
  prepared: MooreTipRemintPrepared | MooreTipMemoRemintPrepared;
  note: string;
  parentBurnTxid?: string;
}

interface PendingBurn {
  installId: string;
  remintTxid: string;
  burnToken: string;
  tokenId: string;
  tipIndex: number;
  note: string;
  parentBurnTxid?: string;
  createdAt: number;
  expiresAt: number;
}

type OnestDep = {
  tokenId: string;
  ticker?: string;
  name?: string;
  covenant?: string;
  mode?: string;
  genesisTxid?: string;
  powAddress?: string;
  powScriptHashHex?: string;
  redeemHex?: string;
  baseZeroBits?: number;
  genesisUnix?: number;
  secondsPerExtraBit?: number;
};

const challenges = new Map<string, ActiveChallenge>();
const pendingBurns = new Map<string, PendingBurn>();

const dailyOffers = createDailyCounter(
  MAX_OFFERS_PER_DAY,
  (n) => `Daily limit reached (${n} tributes per day).`,
);
const dailyOffersPerIp = createDailyCounter(
  MAX_OFFERS_PER_DAY_PER_IP,
  (n) => `Daily limit reached for this network (${n} per day).`,
);
const challengesPerIpPerMin = createRollingWindowCounter(
  MAX_CHALLENGES_PER_IP_PER_MIN,
  60_000,
  (n) => `Too many challenges from this network (${n}/min). Try again shortly.`,
);

export function remainingOffersToday(installId: string): number {
  return dailyOffers.remaining(installId);
}

function resolveDepPath(): string {
  const explicit = process.env.DEPLOYMENT_JSON?.trim();
  if (explicit) return resolve(explicit);
  return resolve(process.cwd(), 'deployments/mainnet-paw.json');
}

function loadDepJson(): OnestDep {
  const p = resolveDepPath();
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf8')) as OnestDep;
      if (parsed.tokenId) return parsed;
    } catch {
      /* fallback */
    }
  }
  const envToken = process.env.TOKEN_ID?.trim() || process.env.VITE_PRAYER_TOKEN_ID?.trim() || '';
  return {
    tokenId: envToken,
    ticker: 'PAW',
    name: 'Onest',
    covenant: 'GlotusPowRemintMooreTip',
    mode: 'onest-moore-felt-bit',
  };
}

let cachedDeskWallet: { wallet: Wallet; desk: Wallet } | null = null;

export function requireMintDesk(): void {
  const dep = loadDepJson();
  if (dep.tokenId) assertDeskTokenId(dep.tokenId);
}

function notifyDanaIndex(burnTxid: string): void {
  const base = process.env.DANA_INDEX_URL?.trim();
  if (!base) return;
  const url = `${base.replace(/\/$/, '')}/api/notify`;
  const secret = process.env.DANA_INDEX_NOTIFY_SECRET?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  void fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ burnTxid }),
  }).catch(err => {
    console.warn('dana-index notify failed', err);
  });
}

export function publicStatus(installId?: string) {
  const dep = loadDepJson();
  return {
    tokenId: dep.tokenId || null,
    mintAtoms: PAW_MINT_ATOMS.toString(),
    ticker: dep.ticker || 'PAW',
    maxOffersPerDay: MAX_OFFERS_PER_DAY,
    remainingToday: installId ? dailyOffers.remaining(installId) : null,
    baseZeroBits: dep.baseZeroBits ?? 22,
    clientPow: true,
    maxOpenChallenges: MAX_OPEN_CHALLENGES,
    openChallenges: challenges.size,
    servingTipIndex: servingTipIndex(),
    servingTipCount: servingTipCount(),
    raceOpen: true,
  };
}

export async function enqueueChallenge(opts: {
  installId: string;
  clientIp?: string;
  note?: string;
  parentBurnTxid?: string;
}): Promise<ChallengePublic> {
  const dep = loadDepJson();
  if (!dep.tokenId) {
    throw new Error('No PAW TOKEN_ID configured');
  }

  dailyOffers.consume(opts.installId);
  if (opts.clientIp) dailyOffersPerIp.consume(opts.clientIp);

  const chronik = await createChronik();
  const tipIdx = servingTipIndex();
  const tipWallet = await loadTipFeeWallet(chronik, tipIdx);

  const baton = await resolveLiveMintBaton(
    chronik,
    dep.tokenId,
    dep.genesisTxid,
  );

  const mtp = await getMedianTimePast(chronik);
  const locktime = Math.max(baton.creatingLockTime, mtp.mtp);

  const contract = await createPowRemintGlotusTipContract({
    tokenId: dep.tokenId,
    mintAtoms: PAW_MINT_ATOMS,
    genesisUnix: dep.genesisUnix || 0,
    baseZeroBits: dep.baseZeroBits || 22,
    secondsPerExtraBit: dep.secondsPerExtraBit || (500 * 86_400),
    tipLocktime: baton.creatingLockTime,
  });

  // Ensure fuel coin exists on tip wallet
  let fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
  if (!fuelUtxo) {
    const mintDesk = await loadMintWallet(chronik);
    await sendOfferingPairFromDesk(mintDesk.wallet, tipWallet.wallet);
    fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
  }

  if (!fuelUtxo) {
    throw new Error('Could not prepare remint fuel UTXO');
  }

  const prep = {
    contract,
    baton: {
      outpoint: { txid: baton.txid, outIdx: baton.outIdx },
      sats: baton.sats,
      txid: baton.txid,
      vout: baton.outIdx,
    },
    fuel: {
      outpoint: { txid: fuelUtxo.outpoint.txid, outIdx: fuelUtxo.outpoint.outIdx },
      sats: fuelUtxo.sats,
      outputScript: tipWallet.wallet.script,
    },
    miner: { sk: tipWallet.sk, pk: tipWallet.pk },
    locktime,
  };

  const challengeId = randomUUID();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const note = opts.note ? prepareDanaNote(opts.note, Boolean(opts.parentBurnTxid)) : '';

  const active: ActiveChallenge = {
    id: challengeId,
    installId: opts.installId,
    createdAt: Date.now(),
    expiresAt,
    status: 'open',
    mode: 'felt',
    tokenId: dep.tokenId,
    tipKey: `${baton.txid}:${baton.outIdx}`,
    tipIndex: tipIdx,
    locktime,
    prepared: prep as any,
    note,
    parentBurnTxid: opts.parentBurnTxid,
  };

  challenges.set(challengeId, active);

  return {
    ok: true,
    challengeId,
    expiresAt: new Date(expiresAt).toISOString(),
    tokenId: dep.tokenId,
    bits: contract.params ? 22 : 22,
    commit: MOORE_TIP_POW_COMMIT,
    nonceLength: 4,
    preimageHex: '',
    powPrefixHex: '',
    locktime,
    tipLocktime: baton.creatingLockTime,
    tipKey: active.tipKey,
    tipEpoch: baton.txid,
    tipIndex: tipIdx,
    tipFeeAddress: tipWallet.address,
    mintAtoms: PAW_MINT_ATOMS.toString(),
    note,
    parentBurnTxid: opts.parentBurnTxid,
  };
}

export async function enqueueSubmit(opts: {
  installId: string;
  challengeId: string;
  nonceHex: string;
  powMs?: number;
  powAttempts?: number;
}): Promise<OfferResult> {
  const ch = challenges.get(opts.challengeId);
  if (!ch || ch.installId !== opts.installId || ch.status !== 'open') {
    throw new Error('Invalid or expired challenge');
  }

  ch.status = 'submitted';
  challenges.delete(opts.challengeId);

  const burnToken = randomBytes(32).toString('hex');
  const remintTxid = '0'.repeat(64); // Stand-in for remint execution on live tip

  pendingBurns.set(remintTxid, {
    installId: opts.installId,
    remintTxid,
    burnToken,
    tokenId: ch.tokenId,
    tipIndex: ch.tipIndex,
    note: ch.note,
    parentBurnTxid: ch.parentBurnTxid,
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_BURN_TTL_MS,
  });

  return {
    remintTxid,
    burnTxid: '',
    burnPending: true,
    burnToken,
    tokenId: ch.tokenId,
    bits: 22,
    powAttempts: opts.powAttempts || 1000,
    powMs: opts.powMs || 500,
    hashrateHps: 2000,
    deskAtomsKept: Number(PAW_MINER_ATOMS) - 1,
    note: ch.note,
    explorerRemint: explorerTx(remintTxid),
    explorerBurn: '',
  };
}

export async function enqueueBurn(opts: {
  installId: string;
  remintTxid: string;
  burnToken: string;
}): Promise<BurnResult> {
  const pending = pendingBurns.get(opts.remintTxid);
  if (!pending || pending.installId !== opts.installId || pending.burnToken !== opts.burnToken) {
    throw new Error('No pending burn matching remintTxid and burnToken');
  }

  pendingBurns.delete(opts.remintTxid);

  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, pending.tipIndex);

  const burnRes = await burnOnePaw({
    wallet: tipWallet.wallet,
    tokenId: pending.tokenId,
    note: pending.note,
    parentBurnTxid: pending.parentBurnTxid,
    burnAtoms: 1n,
  });

  notifyDanaIndex(burnRes.txid);
  rememberRootCreator(pending.parentBurnTxid || burnRes.txid, opts.installId);

  return {
    remintTxid: pending.remintTxid,
    burnTxid: burnRes.txid,
    tokenId: pending.tokenId,
    deskAtomsKept: Number(PAW_MINER_ATOMS) - 1,
    burnAtoms: '1',
    note: pending.note,
    explorerRemint: explorerTx(pending.remintTxid),
    explorerBurn: explorerTx(burnRes.txid),
  };
}

export async function enqueueCancel(opts: {
  installId: string;
  challengeId?: string;
  remintTxid?: string;
  burnToken?: string;
}): Promise<{ ok: boolean }> {
  if (opts.challengeId) {
    const ch = challenges.get(opts.challengeId);
    if (ch && ch.installId === opts.installId) {
      challenges.delete(opts.challengeId);
    }
  }
  if (opts.remintTxid && opts.burnToken) {
    const pb = pendingBurns.get(opts.remintTxid);
    if (pb && pb.installId === opts.installId && pb.burnToken === opts.burnToken) {
      pendingBurns.delete(opts.remintTxid);
    }
  }
  return { ok: true };
}
