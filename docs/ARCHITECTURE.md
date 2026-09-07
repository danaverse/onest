# Onest architecture

Notes for turning Onest from a paw-print memory desk into a pet-owner social network. This is the working plan, not a shipped spec. User-facing copy stays poetic (`Every paw print, a story of love`); this document is for implementers.

Related: [README](../README.md) · [dana-index](../apps/dana-index/README.md) · [mint-api](../apps/mint-api/README.md)

---

## Thesis

| Layer | Role | Source of truth |
|-------|------|-----------------|
| **Chain** | Stamps, paw burns, **weighted** vote burns (N PAW), post-content hashes | Chronik / ALP + DANA (or ONEST) `OP_RETURN` |
| **Hosted index** | Feed, captions, comments, vote tallies, search | SQLite (new). Burns stay on the JSON cache until it hurts |
| **Object storage** | Photos and video bytes | Cloudflare R2 (or S3-compatible) + optional Cloudflare Images |
| **PWA** | Profiles, stamp a paw, later Instagram-like feed | `apps/web` (Vite + React) |

Posts are **off-chain**. The **hash** is **on-chain**. Onest hosts messages and media. Votes are **weighted PAW burns**: any integer **N ≥ 1** atoms, up or down (Lixi’s variable burn, not a single-token click). Do not import Lixi’s Nest / Prisma / Redis stack.

---

## Current system (keep)

Two Node processes on one VM, plus the PWA:

```
apps/web  →  /api        →  mint-api   (PoW challenge, remint, DANA burn)
          →  /index-api  →  dana-index (Chronik ingest, groups, OG cards)
```

- **`WLotusCovenant`**: mint 108 PAW to miner/desk, no temple tax, same genesis clock as WLotus (1:1 issuance convention).
- **Sponsored path**: desk pays network fees; client mines PoW; desk burns 1 PAW for the memory / paw print.
- **`BurnStore`**: durable JSON (`data/dana-index-burns.json`). Reconstructible from Chronik. Correct for burns-only.
- **Other JSON**: push subscriptions, VAPID keys, root creators. Operational; do not fold into a social schema on day one.

`BurnStore.save()` rewrites the whole file on each insert. `groups()` / `trending()` / `search()` scan every burn. That is fine at hundreds of memories. It is the wrong host for posts, comments, media, and votes.

---

## Target shape

```
                    ┌─────────────────────────────────────┐
                    │              apps/web               │
                    │     PWA feed · stamp · vote         │
                    └───────────┬─────────────┬───────────┘
                                │             │
                     /api       │             │  /index-api
                                ▼             ▼
                         mint-api          dana-index
                     PoW / XEC stamp    Chronik + social DB
                                │             │
                                ▼             ▼
                           ALP remint     SQLite index
                           DANA burns     posts / votes
                                          media metadata
                                              │
                                              ▼
                                    R2 / Cloudflare Images
                                      key = sha256(file)
```

### On-chain vs hosted

| Data | Reconstruct from chain? | Store |
|------|-------------------------|--------|
| Profile + paw burns | Yes | Keep JSON for now; SQLite later if grouping/search is slow |
| Post hash + vote burns | Yes | SQLite index (Chronik ingest). Unique on `txid` |
| Caption, comment text | No | SQLite (back this up) |
| Photo / video bytes | No | Object storage; DB holds hash, mime, size, object key |
| Push, root creators, open challenges | n/a | Leave JSON until they hurt |

If the burn JSON is lost, Chronik backfill rebuilds it. If the social DB is lost, captions and media metadata are gone. Treat those as hosted truth and back them up. Never put video blobs in SQLite.

---

## Media and posts (from Lixi, simplified)

Lixi (`bcProFoundation/lixi`) uploads via Cloudflare Images, records `sha256(buffer)`, and keeps posts in Postgres. Onest takes the **hash + CDN** pattern, not the 1,500-line Prisma graph (`Commentable`, `Taggable`, `ImageUploadable`, `PostDana`, Redis timelines).

**Create a post**

1. Client compresses photos (target a few hundred KB WebP/JPEG). Video stays a short clip with a poster frame.
2. API returns a presigned PUT. Object key is `sha256(file)`.
3. Client (or desk) computes `contentHash = sha256(caption + mediaHashes + petRootTxid + author + createdAt)`.
4. Stamp `contentHash` in an `OP_RETURN` (DANA / ONEST lokad) after the same remint/burn or XEC-fee path used for paw prints.
5. Indexer inserts the post only when `hash(hosted row) == on-chain payload` (or marks it unverified until the stamp confirms).

**Suggested tables** (Drizzle, not Lixi polymorphism):

```
posts
  id              text pk          -- contentHash
  pet_root_txid   text not null
  author_install  text             -- later: address
  caption         text
  content_hash    text unique
  anchor_txid     text unique      -- null until confirmed
  created_at      integer
  upvote_atoms    integer default 0   -- SUM of up-burn atoms
  downvote_atoms  integer default 0   -- SUM of down-burn atoms

media
  sha256          text pk
  post_id         text → posts
  object_key      text
  mime            text
  bytes           integer
  width, height   integer
  duration_ms     integer          -- video

votes                              -- from Chronik, not a trusted POST /vote
  txid            text pk          -- one row per burn tx
  post_id         text → posts
  direction       integer          -- 1 up / 0 down
  atoms           integer          -- N PAW burned in this tx (N ≥ 1)
  burned_by       text
  block_height    integer
  -- no unique (burned_by, post_id): later burns add weight

comments                           -- phase 2
  id, post_id, author, body, created_at, anchor_txid?
```

Feed score: `upvote_atoms - downvote_atoms` (atom-weighted), plus existing gravity in `src/lib/trendingScore.ts`. Materialize a `score` column only when listing gets slow.

---

## Votes (N PAW, weighted Lixi-style burn)

Lixi lets the voter pick a burn size (`1, 8, 50, 100, …` XPI) with `BurnType.Up = 1`, `BurnType.Down = 0`, `BurnForType.Post = 0x5f02`. Onest does the same with **PAW atoms**, not a single-token click.

```
OP_RETURN  DANA|ONES  BURN  direction  targetType  postHash  voter
                         1=up / 0=down   0x5f02

ALP burn output: N PAW atoms   ← this is the vote weight
```

- **Weight = atoms burned in that tx.** Minimum **1**. No protocol maximum; UX can offer presets (e.g. 1, 8, 54, 108) plus a custom amount, and optionally cap a single tx (e.g. one mala = 108) so a mis-tap cannot empty a wallet.
- Direction lives in `OP_RETURN`. Amount lives in the ALP burn, not in a hosted “likes++” field.
- Same voter may burn again on the same post. Later txs **add** atoms (another +8 up, or a down that offsets). Do **not** use `unique (burned_by, post_id)`.
- Net for a post: `score = sum(up atoms) - sum(down atoms)`. Optional later: show that voter’s own net (`their up − their down`).
- `dana-index` ingests each vote tx, reads `N` from token entries, matches `postHash`, increments the matching tally by **N**.
- Do not increment score from an unauthenticated API body. The client may *notify*; Chronik is the count.

**Who pays the PAW**

| Path | PAW source | Typical N |
|------|------------|-----------|
| User wallet | PAW the user already holds | Any N they sign |
| Sponsored desk | Desk inventory after remint | **Default 1.** Larger N on the sponsored path drains the desk — require user-held PAW (or user XEC + remint they keep) for N > 1 |

Sponsored *network fees* and sponsored *token inventory* are different. A casual stamp can still burn 1 PAW from the desk. Weighted votes should spend **the voter’s PAW**, or the desk will be farmed for score.

Reuse `trendingScore.ts` (HN-style gravity 1.5) so memories and posts share one ranking idea. Gravity still applies to *when* atoms arrived; weight is the atom count, not the number of click events.

---

## Stamp paths and anti-farming

WLotus’s soft wait is **108 seconds** after remint, before the memorial burn (`minPraySeconds`; cancel skips the burn). A ~54–60s floor is in the same family. Soft wait **must not delay remint** (tip race).

**Is a 54s / 108s pad enough to stop farming?** No, not by itself. Headless browsers spoof mobile headers. The pad is an attention tax, not a Sybil proof. It is enough only when **there is nothing extractable**: sponsored stamps create a memory record, not liquid value the farmer can sell.

### Tiered access

| Tier | Who | Identity | Cost | Latency |
|------|-----|----------|------|---------|
| **1. Casual mobile PWA** | Installed or mobile browser | `installId` + device PoW | Desk-sponsored fees, rate-limited | Soft wait ~60–108s after remint |
| **2. Fast path** | Same PWA, funded wallet | Address + XEC for fuel | User pays ~network fee | Stamp immediately, no soft wait |
| **3. Desktop web** | Browser | Wallet (CashTab / local seed) | **User XEC required** | Immediate. Desk does not sponsor |

Why this split:

- Web bots cannot drain desk XEC if desktop must pay its own fees.
- New phone users still stamp without a wallet.
- People who post or vote a lot graduate to a few sats of XEC and skip the wait.
- Daily caps stay (`MINT_MAX_OFFERS_PER_DAY`, per-IP). Soft wait + Moore felt ramp stay.

**PWA vs “are they really on a phone?”**

Client signals (`display-mode: standalone`, `Sec-CH-UA-Mobile`, touch) are fine for UX. They are not bot-proof. Do not gate security on User-Agent.

Defense in depth:

1. Cloudflare Turnstile (or equivalent) on `/api/challenge` — stops cheap headless farms.
2. Rate limits + soft wait on the sponsored path.
3. No extractable arbitrage on the sponsored path (desk keeps miner atoms; user gets a stamp, not cash).
4. Optional later: WebAuthn / passkey at profile create; Web Push (real APNs/FCM tokens).

**Native apps for anti-farming?** Do not start there.

- App Attest / Play Integrity is stronger than a PWA header.
- Apple review is hostile to client PoW and token-gated votes (3.1.5 / 2.4.2 class issues).
- A store download kills the share-link loop (Zalo / Facebook / Telegram → open the memory).

Stay PWA. If a store listing is needed later, wrap the same web app (TWA / Capacitor) on Android first. Do not build native solely to detect phones.

---

## Data layer decision

Earlier shorthand was “upgrade JSON to SQLite with Drizzle / Prisma or PostgreSQL.” That is too loose.

### Keep JSON for burns

`apps/dana-index/src/store.ts` is a Chronik cache: append-mostly, single writer, rebuildable. Tests already use a temp JSON file. Do not migrate burns on the first social ticket.

### Add SQLite for social

SQLite is the first database because Onest is one writer process on one VM:

- File next to `data/dana-index-burns.json` (e.g. `data/onest-social.sqlite`, env `ONEST_SOCIAL_DB`).
- WAL mode: Chronik ingest + API reads.
- FTS5 for caption / name search (no Postgres `tsvector` yet).
- Tests: temp `.sqlite`, delete in `afterEach`.

PostgreSQL is a later move when there is a second writer, a second host, or metadata in the multi-GB range. Blobs never belong in either database.

### Drizzle, not Prisma

| Option | Verdict |
|--------|---------|
| **Prisma** | Matches Lixi; generate step, Postgres bias, Nest-shaped. Too much for ~6 tables. |
| **Raw `better-sqlite3`** | Fine for two tables; no migration story. |
| **Drizzle + `better-sqlite3`** | TypeScript-first, SQL-shaped, explicit migrations. Same style can target `postgres-js` later. |

Keep a store class API (`BurnStore` / `SocialStore`) so `server.ts` does not grow a second persistence style.

### What not to copy from Lixi

- Polymorphic `Commentable` / `ImageUploadable`
- Denormalized `PostDana` + Redis ZSET timelines
- GraphQL loaders and account/page/token graphs
- Prisma + Postgres + Redis as the *starting* stack

Take: SHA-256 of bytes, CDN delivery, on-chain hash stamp, weighted up/down burns.

---

## Tech stack (planned)

### Already in place

- React + Vite + TypeScript PWA (`apps/web`)
- Node `tsx` HTTP servers (`mint-api`, `dana-index`)
- Chronik, `ecash-lib` / `ecash-wallet`, `WLotusCovenant`
- JSON files for burns, push, root creators
- Client PoW in a web worker

### Add when social lands

| Piece | Choice |
|-------|--------|
| Social DB | SQLite + Drizzle + `better-sqlite3`, WAL, FTS5 |
| Object store | Cloudflare R2 (zero egress) or S3-compatible; presigned PUT |
| Image variants | Cloudflare Images later (resize / WebP), not required for beta |
| Client compress | `browser-image-compression` (or equivalent) before upload |
| Bot check | Turnstile on sponsored challenge |
| Wallet (fast / desktop) | Existing desk path + optional CashTab / local seed for user-paid fees |
| Ranking | `src/lib/trendingScore.ts` |

No Nest, no Prisma, no Redis, no second language. One monorepo, two Node services, one PWA.

---

## Phased work

1. **This document** — shared plan.
2. **Social store** — Drizzle schema (`posts`, `media`, `votes`); leave `BurnStore` on JSON.
3. **Upload** — presigned R2 (local disk acceptable on the test VM); hash-keyed objects.
4. **Post stamp** — `OP_RETURN` content hash; indexer verifies before “verified.”
5. **Feed UI** — card layout on the PWA (caption, images, later video).
6. **Votes** — N PAW burn up/down (weight = atoms); Chronik ingest; unique on `txid` only; stack burns per voter.
7. **Stamp tiers** — detect PWA/mobile for UX only; desktop requires user XEC; optional instant-with-XEC on mobile; Turnstile on `/api/challenge`.
8. **Comments** — hosted first; optional hash stamp later.
9. **Promote burns to SQLite** — only if `groups()` / search become the bottleneck.
10. **Postgres** — only after a second writer or a real ops need.

---

## Open choices (do not block phase 2–4)

- Lokad id for post stamps: keep `DANA` vs add `ONES`.
- Soft wait default: 60s vs WLotus 108s (build-time / env, clamp 0–600).
- Author identity: `installId` until wallets are common, then address.
- Video: duration / size cap, and whether beta is images-only.
- Vote UX presets and optional per-tx atom cap (suggested 108). Stacked burns are decided: **sum atoms, no one-vote-per-identity lock.**
- Whether a sponsored path may ever burn N > 1 for a vote (default **no**).

When those are decided, update this file rather than scattering notes in PR descriptions.
