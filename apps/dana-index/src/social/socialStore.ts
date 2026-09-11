/**
 * SocialStore — hosted posts / media / comments plus chain-derived votes.
 *
 * Votes are only ever written from Chronik ingest; tallies are updated in the
 * same transaction that inserts the unique vote row (txid).
 */
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { TRENDING_GRAVITY } from '../../../../src/lib/trendingScore.js';
import {
  comments,
  ingestState,
  media,
  postMedia,
  posts,
  users,
  votes,
} from './schema.js';
import type * as schema from './schema.js';

export const INGEST_CURSOR_KEY = 'paw-token';

export interface MediaRow {
  sha256: string;
  mime: string;
  bytes: number;
  objectKey: string;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export interface PostRow {
  id: string;
  petRootTxid: string;
  authorInstall: string;
  authorAddress: string | null;
  caption: string;
  contentHash: string;
  anchorTxid: string | null;
  status: 'pending' | 'verified' | 'removed';
  createdAt: number;
  anchoredAt: number | null;
  upvoteAtoms: number;
  downvoteAtoms: number;
}

export interface PostMediaItem {
  sha256: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  position: number;
}

export interface FeedPost extends PostRow {
  media: PostMediaItem[];
}

export interface VoteRow {
  txid: string;
  postId: string;
  direction: number;
  atoms: number;
  burnedBy: string;
  voterInstall: string | null;
  blockHeight: number | null;
  votedAt: number;
}

export interface UserRow {
  installId: string;
  address: string;
  createdAt: number;
  updatedAt: number;
}

export interface CommentRow {
  id: string;
  postId: string;
  authorInstall: string;
  authorAddress: string | null;
  body: string;
  createdAt: number;
}

export interface FeedQuery {
  limit?: number;
  beforeCreatedAt?: number;
  beforeId?: string;
  q?: string;
}

export type RecordVoteResult = 'inserted' | 'duplicate' | 'post-missing';

interface MediaInput {
  sha256: string;
  mime: string;
  bytes: number;
  objectKey: string;
  width?: number | null;
  height?: number | null;
  createdAt: number;
}

export class SocialStore {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly db: BetterSQLite3Database<typeof schema>,
  ) {}

  // ---------------------------------------------------------------- posts

  createPost(input: {
    id: string;
    petRootTxid: string;
    authorInstall: string;
    authorAddress?: string | null;
    caption: string;
    createdAt: number;
    mediaHashes?: readonly string[];
  }): { ok: true } | { ok: false; error: 'duplicate' } {
    const existing =
      this.db.select({ id: posts.id }).from(posts).where(eq(posts.id, input.id)).get() ??
      this.db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.contentHash, input.id))
        .get();
    if (existing) return { ok: false, error: 'duplicate' };

    const mediaHashes = input.mediaHashes ?? [];
    this.db.transaction(() => {
      this.db
        .insert(posts)
        .values({
          id: input.id,
          petRootTxid: input.petRootTxid,
          authorInstall: input.authorInstall,
          authorAddress: input.authorAddress ?? null,
          caption: input.caption,
          contentHash: input.id,
          createdAt: input.createdAt,
          status: 'pending',
        })
        .run();
      mediaHashes.forEach((sha256, position) => {
        this.db.insert(postMedia).values({ postId: input.id, sha256, position }).run();
      });
    });
    return { ok: true };
  }

  verifyPost(
    contentHash: string,
    anchorTxid: string,
    anchoredAtMs: number,
  ): boolean {
    const res = this.db
      .update(posts)
      .set({ status: 'verified', anchorTxid, anchoredAt: anchoredAtMs })
      .where(and(eq(posts.contentHash, contentHash), eq(posts.status, 'pending')))
      .run();
    return res.changes > 0;
  }

  postExists(id: string): boolean {
    return Boolean(this.db.select({ id: posts.id }).from(posts).where(eq(posts.id, id)).get());
  }

  anchorExists(anchorTxid: string): boolean {
    return Boolean(
      this.db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.anchorTxid, anchorTxid))
        .get(),
    );
  }

  getPost(id: string, opts?: { includeRemoved?: boolean }): FeedPost | null {
    const row = this.db.select().from(posts).where(eq(posts.id, id)).get();
    if (!row) return null;
    if (row.status === 'removed' && !opts?.includeRemoved) return null;
    return { ...row, media: this.mediaForPosts([row.id]).get(row.id) ?? [] };
  }

  listByPetRoot(petRootTxid: string, limit = 50): FeedPost[] {
    const rows = this.db
      .select()
      .from(posts)
      .where(and(eq(posts.petRootTxid, petRootTxid), eq(posts.status, 'verified')))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .all();
    return this.attachMedia(rows);
  }

  listFeed(query: FeedQuery = {}): FeedPost[] {
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));

    let idsFromSearch: string[] | null = null;
    if (query.q && query.q.trim()) {
      idsFromSearch = this.searchPostIds(query.q, limit);
      if (idsFromSearch.length === 0) return [];
    }

    const conditions = [eq(posts.status, 'verified')];
    if (idsFromSearch) {
      conditions.push(inArray(posts.id, idsFromSearch));
    }
    if (
      query.beforeCreatedAt != null &&
      Number.isFinite(query.beforeCreatedAt) &&
      query.beforeId
    ) {
      conditions.push(
        or(
          lt(posts.createdAt, query.beforeCreatedAt),
          and(
            eq(posts.createdAt, query.beforeCreatedAt),
            lt(posts.id, query.beforeId),
          ),
        )!,
      );
    }

    const rows = this.db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit)
      .all();
    return this.attachMedia(rows);
  }

  countPosts(): number {
    return (
      this.db
        .select({ n: sql<number>`count(*)` })
        .from(posts)
        .where(sql`${posts.status} != 'removed'`)
        .get()?.n ?? 0
    );
  }

  removePost(postId: string, installId: string): boolean {
    const res = this.db
      .update(posts)
      .set({ status: 'removed' })
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.authorInstall, installId),
          sql`${posts.status} != 'removed'`,
        ),
      )
      .run();
    return res.changes > 0;
  }

  /** Atom-weighted HN gravity over vote events for verified posts. */
  listTrending(windowDays = 14, limit = 20, nowMs = Date.now()): FeedPost[] {
    const windowStart = nowMs - windowDays * 24 * 60 * 60 * 1000;
    const rows = this.sqlite
      .prepare(
        `SELECT v.post_id AS postId, v.atoms AS atoms, v.voted_at AS votedAt
           FROM votes v
           JOIN posts p ON p.id = v.post_id
          WHERE p.status = 'verified' AND v.voted_at >= ?
          ORDER BY v.voted_at DESC
          LIMIT 20000`,
      )
      .all(windowStart) as Array<{ postId: string; atoms: number; votedAt: number }>;

    const scored = new Map<string, { score: number; atMs: number; atoms: number }>();
    for (const r of rows) {
      const ageHours = Math.max(0, (nowMs - r.votedAt) / 3_600_000);
      const weight = r.atoms * (1 / (ageHours + 2) ** TRENDING_GRAVITY);
      const cur = scored.get(r.postId);
      if (cur) {
        cur.score += weight;
        cur.atoms += r.atoms;
        cur.atMs = Math.max(cur.atMs, r.votedAt);
      } else {
        scored.set(r.postId, { score: weight, atMs: r.votedAt, atoms: r.atoms });
      }
    }

    const ranked = [...scored.entries()]
      .sort(
        (a, b) =>
          b[1].score - a[1].score ||
          b[1].atMs - a[1].atMs ||
          b[1].atoms - a[1].atoms,
      )
      .slice(0, limit)
      .map(([id]) => id);

    if (ranked.length === 0) return this.listFeed({ limit });
    const rowsById = this.db.select().from(posts).where(inArray(posts.id, ranked)).all();
    const byId = new Map(rowsById.map(r => [r.id, r]));
    const ordered = ranked
      .map(id => byId.get(id))
      .filter((r): r is typeof posts.$inferSelect => Boolean(r));
    return this.attachMedia(ordered);
  }

  // ---------------------------------------------------------------- votes

  recordVote(vote: VoteRow): RecordVoteResult {
    const post = this.db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .where(eq(posts.id, vote.postId))
      .get();
    if (!post || post.status === 'removed') return 'post-missing';

    return this.db.transaction((): RecordVoteResult => {
      const inserted = this.db
        .insert(votes)
        .values({
          txid: vote.txid,
          postId: vote.postId,
          direction: vote.direction,
          atoms: vote.atoms,
          burnedBy: vote.burnedBy,
          voterInstall: vote.voterInstall ?? null,
          blockHeight: vote.blockHeight ?? null,
          votedAt: vote.votedAt,
        })
        .onConflictDoNothing()
        .run();
      if (inserted.changes === 0) return 'duplicate';
      this.db
        .update(posts)
        .set(
          vote.direction === 1
            ? { upvoteAtoms: sql`${posts.upvoteAtoms} + ${vote.atoms}` }
            : { downvoteAtoms: sql`${posts.downvoteAtoms} + ${vote.atoms}` },
        )
        .where(eq(posts.id, vote.postId))
        .run();
      return 'inserted';
    });
  }

  countVotes(postId: string): number {
    return (
      this.db
        .select({ n: sql<number>`count(*)` })
        .from(votes)
        .where(eq(votes.postId, postId))
        .get()?.n ?? 0
    );
  }

  // ---------------------------------------------------------------- media

  insertMedia(row: MediaInput): void {
    this.db.insert(media).values({ ...row, width: row.width ?? null, height: row.height ?? null }).onConflictDoNothing().run();
  }

  getMedia(sha256: string): MediaRow | null {
    return this.db.select().from(media).where(eq(media.sha256, sha256)).get() ?? null;
  }

  mediaExists(sha256: string): boolean {
    return Boolean(
      this.db.select({ sha256: media.sha256 }).from(media).where(eq(media.sha256, sha256)).get(),
    );
  }

  private mediaForPosts(postIds: string[]): Map<string, PostMediaItem[]> {
    const out = new Map<string, PostMediaItem[]>();
    if (postIds.length === 0) return out;
    const rows = this.sqlite
      .prepare(
        `SELECT pm.post_id AS postId, m.sha256 AS sha256, m.mime AS mime,
                m.bytes AS bytes, m.width AS width, m.height AS height,
                pm.position AS position
           FROM post_media pm
           JOIN media m ON m.sha256 = pm.sha256
          WHERE pm.post_id IN (${postIds.map(() => '?').join(',')})
          ORDER BY pm.position ASC`,
      )
      .all(...postIds) as Array<PostMediaItem & { postId: string }>;
    for (const r of rows) {
      const list = out.get(r.postId) ?? [];
      list.push({
        sha256: r.sha256,
        mime: r.mime,
        bytes: r.bytes,
        width: r.width,
        height: r.height,
        position: r.position,
      });
      out.set(r.postId, list);
    }
    return out;
  }

  private attachMedia(rows: Array<typeof posts.$inferSelect>): FeedPost[] {
    const mediaMap = this.mediaForPosts(rows.map(r => r.id));
    return rows.map(row => ({ ...row, media: mediaMap.get(row.id) ?? [] }));
  }

  // ---------------------------------------------------------------- comments

  addComment(input: {
    id: string;
    postId: string;
    authorInstall: string;
    authorAddress?: string | null;
    body: string;
    createdAt: number;
  }): CommentRow {
    this.db.insert(comments).values({
      id: input.id,
      postId: input.postId,
      authorInstall: input.authorInstall,
      authorAddress: input.authorAddress ?? null,
      body: input.body,
      createdAt: input.createdAt,
    }).run();
    return {
      id: input.id,
      postId: input.postId,
      authorInstall: input.authorInstall,
      authorAddress: input.authorAddress ?? null,
      body: input.body,
      createdAt: input.createdAt,
    };
  }

  listComments(postId: string, limit = 200): CommentRow[] {
    return this.db
      .select({
        id: comments.id,
        postId: comments.postId,
        authorInstall: comments.authorInstall,
        authorAddress: comments.authorAddress,
        body: comments.body,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.postId, postId), eq(comments.removed, 0)))
      .orderBy(comments.createdAt)
      .limit(Math.min(500, Math.max(1, limit)))
      .all();
  }

  removeComment(commentId: string, installId: string): boolean {
    const res = this.db
      .update(comments)
      .set({ removed: 1 })
      .where(and(eq(comments.id, commentId), eq(comments.authorInstall, installId)))
      .run();
    return res.changes > 0;
  }

  commentCount(postId: string): number {
    return (
      this.db
        .select({ n: sql<number>`count(*)` })
        .from(comments)
        .where(and(eq(comments.postId, postId), eq(comments.removed, 0)))
        .get()?.n ?? 0
    );
  }

  // ---------------------------------------------------------------- users

  bindUser(input: { installId: string; address: string }): UserRow {
    const now = Date.now();
    const existing = this.getUser(input.installId);
    const row: UserRow = {
      installId: input.installId,
      address: input.address.trim().toLowerCase(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.db
      .insert(users)
      .values(row)
      .onConflictDoUpdate({
        target: users.installId,
        set: { address: row.address, updatedAt: now },
      })
      .run();
    return row;
  }

  getUser(installId: string): UserRow | null {
    return (
      this.db
        .select()
        .from(users)
        .where(eq(users.installId, installId.trim()))
        .get() ?? null
    );
  }

  getUserByAddress(address: string): UserRow | null {
    return (
      this.db
        .select()
        .from(users)
        .where(eq(users.address, address.trim().toLowerCase()))
        .get() ?? null
    );
  }

  // ---------------------------------------------------------------- cursor

  getIngestCursor(key = INGEST_CURSOR_KEY): string | null {
    return (
      this.db
        .select({ lastSeenTxid: ingestState.lastSeenTxid })
        .from(ingestState)
        .where(eq(ingestState.key, key))
        .get()?.lastSeenTxid ?? null
    );
  }

  setIngestCursor(txid: string, key = INGEST_CURSOR_KEY): void {
    this.db
      .insert(ingestState)
      .values({ key, lastSeenTxid: txid, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: ingestState.key,
        set: { lastSeenTxid: txid, updatedAt: Date.now() },
      })
      .run();
  }

  // ---------------------------------------------------------------- search

  searchPostIds(query: string, limit = 20): string[] {
    const match = ftsQuery(query);
    if (!match) return [];
    try {
      const rows = this.sqlite
        .prepare(
          `SELECT posts_fts.id AS id
             FROM posts_fts
             JOIN posts ON posts.id = posts_fts.id
            WHERE posts_fts MATCH ? AND posts.status = 'verified'
            ORDER BY posts.created_at DESC
            LIMIT ?`,
        )
        .all(match, Math.min(100, Math.max(1, limit))) as Array<{ id: string }>;
      return rows.map(r => r.id);
    } catch {
      return [];
    }
  }
}

/** Build a safe FTS5 prefix query from free text. */
export function ftsQuery(raw: string): string {
  const tokens = raw
    .replace(/["*^:(){}[\]]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (tokens.length === 0) return '';
  return tokens.map(t => `"${t}"*`).join(' ');
}
