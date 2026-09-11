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
  const paymentTxid = resp.broadcasted?.[0];
  if (!paymentTxid) throw new Error('Profile fee payment failed');

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
    throw new Error(
      (err as { error?: string }).error || `Profile create HTTP ${res.status}`,
    );
  }
  const data = await res.json();
  await wallet.sync().catch(() => undefined);
  return { burnTxid: data.burnTxid };
}
