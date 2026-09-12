/**
 * Flat-fee paid post stamp: pay XEC, the desk burns 1 PAW with the DANA v4
 * content hash. No PoW, no wait. A retry reuses the pending payment.
 */
import type { Wallet } from 'ecash-wallet';
import {
  MINT_API_BASE,
  PAW_TOKEN_ID,
  getOrCreateInstallId,
} from './config.js';
import { notifyBurn } from './profileCreation.js';

const PENDING_PAYMENT_KEY = 'onest.pendingPostPayment';

/** Wallet PAW path: the burn tx only needs a small XEC postage/fee reserve. */
export const MIN_POST_PAW_XEC_SATS = 1_000n;

interface WalletUtxoLike {
  sats: bigint;
  token?: unknown;
}

function readPendingPayment(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_PAYMENT_KEY)?.trim() || '';
    return /^[0-9a-f]{64}$/i.test(raw) ? raw.toLowerCase() : null;
  } catch {
    return null;
  }
}

function writePendingPayment(txid: string): void {
  try {
    localStorage.setItem(PENDING_PAYMENT_KEY, txid.toLowerCase());
  } catch {
    /* ignore */
  }
}

function clearPendingPayment(): void {
  try {
    localStorage.removeItem(PENDING_PAYMENT_KEY);
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface PostFeeInfo {
  xec: string;
  xecSats: string;
  address: string;
}

export async function fetchPostFee(): Promise<PostFeeInfo> {
  const res = await fetch(`${MINT_API_BASE}/api/post/fee`);
  if (!res.ok) throw new Error(`Post fee HTTP ${res.status}`);
  return res.json();
}

/**
 * Wallet PAW path for pets you do not own: burn 1 atom with the DANA v4
 * content hash from your own wallet. No desk fee; XEC only covers the tx.
 */
export async function createPostWithPaw(opts: {
  wallet: Wallet;
  contentHash: string;
  onProgress?: (message: string) => void;
}): Promise<{ burnTxid: string }> {
  opts.onProgress?.('Burning 1 PAW for this moment...');
  // Lazy: keeps ecash-lib/wasm out of the main bundle.
  const { burnOnePaw } = await import('../../../../src/offering/burnPaw.js');
  const { encodePostStampPushdata } = await import(
    '../../../../src/social/danaSocial.js'
  );
  const result = await burnOnePaw({
    wallet: opts.wallet,
    tokenId: PAW_TOKEN_ID,
    pushdata: encodePostStampPushdata(opts.contentHash),
    burnAtoms: 1n,
    autoSelectUtxos: true,
  });
  notifyBurn(result.txid);
  await opts.wallet.sync().catch(() => undefined);
  return { burnTxid: result.txid };
}

export async function createPaidPostWithXec(opts: {
  wallet: Wallet;
  contentHash: string;
  onProgress?: (message: string) => void;
}): Promise<{ burnTxid: string }> {
  const installId = getOrCreateInstallId();
  const { wallet } = opts;

  let paymentTxid = readPendingPayment();
  if (paymentTxid) {
    opts.onProgress?.('Retrying with your previous payment...');
  } else {
    opts.onProgress?.('Fetching the post fee...');
    const fee = await fetchPostFee();

    await wallet.sync();
    const pureSats = (wallet.utxos as unknown as WalletUtxoLike[])
      .filter(u => !u.token)
      .reduce((sum, u) => sum + u.sats, 0n);
    const need = BigInt(fee.xecSats);
    if (pureSats < need + 500n) throw new Error('POST_NEED_XEC');

    opts.onProgress?.(`Paying ${fee.xec} XEC...`);
    const built = wallet
      .action({ outputs: [{ sats: need, address: fee.address }] })
      .build();
    const resp = await built.broadcast();
    const broadcasted = resp.broadcasted?.[0];
    if (!broadcasted) throw new Error('Post fee payment failed');
    paymentTxid = broadcasted.toLowerCase();
    writePendingPayment(paymentTxid);
    await sleep(1_500);
  }

  opts.onProgress?.('Stamping the moment on-chain...');
  const res = await fetch(`${MINT_API_BASE}/api/post/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      address: wallet.address,
      paymentTxid,
      contentHash: opts.contentHash,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message =
      (err as { error?: string }).error || `Post create HTTP ${res.status}`;
    const transient = /still propagating/i.test(message);
    const alreadyUsed = /already been used/i.test(message);
    if (!transient) clearPendingPayment();
    throw new Error(
      alreadyUsed
        ? 'This payment was already used — refresh the feed to see your moment.'
        : message,
    );
  }
  const data = await res.json();
  clearPendingPayment();
  await wallet.sync().catch(() => undefined);
  return { burnTxid: data.burnTxid };
}
