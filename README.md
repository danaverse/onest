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
