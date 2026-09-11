/**
 * Client-paid remint ("mint PAW from XEC").
 *
 * The user's wallet pays XEC fees and signs locally; the desk only finds and
 * reserves a mint baton, prepares the BIP143 preimages, verifies the PoW and
 * assembles/broadcasts the covenant tx. Minted atoms go to the user's P2PKH
 * output, enforced by the covenant.
 */
import { randomUUID } from 'node:crypto';
import {
  Address,
  DEFAULT_FEE_SATS_PER_KB,
  Script,
  calcTxFee,
  fromHex,
  shaRmd160,
  toHex,
} from 'ecash-lib';
import { createChronik } from '../../../src/network/createChronik.js';
import { getMedianTimePast } from '../../../src/network/medianTimePast.js';
import { createPowRemintWLotusCovenantContract } from '../../../src/covenant/powRemintWLotusCovenantScript.js';
import { expectedWLotusCovenantMintOpReturnScript } from '../../../src/covenant/powRemintWLotusCovenantOutputs.js';
import {
  MOORE_TIP_POW_COMMIT,
  assembleMooreTipRemintTxWithSignatures,
  buildMooreTipRemintChallenge,
  parseNonceHex,
  type MooreTipRemintPrepared,
} from '../../../src/miner/remintMooreTip.js';
import {
  batonKey,
  BatonReservations,
} from '../../../src/mint/batonReservation.js';
import {
  findLiveMintBatons,
  matchCovenantToBaton,
  resolveLiveMintBaton,
  type LiveMintBaton,
} from '../../../src/mint/followMintBaton.js';
import { ds64FromSig, p2pkhScriptSig } from '../../../src/mint/clientMintSign.js';
import {
  PAW_MINT_ATOMS,
  POW_PAW_BASE_ZERO_BITS,
  WLOTUS_GENESIS_UNIX,
} from '../../../src/params/pawMint.js';
import { loadDepJson } from './offer.js';

const CHALLENGE_TTL_MS = 10 * 60_000;
const MIN_MINT_FEE_SATS = 1_000n;

interface ClientMintChallenge {
  id: string;
  installId: string;
  prepared: MooreTipRemintPrepared;
  batonKey: string;
  createdAt: number;
  expiresAt: number;
}

const challenges = new Map<string, ClientMintChallenge>();
const reservations = new BatonReservations(CHALLENGE_TTL_MS);

function pruneChallenges(now = Date.now()): void {
  for (const [id, ch] of challenges) {
    if (ch.expiresAt <= now) {
      challenges.delete(id);
      reservations.release(ch.batonKey, ch.installId);
    }
  }
}

/** Prefer the configured genesis index (e.g. #26), then lowest outIdx. */
function batonScore(baton: LiveMintBaton, genesisTxid: string, preferIdx: number): number {
  if (baton.creatingTxid === genesisTxid.toLowerCase() && baton.outIdx === preferIdx) {
    return 0;
  }
  return 1 + baton.outIdx;
}

export interface ClientMintChallengePublic {
  ok: true;
  challengeId: string;
  expiresAt: string;
  tokenId: string;
  mintAtoms: string;
  bits: number;
  commit: typeof MOORE_TIP_POW_COMMIT;
  nonceLength: number;
  preimageHex: string;
  fuelPreimageHex: string;
  powPrefixHex: string;
  locktime: number;
  baton: { txid: string; outIdx: number; sats: string };
  fuel: { txid: string; outIdx: number; sats: string };
  reservedUntil: string;
}

export async function createClientMintChallenge(input: {
  installId: string;
  address: string;
  pkHex: string;
  fuelTxid: string;
  fuelOutIdx: number;
}): Promise<ClientMintChallengePublic> {
  pruneChallenges();
  const dep = loadDepJson();
  if (!dep.tokenId) throw new Error('No PAW TOKEN_ID configured');

  const pk = fromHex(input.pkHex.trim().toLowerCase());
  if (pk.length !== 33) throw new Error('pkHex must be a 33-byte compressed public key');
  const address = Address.parse(input.address.trim());
  if (toHex(shaRmd160(pk)) !== address.hash.toLowerCase()) {
    throw new Error('Public key does not match the wallet address');
  }

  const chronik = await createChronik();

  // Validate the fuel UTXO: P2PKH to this wallet, unspent; use on-chain sats.
  const fuelTx = await chronik.tx(input.fuelTxid.trim().toLowerCase());
  const fuelOut = fuelTx.outputs[input.fuelOutIdx];
  if (!fuelOut) throw new Error('Fuel output not found');
  if (fuelOut.spentBy) throw new Error('Fuel output is already spent');
  const expectedScript = Script.p2pkh(shaRmd160(pk));
  if (toHex(fuelOut.outputScript ? fromHex(fuelOut.outputScript) : new Uint8Array()) !== toHex(expectedScript.bytecode)) {
    throw new Error('Fuel output does not belong to this wallet');
  }

  const liveBatons = await findLiveMintBatons(chronik, dep.tokenId);
  if (liveBatons.length === 0) throw new Error('No live mint batons for PAW');

  let deskKey = '';
  try {
    const deskBaton = await resolveLiveMintBaton(chronik, dep.tokenId, dep.genesisTxid);
    deskKey = batonKey(deskBaton.txid, deskBaton.outIdx);
  } catch {
    /* desk lineage unknown; reservation still prevents collisions */
  }

  const preferIdx = Math.max(
    0,
    Number(process.env.MINT_CLIENT_BATON_INDEX?.trim() || 26) || 26,
  );
  const genesisTxid = (dep.genesisTxid || dep.tokenId).toLowerCase();
  const candidates = liveBatons
    .filter(b => batonKey(b.txid, b.outIdx) !== deskKey)
    .sort(
      (a, b) =>
        batonScore(a, genesisTxid, preferIdx) - batonScore(b, genesisTxid, preferIdx),
    );

  let chosen: LiveMintBaton | null = null;
  let chosenKey = '';
  for (const candidate of candidates) {
    const key = batonKey(candidate.txid, candidate.outIdx);
    const reserved = reservations.reserve(key, input.installId);
    if (reserved.ok) {
      chosen = candidate;
      chosenKey = key;
      break;
    }
  }
  if (!chosen) {
    throw new Error('No mint baton available right now — try again shortly');
  }

  try {
    const contract = await matchCovenantToBaton(
      chosen,
      [dep.genesisUnix ?? WLOTUS_GENESIS_UNIX],
      async tipLocktime => {
        const c = await createPowRemintWLotusCovenantContract({
          tokenId: dep.tokenId!,
          mintAtoms: PAW_MINT_ATOMS,
          genesisUnix: dep.genesisUnix ?? WLOTUS_GENESIS_UNIX,
          baseZeroBits: dep.baseZeroBits ?? POW_PAW_BASE_ZERO_BITS,
          secondsPerExtraBit: dep.secondsPerExtraBit || 500 * 86_400,
          tipLocktime,
        });
        return {
          ...c,
          p2shScriptHex: toHex(c.p2shScript.bytecode),
          tipLocktime,
        };
      },
    );

    const mtp = await getMedianTimePast(chronik);
    const locktime = Math.max(chosen.creatingLockTime, mtp.mtp);

    const prepared = await buildMooreTipRemintChallenge({
      contract,
      baton: {
        outpoint: { txid: chosen.txid, outIdx: chosen.outIdx },
        sats: chosen.sats,
        txid: chosen.txid,
        vout: chosen.outIdx,
      },
      fuel: {
        outpoint: { txid: input.fuelTxid.trim().toLowerCase(), outIdx: input.fuelOutIdx },
        sats: fuelOut.sats,
        outputScript: expectedScript,
      },
      miner: { sk: new Uint8Array(32), pk },
      locktime,
      opReturn: expectedWLotusCovenantMintOpReturnScript(
        dep.tokenId,
        PAW_MINT_ATOMS,
      ),
    });

    const id = randomUUID();
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    challenges.set(id, {
      id,
      installId: input.installId,
      prepared,
      batonKey: chosenKey,
      createdAt: Date.now(),
      expiresAt,
    });

    return {
      ok: true,
      challengeId: id,
      expiresAt: new Date(expiresAt).toISOString(),
      tokenId: dep.tokenId,
      mintAtoms: PAW_MINT_ATOMS.toString(),
      bits: prepared.tip.bits,
      commit: MOORE_TIP_POW_COMMIT,
      nonceLength: 4,
      preimageHex: prepared.preimageHex,
      fuelPreimageHex: prepared.fuelPreimageHex,
      powPrefixHex: prepared.powPrefixHex,
      locktime,
      baton: {
        txid: chosen.txid,
        outIdx: chosen.outIdx,
        sats: chosen.sats.toString(),
      },
      fuel: {
        txid: input.fuelTxid.trim().toLowerCase(),
        outIdx: input.fuelOutIdx,
        sats: fuelOut.sats.toString(),
      },
      reservedUntil: new Date(expiresAt).toISOString(),
    };
  } catch (e) {
    reservations.release(chosenKey, input.installId);
    throw e;
  }
}

export async function submitClientMint(input: {
  installId: string;
  challengeId: string;
  nonceHex: string;
  batonSigHex: string;
  fuelSigHex: string;
}): Promise<{ ok: true; txid: string; mintAtoms: string }> {
  pruneChallenges();
  const ch = challenges.get(input.challengeId);
  if (!ch || ch.installId !== input.installId) {
    throw new Error('Invalid or expired mint challenge');
  }
  challenges.delete(input.challengeId);

  try {
    const nonce = parseNonceHex(input.nonceHex);
    const batonSig65 = fromHex(input.batonSigHex.trim().toLowerCase());
    const fuelSig65 = fromHex(input.fuelSigHex.trim().toLowerCase());
    const assembled = assembleMooreTipRemintTxWithSignatures({
      prepared: ch.prepared,
      nonce,
      batonSig65,
      ds64: ds64FromSig(batonSig65),
      fuelScriptSig: p2pkhScriptSig(fuelSig65, ch.prepared.miner.pk),
    });

    // Ensure the fuel covers dust + a sane fee (outputs are fixed by covenant).
    const inputSum = ch.prepared.baton.sats + ch.prepared.fuel.sats;
    const outputSum = ch.prepared.dust * 2n;
    const minFee = calcTxFee(
      assembled.txHex.length / 2,
      DEFAULT_FEE_SATS_PER_KB,
    );
    const fee = inputSum - outputSum;
    if (fee < minFee || fee < MIN_MINT_FEE_SATS) {
      throw new Error(
        `Not enough XEC fuel (fee ${fee} sats, need ${minFee} sats)`,
      );
    }

    const chronik = await createChronik();
    const broadcast = await chronik.broadcastTx(assembled.txHex);
    const txid =
      typeof broadcast === 'string' ? broadcast : broadcast.txid;

    return { ok: true, txid, mintAtoms: assembled.mintAtoms };
  } finally {
    reservations.release(ch.batonKey, input.installId);
  }
}
