/**
 * User-paid pet profile creation: the wallet burns 1 PAW, pays the desk's
 * listing fee in PAW and covers XEC network fees. No soft wait.
 */
import type { Wallet } from 'ecash-wallet';
import {
  encodeAnimalProfileNote,
  type AnimalProfileFields,
} from '../../../../src/offering/animalProfileFields.js';
import { MINT_API_BASE, PAW_TOKEN_ID, getOrCreateInstallId } from './config.js';

export interface ListingFeeInfo {
  tokenId: string;
  atoms: bigint;
  feeAddress: string;
}

export async function fetchListingFee(): Promise<ListingFeeInfo> {
  const res = await fetch(`${MINT_API_BASE}/api/listing-fee`);
  if (!res.ok) throw new Error(`Listing fee HTTP ${res.status}`);
  const data = await res.json();
  return {
    tokenId: String(data.tokenId || ''),
    atoms: BigInt(data.atoms || 0),
    feeAddress: String(data.feeAddress || ''),
  };
}

/** Ask mint-api to trigger dana-index ingest for a wallet-broadcast tx. */
export function notifyBurn(burnTxid: string): void {
  void fetch(`${MINT_API_BASE}/api/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ burnTxid, installId: getOrCreateInstallId() }),
  }).catch(() => {
    /* the poller will pick it up */
  });
}

export async function createPetProfileWithWallet(opts: {
  wallet: Wallet;
  fields: AnimalProfileFields;
}): Promise<{ txid: string }> {
  const fee = await fetchListingFee();
  const tokenId = fee.tokenId || PAW_TOKEN_ID;
  if (!tokenId) throw new Error('No PAW token configured');
  if (!fee.feeAddress) throw new Error('Desk fee address unavailable');

  const note = encodeAnimalProfileNote(opts.fields);
  // Lazy: keeps ecash-lib/wasm out of the main bundle.
  const { burnOnePaw } = await import('../../../../src/offering/burnPaw.js');
  const result = await burnOnePaw({
    wallet: opts.wallet,
    tokenId,
    note,
    burnAtoms: 1n,
    feeAtoms: fee.atoms,
    feeAddress: fee.feeAddress,
    autoSelectUtxos: true,
  });
  notifyBurn(result.txid);
  return { txid: result.txid };
}
