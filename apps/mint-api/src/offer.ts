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
import {
  createPowRemintWLotusCovenantContract,
  createPowRemintGlotusTipContract,
} from '../../../src/covenant/powRemintWLotusCovenantScript.js';
import {
  expectedWLotusCovenantMintOpReturnScript,
  expectedGlotusMintOpReturnScript,
} from '../../../src/covenant/powRemintWLotusCovenantOutputs.js';
import {
  buildMooreTipRemintChallenge,
  buildMooreTipRemintTxWithNonce,
  MOORE_TIP_NONCE_LENGTH,
  MOORE_TIP_POW_COMMIT,
  parseNonceHex,
  type MooreTipRemintPrepared,
} from '../../../src/miner/remintMooreTip.js';
import {
  computeMooreTipState,
} from '../../../src/covenant/mooreTip.js';
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
  WLOTUS_GENESIS_UNIX,
  POW_PAW_BASE_ZERO_BITS,
  isPawFeltCovenant,
  resolvePawListingFeeAtoms,
} from '../../../src/params/pawMint.js';
import {
  encodePostStampPushdata,
  encodeVotePushdata,
  normalizeHex64,
  normalizeVoteDirection,
  VOTE_TARGET_TYPE_POST,
  type VoteDirection,
} from '../../../src/social/danaSocial.js';
import {
  minPrayWaitUntilMs,
  parseMinPraySeconds,
} from '../../../src/lib/minPray.js';
import { resolveRemintLocktime } from '../../../src/mint/remintLocktime.js';
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

/** Server-enforced soft wait ("min pray"). Default 54s, 0 disables. */
const MIN_PRAY_SECONDS = parseMinPraySeconds(process.env.MINT_MIN_PRAY_SECONDS);

/** PAW atoms the user's wallet pays the desk on user-paid burns. */
const LISTING_FEE_ATOMS = resolvePawListingFeeAtoms(
  process.env.MINT_LISTING_FEE_ATOMS,
);

export type BurnKind = 'memorial' | 'post' | 'vote';

/** Thrown by /api/burn when the soft wait has not elapsed yet. */
export class WaitNotElapsedError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super('Soft wait not elapsed');
    this.name = 'WaitNotElapsedError';
    this.retryAfterMs = Math.max(0, Math.ceil(retryAfterMs));
  }
}

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
  kind: BurnKind;
  /** ISO time before which the desk will reject the burn (soft wait). */
  waitUntil: string;
  minPraySeconds: number;
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
  kind: BurnKind;
}

export interface ChallengePublic {
  ok: true;
  challengeId: string;
  expiresAt: string;
  tokenId: string;
  bits: number;
  commit: typeof MOORE_TIP_POW_COMMIT;
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
  kind: BurnKind;
  contentHash?: string;
  postHash?: string;
  direction?: VoteDirection;
  targetType?: number;
  minPraySeconds: number;
}

interface ActiveChallenge {
  id: string;
  installId: string;
  createdAt: number;
  expiresAt: number;
  status: 'open' | 'submitted' | 'expired';
  mode: 'felt';
  tokenId: string;
  tipKey: string;
  tipIndex: number;
  locktime: number;
  prepared: MooreTipRemintPrepared;
  note: string;
  parentBurnTxid?: string;
  kind: BurnKind;
  contentHash?: string;
  postHash?: string;
  voteDirection?: VoteDirection;
  voteTargetType?: number;
}

interface PendingBurn {
  installId: string;
  remintTxid: string;
  burnToken: string;
  tokenId: string;
  tipIndex: number;
  note: string;
  parentBurnTxid?: string;
  kind: BurnKind;
  contentHash?: string;
  postHash?: string;
  voteDirection?: VoteDirection;
  voteTargetType?: number;
  createdAt: number;
  expiresAt: number;
  waitUntilMs: number;
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
  const mainnetPath = resolve(process.cwd(), 'deployments/mainnet-paw.json');
  if (existsSync(mainnetPath)) return mainnetPath;
  const testPath = resolve(process.cwd(), 'deployments/test-paw.json');
  if (existsSync(testPath)) return testPath;
  return mainnetPath;
}

export function loadDepJson(): OnestDep {
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
    covenant: 'WLotusCovenant',
    mode: 'onest-moore-felt-bit',
    baseZeroBits: POW_PAW_BASE_ZERO_BITS,
    genesisUnix: WLOTUS_GENESIS_UNIX,
    secondsPerExtraBit: 500 * 86_400,
  };
}

let cachedDeskWallet: { wallet: Wallet; desk: Wallet } | null = null;

export function requireMintDesk(): void {
  const dep = loadDepJson();
  if (dep.tokenId) assertDeskTokenId(dep.tokenId);
}

export function notifyDanaIndex(burnTxid: string, installId?: string): void {
  const base = process.env.DANA_INDEX_URL?.trim();
  if (!base) return;
  const url = `${base.replace(/\/$/, '')}/api/notify`;
  const secret = process.env.DANA_INDEX_NOTIFY_SECRET?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  void fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ burnTxid, installId }),
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
    baseZeroBits: dep.baseZeroBits ?? POW_PAW_BASE_ZERO_BITS,
    clientPow: true,
    maxOpenChallenges: MAX_OPEN_CHALLENGES,
    openChallenges: challenges.size,
    servingTipIndex: servingTipIndex(),
    servingTipCount: servingTipCount(),
    raceOpen: true,
    minPraySeconds: MIN_PRAY_SECONDS,
    burnKinds: ['memorial', 'post', 'vote'],
    listingFeeAtoms: LISTING_FEE_ATOMS.toString(),
  };
}

/**
 * Quote for wallet-paid burns: destination desk address + atoms.
 * The client builds and broadcasts the burn from its own wallet (no wait).
 */
export async function listingFeeInfo(): Promise<{
  tokenId: string;
  atoms: string;
  feeAddress: string;
}> {
  const dep = loadDepJson();
  if (!dep.tokenId) throw new Error('No PAW TOKEN_ID configured');
  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, servingTipIndex());
  return {
    tokenId: dep.tokenId,
    atoms: LISTING_FEE_ATOMS.toString(),
    feeAddress: tipWallet.address,
  };
}

export interface ChallengeInput {
  installId: string;
  clientIp?: string;
  kind?: string;
  note?: string;
  parentBurnTxid?: string;
  contentHash?: string;
  postHash?: string;
  direction?: unknown;
  targetType?: unknown;
}

export async function enqueueChallenge(opts: ChallengeInput): Promise<ChallengePublic> {
  const dep = loadDepJson();
  if (!dep.tokenId) {
    throw new Error('No PAW TOKEN_ID configured');
  }

  const kind: BurnKind =
    opts.kind === 'post' ? 'post' : opts.kind === 'vote' ? 'vote' : 'memorial';
  // Pet profiles are user-paid: the wallet burns 1 PAW + pays the listing fee.
  // Sponsored memorials are tributes only (they carry parentBurnTxid).
  if (kind === 'memorial' && !opts.parentBurnTxid) {
    throw new Error(
      'Pet profiles must be created from your wallet (user profile required). Sponsored burns are for tributes only.',
    );
  }
  let contentHash: string | undefined;
  let postHash: string | undefined;
  let voteDirection: VoteDirection | undefined;
  let voteTargetType: number | undefined;
  if (kind === 'post') {
    contentHash = normalizeHex64(opts.contentHash) ?? undefined;
    if (!contentHash) throw new Error('contentHash required (64 hex) for post stamps');
  }
  if (kind === 'vote') {
    postHash = normalizeHex64(opts.postHash) ?? undefined;
    if (!postHash) throw new Error('postHash required (64 hex) for votes');
    const direction = normalizeVoteDirection(opts.direction ?? 1);
    if (direction == null) throw new Error('direction must be up (1) or down (0)');
    voteDirection = direction;
    const rawTarget =
      opts.targetType == null ? VOTE_TARGET_TYPE_POST : Number(opts.targetType);
    if (!Number.isInteger(rawTarget) || rawTarget < 0 || rawTarget > 0xffff) {
      throw new Error('targetType out of range');
    }
    voteTargetType = rawTarget;
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
  const locktime = resolveRemintLocktime(baton.creatingLockTime, mtp.mtp);

  const contract = await matchCovenantToBaton(
    baton,
    [dep.genesisUnix ?? WLOTUS_GENESIS_UNIX],
    async (tipLocktime) => {
      const c = await createPowRemintWLotusCovenantContract({
        tokenId: dep.tokenId,
        mintAtoms: PAW_MINT_ATOMS,
        genesisUnix: dep.genesisUnix ?? WLOTUS_GENESIS_UNIX,
        baseZeroBits: dep.baseZeroBits ?? POW_PAW_BASE_ZERO_BITS,
        secondsPerExtraBit: dep.secondsPerExtraBit || (500 * 86_400),
        tipLocktime,
      });
      return {
        ...c,
        p2shScriptHex: toHex(c.p2shScript.bytecode),
        tipLocktime,
      };
    },
  );

  // Ensure fuel coin and postage exist on tip wallet
  let fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
  let postageUtxo = pickBurnPostageUtxo(tipWallet.wallet.utxos);
  if (!fuelUtxo || !postageUtxo) {
    const mintDesk = await loadMintWallet(chronik);
    await sendOfferingPairFromDesk(mintDesk.wallet, tipWallet.wallet);
    await tipWallet.wallet.sync();
    fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
    postageUtxo = pickBurnPostageUtxo(tipWallet.wallet.utxos);
  }

  if (!fuelUtxo) {
    throw new Error('Could not prepare remint fuel UTXO');
  }

  const prep = await buildMooreTipRemintChallenge({
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
    opReturn: expectedWLotusCovenantMintOpReturnScript(dep.tokenId, PAW_MINT_ATOMS),
  });

  const challengeId = randomUUID();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const note = opts.note ? prepareDanaNote(opts.note, Boolean(opts.parentBurnTxid)) : '';
  const tipState = computeMooreTipState(locktime, contract.params);

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
    prepared: prep,
    note,
    parentBurnTxid: opts.parentBurnTxid,
    kind,
    contentHash,
    postHash,
    voteDirection,
    voteTargetType,
  };

  challenges.set(challengeId, active);

  return {
    ok: true,
    challengeId,
    expiresAt: new Date(expiresAt).toISOString(),
    tokenId: dep.tokenId,
    bits: prep.tip.bits,
    commit: MOORE_TIP_POW_COMMIT,
    nonceLength: 4,
    preimageHex: prep.preimageHex,
    powPrefixHex: prep.powPrefixHex,
    locktime,
    tipLocktime: contract.params.tipLocktime,
    tipKey: active.tipKey,
    tipEpoch: baton.txid,
    tipIndex: tipIdx,
    tipFeeAddress: tipWallet.address,
    mintAtoms: PAW_MINT_ATOMS.toString(),
    note,
    parentBurnTxid: opts.parentBurnTxid,
    kind,
    contentHash,
    postHash,
    direction: voteDirection,
    targetType: voteTargetType,
    minPraySeconds: MIN_PRAY_SECONDS,
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

  const nonce = parseNonceHex(opts.nonceHex);
  const built = await buildMooreTipRemintTxWithNonce({
    prepared: ch.prepared,
    nonce,
  });

  const chronik = await createChronik();
  let remintTxid: string;
  try {
    const broadcast = await chronik.broadcastTx(built.txHex);
    remintTxid =
      typeof broadcast === 'string'
        ? broadcast
        : (broadcast as { txid: string }).txid;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ch.status = 'expired';
    throw new Error(
      /missing|spent|conflict|txn-mempool|already|orphan|inputs-missing/i.test(msg)
        ? 'TIP_RACE_LOST'
        : msg,
    );
  }

  const burnToken = randomBytes(32).toString('hex');
  const waitUntilMs = minPrayWaitUntilMs(ch.createdAt, MIN_PRAY_SECONDS);

  pendingBurns.set(remintTxid, {
    installId: opts.installId,
    remintTxid,
    burnToken,
    tokenId: ch.tokenId,
    tipIndex: ch.tipIndex,
    note: ch.note,
    parentBurnTxid: ch.parentBurnTxid,
    kind: ch.kind,
    contentHash: ch.contentHash,
    postHash: ch.postHash,
    voteDirection: ch.voteDirection,
    voteTargetType: ch.voteTargetType,
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_BURN_TTL_MS,
    waitUntilMs,
  });

  const powMs = opts.powMs != null && opts.powMs > 0 ? Math.round(opts.powMs) : 0;
  const powAttempts = opts.powAttempts != null && opts.powAttempts > 0 ? Math.round(opts.powAttempts) : 0;
  const hashrateHps = powMs > 0 && powAttempts > 0 ? Math.round(powAttempts / (powMs / 1000)) : 0;

  return {
    remintTxid,
    burnTxid: '',
    burnPending: true,
    burnToken,
    tokenId: ch.tokenId,
    bits: ch.prepared?.tip?.bits ?? 0,
    powAttempts,
    powMs,
    hashrateHps,
    deskAtomsKept: Number(PAW_MINER_ATOMS) - 1,
    note: ch.note,
    explorerRemint: explorerTx(remintTxid),
    explorerBurn: '',
    kind: ch.kind,
    waitUntil: new Date(waitUntilMs).toISOString(),
    minPraySeconds: MIN_PRAY_SECONDS,
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

  const waitRemainingMs = pending.waitUntilMs - Date.now();
  if (waitRemainingMs > 0) {
    throw new WaitNotElapsedError(waitRemainingMs);
  }

  pendingBurns.delete(opts.remintTxid);

  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, pending.tipIndex);

  let pushdata: Uint8Array | undefined;
  if (pending.kind === 'post' && pending.contentHash) {
    pushdata = encodePostStampPushdata(pending.contentHash);
  } else if (pending.kind === 'vote' && pending.postHash && pending.voteDirection != null) {
    pushdata = encodeVotePushdata({
      direction: pending.voteDirection,
      postHash: pending.postHash,
      targetType: pending.voteTargetType,
    });
  }

  const burnRes = await burnOnePaw({
    wallet: tipWallet.wallet,
    tokenId: pending.tokenId,
    note: pending.kind === 'memorial' ? pending.note : '',
    parentBurnTxid: pending.parentBurnTxid,
    burnAtoms: 1n,
    pushdata,
  });

  notifyDanaIndex(burnRes.txid, opts.installId);
  rememberRootCreator(pending.parentBurnTxid || burnRes.txid, opts.installId);

  return {
    remintTxid: pending.remintTxid,
    burnTxid: burnRes.txid,
    tokenId: pending.tokenId,
    deskAtomsKept: Number(PAW_MINER_ATOMS) - 1,
    burnAtoms: '1',
    note: pending.kind === 'memorial' ? pending.note : '',
    explorerRemint: explorerTx(pending.remintTxid),
    explorerBurn: explorerTx(burnRes.txid),
    kind: pending.kind,
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
