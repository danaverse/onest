/**
 * Desk PAW inventory: sell from stock, top up with a fresh server-side remint
 * (the sponsored vote path mints fresh too, so inventory grows with activity).
 */
import { ALP_TOKEN_TYPE_STANDARD, toHex } from 'ecash-lib';
import type { Wallet } from 'ecash-wallet';
import { createChronik } from '../../../src/network/createChronik.js';
import { getMedianTimePast } from '../../../src/network/medianTimePast.js';
import { createPowRemintWLotusCovenantContract } from '../../../src/covenant/powRemintWLotusCovenantScript.js';
import { expectedWLotusCovenantMintOpReturnScript } from '../../../src/covenant/powRemintWLotusCovenantOutputs.js';
import { minePowBits } from '../../../src/covenant/minePow.js';
import {
  MOORE_TIP_POW_COMMIT,
  buildMooreTipRemintChallenge,
  buildMooreTipRemintTxWithNonce,
} from '../../../src/miner/remintMooreTip.js';
import {
  matchCovenantToBaton,
  resolveLiveMintBaton,
} from '../../../src/mint/followMintBaton.js';
import { pickSizedFuelUtxo } from '../../../src/mint/fuelUtxo.js';
import { sendOfferingPairFromDesk } from '../../../src/mint/peelSizedFuel.js';
import { loadMintWallet } from '../../../src/mint/loadMintWallet.js';
import { loadTipFeeWallet } from '../../../src/mint/loadTipFeeWallet.js';
import { parseServingTipIndex } from '../../../src/mint/servingTips.js';
import {
  PAW_MINT_ATOMS,
  POW_PAW_BASE_ZERO_BITS,
  WLOTUS_GENESIS_UNIX,
} from '../../../src/params/pawMint.js';
import { loadDepJson } from './offer.js';

interface TokenUtxoLike {
  token?: { tokenId?: string; atoms?: bigint | number | string };
}

export async function deskPawAtoms(
  wallet: Wallet,
  tokenId: string,
): Promise<bigint> {
  const want = tokenId.toLowerCase();
  let sum = 0n;
  for (const utxo of wallet.utxos as unknown as TokenUtxoLike[]) {
    if (
      utxo.token?.tokenId?.toLowerCase() === want &&
      utxo.token.atoms != null
    ) {
      sum += BigInt(utxo.token.atoms);
    }
  }
  return sum;
}

/** Fresh sponsored remint to the desk wallet (inventory top-up). */
export async function mintDeskPaw(): Promise<{ txid: string }> {
  const dep = loadDepJson();
  if (!dep.tokenId) throw new Error('No PAW TOKEN_ID configured');

  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, parseServingTipIndex());
  const baton = await resolveLiveMintBaton(chronik, dep.tokenId, dep.genesisTxid);

  const contract = await matchCovenantToBaton(
    baton,
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
  const locktime = Math.max(baton.creatingLockTime, mtp.mtp);

  let fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
  if (!fuelUtxo) {
    const mintDesk = await loadMintWallet(chronik);
    await sendOfferingPairFromDesk(mintDesk.wallet, tipWallet.wallet);
    await tipWallet.wallet.sync();
    fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
  }
  if (!fuelUtxo) throw new Error('Could not prepare remint fuel');

  const prepared = await buildMooreTipRemintChallenge({
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
    opReturn: expectedWLotusCovenantMintOpReturnScript(
      dep.tokenId,
      PAW_MINT_ATOMS,
    ),
  });

  const mined = minePowBits({
    preimage: prepared.preimage,
    bits: prepared.tip.bits,
    commit: MOORE_TIP_POW_COMMIT,
    maxAttempts: 100_000_000,
  });
  const built = await buildMooreTipRemintTxWithNonce({
    prepared,
    nonce: mined.nonce,
  });
  const broadcast = await chronik.broadcastTx(built.txHex);
  const txid = typeof broadcast === 'string' ? broadcast : broadcast.txid;
  return { txid };
}

export async function ensureDeskPaw(minAtoms: bigint): Promise<void> {
  const dep = loadDepJson();
  if (!dep.tokenId) throw new Error('No PAW TOKEN_ID configured');
  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, parseServingTipIndex());
  await tipWallet.wallet.sync();
  const have = await deskPawAtoms(tipWallet.wallet, dep.tokenId);
  if (have >= minAtoms) return;
  await mintDeskPaw();
}

export async function sendPawToAddress(input: {
  toAddress: string;
  atoms: bigint;
}): Promise<{ txid: string }> {
  const dep = loadDepJson();
  if (!dep.tokenId) throw new Error('No PAW TOKEN_ID configured');
  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, parseServingTipIndex());
  await tipWallet.wallet.sync();

  const have = await deskPawAtoms(tipWallet.wallet, dep.tokenId);
  if (have < input.atoms) {
    throw new Error(`Desk PAW inventory too low (${have} < ${input.atoms})`);
  }

  const built = tipWallet.wallet
    .action({
      outputs: [
        {
          sats: 0n,
          tokenId: dep.tokenId,
          atoms: input.atoms,
          isMintBaton: false,
          address: input.toAddress,
        },
      ],
      tokenActions: [
        {
          type: 'SEND',
          tokenId: dep.tokenId,
          tokenType: ALP_TOKEN_TYPE_STANDARD,
        },
      ],
    })
    .build();
  const resp = await built.broadcast();
  const txid = resp.broadcasted?.[0];
  if (!txid) throw new Error('PAW delivery broadcast returned no txid');
  return { txid };
}
