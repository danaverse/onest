/**
 * Flat-fee paid pet profiles: the user pays XEC on-chain and the desk spends
 * 7 PAW from inventory (1 burned + 6 listing retained). No remint, no PoW.
 */
import { prepareDanaNote } from '../../../src/offering/animalProfileFields.js';
import { burnOnePaw, explorerTx } from '../../../src/offering/burnPaw.js';
import { consumePaidAction, paidActionFeeInfo } from './paidAction.js';
import { notifyDanaIndex } from './offer.js';
import { rememberRootCreator } from './rootCreators.js';

/** 1 atom burned + 6 atoms listing fee retained per paid profile. */
const MIN_DESK_PAW_PER_PROFILE = 7n;

export const profileFeeInfo = paidActionFeeInfo;

export interface PaidProfileResult {
  ok: true;
  burnTxid: string;
  note: string;
  explorerBurn: string;
  xec: string;
}

export async function createPaidProfile(input: {
  installId: string;
  address: string;
  paymentTxid: string;
  note: string;
  parentBurnTxid?: string;
}): Promise<PaidProfileResult> {
  return consumePaidAction({
    installId: input.installId,
    address: input.address,
    paymentTxid: input.paymentTxid,
    minDeskPaw: MIN_DESK_PAW_PER_PROFILE,
    run: async ({ dep, tipWallet, feeXec }) => {
      const note = prepareDanaNote(input.note, Boolean(input.parentBurnTxid));
      const burn = await burnOnePaw({
        wallet: tipWallet.wallet,
        tokenId: dep.tokenId!,
        note,
        parentBurnTxid: input.parentBurnTxid,
        burnAtoms: 1n,
      });
      notifyDanaIndex(burn.txid, input.installId);
      rememberRootCreator(input.parentBurnTxid || burn.txid, input.installId);
      return {
        ok: true as const,
        burnTxid: burn.txid,
        note,
        explorerBurn: explorerTx(burn.txid),
        xec: feeXec,
      };
    },
  });
}
