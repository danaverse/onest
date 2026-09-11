/**
 * Flat-fee paid profile: the wallet pays XEC on-chain and the desk burns
 * 1 PAW from inventory. Used when the wallet has no PAW.
 */
import type { Wallet } from 'ecash-wallet';
import { MINT_API_BASE, getOrCreateInstallId } from './config.js';

export interface ProfileFeeInfo {
  xec: string;
  xecSats: string;
  address: string;
}

/**
 * A paid fee tx that has been broadcast but whose profile create call has not
 * succeeded yet. Reused on retry so the user never pays twice.
 */
const PENDING_PAYMENT_KEY = 'onest.pendingProfilePayment';

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
    /* ignore quota / private mode */
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

interface WalletUtxoLike {
  sats: bigint;
  token?: unknown;
}

export async function fetchProfileFee(): Promise<ProfileFeeInfo> {
  const res = await fetch(`${MINT_API_BASE}/api/profile/fee`);
  if (!res.ok) throw new Error(`Profile fee HTTP ${res.status}`);
  return res.json();
}

export async function createPaidProfileWithXec(opts: {
  wallet: Wallet;
  note: string;
  parentBurnTxid?: string;
  onProgress?: (message: string) => void;
}): Promise<{ burnTxid: string }> {
  const installId = getOrCreateInstallId();
  const { wallet } = opts;

  let paymentTxid = readPendingPayment();
  if (paymentTxid) {
    opts.onProgress?.('Retrying with your previous payment...');
  } else {
    opts.onProgress?.('Fetching the profile fee...');
    const fee = await fetchProfileFee();

    await wallet.sync();
    const pureSats = (wallet.utxos as unknown as WalletUtxoLike[])
      .filter(u => !u.token)
      .reduce((sum, u) => sum + u.sats, 0n);
    const need = BigInt(fee.xecSats);
    if (pureSats < need + 500n) {
      throw new Error('PAY_NEED_XEC');
    }

    opts.onProgress?.(`Paying ${fee.xec} XEC...`);
    const built = wallet
      .action({ outputs: [{ sats: need, address: fee.address }] })
      .build();
    const resp = await built.broadcast();
    const broadcasted = resp.broadcasted?.[0];
    if (!broadcasted) throw new Error('Profile fee payment failed');
    paymentTxid = broadcasted.toLowerCase();
    writePendingPayment(paymentTxid);
    /* Give Chronik a moment; the desk also retries the lookup. */
    await sleep(1_500);
  }

  opts.onProgress?.('Creating the profile on-chain...');
  const res = await fetch(`${MINT_API_BASE}/api/profile/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      address: wallet.address,
      paymentTxid,
      note: opts.note,
      parentBurnTxid: opts.parentBurnTxid,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message =
      (err as { error?: string }).error || `Profile create HTTP ${res.status}`;
    const transient = /still propagating/i.test(message);
    const alreadyUsed = /already been used/i.test(message);
    /* Keep the pending payment for transient failures only; on success or a
       permanent outcome there is nothing to retry with. */
    if (!transient) clearPendingPayment();
    throw new Error(
      alreadyUsed
        ? 'This payment was already used — check your My Pets tab for the profile.'
        : message,
    );
  }
  const data = await res.json();
  clearPendingPayment();
  await wallet.sync().catch(() => undefined);
  return { burnTxid: data.burnTxid };
}
