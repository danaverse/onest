/**
 * Chronik ingest — scan PAW token history for DANA memorials, post stamps and votes.
 *
 * Cursor model:
 *   - `paw-token`                newest processed txid (incremental catch-up)
 *   - `paw-token-backfill-page`  next anti-chronological page to walk (deep history)
 *
 * All routes are idempotent (BurnStore.has, unique vote txid, pending-only verify),
 * so re-processing is safe.
 */
import { Address } from 'ecash-lib';
import { ChronikClient, type Tx } from 'chronik-client';
import { danaPushFromOutputScriptHex } from '../../../src/social/danaFromScript.js';
import type { DanaPush } from '../../../src/social/danaClassify.js';
import type { BurnStore } from './store.js';
import type { SocialStore } from './social/socialStore.js';
import { INGEST_CURSOR_KEY } from './social/socialStore.js';
import { routeDanaTx, type RouteResult } from './social/txRouting.js';

const DEFAULT_CHRONIK = [
  'https://chronik.e.cash',
  'https://xec.paybutton.org',
  'https://chronik.pay2stay.com/xec',
];

export const HISTORY_PAGE_SIZE = 50;
/** First-run deep walk cap (pages). */
export const MAX_CATCHUP_PAGES = 40;
export const BACKFILL_CURSOR_KEY = 'paw-token-backfill-page';
export const BACKFILL_DONE = 'done';

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

export function danaFromTx(tx: Tx): DanaPush | null {
  for (const out of tx.outputs ?? []) {
    const hex = out.outputScript;
    if (!hex || typeof hex !== 'string') continue;
    const m = danaPushFromOutputScriptHex(hex);
    if (m) return m;
  }
  return null;
}

/** First input address (P2PKH/P2SH); empty for coinbase or unparseable inputs. */
export function senderAddressFromTx(tx: Tx): string | null {
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

export interface IngestTotals {
  processed: number;
  memorial: number;
  post: number;
  vote: number;
}

export function emptyTotals(): IngestTotals {
  return { processed: 0, memorial: 0, post: 0, vote: 0 };
}

function addRoute(totals: IngestTotals, r: RouteResult): void {
  totals.processed += 1;
  if (r.memorial) totals.memorial += 1;
  if (r.post) totals.post += 1;
  if (r.vote) totals.vote += 1;
}

function mergeTotals(dst: IngestTotals, src: IngestTotals): void {
  dst.processed += src.processed;
  dst.memorial += src.memorial;
  dst.post += src.post;
  dst.vote += src.vote;
}

export function routeTx(
  tx: Tx,
  tokenId: string,
  burnStore: BurnStore,
  social: SocialStore,
  opts?: { voterInstall?: string | null },
): IngestTotals {
  const totals = emptyTotals();
  const push = danaFromTx(tx);
  if (!push) return totals;
  const r = routeDanaTx({
    tx,
    tokenId,
    push,
    burnStore,
    social,
    burnedBy: senderAddressFromTx(tx),
    voterInstall: opts?.voterInstall ?? null,
  });
  addRoute(totals, r);
  return totals;
}

export async function ingestTxid(
  chronik: ChronikClient,
  burnStore: BurnStore,
  social: SocialStore,
  txid: string,
  tokenId: string,
  opts?: { voterInstall?: string | null },
): Promise<IngestTotals> {
  const id = txid.trim().toLowerCase();
  try {
    const tx = await chronik.tx(id);
    return routeTx(tx, tokenId, burnStore, social, opts);
  } catch (err) {
    console.warn(`Ingest failed for tx ${id}:`, err);
    return emptyTotals();
  }
}

export interface SyncResult extends IngestTotals {
  newestTxid: string | null;
  backfillDone: boolean;
}

/**
 * Incremental catch-up from the newest tx back to the cursor, plus one page of
 * deep-history backfill per pass until the token history is fully walked.
 */
export async function syncTokenHistory(
  chronik: ChronikClient,
  tokenId: string,
  burnStore: BurnStore,
  social: SocialStore,
): Promise<SyncResult> {
  const totals = emptyTotals();
  const cursor = chronik.tokenId(tokenId);

  const lastSeen = social.getIngestCursor(INGEST_CURSOR_KEY);
  let newestTxid: string | null = null;
  let page = 0;
  let coveredToCursor = lastSeen == null;

  while (page < MAX_CATCHUP_PAGES) {
    const history = await cursor.history(page, HISTORY_PAGE_SIZE);
    const txs = history.txs ?? [];
    if (page === 0 && txs[0]) newestTxid = txs[0].txid.toLowerCase();
    if (txs.length === 0) {
      coveredToCursor = true;
      break;
    }
    let sawCursor = false;
    for (const tx of txs) {
      if (lastSeen && tx.txid.toLowerCase() === lastSeen) {
        sawCursor = true;
        break;
      }
      mergeTotals(totals, routeTx(tx, tokenId, burnStore, social));
    }
    if (sawCursor) {
      coveredToCursor = true;
      break;
    }
    if (txs.length < HISTORY_PAGE_SIZE) {
      coveredToCursor = true;
      break;
    }
    page += 1;
  }

  if (newestTxid) social.setIngestCursor(newestTxid);
  if (lastSeen == null) {
    social.setIngestCursor(
      coveredToCursor ? BACKFILL_DONE : String(page + 1),
      BACKFILL_CURSOR_KEY,
    );
  }

  let backfillDone = social.getIngestCursor(BACKFILL_CURSOR_KEY) === BACKFILL_DONE;
  if (!backfillDone) {
    const raw = social.getIngestCursor(BACKFILL_CURSOR_KEY);
    const bfPage = Number.parseInt(raw ?? '0', 10);
    const bf = Number.isFinite(bfPage) && bfPage >= 0 ? bfPage : 0;
    const history = await cursor.history(bf, HISTORY_PAGE_SIZE);
    const txs = history.txs ?? [];
    for (const tx of txs) {
      mergeTotals(totals, routeTx(tx, tokenId, burnStore, social));
    }
    const next = bf + 1;
    const numPages = history.numPages ?? 0;
    if (txs.length === 0 || next >= numPages) {
      social.setIngestCursor(BACKFILL_DONE, BACKFILL_CURSOR_KEY);
      backfillDone = true;
    } else {
      social.setIngestCursor(String(next), BACKFILL_CURSOR_KEY);
    }
  }

  return { ...totals, newestTxid, backfillDone };
}
