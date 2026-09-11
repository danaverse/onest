/**
 * Desk exchange client: buy PAW with XEC. Creates an order, pays the quoted
 * XEC with an OP_RETURN memo, then polls until the desk delivers PAW.
 */
import { Script } from 'ecash-lib';
import type { Wallet } from 'ecash-wallet';
import {
  exchangeMemo,
  memoOpReturnScriptBytes,
} from '../../../../src/mint/exchangeMemo.js';
import { MINT_API_BASE, getOrCreateInstallId } from './config.js';

const POLL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

interface WalletUtxoLike {
  sats: bigint;
  token?: unknown;
}

export async function buyPawWithXec(opts: {
  wallet: Wallet;
  pawAtoms: bigint;
  onProgress?: (message: string) => void;
}): Promise<{ txid: string; pawAtoms: string }> {
  const installId = getOrCreateInstallId();
  const { wallet } = opts;

  opts.onProgress?.('Creating exchange order...');
  const orderRes = await fetch(`${MINT_API_BASE}/api/exchange/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId,
      address: wallet.address,
      pawAtoms: opts.pawAtoms.toString(),
    }),
  });
  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || `Exchange HTTP ${orderRes.status}`,
    );
  }
  const order = await orderRes.json();

  await wallet.sync();
  const pureSats = (wallet.utxos as unknown as WalletUtxoLike[])
    .filter(u => !u.token)
    .reduce((sum, u) => sum + u.sats, 0n);
  const needed = BigInt(order.xecSats);
  if (pureSats < needed + 500n) {
    throw new Error('BUY_NEED_XEC');
  }

  opts.onProgress?.(
    `Paying ${order.xec} XEC for ${order.pawAtoms} PAW...`,
  );
  const memoScript = new Script(
    memoOpReturnScriptBytes(exchangeMemo(order.orderId)),
  );
  const built = wallet
    .action({
      outputs: [
        { sats: needed, address: order.depositAddress },
        { sats: 0n, script: memoScript },
      ],
    })
    .build();
  const resp = await built.broadcast();
  const payTxid = resp.broadcasted?.[0];
  if (!payTxid) throw new Error('Exchange payment broadcast failed');

  opts.onProgress?.('Waiting for the desk to deliver PAW...');
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    try {
      const statusRes = await fetch(
        `${MINT_API_BASE}/api/exchange/order/${order.orderId}`,
      );
      if (statusRes.ok) {
        const data = await statusRes.json();
        const status = data.order?.status;
        if (status === 'fulfilled') {
          await wallet.sync();
          return { txid: payTxid, pawAtoms: order.pawAtoms };
        }
        if (status === 'failed' || status === 'expired') {
          throw new Error(data.order?.error || `Exchange ${status}`);
        }
      }
    } catch (e) {
      if (e instanceof Error && /underpaid|failed|expired/.test(e.message)) {
        throw e;
      }
      /* transient network error; keep polling */
    }
    if (Date.now() > deadline) {
      throw new Error(
        'Exchange is taking longer than expected — it will complete automatically; refresh in a moment.',
      );
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
