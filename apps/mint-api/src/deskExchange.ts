/**
 * Desk XEC → PAW exchange: sells PAW from desk inventory at a configurable
 * rate (default 1 XEC = 1 PAW atom). Orders are paid with an OP_RETURN memo;
 * a watcher matches payments, tops up inventory with a fresh remint if
 * needed, and delivers PAW to the buyer.
 */
import { randomUUID } from 'node:crypto';
import { Address, toHex } from 'ecash-lib';
import { resolve } from 'node:path';
import { createChronik } from '../../../src/network/createChronik.js';
import { loadTipFeeWallet } from '../../../src/mint/loadTipFeeWallet.js';
import { parseServingTipIndex } from '../../../src/mint/servingTips.js';
import {
  quoteXecSats,
  resolveXecSatsPerPaw,
  xecFromSats,
} from '../../../src/mint/exchangeRate.js';
import {
  decodeExchangeMemoFromScriptHex,
  exchangeMemo,
} from '../../../src/mint/exchangeMemo.js';
import { ExchangeStore, type ExchangeOrder } from './exchangeStore.js';
import { ensureDeskPaw, sendPawToAddress } from './deskInventory.js';

const ORDER_TTL_MS = 30 * 60_000;
const MIN_ORDER_ATOMS = 1n;
const POLL_MS = 15_000;

const SATS_PER_ATOM = resolveXecSatsPerPaw(process.env.MINT_XEC_SATS_PER_PAW);
const MAX_ORDER_ATOMS = (() => {
  const raw = process.env.MINT_MAX_EXCHANGE_ATOMS?.trim();
  try {
    const n = raw ? BigInt(raw) : 1080n;
    return n > 0n ? n : 1080n;
  } catch {
    return 1080n;
  }
})();

const STORE_PATH =
  process.env.MINT_EXCHANGE_STORE?.trim() ||
  resolve(process.cwd(), 'data/exchange-orders.json');

export const exchangeStore = new ExchangeStore(STORE_PATH);

export function exchangeRateInfo(): {
  ok: true;
  satsPerPawAtom: string;
  xecPerPawAtom: string;
  maxPawAtoms: string;
  minPawAtoms: string;
} {
  return {
    ok: true,
    satsPerPawAtom: SATS_PER_ATOM.toString(),
    xecPerPawAtom: xecFromSats(SATS_PER_ATOM),
    maxPawAtoms: MAX_ORDER_ATOMS.toString(),
    minPawAtoms: MIN_ORDER_ATOMS.toString(),
  };
}

export interface ExchangeOrderQuote {
  ok: true;
  orderId: string;
  depositAddress: string;
  pawAtoms: string;
  xecSats: string;
  xec: string;
  memo: string;
  expiresAt: string;
}

export async function createExchangeOrder(input: {
  installId: string;
  address: string;
  pawAtoms: bigint;
}): Promise<ExchangeOrderQuote> {
  Address.parse(input.address.trim());
  if (input.pawAtoms < MIN_ORDER_ATOMS || input.pawAtoms > MAX_ORDER_ATOMS) {
    throw new Error(
      `pawAtoms must be between ${MIN_ORDER_ATOMS} and ${MAX_ORDER_ATOMS}`,
    );
  }

  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, parseServingTipIndex());
  const id = randomUUID().replaceAll('-', '').toLowerCase();
  const xecSats = quoteXecSats(input.pawAtoms, SATS_PER_ATOM);
  const now = Date.now();

  const order: ExchangeOrder = {
    id,
    installId: input.installId,
    address: input.address.trim().toLowerCase(),
    pawAtoms: input.pawAtoms.toString(),
    xecSats: xecSats.toString(),
    depositAddress: tipWallet.address,
    status: 'open',
    createdAt: now,
    expiresAt: now + ORDER_TTL_MS,
  };
  exchangeStore.create(order);

  return {
    ok: true,
    orderId: id,
    depositAddress: tipWallet.address,
    pawAtoms: order.pawAtoms,
    xecSats: order.xecSats,
    xec: xecFromSats(xecSats),
    memo: exchangeMemo(id),
    expiresAt: new Date(order.expiresAt).toISOString(),
  };
}

export function publicExchangeOrder(order: ExchangeOrder): {
  orderId: string;
  address: string;
  pawAtoms: string;
  xecSats: string;
  xec: string;
  status: ExchangeOrder['status'];
  createdAt: number;
  expiresAt: number;
  paymentTxid?: string;
  fulfillmentTxid?: string;
  error?: string;
} {
  return {
    orderId: order.id,
    address: order.address,
    pawAtoms: order.pawAtoms,
    xecSats: order.xecSats,
    xec: xecFromSats(BigInt(order.xecSats)),
    status: order.status,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paymentTxid: order.paymentTxid,
    fulfillmentTxid: order.fulfillmentTxid,
    error: order.error,
  };
}

let watcherTimer: NodeJS.Timeout | null = null;

export function startExchangeWatcher(): void {
  if (watcherTimer) return;
  const tick = (): void => {
    void pollExchange().catch(err => console.warn('exchange watcher:', err));
  };
  tick();
  watcherTimer = setInterval(tick, POLL_MS);
}

/** One watcher pass: match paid orders and deliver PAW. */
export async function pollExchange(
  now = Date.now(),
): Promise<{ processed: number }> {
  exchangeStore.pruneExpired(now);

  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, parseServingTipIndex());
  const depositScriptHex = toHex(tipWallet.wallet.script.bytecode);
  const history = await chronik.address(tipWallet.address).history(0, 20);

  let processed = 0;
  for (const tx of history.txs ?? []) {
    const txid = tx.txid?.toLowerCase();
    if (!txid || exchangeStore.hasProcessedTx(txid)) continue;

    let orderId: string | null = null;
    for (const out of tx.outputs ?? []) {
      if (typeof out.outputScript !== 'string') continue;
      const memo = decodeExchangeMemoFromScriptHex(out.outputScript);
      if (memo) {
        orderId = memo;
        break;
      }
    }
    if (!orderId) continue;
    exchangeStore.addProcessedTx(txid);

    const order = exchangeStore.get(orderId);
    if (!order || order.status !== 'open') continue;

    let paid = 0n;
    for (const out of tx.outputs ?? []) {
      if (out.outputScript?.toLowerCase() === depositScriptHex) {
        paid += out.sats;
      }
    }
    if (paid < BigInt(order.xecSats)) {
      exchangeStore.update(order.id, {
        status: 'failed',
        error: `underpaid ${paid.toString()}/${order.xecSats}`,
      });
      continue;
    }

    exchangeStore.update(order.id, {
      status: 'paid',
      paymentTxid: txid,
      paidAt: now,
    });
    try {
      await ensureDeskPaw(BigInt(order.pawAtoms));
      const { txid: deliverTxid } = await sendPawToAddress({
        toAddress: order.address,
        atoms: BigInt(order.pawAtoms),
      });
      exchangeStore.update(order.id, {
        status: 'fulfilled',
        fulfillmentTxid: deliverTxid,
      });
      processed++;
    } catch (e) {
      exchangeStore.update(order.id, {
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      });
      console.warn(`exchange order ${order.id} delivery failed:`, e);
    }
  }
  return { processed };
}
