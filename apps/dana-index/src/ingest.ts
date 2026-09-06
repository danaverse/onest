/**
 * Chronik ingest — scan PAW token history for DANA animal memorial & paw burns.
 */
import { ChronikClient, type Tx } from 'chronik-client';
import { memorialFromOutputScriptHex } from '../../../src/offering/memorialFromScript.js';
import { burnAtomsFromTokenEntries } from '../../../src/offering/pawAtoms.js';
import type { BurnStore, IndexedBurn } from './store.js';

const DEFAULT_CHRONIK = [
  'https://chronik.e.cash',
  'https://xec.paybutton.org',
  'https://chronik.pay2stay.com/xec',
];

export function chronikUrlsFromEnv(): string[] {
  const raw = process.env.CHRONIK_URLS?.trim();
  if (raw) {
    const list = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (list.length) return list;
  }
  return [...DEFAULT_CHRONIK];
}

export function createIngestChronik(urls = chronikUrlsFromEnv()): ChronikClient {
  return new ChronikClient(urls);
}

function memorialFromTx(tx: Tx): ReturnType<typeof memorialFromOutputScriptHex> {
  for (const out of tx.outputs ?? []) {
    const hex = out.outputScript;
    if (!hex || typeof hex !== 'string') continue;
    const m = memorialFromOutputScriptHex(hex);
    if (m) return m;
  }
  return null;
}

export function burnAtomsFromTx(tx: Tx, tokenId: string): string {
  return burnAtomsFromTokenEntries(tx.tokenEntries ?? [], tokenId);
}

function txTouchesToken(tx: Tx, tokenId: string): boolean {
  const want = tokenId.toLowerCase();
  for (const te of tx.tokenEntries ?? []) {
    if (te.tokenId?.toLowerCase() === want) return true;
  }
  for (const out of tx.outputs ?? []) {
    if (out.token?.tokenId?.toLowerCase() === want) return true;
  }
  for (const inp of tx.inputs ?? []) {
    if (inp.token?.tokenId?.toLowerCase() === want) return true;
  }
  return false;
}

export function indexedBurnFromTx(
  tx: Tx,
  tokenId: string,
  nowIso = new Date().toISOString(),
): IndexedBurn | null {
  if (!tx.txid) return null;
  if (!txTouchesToken(tx, tokenId)) return null;
  const memorial = memorialFromTx(tx);
  if (!memorial) return null;
  if (memorial.version !== 1 && memorial.version !== 2) return null;

  const parent = memorial.parentBurnTxid?.toLowerCase();
  const burnTxid = tx.txid.toLowerCase();
  return {
    burnTxid,
    tokenId: tokenId.toLowerCase(),
    note: (memorial.note || '').trim(),
    offeringId: memorial.offeringId,
    version: memorial.version,
    parentBurnTxid: parent,
    originalBurnTxid: parent || burnTxid,
    blockHeight: tx.block?.height ?? null,
    blockTimestamp: tx.block?.timestamp ? Number(tx.block.timestamp) : null,
    timeFirstSeen: nowIso,
    burnAtoms: burnAtomsFromTx(tx, tokenId),
  };
}

export async function ingestTxid(
  chronik: ChronikClient,
  store: BurnStore,
  txid: string,
  tokenId: string,
): Promise<boolean> {
  const id = txid.trim().toLowerCase();
  if (store.has(id)) return false;
  try {
    const tx = await chronik.tx(id);
    const item = indexedBurnFromTx(tx, tokenId);
    if (!item) return false;
    return store.insert(item);
  } catch (err) {
    console.warn(`Ingest failed for tx ${id}:`, err);
    return false;
  }
}

export async function backfillRecent(
  chronik: ChronikClient,
  store: BurnStore,
  tokenId: string,
  page = 0,
  pageSize = 50,
): Promise<number> {
  const history = await chronik.tokenId(tokenId).history(page, pageSize);
  const txs = history.txs ?? [];
  let added = 0;
  for (const tx of txs) {
    const item = indexedBurnFromTx(tx, tokenId);
    if (item && store.insert(item)) {
      added++;
    }
  }
  return added;
}

export async function ingestUnconfirmed(
  chronik: ChronikClient,
  store: BurnStore,
  tokenId: string,
): Promise<number> {
  const history = await chronik.tokenId(tokenId).history(0, 30);
  const txs = history.txs ?? [];
  let added = 0;
  for (const tx of txs) {
    if (tx.block) continue;
    const item = indexedBurnFromTx(tx, tokenId);
    if (item && store.insert(item)) {
      added++;
    }
  }
  return added;
}
