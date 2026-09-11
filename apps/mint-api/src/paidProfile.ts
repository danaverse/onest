/**
 * Flat-fee paid pet profiles: the user pays XEC on-chain and the desk spends
 * 12 PAW from inventory (6 burned for rebirth + 6 listing retained). No
 * remint, no PoW.
 */
import { Address } from 'ecash-lib';
import { prepareDanaNote } from '../../../src/offering/animalProfileFields.js';
import { burnOnePaw, explorerTx } from '../../../src/offering/burnPaw.js';
import { consumePaidAction, paidActionFeeInfo } from './paidAction.js';
import { notifyDanaIndex } from './offer.js';
import { rememberRootCreator } from './rootCreators.js';

/** 6 atoms burned (rebirth) + 6 atoms listing fee retained per paid profile. */
const MIN_DESK_PAW_PER_PROFILE = 12n;

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
      /* Embed the verified payer's hash160 in the DANA payload so ownership
         is recoverable from the chain alone (index rebuilt from Chronik). */
      const creatorHash160 = Address.parse(input.address.trim()).hash;
      const burn = await burnOnePaw({
        wallet: tipWallet.wallet,
        tokenId: dep.tokenId!,
        note,
        parentBurnTxid: input.parentBurnTxid,
        creatorHash160,
        burnAtoms: 6n,
      });
      notifyDanaIndex(burn.txid, input.installId, input.address);
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
