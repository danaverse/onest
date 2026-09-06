import { DANA_INDEX_BASE } from './config.js';

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

export async function searchProfiles(query: string, limit = 20): Promise<IndexMemorialGroup[]> {
  const base = DANA_INDEX_BASE || '/index-api';
  const res = await fetch(`${base}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

export async function fetchMemorialDetails(txid: string): Promise<IndexMemorialGroup> {
  const base = DANA_INDEX_BASE || '/index-api';
  const res = await fetch(`${base}/api/memorial/${encodeURIComponent(txid)}`);
  if (!res.ok) throw new Error(`Memorial HTTP ${res.status}`);
  const data = await res.json();
  return data.memorial;
}
