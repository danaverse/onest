/**
 * Flat-fee paid votes: the user pays XEC on-chain and the desk burns 1 PAW
 * with the DANA v3 vote payload. No listing fee (nothing is kept), no remint,
 * no PoW, no wait.
 */
import {
  encodeVotePushdata,
  normalizeHex64,
  normalizeVoteDirection,
  VOTE_TARGET_TYPE_POST,
} from '../../../src/social/danaSocial.js';
import { resolveVoteXecFee } from '../../../src/mint/profileFee.js';
import { burnOnePaw, explorerTx } from '../../../src/offering/burnPaw.js';
import { consumePaidAction, paidActionFeeInfo } from './paidAction.js';
import { notifyDanaIndex } from './offer.js';

const VOTE_FEE_XEC = resolveVoteXecFee(process.env.MINT_VOTE_XEC_FEE);

/** A vote burns a single atom — no listing fee. */
const MIN_DESK_PAW_PER_VOTE = 1n;

export const voteFeeInfo = () => paidActionFeeInfo(VOTE_FEE_XEC);

export interface PaidVoteResult {
  ok: true;
  burnTxid: string;
  postHash: string;
  direction: 1 | 0;
  explorerBurn: string;
  xec: string;
}

export async function createPaidVote(input: {
  installId: string;
  address: string;
  paymentTxid: string;
  postHash: string;
  direction: unknown;
  targetType?: number;
}): Promise<PaidVoteResult> {
  const postHash = normalizeHex64(input.postHash);
  if (!postHash) throw new Error('valid postHash required');
  const direction = normalizeVoteDirection(input.direction);
  if (direction === null) throw new Error('direction must be up (1) or down (0)');
  const targetType = input.targetType ?? VOTE_TARGET_TYPE_POST;

  return consumePaidAction({
    installId: input.installId,
    address: input.address,
    paymentTxid: input.paymentTxid,
    minDeskPaw: MIN_DESK_PAW_PER_VOTE,
    feeXec: VOTE_FEE_XEC,
    run: async ({ dep, tipWallet, feeXec }) => {
      const burn = await burnOnePaw({
        wallet: tipWallet.wallet,
        tokenId: dep.tokenId!,
        pushdata: encodeVotePushdata({ direction, postHash, targetType }),
        burnAtoms: 1n,
      });
      notifyDanaIndex(burn.txid, input.installId, input.address);
      return {
        ok: true as const,
        burnTxid: burn.txid,
        postHash,
        direction,
        explorerBurn: explorerTx(burn.txid),
        xec: feeXec,
      };
    },
  });
}
