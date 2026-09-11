# Onest DANA Index

Chronik-backed public index of on-chain PAW animal profile burns and paw-print tributes, plus the hosted social feed (posts, votes, comments, media).

- Read-only on-chain history + SQLite social store (`ONEST_SOCIAL_DB`, default `data/onest-social.sqlite`)
- Hash-keyed media store on local disk (`ONEST_MEDIA_DIR`, default `data/media`); same key layout as a later R2 swap
- Social share previews (Open Graph HTML & meta tags)
- Configured via `/etc/onest/dana-index.env` and `.env`

## API Endpoints

Memories:

- `GET /health` — Service health check (includes post count + ingest cursor)
- `GET /api/recent?limit=40` — Recent paw tributes and profiles
- `GET /api/trending?limit=8` — Trending profiles ranked by tribute activity & gravity decay
- `GET /api/search?q=&limit=20` — Search profiles by pet name
- `GET /api/memorial/:txid` — Memorial details and aggregated paw-print tributes
- `GET /og/:txid` — Open Graph preview HTML for messaging app embeds
- `POST /api/notify { burnTxid, installId? }` — Trigger background ingest for a newly broadcasted burn

Social feed:

- `GET /api/feed?limit=&beforeCreatedAt=&beforeId=&q=` — Verified posts, newest first (keyset cursor; `q` uses FTS5)
- `GET /api/feed/trending?limit=20` — Atom-weighted gravity ranking
- `GET /api/posts/:id` — Post + comments
- `GET /api/pets/:txid/posts` — Verified posts for a pet root
- `PUT /api/media/:sha256?installId=` — Raw image upload (jpeg/png/webp, ≤2 MiB); key must equal sha256(bytes)
- `GET /media/:sha256` — Immutable-cache media bytes
- `POST /api/posts { installId, petRootTxid, caption, mediaHashes, createdAt }` — Create hosted post (pending until its DANA v4 stamp is indexed)
- `POST /api/posts/:id/comments { installId, body }` — Hosted comment
- `POST /api/posts/:id/remove { installId }` — Author soft-delete
- `POST /api/comments/:id/remove { installId }` — Author soft-delete

User profiles (identity binding):

- `POST /api/users/bind { installId, address, message, signature }` — Verify the recoverable signature (`verifyMsg`), then upsert `install_id ↔ address` in the `users` table
- `GET /api/users/:installId` — Look up the bound wallet address
- `GET /api/pets?address=<cashaddr>` — Pet profiles whose root burn was sent by that wallet (used by the "My pets" tab)

Feed, trending, post detail and pet-post responses include `pet: { name, species }` when the pet profile is indexed.

## Ingest

`syncTokenHistory()` walks the PAW token history with two cursors (`ingest_state` in SQLite):

- `paw-token` — newest processed txid, for incremental catch-up each poll
- `paw-token-backfill-page` — deep-history backfill page, one page per pass until done

DANA payloads are routed by version: v1/v2 memorial → JSON `BurnStore`, v3 vote → `votes` table + atom tallies, v4 post stamp → `posts.status = 'verified'`.
