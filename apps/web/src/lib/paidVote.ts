/**
 * Flat-fee paid vote: pay XEC, the desk burns 1 PAW with the DANA v3 vote
 * payload. No listing fee, no PoW, no wait. A retry reuses the pending
 * payment for the same post + direction.
 */
import type { Wallet } from 'ecash-wallet';
import { MINT_API_BASE, getOrCreateInstallId } from './config.js';

const PENDING_PAYMENT_KEY = 'onest.pendingVotePayment';

interface WalletUtxoLike {
  sats: bigint;
  token?: unknown;
}

export type VoteDirection = 1 | 0;

interface PendingVotePayment {
  postId: string;
  direction: VoteDirection;
  paymentTxid: string;
}

export interface VoteFee {
  xec: string;
  xecSats: string;
  address: string;
}

function readPendingPayment(
  postId: string,
  direction: VoteDirection,
): string | null {
  try {
    const raw = localStorage.getItem(PENDING_PAYMENT_KEY)?.trim() || '';
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVotePayment;
    if (
      parsed &&
      parsed.postId === postId &&
      parsed.direction === direction &&
      /^[0-9a-f]{64}$/i.test(parsed.paymentTxid)
    ) {
      return parsed.paymentTxid.toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writePendingPayment(payment: PendingVotePayment): void {
  try {
    localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(payment));
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

export async function fetchVoteFee(): Promise<VoteFee> {
  const res = await fetch(`${MINT_API_BASE}/api/vote/fee`);
  if (!res.ok) throw new Error(`Vote fee HTTP ${res.status}`);
  return (await res.json()) as VoteFee;
}

export async function createPaidVoteWithXec(opts: {
  wallet: Wallet;
  postId: string;
  direction: VoteDirection;
  onProgress?: (message: string) => void;
}): Promise<{ burnTxid: string; direction: VoteDirection }> {
  const installId = getOrCreateInstallId();
  const { wallet, postId, direction } = opts;

  let paymentTxid = readPendingPayment(postId, direction);
  if (paymentTxid) {
    opts.onProgress?.('Retrying with your previous payment...');
  } else {
    opts.onProgress?.('Fetching the vote fee...');
    const fee = await fetchVoteFee();

    await wallet.sync();
    const pureSats = (wallet.utxos as unknown as WalletUtxoLike[])
      .filter(u => !u.token)
      .reduce((sum, u) => sum + u.sats, 0n);
    const need = BigInt(fee.xecSats);
    if (pureSats < need + 500n) throw new Error('VOTE_NEED_XEC');

    opts.onProgress?.(`Paying ${fee.xec} XEC...`);
    const built = wallet
      .action({ outputs: [{ sats: need, address: fee.address }] })
      .build();
    const resp = await built.broadcast();
    const broadcasted = resp.broadcasted?.[0];
    if (!broadcasted) throw new Error('Vote fee payment failed');
    paymentTxid = broadcasted.toLowerCase();
    writePendingPayment({ postId, direction, paymentTxid });
    await sleep(1_500);
  }

  opts.onProgress?.('Burning 1 PAW for your vote...');
  const res = await fetch(`${MINT_API_BASE}/api/vote/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      address: wallet.address,
      paymentTxid,
      postHash: postId,
      direction,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message =
      (err as { error?: string }).error || `Vote create HTTP ${res.status}`;
    const transient = /still propagating/i.test(message);
    const alreadyUsed = /already been used/i.test(message);
    if (!transient) clearPendingPayment();
    throw new Error(
      alreadyUsed ? 'This payment was already used — your vote is counted.' : message,
    );
  }
  const data = (await res.json()) as { burnTxid: string };
  clearPendingPayment();
  await wallet.sync().catch(() => undefined);
  return { burnTxid: data.burnTxid, direction };
}
