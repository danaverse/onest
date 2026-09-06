# Onest DANA Index

Chronik-backed public index of on-chain PAW animal profile burns and paw-print tributes.

- Read-only on-chain history
- Social share previews (Open Graph HTML & meta tags)
- Configured via `/etc/onest/dana-index.env` and `.env`

## API Endpoints

- `GET /health` — Service health check
- `GET /api/recent?limit=40` — Recent paw tributes and profiles
- `GET /api/trending?limit=8` — Trending profiles ranked by tribute activity & gravity decay
- `GET /api/search?q=&limit=20` — Search profiles by pet name
- `GET /api/memorial/:txid` — Memorial details and aggregated paw-print tributes
- `GET /og/:txid` — Open Graph preview HTML for messaging app embeds
- `POST /api/notify { burnTxid }` — Trigger background ingest for a newly broadcasted burn
