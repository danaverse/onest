# Onest (`PAW`)

On-chain animal memorial, paw-print tributes, and ALP PoW minting on eCash.

- **Site:** [https://onest.pet](https://onest.pet)
- **Token:** PAW (`Onest`, URL `https://onest.pet`, ALP standard fungible token with PoW remint batons)
- **App:** Animal profile / paw-print tribute PWA

## Features

- **`apps/mint-api`**: Device PoW challenge/submit desk with fee-sponsored remint and DANA memorial burns (`/api/challenge`, `/api/submit`, `/api/burn`, `/api/status`, `/api/root-creator`). Configured via `/etc/onest/mint.env` and `.env`.
- **`apps/dana-index`**: Chronik-backed public history of PAW burns, animal profiles, search, trending, and social Open Graph preview cards (`/og/:txid`). Configured via `/etc/onest/dana-index.env` and `.env`.
- **`apps/web`**: Lightweight Progressive Web App (PWA) shell for [onest.pet](https://onest.pet) with offline support, service worker auto-update, Web Worker client-side PoW mining, and animal profile creation & paw-print tribute interface.

## Monorepo Layout

```
.
├── apps/
│   ├── dana-index/   # Public Chronik burn index & Open Graph share previews
│   ├── mint-api/     # Sponsored-fee PoW challenge & burn API
│   └── web/          # Onest PWA frontend (Vite + React)
├── contracts/        # Spedn smart contracts for PoW remint covenants
├── src/              # Shared consensus parameters, covenants, and helpers
└── scripts/          # Genesis & token operation scripts
```

## Tokenomics & Covenant Alignment

PAW is designed for 1:1 issuance and difficulty exchangeability with WLotus:
- **Covenant Model:** `WLotusCovenant` (standard Moore 2× felt +1 bit, single-tier, no temple tax)
- **Genesis Unix:** `1788215242` (baked-in WLotus mainnet genesis timestamp)
- **Mint Atoms:** `108` atoms per remint (100% to miner / tip desk)
- **Base Difficulty:** `0` base zero bits
- **Clock Speed:** `500` days per extra bit (`43,200,000` seconds)
- **Batons:** `28` PoW remint batons

## Setup & Running

Install dependencies:

```bash
npm install
```

Build shared TypeScript libraries:

```bash
npm run build
```

Run mint API:

```bash
npm run mint-api
```

Run DANA burn index:

```bash
npm run dana-index
```

Run web frontend:

```bash
npm run web
```

## Continuous Deployment (GitHub Actions)

When a pull request is merged into the `main` branch, the `.github/workflows/deploy-test.yml` workflow automatically runs the test suite, linter, builds the web app, and deploys to the test VM (`test.onest.pet`).

### Required GitHub Secrets

Configure the following secrets in GitHub (**Settings → Secrets and variables → Actions → Secrets**):

- `TEST_SSH_HOST`: IP or domain of the test VM (`154.53.59.31`)
- `TEST_SSH_USER`: SSH user (`root`)
- `TEST_SSH_KEY`: The SSH private key generated for passwordless deployment (`ed25519` PEM format)

#### Optional Variables / Secrets:
- `TEST_SSH_PORT`: SSH port (default `22`)
- `TEST_WEB_PATH`: Web root on VM (default `/var/www/onest-test`)
- `TEST_REPO_PATH`: Codebase destination on VM (default `/opt/onest`)
- `TEST_SMOKE_URL`: Live verification URL (default `https://test.onest.pet`)

