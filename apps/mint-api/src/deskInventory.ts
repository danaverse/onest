/**
 * Desk PAW inventory helpers.
 *
 * Paid profiles need 7 atoms from inventory (1 burned + 6 listing retained).
 * When nothing has been minted yet (no sponsored upvotes/tributes), the desk
 * mints a fresh sponsored remint (108 atoms) before serving the burn.
 *
 * Cost note: a fresh remint costs ~40–50 XEC in network fees and yields 108
 * atoms (~0.4 XEC per atom amortized), so the 20 XEC profile fee remains
 * profitable across the inventory it creates.
 */
import { toHex } from 'ecash-lib';
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
import { resolveRemintLocktime } from '../../../src/mint/remintLocktime.js';
import { loadDepJson } from './offer.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface TokenUtxoLike {
  outpoint: { txid: string; outIdx: number };
  sats: bigint;
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

/** Fresh sponsored remint to the desk tip wallet (inventory top-up). */
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

  let fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
  if (!fuelUtxo) {
    const mintDesk = await loadMintWallet(chronik);
    await sendOfferingPairFromDesk(mintDesk.wallet, tipWallet.wallet);
    await tipWallet.wallet.sync();
    fuelUtxo = pickSizedFuelUtxo(tipWallet.wallet.utxos);
  }
  if (!fuelUtxo) throw new Error('Could not prepare remint fuel');

  /* Retry with a fresh locktime if the mempool rejects the tx as non-final
     (e.g. MTP moved between the read and the broadcast). */
  for (let attempt = 1; ; attempt++) {
    const mtp = await getMedianTimePast(chronik);
    const locktime = resolveRemintLocktime(baton.creatingLockTime, mtp.mtp);

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
    try {
      const broadcast = await chronik.broadcastTx(built.txHex);
      const txid = typeof broadcast === 'string' ? broadcast : broadcast.txid;
      return { txid };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/nonfinal|non-final/i.test(msg) || attempt >= 3) throw e;
      console.warn(`desk mint non-final, retrying with fresh locktime (${attempt}/3)`);
      await sleep(20_000);
    }
  }
}

/** Mint a fresh remint when the tip wallet holds fewer than `minAtoms`. */
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
