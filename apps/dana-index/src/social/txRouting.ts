/**
 * Pure tx routing: classified DANA push + raw Chronik tx -> store writes.
 * Kept free of ecash-lib so it stays unit-testable (script parsing lives in ingest.ts).
 */
import type { Tx } from 'chronik-client';
import { burnAtomsFromTokenEntries } from '../../../../src/offering/pawAtoms.js';
import type { MemorialFields } from '../../../../src/offering/danaMemorial.js';
import type { DanaPush } from '../../../../src/social/danaClassify.js';
import type { PostStampFields, VoteFields } from '../../../../src/social/danaSocial.js';
import { VOTE_DIRECTION_UP } from '../../../../src/social/danaSocial.js';
import type { BurnStore, IndexedBurn } from '../store.js';
import type { SocialStore } from './socialStore.js';

export interface RouteResult {
  memorial: boolean;
  post: boolean;
  vote: boolean;
}

const NO_ROUTE: RouteResult = { memorial: false, post: false, vote: false };

export function txTimeMs(tx: Tx): number {
  const blockTs = tx.block?.timestamp ? Number(tx.block.timestamp) : 0;
  if (blockTs > 0) return blockTs * 1000;
  if (tx.timeFirstSeen && tx.timeFirstSeen > 0) return tx.timeFirstSeen * 1000;
  return Date.now();
}

export function txTouchesToken(tx: Tx, tokenId: string): boolean {
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

export function burnAtomsFromTx(tx: Tx, tokenId: string): string {
  return burnAtomsFromTokenEntries(tx.tokenEntries ?? [], tokenId);
}

export function indexedBurnFromPush(
  tx: Tx,
  tokenId: string,
  memorial: MemorialFields,
  nowIso = new Date().toISOString(),
  senderAddress?: string | null,
): IndexedBurn | null {
  if (!tx.txid) return null;
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
    senderAddress: senderAddress?.trim().toLowerCase() || undefined,
  };
}

export interface RoutedVote {
  txid: string;
  postId: string;
  direction: number;
  atoms: number;
  burnedBy: string;
  voterInstall: string | null;
  blockHeight: number | null;
  votedAt: number;
}

export function voteFromPush(
  tx: Tx,
  tokenId: string,
  vote: VoteFields,
  opts?: { burnedBy?: string | null; voterInstall?: string | null },
): RoutedVote | null {
  if (!tx.txid) return null;
  const atoms = Number.parseInt(burnAtomsFromTx(tx, tokenId), 10);
  return {
    txid: tx.txid.toLowerCase(),
    postId: vote.postHash,
    direction: vote.direction === VOTE_DIRECTION_UP ? 1 : 0,
    atoms: Number.isFinite(atoms) && atoms > 0 ? atoms : 1,
    burnedBy: (opts?.burnedBy || 'unknown').toLowerCase(),
    voterInstall: opts?.voterInstall?.trim() || null,
    blockHeight: tx.block?.height ?? null,
    votedAt: txTimeMs(tx),
  };
}

export interface RouteDanaTxOpts {
  tx: Tx;
  tokenId: string;
  push: DanaPush;
  burnStore: BurnStore;
  social?: SocialStore;
  burnedBy?: string | null;
  voterInstall?: string | null;
  nowIso?: string;
}

export function routeDanaTx(opts: RouteDanaTxOpts): RouteResult {
  const { tx, tokenId, push } = opts;
  if (!tx.txid) return NO_ROUTE;
  if (!txTouchesToken(tx, tokenId)) return NO_ROUTE;

  if (push.kind === 'memorial') {
    const item = indexedBurnFromPush(
      tx,
      tokenId,
      push.memorial,
      opts.nowIso,
      opts.burnedBy,
    );
    if (item && opts.burnStore.insert(item)) {
      return { memorial: true, post: false, vote: false };
    }
    return NO_ROUTE;
  }

  if (!opts.social) return NO_ROUTE;

  if (push.kind === 'post') {
    const verified = opts.social.verifyPost(
      push.post.contentHash,
      tx.txid.toLowerCase(),
      txTimeMs(tx),
    );
    return { memorial: false, post: verified, vote: false };
  }

  const routed = voteFromPush(tx, tokenId, push.vote, {
    burnedBy: opts.burnedBy,
    voterInstall: opts.voterInstall,
  });
  if (routed && opts.social.recordVote(routed) === 'inserted') {
    return { memorial: false, post: false, vote: true };
  }
  return NO_ROUTE;
}

export type { PostStampFields };
