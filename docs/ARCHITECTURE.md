# Onest architecture

Notes for turning Onest from a paw-print memory desk into a pet-owner social network. This is the working plan, not a shipped spec. User-facing copy stays poetic (`Every paw print, a story of love`); this document is for implementers.

Related: [README](../README.md) · [dana-index](../apps/dana-index/README.md) · [mint-api](../apps/mint-api/README.md)

---

## Thesis

| Layer | Role | Source of truth |
|-------|------|-----------------|
| **Chain** | Stamps, paw burns, **weighted** vote burns (N PAW), post-content hashes | Chronik / ALP + DANA `OP_RETURN` |
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
- **`BurnStore`**: durable JSON (`data/dana-index-burns.json`). Reconstructible from Chronik via the dual-cursor sync. Correct for burns-only.
- **Social store**: `dana-index` also owns `data/onest-social.sqlite` (posts, media, votes, comments) + `data/media` — see the tech stack below.
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

1. Client compresses photos (target a few hundred KB WebP/JPEG). Images-only at MVP; short video with a poster frame later.
2. API returns a presigned PUT. Object key is `sha256(file)`.
3. Client (or desk) computes `contentHash = sha256(caption + mediaHashes + petRootTxid + author + createdAt)`.
4. Stamp `contentHash` in the DANA `OP_RETURN` of the **PAW burn tx** itself — every stamp burns PAW; XEC covers network fees only. Ingest stays on `tokenId(TOKEN_ID).history()`; no lokad-wide scan.
5. Indexer inserts the post only when `hash(hosted row) == on-chain payload` (or marks it unverified until the stamp confirms).

**Suggested tables** (Drizzle, not Lixi polymorphism):

```
posts
  id              text pk          -- contentHash
  pet_root_txid   text not null
  author_install  text             -- MVP author (sponsored path, no wallet)
  author_address  text             -- when a wallet is used; takes precedence
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
  burned_by       text             -- on-chain sender address (desk on sponsored path)
  voter_install   text             -- UX only; never tallies
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
OP_RETURN  DANA | v3 | direction | targetType | postHash
                      1=up / 0=down   0x5f02    32-byte content hash

ALP burn output: N PAW atoms   ← this is the vote weight
```

No `voter` field: the sender address comes from the tx inputs (desk on the sponsored path). Memorials stay v1/v2; post stamps are v4.

- **Weight = atoms burned in that tx.** Minimum **1**. **MVP is a single +1 vote**; amount presets (e.g. 1, 8, 54, 108) plus an optional per-tx cap (e.g. one mala = 108) ship after launch so a mis-tap cannot empty a wallet.
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

Sponsored *network fees* and sponsored *token inventory* are different. A casual stamp can still burn 1 PAW from the desk. MVP votes are +1 on the sponsored path (bounded by PoW, the soft wait, and daily caps); when farming becomes indefensible, switch votes to **wallet-only** (weighted) so the voter’s own PAW pays.

Reuse `trendingScore.ts` (HN-style gravity 1.5) so memories and posts share one ranking idea. Gravity still applies to *when* atoms arrived; weight is the atom count, not the number of click events.

---

## Stamp paths and anti-farming

Soft wait ("min pray") is **enforced server-side in `mint-api`** — the WLotus client-side floor alone is too weak. The desk records `waitUntil = challenge.createdAt + MINT_MIN_PRAY_SECONDS` when the remint submits; `/api/burn` rejects early calls (`425 Too Early` + `retryAfterMs`) and never builds the burn before the floor. Config via `MINT_MIN_PRAY_SECONDS` (default **54**, clamp 0–600, `0` disables), set per environment from a GitHub Actions variable into `/etc/onest/mint.env` on deploy. The PWA ports the WLotus countdown (`minPraySeconds.ts`) for UX only — not trusted; PoW time still counts toward the floor because the clock starts at challenge issue. Remint submits immediately on a nonce; cancel abandons the pending burn and the desk keeps the atom (tip race). Pending burns are in-memory today — persist the pending record (with `waitUntil`) so a desk restart mid-wait does not strand the user's remint.

**Is a 54s / 108s pad enough to stop farming?** No, not by itself. Headless browsers spoof mobile headers. The pad is an attention tax, not a Sybil proof. It is enough only when **there is nothing extractable**: sponsored stamps create a memory record, not liquid value the farmer can sell.

### Tiered access

| Tier | Who | Identity | Cost | Latency |
|------|-----|----------|------|---------|
| **1. Casual mobile PWA** | Installed or mobile browser | `installId` + device PoW | Desk-sponsored fees, rate-limited | Soft wait floor (54s), server-enforced |
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
- SQLite + Drizzle + `better-sqlite3` social store (`posts`, `media`, `post_media`, `votes`, `comments`, `ingest_state`; WAL + FTS5; migrations run at startup)
- Hash-keyed media store on local disk behind an R2-ready interface (raw PUT, sha256 key)
- DANA v3 vote / v4 post-stamp payloads + classifier; dual-cursor Chronik ingest
- Server-enforced soft wait (`MINT_MIN_PRAY_SECONDS`, default 54)
- Canvas client-side image compression; atom-weighted trending

### Still to add

| Piece | Choice |
|-------|--------|
| Object store | Cloudflare R2 (zero egress) or S3-compatible; presigned PUT reusing the sha256 key |
| Image variants | Cloudflare Images later (resize / WebP), not required for beta |
| Bot check | Turnstile on sponsored challenge |
| Wallet (fast / desktop) | CashTab / local seed for user-paid fees; wallet-only weighted votes when farming becomes indefensible |
| Backups | `sqlite3 .backup` timer for the social DB; R2 lifecycle for orphaned objects |

No Nest, no Prisma, no Redis, no second language. One monorepo, two Node services, one PWA.

---

## Phased work

1. **This document** — shared plan.
2. **Social store** — shipped: `dana-index` owns SQLite + Drizzle (`posts`, `post_media`, `media`, `votes`, `comments`, `ingest_state`); dual-cursor Chronik sync replaces the page-0-only backfill; `BurnStore` stays on JSON.
3. **Upload** — shipped: raw sha256-keyed PUT to local disk (`ONEST_MEDIA_DIR`) behind an R2-ready interface.
4. **Post stamp** — shipped: PAW burn tx carries the DANA **v4** content hash; indexer verifies the hosted row before “verified.”
5. **Feed UI** — shipped: Moments feed on the PWA (caption + images; video later).
6. **Votes** — shipped: +1 PAW sponsored burn, DANA **v3** payload; weight = atoms; Chronik ingest; unique on `txid` only; stack burns per voter.
7. **Stamp tiers** — sponsored path only for now; PWA/mobile detection, user-paid XEC and Turnstile still to add.
8. **Comments** — shipped: hosted (author soft-delete); optional hash stamp later.
9. **Promote burns to SQLite** — only if `groups()` / search become the bottleneck.
10. **Postgres** — only after a second writer or a real ops need.

---

## Decisions (resolved)

- **Lokad:** keep `DANA` for post stamps; do not add `ONES`.
- **Wire format:** `DANA` versions — v1/v2 memorial, **v3** vote (`direction`, `targetType`, `postHash`; sender read from the tx), **v4** post stamp (`contentHash`).
- **Stamp discovery:** every stamp (post or vote) rides a **PAW burn tx**; XEC is only the fee. Ingest stays on the PAW token history — no lokad-wide scan.
- **Social DB owner:** `dana-index` is the single writer (hosted rows + chain-derived rows); `mint-api` stays on PoW/burn and calls it internally.
- **Soft wait:** **server-enforced in `mint-api`** (deliberately stronger than WLotus's client-only floor). `MINT_MIN_PRAY_SECONDS` default **54s**, clamp 0–600, GitHub Actions variable → `/etc/onest/mint.env`; submit returns `waitUntil`; `/api/burn` rejects early with `425` + `retryAfterMs`. Client ports the WLotus countdown for UX only; never delays remint.
- **Identity:** progressive. `installId` authors posts/comments on the sponsored path (no wallet needed); `author_address` is captured when a wallet is used and takes precedence. Votes are identified by on-chain sender address; `voter_install` is UX-only and never tallies. Bind `installId ↔ address` when wallets land.
- **Video:** out of MVP; images-only at launch, short clips with poster frame later.
- **Vote UX:** MVP is a single **+1** PAW vote; amount presets and an optional per-tx cap (suggested 108) come after launch. Stacked burns stand: **sum atoms, no one-vote-per-identity lock.**
- **Sponsored vote path:** MVP +1 sponsored allowed (PoW + soft wait + daily caps as the farming bound); N > 1 stays **no**. Migrate to **wallet-only** weighted votes when farming becomes indefensible.
- **Comments:** phase 2 (hosted), same identity rules as posts.

Change a decision here rather than scattering notes in PR descriptions.
