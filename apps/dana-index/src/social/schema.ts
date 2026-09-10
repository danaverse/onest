/**
 * Onest social schema (SQLite / Drizzle).
 *
 * posts.id = canonical content hash (sha256). Hosted rows are written by the
 * API; `status` flips to verified only when the matching DANA v4 stamp is
 * seen on-chain. Votes arrive from Chronik only (never a trusted POST).
 */
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    petRootTxid: text('pet_root_txid').notNull(),
    authorInstall: text('author_install').notNull(),
    authorAddress: text('author_address'),
    caption: text('caption').notNull().default(''),
    contentHash: text('content_hash').notNull(),
    anchorTxid: text('anchor_txid'),
    status: text('status', { enum: ['pending', 'verified', 'removed'] })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at').notNull(),
    anchoredAt: integer('anchored_at'),
    upvoteAtoms: integer('upvote_atoms').notNull().default(0),
    downvoteAtoms: integer('downvote_atoms').notNull().default(0),
  },
  t => [
    uniqueIndex('posts_content_hash_idx').on(t.contentHash),
    uniqueIndex('posts_anchor_txid_idx').on(t.anchorTxid),
    index('posts_created_idx').on(t.createdAt),
    index('posts_status_created_idx').on(t.status, t.createdAt),
    index('posts_pet_root_idx').on(t.petRootTxid),
  ],
);

export const media = sqliteTable(
  'media',
  {
    sha256: text('sha256').primaryKey(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    objectKey: text('object_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: integer('created_at').notNull(),
  },
  t => [index('media_created_idx').on(t.createdAt)],
);

export const postMedia = sqliteTable(
  'post_media',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    sha256: text('sha256')
      .notNull()
      .references(() => media.sha256),
    position: integer('position').notNull().default(0),
  },
  t => [primaryKey({ columns: [t.postId, t.sha256] })],
);

export const votes = sqliteTable(
  'votes',
  {
    txid: text('txid').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id),
    direction: integer('direction').notNull(),
    atoms: integer('atoms').notNull(),
    burnedBy: text('burned_by').notNull(),
    voterInstall: text('voter_install'),
    blockHeight: integer('block_height'),
    votedAt: integer('voted_at').notNull(),
  },
  t => [
    index('votes_post_idx').on(t.postId),
    index('votes_voted_at_idx').on(t.votedAt),
  ],
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorInstall: text('author_install').notNull(),
    authorAddress: text('author_address'),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    removed: integer('removed').notNull().default(0),
  },
  t => [index('comments_post_idx').on(t.postId, t.createdAt)],
);

/** Chronik ingest cursor — last fully processed txid for the PAW token. */
export const ingestState = sqliteTable('ingest_state', {
  key: text('key').primaryKey(),
  lastSeenTxid: text('last_seen_txid'),
  updatedAt: integer('updated_at').notNull(),
});

// FTS5 mirror of post captions lives in the generated migration as raw SQL
// (drizzle-kit does not model virtual tables); queries use `sqlite.prepare`.
