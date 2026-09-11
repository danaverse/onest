/**
 * Flat-fee paid pet profiles: the user pays XEC on-chain and the desk burns
 * 1 PAW from inventory (no remint, no PoW, no wait). The payment itself is the
 * anti-spam cost and must come from the wallet creating the profile.
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
import { prepareDanaNote } from '../../../src/offering/animalProfileFields.js';
import { burnOnePaw, explorerTx } from '../../../src/offering/burnPaw.js';
import { loadDepJson, notifyDanaIndex } from './offer.js';
import { rememberRootCreator } from './rootCreators.js';

const FEE_XEC = resolveProfileXecFee(process.env.MINT_PROFILE_XEC_FEE);
const USED_PATH =
  process.env.MINT_PAID_PROFILE_STORE?.trim() ||
  resolve(process.cwd(), 'data/paid-profiles.json');
const MAX_USED = 1000;

interface UsedFile {
  version: 1;
  txids: string[];
}

function loadUsed(): string[] {
  if (!existsSync(USED_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(USED_PATH, 'utf8')) as UsedFile;
    return raw && raw.version === 1 && Array.isArray(raw.txids) ? raw.txids : [];
  } catch {
    return [];
  }
}

function saveUsed(txids: string[]): void {
  mkdirSync(dirname(USED_PATH), { recursive: true });
  writeFileSync(
    USED_PATH,
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

export async function profileFeeInfo(): Promise<{
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

export interface PaidProfileResult {
  ok: true;
  burnTxid: string;
  note: string;
  explorerBurn: string;
  xec: string;
}

export async function createPaidProfile(input: {
  installId: string;
  address: string;
  paymentTxid: string;
  note: string;
  parentBurnTxid?: string;
}): Promise<PaidProfileResult> {
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
      throw new Error('Payment must come from the wallet creating the profile');
    }

    markUsed(paymentTxid);
    try {
      const note = prepareDanaNote(input.note, Boolean(input.parentBurnTxid));
      const burn = await burnOnePaw({
        wallet: tipWallet.wallet,
        tokenId: dep.tokenId,
        note,
        parentBurnTxid: input.parentBurnTxid,
        burnAtoms: 1n,
      });
      notifyDanaIndex(burn.txid, input.installId);
      rememberRootCreator(input.parentBurnTxid || burn.txid, input.installId);
      return {
        ok: true,
        burnTxid: burn.txid,
        note,
        explorerBurn: explorerTx(burn.txid),
        xec: FEE_XEC.toString(),
      };
    } catch (e) {
      unmarkUsed(paymentTxid);
      throw e;
    }
  } finally {
    inFlight.delete(paymentTxid);
  }
}
