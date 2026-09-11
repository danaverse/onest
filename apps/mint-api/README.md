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
- `POST /api/mint/client/challenge` — User-paid remint prep `{ installId, address, pkHex, fuelTxid, fuelOutIdx }`: reserves a non-serving baton (prefers genesis index `MINT_CLIENT_BATON_INDEX`, default 26) and returns the BIP143 preimages/PoW material
- `POST /api/mint/client/submit` — `{ installId, challengeId, nonceHex, batonSigHex, fuelSigHex }`: verifies PoW, assembles the covenant tx with the client's signatures and broadcasts; the minted 108 PAW go to the user's address
- `POST /api/notify { burnTxid, installId? }` — Forward a wallet-broadcast tx to dana-index for immediate ingest
- `GET /health` — Health check endpoint

Sponsored root memorials are rejected: `kind: 'memorial'` without `parentBurnTxid` must be created from the user's wallet (pet profile = 1 PAW burn + 6-atom listing fee). Sponsored memorials are tributes only.
