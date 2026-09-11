# Onest Mint API

Device PoW challenge/submit desk with fee-sponsored remint and DANA animal memorial / paw-print burns, post stamps and votes on eCash.

- Configured via `/etc/onest/mint.env` and `.env` (Never shares `/etc/wlotus/mint.env`).
- No temple catalog or temple tax (100% PAW tokens go to miner/desk).
- Server-enforced soft wait (`MINT_MIN_PRAY_SECONDS`, default 54, `0` disables) between challenge issue and burn. Remint is never delayed; `/api/burn` returns `425` + `retryAfterMs` until the floor passes.

## Endpoints

- `POST /api/challenge` — Request PoW challenge `{ installId, kind?, note?, parentBurnTxid?, contentHash?, postHash?, direction?, targetType? }`
  - `kind: 'memorial'` (default) — v1/v2 tribute note
  - `kind: 'post'` — requires `contentHash` (64 hex), burns a DANA v4 stamp
  - `kind: 'vote'` — requires `postHash` (64 hex); `direction` 1 up / 0 down (default up)
- `POST /api/submit` — Submit solved challenge `{ installId, challengeId, nonceHex, powMs?, powAttempts? }` (returns `waitUntil` + `minPraySeconds`)
- `POST /api/burn` — Execute memorial / post / vote burn after soft pray `{ installId, remintTxid, burnToken }`
- `GET /api/status` — Get desk status, token era, serving tips, remaining daily offers, `minPraySeconds`
- `GET /api/root-creator` — Check animal profile root creator status `{ txid, installId }`
- `POST /api/cancel` — Cancel active challenge or pending burn
- `GET /api/listing-fee` — Quote for wallet-paid burns `{ tokenId, atoms (default 6), feeAddress }`; the user's wallet burns 1 PAW, sends the fee and pays XEC, then broadcasts directly (no wait)
- `GET /api/exchange/rate` — PAW exchange rate `{ satsPerPawAtom, xecPerPawAtom, maxPawAtoms }` (default 1 XEC = 1 PAW atom)
- `POST /api/exchange/order` — Create a buy order `{ installId, address, pawAtoms }` → `{ orderId, depositAddress, xecSats, xec, memo, expiresAt }` (30-minute TTL)
- `GET /api/exchange/order/:id` — Order status (`open` / `paid` / `fulfilled` / `failed` / `expired`)

**PAW exchange**: the buyer pays the quoted XEC to the deposit address with the `ONEX<orderId>` OP_RETURN memo; the watcher matches the payment, tops up inventory with a fresh sponsored remint if needed, and delivers PAW from the desk wallet. Sponsored votes keep minting fresh (108 per remint), which replenishes the inventory. The earlier client-side self-mint (PR #21) was removed in favor of the desk exchange.
- `POST /api/notify { burnTxid, installId? }` — Forward a wallet-broadcast tx to dana-index for immediate ingest
- `GET /health` — Health check endpoint

Sponsored root memorials are rejected: `kind: 'memorial'` without `parentBurnTxid` must be created from the user's wallet (pet profile = 1 PAW burn + 6-atom listing fee). Sponsored memorials are tributes only.
