/**
 * Durable JSON store for indexed DANA animal memorial & paw-print tribute burns.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  profileBareNameFromNote,
  profileSearchRelevance,
  profileDisplayName,
} from '../../../src/offering/animalProfileFields.js';
import {
  compareTrending,
  TRENDING_GRAVITY,
  trendingGroupScore,
} from '../../../src/lib/trendingScore.js';
import { sumPawAtoms } from '../../../src/offering/pawAtoms.js';

export interface IndexedBurn {
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
  /** On-chain sender of the burn tx (lowercased); used for "my pets". */
  senderAddress?: string;
}

export interface MemorialGroup {
  originalBurnTxid: string;
  originalNote: string;
  latestBurnTxid: string;
  latestNote: string;
  totalBurns: number;
  totalPaw: number;
  at: string;
  burns: IndexedBurn[];
}

export const TRENDING_WINDOW_MS = 24 * 60 * 60 * 1000;
export { TRENDING_GRAVITY };

export interface TrendingGroup extends MemorialGroup {
  dayBurns: number;
  score: number;
}

interface StoreFile {
  version: 1;
  burns: IndexedBurn[];
}

export class BurnStore {
  private filePath: string;
  private burns: IndexedBurn[] = [];
  private byTxid = new Map<string, IndexedBurn>();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.burns = [];
      this.byTxid.clear();
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoreFile;
      if (raw && raw.version === 1 && Array.isArray(raw.burns)) {
        this.burns = raw.burns;
        this.byTxid.clear();
        for (const b of this.burns) {
          this.byTxid.set(b.burnTxid.toLowerCase(), b);
        }
      }
    } catch {
      this.burns = [];
      this.byTxid.clear();
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp.${Date.now()}`;
    const payload: StoreFile = { version: 1, burns: this.burns };
    writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
    renameSync(tmp, this.filePath);
  }

  get(txid: string): IndexedBurn | undefined {
    return this.byTxid.get(txid.toLowerCase());
  }

  has(txid: string): boolean {
    return this.byTxid.has(txid.toLowerCase());
  }

  insert(burn: IndexedBurn): boolean {
    const id = burn.burnTxid.toLowerCase();
    if (this.byTxid.has(id)) return false;
    this.burns.push(burn);
    this.byTxid.set(id, burn);
    this.save();
    return true;
  }

  insertBatch(burns: IndexedBurn[]): number {
    let added = 0;
    for (const b of burns) {
      const id = b.burnTxid.toLowerCase();
      if (!this.byTxid.has(id)) {
        this.burns.push(b);
        this.byTxid.set(id, b);
        added++;
      }
    }
    if (added > 0) this.save();
    return added;
  }

  recent(limit = 40): IndexedBurn[] {
    return [...this.burns]
      .sort((a, b) => {
        const ta = a.blockTimestamp ? a.blockTimestamp * 1000 : new Date(a.timeFirstSeen).getTime();
        const tb = b.blockTimestamp ? b.blockTimestamp * 1000 : new Date(b.timeFirstSeen).getTime();
        return tb - ta;
      })
      .slice(0, limit);
  }

  groups(): MemorialGroup[] {
    const groupsByRoot = new Map<string, IndexedBurn[]>();
    for (const b of this.burns) {
      const root = b.originalBurnTxid.toLowerCase();
      const list = groupsByRoot.get(root) ?? [];
      list.push(b);
      groupsByRoot.set(root, list);
    }

    const out: MemorialGroup[] = [];
    for (const [rootTxid, list] of groupsByRoot) {
      list.sort((a, b) => {
        const ta = a.blockTimestamp ? a.blockTimestamp * 1000 : new Date(a.timeFirstSeen).getTime();
        const tb = b.blockTimestamp ? b.blockTimestamp * 1000 : new Date(b.timeFirstSeen).getTime();
        return ta - tb;
      });

      const rootBurn = list.find(b => b.burnTxid.toLowerCase() === rootTxid) || list[0]!;
      const latestBurn = list[list.length - 1]!;

      out.push({
        originalBurnTxid: rootTxid,
        originalNote: rootBurn.note,
        latestBurnTxid: latestBurn.burnTxid,
        latestNote: latestBurn.note,
        totalBurns: list.length,
        totalPaw: sumPawAtoms(list),
        at: latestBurn.timeFirstSeen,
        burns: list,
      });
    }
    return out;
  }

  /** Pet profiles whose root burn was sent by `address` (wallet-paid). */
  petsForSender(address: string): MemorialGroup[] {
    const want = address.trim().toLowerCase();
    if (!want) return [];
    return this.groups().filter(g => {
      const root = g.burns.find(
        b => b.burnTxid.toLowerCase() === g.originalBurnTxid.toLowerCase(),
      );
      return root?.senderAddress?.toLowerCase() === want;
    });
  }

  groupForRoot(txid: string): MemorialGroup | null {
    const id = txid.toLowerCase();
    const item = this.get(id);
    const targetRoot = item?.originalBurnTxid?.toLowerCase() || id;
    const all = this.groups();
    return all.find(g => g.originalBurnTxid.toLowerCase() === targetRoot) || null;
  }

  trending(limit = 8, nowMs = Date.now()): TrendingGroup[] {
    const all = this.groups();
    const ranked: TrendingGroup[] = all.map(g => {
      const times = g.burns.map(b =>
        b.blockTimestamp ? b.blockTimestamp * 1000 : new Date(b.timeFirstSeen).getTime(),
      );
      const score = trendingGroupScore(times, nowMs);
      const dayBurns = times.filter(t => t >= nowMs - TRENDING_WINDOW_MS).length;
      return { ...g, score, dayBurns };
    });

    ranked.sort((a, b) => {
      const atA = new Date(a.at).getTime();
      const atB = new Date(b.at).getTime();
      return compareTrending({ score: a.score, atMs: atA }, { score: b.score, atMs: atB });
    });

    return ranked.slice(0, limit);
  }

  search(query: string, limit = 20): MemorialGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.groups().slice(0, limit);

    const scored = this.groups()
      .map(g => {
        const bare = profileBareNameFromNote(g.originalNote);
        const rel = profileSearchRelevance(bare, q);
        return { group: g, relevance: rel };
      })
      .filter(x => x.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);

    return scored.map(x => x.group).slice(0, limit);
  }
}
