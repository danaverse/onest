/**
 * Flat-fee paid post stamps: the user pays XEC on-chain and the desk burns
 * 1 PAW with the DANA v4 content hash. No remint, no PoW, no wait.
 */
import { encodePostStampPushdata, normalizeHex64 } from '../../../src/social/danaSocial.js';
import { burnOnePaw, explorerTx } from '../../../src/offering/burnPaw.js';
import { consumePaidAction, paidActionFeeInfo } from './paidAction.js';
import { notifyDanaIndex } from './offer.js';

/** Post stamps burn a single atom (no listing fee). */
const MIN_DESK_PAW_PER_POST = 1n;

export const postFeeInfo = paidActionFeeInfo;

export interface PaidPostResult {
  ok: true;
  burnTxid: string;
  contentHash: string;
  explorerBurn: string;
  xec: string;
}

export async function createPaidPost(input: {
  installId: string;
  address: string;
  paymentTxid: string;
  contentHash: string;
}): Promise<PaidPostResult> {
  const contentHash = normalizeHex64(input.contentHash);
  if (!contentHash) throw new Error('valid contentHash required');

  return consumePaidAction({
    installId: input.installId,
    address: input.address,
    paymentTxid: input.paymentTxid,
    minDeskPaw: MIN_DESK_PAW_PER_POST,
    run: async ({ dep, tipWallet, feeXec }) => {
      const burn = await burnOnePaw({
        wallet: tipWallet.wallet,
        tokenId: dep.tokenId!,
        pushdata: encodePostStampPushdata(contentHash),
        burnAtoms: 1n,
      });
      notifyDanaIndex(burn.txid, input.installId, input.address);
      return {
        ok: true as const,
        burnTxid: burn.txid,
        contentHash,
        explorerBurn: explorerTx(burn.txid),
        xec: feeXec,
      };
    },
  });
}
