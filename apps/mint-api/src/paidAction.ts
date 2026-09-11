/**
 * Shared flat-fee paid actions (profiles, post stamps).
 *
 * The user pays XEC on-chain; the desk verifies the payment (amount, payer,
 * single-use), ensures it holds enough PAW inventory, then runs the action
 * (normally a 1-PAW burn). No PoW, no wait.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Address, toHex } from 'ecash-lib';
import type { ChronikClient, Tx } from 'chronik-client';
import { createChronik } from '../../../src/network/createChronik.js';
import { loadTipFeeWallet } from '../../../src/mint/loadTipFeeWallet.js';
import { parseServingTipIndex } from '../../../src/mint/servingTips.js';
import {
  resolveProfileXecFee,
  sumOutputsToScript,
  xecToSats,
} from '../../../src/mint/profileFee.js';
import { ensureDeskPaw } from './deskInventory.js';
import { loadDepJson, type OnestDep } from './offer.js';

const FEE_XEC = resolveProfileXecFee(
  process.env.MINT_ACTION_XEC_FEE ?? process.env.MINT_PROFILE_XEC_FEE,
);

const STORE_PATH =
  process.env.MINT_PAID_PROFILE_STORE?.trim() ||
  resolve(process.cwd(), 'data/paid-profiles.json');
const MAX_USED = 2000;

interface UsedFile {
  version: 1;
  txids: string[];
}

function loadUsed(): string[] {
  if (!existsSync(STORE_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as UsedFile;
    return raw && raw.version === 1 && Array.isArray(raw.txids) ? raw.txids : [];
  } catch {
    return [];
  }
}

function saveUsed(txids: string[]): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(
    STORE_PATH,
    `${JSON.stringify({ version: 1, txids: txids.slice(-MAX_USED) }, null, 2)}\n`,
  );
}

const usedPayments = new Set(loadUsed());
const inFlight = new Set<string>();

function markUsed(txid: string): void {
  usedPayments.add(txid);
  saveUsed([...usedPayments]);
}

function unmarkUsed(txid: string): void {
  usedPayments.delete(txid);
  saveUsed([...usedPayments]);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * A freshly broadcast payment may not be in the desk Chronik node yet.
 * Retry briefly before giving up so the user doesn't have to re-pay.
 */
async function fetchTxWithRetry(
  chronik: ChronikClient,
  txid: string,
  attempts = 10,
  delayMs = 2_000,
): Promise<Tx> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await chronik.tx(txid);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/404|not found/i.test(msg)) throw e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw new Error(
    `Payment transaction is still propagating (${lastErr instanceof Error ? lastErr.message : 'not found'}). ` +
      'Tap the pay button again to retry — your previous payment will be reused, no extra payment is made.',
  );
}

/** First P2PKH input address (the paying wallet). */
function senderAddressFromTx(tx: Tx): string | null {
  for (const inp of tx.inputs ?? []) {
    const hex = inp.outputScript;
    if (!hex || typeof hex !== 'string') continue;
    try {
      return Address.fromScriptHex(hex).toString().toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

export async function paidActionFeeInfo(): Promise<{
  ok: true;
  xec: string;
  xecSats: string;
  address: string;
}> {
  const chronik = await createChronik();
  const tipWallet = await loadTipFeeWallet(chronik, parseServingTipIndex());
  return {
    ok: true,
    xec: FEE_XEC.toString(),
    xecSats: xecToSats(FEE_XEC).toString(),
    address: tipWallet.address,
  };
}

export interface PaidActionContext {
  dep: OnestDep;
  tipWallet: Awaited<ReturnType<typeof loadTipFeeWallet>>;
  paidSats: bigint;
  feeXec: string;
}

/**
 * Verify a payment and run a desk action:
 *   1. on-chain lookup (with propagation retry), payer/amount checks
 *   2. ensure desk PAW inventory (fresh sponsored remint when short)
 *   3. mark the payment used, run the action, unmark on failure
 */
export async function consumePaidAction<T>(input: {
  installId: string;
  address: string;
  paymentTxid: string;
  /** Desk PAW required (profiles: 7, post stamps: 1). */
  minDeskPaw: bigint;
  run: (ctx: PaidActionContext) => Promise<T>;
}): Promise<T> {
  const dep = loadDepJson();
  if (!dep.tokenId) throw new Error('No PAW TOKEN_ID configured');

  const paymentTxid = input.paymentTxid.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(paymentTxid)) {
    throw new Error('valid paymentTxid required');
  }
  if (usedPayments.has(paymentTxid)) {
    throw new Error('Payment has already been used');
  }
  if (inFlight.has(paymentTxid)) {
    throw new Error('Payment is already being processed');
  }
  inFlight.add(paymentTxid);

  try {
    const chronik = await createChronik();
    const tx = await fetchTxWithRetry(chronik, paymentTxid);
    const tipWallet = await loadTipFeeWallet(chronik, parseServingTipIndex());

    const feeSats = xecToSats(FEE_XEC);
    const paid = sumOutputsToScript(
      (tx.outputs ?? []) as Array<{ sats: bigint; outputScript: string }>,
      toHex(tipWallet.wallet.script.bytecode),
    );
    if (paid < feeSats) {
      throw new Error(`Payment too small (${paid} / ${feeSats} sats)`);
    }

    const sender = senderAddressFromTx(tx);
    if (!sender || sender !== input.address.trim().toLowerCase()) {
      throw new Error('Payment must come from the wallet creating the action');
    }

    /* No sponsored upvotes yet? Mint a fresh remint (108 atoms) so the burn
       can proceed. Done before marking the payment used, so a mint failure
       leaves the payment retryable. */
    await ensureDeskPaw(input.minDeskPaw);

    markUsed(paymentTxid);
    try {
      return await input.run({
        dep,
        tipWallet,
        paidSats: paid,
        feeXec: FEE_XEC.toString(),
      });
    } catch (e) {
      unmarkUsed(paymentTxid);
      throw e;
    }
  } finally {
    inFlight.delete(paymentTxid);
  }
}
