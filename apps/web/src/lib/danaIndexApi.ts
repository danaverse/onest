import { DANA_INDEX_BASE } from './config.js';
import type { ProfileMediaLinks } from './socialApi.js';

export interface IndexBurn {
  burnTxid: string;
  tokenId: string;
  note: string;
  offeringId: string;
  version: number;
  parentBurnTxid?: string;
  originalBurnTxid: string;
  blockHeight: number | null;
  blockTimestamp: number | null;
  timeFirstSeen: string;
  burnAtoms?: string;
  /** Creator attribution (install id / wallets) used for own-pet checks. */
  creatorInstallId?: string;
  creatorAddress?: string;
  senderAddress?: string;
  /** Artwork of the profile this burn belongs to, when uploaded. */
  media?: ProfileMediaLinks | null;
}

export interface IndexMemorialGroup {
  originalBurnTxid: string;
  originalNote: string;
  latestBurnTxid: string;
  latestNote: string;
  totalBurns: number;
  totalPaw?: number;
  at: string;
  burns: IndexBurn[];
  /** Off-chain avatar/banner keys, when uploaded. */
  media?: ProfileMediaLinks | null;
}

export async function fetchRecentBurns(limit = 40): Promise<IndexBurn[]> {
  const base = DANA_INDEX_BASE || '/index-api';
  const res = await fetch(`${base}/api/recent?limit=${limit}`);
  if (!res.ok) throw new Error(`Recent burns HTTP ${res.status}`);
  const data = await res.json();
  return data.burns ?? [];
}

export async function fetchTrendingProfiles(limit = 8): Promise<IndexMemorialGroup[]> {
  const base = DANA_INDEX_BASE || '/index-api';
  const res = await fetch(`${base}/api/trending?limit=${limit}`);
  if (!res.ok) throw new Error(`Trending HTTP ${res.status}`);
  const data = await res.json();
  return data.trending ?? [];
}

/** Newest pet profiles by creation time (root burn), not latest activity. */
export async function fetchRecentProfiles(limit = 12): Promise<IndexMemorialGroup[]> {
  const base = DANA_INDEX_BASE || '/index-api';
  const res = await fetch(`${base}/api/profiles/recent?limit=${limit}`);
  if (!res.ok) throw new Error(`Recent profiles HTTP ${res.status}`);
  const data = await res.json();
  return data.profiles ?? [];
}

export async function searchProfiles(query: string, limit = 20): Promise<IndexMemorialGroup[]> {
  const base = DANA_INDEX_BASE || '/index-api';
  const res = await fetch(`${base}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

export async function fetchMemorialDetails(txid: string): Promise<IndexMemorialGroup> {
  const base = DANA_INDEX_BASE || '/index-api';
  const res = await fetch(`${base}/api/memory/${encodeURIComponent(txid)}`);
  if (!res.ok) {
    const fallback = await fetch(`${base}/api/memorial/${encodeURIComponent(txid)}`);
    if (!fallback.ok) throw new Error(`Memory HTTP ${fallback.status}`);
    const fbData = await fallback.json();
    return fbData.memory || fbData.memorial;
  }
  const data = await res.json();
  return data.memory || data.memorial;
}
