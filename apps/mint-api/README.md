# Onest Mint API

Device PoW challenge/submit desk with fee-sponsored remint and DANA animal memorial / paw-print burns, post stamps and votes on eCash.

- Configured via `/etc/onest/mint.env` and `.env` (Never shares `/etc/wlotus/mint.env`).
- No temple catalog or temple tax (100% PAW tokens go to miner/desk).
- Server-enforced soft wait between challenge issue and burn. Remint is never delayed; `/api/burn` returns `425` + `retryAfterMs` until the floor passes. Per-kind: memorials/votes `MINT_MIN_PRAY_SECONDS` (default 54), sponsored first profiles `MINT_PROFILE_MIN_PRAY_SECONDS` (default 120), sponsored posts `MINT_POST_MIN_PRAY_SECONDS` (default 60). `0` disables.

## Endpoints

- `POST /api/challenge` — Request PoW challenge `{ installId, kind?, note?, parentBurnTxid?, contentHash?, postHash?, direction?, targetType?, creatorAddress? }`
  - `kind: 'memorial'` (default) — v1/v2 tribute note (requires `parentBurnTxid`)
  - `kind: 'profile'` — first sponsored pet profile only (once per install); requires an encoded profile `note` and accepts `creatorAddress` to stamp the v5 creator hash. The desk burns 6 atoms after the ~2 minute wait
  - `kind: 'post'` — requires `contentHash` and `petRootTxid` (64 hex each); desk-sponsored **only for the install's own pets** (1 atom, ~1 minute wait). Posts on other pets need a 2 PAW wallet burn (1 stamp + 1 to the creator) or the flat XEC stamp fee (desk burns 1 PAW and rewards the creator 1 PAW)
  - `kind: 'vote'` — requires `postHash` (64 hex); `direction` 1 up / 0 down (default up)
- `POST /api/submit` — Submit solved challenge `{ installId, challengeId, nonceHex, powMs?, powAttempts? }` (returns `waitUntil` + per-kind `minPraySeconds`)
- `POST /api/burn` — Execute memorial / profile / post / vote burn after soft pray `{ installId, remintTxid, burnToken }`
- `GET /api/status` — Get desk status, token era, serving tips, remaining daily offers, `minPraySeconds`
- `GET /api/root-creator` — Check animal profile root creator status `{ txid, installId }`
- `POST /api/cancel` — Cancel active challenge or pending burn
- `GET /api/listing-fee` — Quote for wallet-paid burns `{ tokenId, atoms (default 6), feeAddress }`; the user's wallet burns 6 PAW (rebirth), sends the fee and pays XEC, then broadcasts directly (no wait)
- `GET /api/profile/fee` — Flat XEC fee for a desk-built profile `{ xec, xecSats, address }` (`MINT_PROFILE_XEC_FEE`, default 20 XEC = 2,000 sats)
- `GET /api/post/fee` — Same fee quote for paid post stamps
- `POST /api/post/create` — `{ installId, address, paymentTxid, contentHash, petRootTxid }`: verifies the payment and burns 1 PAW with the DANA v4 content hash. On another user's pet the desk also sends **1 PAW atom to the creator** (2 atoms total) from the same flat fee. No PoW, no wait; only casual voting still uses the sponsored PoW challenge.
- `POST /api/profile/create` — `{ installId, address, paymentTxid, note, parentBurnTxid? }`: verifies the on-chain payment (paid to the desk from the creator's address, not reused) and spends 12 PAW from desk inventory — 6 atoms burned for rebirth, 6 atoms listing fee retained — to anchor the profile. No remint, no PoW, no wait.

**Paid profiles (no PAW)**: the user pays a flat XEC fee (default 20 XEC = 2,000 sats). Desk cost: 12 PAW atoms at the 1 XEC/atom reference (~1,200 sats) + ~300–600 sats burn-tx fee → margin ≈ **200–500 sats (~10–25%)**. Sponsored votes keep minting fresh (108 per remint), which maintains inventory.
- `POST /api/notify { burnTxid, installId? }` — Forward a wallet-broadcast tx to dana-index for immediate ingest
- `GET /health` — Health check endpoint

Sponsored root memorials are rejected except for the **first sponsored pet profile**: `kind: 'memorial'` without `parentBurnTxid` must be created from the user's wallet, while `kind: 'profile'` is desk-sponsored once per install (6-atom burn, ~2 minute wait). Subsequent profiles are user-paid.
