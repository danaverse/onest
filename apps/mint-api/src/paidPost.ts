/**
 * Flat-fee paid post stamps: the user pays XEC on-chain and the desk burns
 * 1 PAW with the DANA v4 content hash. When the pet belongs to someone else,
 * the desk also sends 1 PAW atom to the creator from the same fee.
 * No remint, no PoW, no wait.
 */
import { encodePostStampPushdata, normalizeHex64 } from '../../../src/social/danaSocial.js';
import { burnOnePaw, explorerTx } from '../../../src/offering/burnPaw.js';
import { consumePaidAction, paidActionFeeInfo } from './paidAction.js';
import { notifyDanaIndex } from './offer.js';

/** The stamp burn itself. */
const MIN_DESK_PAW_PER_POST = 1n;
/** Extra atom sent to the creator when posting on someone else's pet. */
const CREATOR_REWARD_ATOMS = 1n;

export const postFeeInfo = paidActionFeeInfo;

interface PetRootCreator {
  creatorInstallId: string | null;
  creatorAddress: string | null;
}

/**
 * Resolve the pet root's creator from dana-index so the desk knows whether
 * this is a self-post and, if not, where to send the creator reward.
 */
async function fetchPetRootCreator(
  petRootTxid: string,
): Promise<PetRootCreator | null> {
  const base = process.env.DANA_INDEX_URL?.trim();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base.replace(/\/$/, '')}/api/memory/${petRootTxid}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      memory?: {
        burns?: Array<{
          burnTxid?: string;
          creatorInstallId?: string;
          creatorAddress?: string;
          senderAddress?: string;
        }>;
      };
      memorial?: {
        burns?: Array<{
          burnTxid?: string;
          creatorInstallId?: string;
          creatorAddress?: string;
          senderAddress?: string;
        }>;
      };
    };
    const group = data.memory ?? data.memorial;
    const burns = group?.burns ?? [];
    const root =
      burns.find(b => String(b.burnTxid || '').toLowerCase() === petRootTxid) ??
      burns[0];
    if (!root) return null;
    return {
      creatorInstallId: root.creatorInstallId?.trim() || null,
      creatorAddress:
        (root.creatorAddress || root.senderAddress || '').trim().toLowerCase() ||
        null,
    };
  } catch {
    return null;
  }
}

export interface PaidPostResult {
  ok: true;
  burnTxid: string;
  contentHash: string;
  explorerBurn: string;
  xec: string;
  /** Atoms sent to the pet creator on other-pet posts (0 for self-posts). */
  creatorAtoms: string;
  creatorAddress: string | null;
}

export async function createPaidPost(input: {
  installId: string;
  address: string;
  paymentTxid: string;
  contentHash: string;
  petRootTxid?: string;
}): Promise<PaidPostResult> {
  const contentHash = normalizeHex64(input.contentHash);
  if (!contentHash) throw new Error('valid contentHash required');
  const petRootTxid = normalizeHex64(input.petRootTxid);
  if (!petRootTxid) {
    throw new Error('petRootTxid required (64 hex) for post stamps');
  }

  /* Resolve ownership before consuming the payment: other-pet posts burn
     1 atom AND send 1 atom to the creator. */
  const creator = await fetchPetRootCreator(petRootTxid);
  if (!creator) {
    throw new Error('Could not verify the pet owner yet — try again shortly');
  }
  const payer = input.address.trim().toLowerCase();
  const isSelfPost =
    (creator.creatorInstallId != null &&
      creator.creatorInstallId === input.installId) ||
    (creator.creatorAddress != null && creator.creatorAddress === payer);
  const creatorAddress = isSelfPost ? null : creator.creatorAddress;
  if (!isSelfPost && !creatorAddress) {
    throw new Error('Pet creator address unavailable — try again shortly');
  }

  return consumePaidAction({
    installId: input.installId,
    address: input.address,
    paymentTxid: input.paymentTxid,
    minDeskPaw:
      MIN_DESK_PAW_PER_POST + (creatorAddress ? CREATOR_REWARD_ATOMS : 0n),
    run: async ({ dep, tipWallet, feeXec }) => {
      const burn = await burnOnePaw({
        wallet: tipWallet.wallet,
        tokenId: dep.tokenId!,
        pushdata: encodePostStampPushdata(contentHash),
        burnAtoms: 1n,
        ...(creatorAddress
          ? { feeAtoms: CREATOR_REWARD_ATOMS, feeAddress: creatorAddress }
          : {}),
      });
      notifyDanaIndex(burn.txid, input.installId, input.address);
      return {
        ok: true as const,
        burnTxid: burn.txid,
        contentHash,
        explorerBurn: explorerTx(burn.txid),
        xec: feeXec,
        creatorAtoms: creatorAddress ? CREATOR_REWARD_ATOMS.toString() : '0',
        creatorAddress,
      };
    },
  });
}
