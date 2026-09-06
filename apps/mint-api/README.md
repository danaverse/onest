# Onest Mint API

Device PoW challenge/submit desk with fee-sponsored remint and DANA animal memorial / paw-print burns on eCash.

- Configured via `/etc/onest/mint.env` and `.env` (Never shares `/etc/wlotus/mint.env`).
- No temple catalog or temple tax (100% PAW tokens go to miner/desk).

## Endpoints

- `POST /api/challenge` — Request PoW challenge `{ installId, note?, parentBurnTxid? }`
- `POST /api/submit` — Submit solved challenge `{ installId, challengeId, nonceHex, powMs?, powAttempts? }`
- `POST /api/burn` — Execute memorial / paw-print burn after soft pray `{ installId, remintTxid, burnToken }`
- `GET /api/status` — Get desk status, token era, serving tips, remaining daily offers
- `GET /api/root-creator` — Check animal profile root creator status `{ txid, installId }`
- `POST /api/cancel` — Cancel active challenge or pending burn
- `GET /health` — Health check endpoint
