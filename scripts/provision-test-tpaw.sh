#!/usr/bin/env bash
# Provision the test Onest desk on tPAW (not WLotus).
#
# Requires TEST_DESK_SEEDS (or MINT_MNEMONIC) in the environment.
# Safe to re-run: reuses deployments/test-paw.json when present.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO_DEST="${REPO_DEST:-/opt/onest}"
MINT_ENV="${ONEST_MINT_ENV:-/etc/onest/mint.env}"
DANA_ENV="${ONEST_DANA_INDEX_ENV:-/etc/onest/dana-index.env}"
MINT_PORT="${MINT_API_PORT:-9787}"
DANA_PORT="${DANA_INDEX_PORT:-9788}"
SITE_ORIGIN="${PUBLIC_SITE_ORIGIN:-https://test.onest.pet}"
CHRONIK_URLS="${CHRONIK_URLS:-https://chronik.e.cash,https://xec.paybutton.org}"
SOFT_WAIT="${MINT_MIN_PRAY_SECONDS:-54}"
NGINX_SRC="$ROOT/deploy/contabo/nginx-onest-test.conf"
NGINX_DEST="${NGINX_DEST:-/etc/nginx/sites-enabled/onest-test}"

if [[ -z "${TEST_DESK_SEEDS:-}" && -z "${MINT_MNEMONIC:-}" && -z "${GENESIS_MNEMONIC:-}" ]]; then
  echo "provision-test-tpaw: TEST_DESK_SEEDS (or MINT_MNEMONIC) is required" >&2
  exit 1
fi

export PATH="$ROOT/node_modules/.bin:/usr/local/bin:/usr/bin:${PATH:-}"
chmod +x "$ROOT/deploy/contabo/run-mint-api.sh" "$ROOT/deploy/contabo/run-dana-index.sh"

echo "provision-test-tpaw: inspecting desk address (no broadcast)..."
ADDRESS_OUT="$(npx tsx scripts/create-paw-token.ts --test --address)"
echo "$ADDRESS_OUT" | grep -E 'Genesis Address:|Current Balance:|Ticker:|Mode:' || true

mkdir -p "$(dirname "$MINT_ENV")" "$(dirname "$DANA_ENV")" "$ROOT/deployments" "$ROOT/data"

echo "provision-test-tpaw: creating tPAW genesis if needed..."
npx tsx scripts/create-paw-token.ts --test

DEP_JSON="$ROOT/deployments/test-paw.json"
if [[ ! -f "$DEP_JSON" ]]; then
  echo "provision-test-tpaw: missing $DEP_JSON after genesis" >&2
  exit 1
fi
TOKEN_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DEP_JSON','utf8')).tokenId || '')")"
if [[ ! "$TOKEN_ID" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "provision-test-tpaw: invalid tokenId in $DEP_JSON" >&2
  exit 1
fi
echo "provision-test-tpaw: tPAW tokenId=${TOKEN_ID:0:8}…"

# Persist desk env. Quote the mnemonic so dotenv keeps the phrase intact.
SEED_SRC="${TEST_DESK_SEEDS:-${GENESIS_MNEMONIC:-${MINT_MNEMONIC:-}}}"
export SEED_SRC TOKEN_ID REPO_DEST SOFT_WAIT CHRONIK_URLS SITE_ORIGIN MINT_ENV DANA_ENV
export MINT_PORT DANA_PORT
umask 077
node --input-type=module -e '
import { writeFileSync } from "node:fs";
const seed = process.env.SEED_SRC || "";
const tokenId = process.env.TOKEN_ID || "";
const mintPort = process.env.MINT_PORT || "9787";
const danaPort = process.env.DANA_PORT || "9788";
const repo = process.env.REPO_DEST || "/opt/onest";
const wait = process.env.SOFT_WAIT || "54";
const chronik = process.env.CHRONIK_URLS || "";
const origin = process.env.SITE_ORIGIN || "";
const q = (s) => `"${String(s).replaceAll("\\\\", "\\\\\\\\").replaceAll("\"", "\\\"")}"`;
writeFileSync(process.env.MINT_ENV, [
  `MINT_API_PORT=${mintPort}`,
  `MINT_MNEMONIC=${q(seed)}`,
  `GENESIS_MNEMONIC=${q(seed)}`,
  `MINT_SERVING_TIP_INDEX=0`,
  `MINT_SERVING_TIP_COUNT=1`,
  `MINT_MIN_PRAY_SECONDS=${wait}`,
  `MINT_LISTING_FEE_ATOMS=6`,
  `TOKEN_ID=${tokenId}`,
  `VITE_PAW_TOKEN_ID=${tokenId}`,
  `VITE_PAW_TICKER=tPAW`,
  `DEPLOYMENT_JSON=${repo}/deployments/test-paw.json`,
  `DANA_INDEX_URL=http://127.0.0.1:${danaPort}`,
  `CHRONIK_URLS=${chronik}`,
  `PUBLIC_SITE_ORIGIN=${origin}`,
  "",
].join("\n"));
writeFileSync(process.env.DANA_ENV, [
  `DANA_INDEX_PORT=${danaPort}`,
  `TOKEN_ID=${tokenId}`,
  `VITE_PAW_TOKEN_ID=${tokenId}`,
  `VITE_PAW_TICKER=tPAW`,
  `DEPLOYMENT_JSON=${repo}/deployments/test-paw.json`,
  `CHRONIK_URLS=${chronik}`,
  `DANA_INDEX_STORE=${repo}/data/dana-index-burns.json`,
  `ONEST_SOCIAL_DB=${repo}/data/onest-social.sqlite`,
  `ONEST_MEDIA_DIR=${repo}/data/media`,
  `PUBLIC_SITE_ORIGIN=${origin}`,
  "",
].join("\n"));
'

chown root:deploy "$MINT_ENV" "$DANA_ENV" 2>/dev/null || true
chmod 640 "$MINT_ENV" "$DANA_ENV"

# Repo-local .env for the services (no mnemonic)
touch "$ROOT/.env"
sed -i '/^MINT_MIN_PRAY_SECONDS=/d;/^TOKEN_ID=/d;/^VITE_PAW_TOKEN_ID=/d;/^VITE_PAW_TICKER=/d;/^DEPLOYMENT_JSON=/d;/^DANA_INDEX_URL=/d;/^PUBLIC_SITE_ORIGIN=/d;/^MINT_API_PORT=/d;/^DANA_INDEX_PORT=/d' "$ROOT/.env" 2>/dev/null || true
cat >> "$ROOT/.env" <<EOF
MINT_API_PORT=${MINT_PORT}
DANA_INDEX_PORT=${DANA_PORT}
MINT_MIN_PRAY_SECONDS=${SOFT_WAIT}
TOKEN_ID=${TOKEN_ID}
VITE_PAW_TOKEN_ID=${TOKEN_ID}
VITE_PAW_TICKER=tPAW
DEPLOYMENT_JSON=${REPO_DEST}/deployments/test-paw.json
DANA_INDEX_URL=http://127.0.0.1:${DANA_PORT}
PUBLIC_SITE_ORIGIN=${SITE_ORIGIN}
EOF

install -d -m 755 "$REPO_DEST/deploy/contabo"
install -m 755 "$ROOT/deploy/contabo/run-mint-api.sh" "$REPO_DEST/deploy/contabo/run-mint-api.sh"
install -m 755 "$ROOT/deploy/contabo/run-dana-index.sh" "$REPO_DEST/deploy/contabo/run-dana-index.sh"
install -m 644 "$ROOT/deploy/contabo/onest-mint-api.service" /etc/systemd/system/onest-mint-api.service
install -m 644 "$ROOT/deploy/contabo/onest-dana-index.service" /etc/systemd/system/onest-dana-index.service

# Start Onest on 9787/9788 before flipping nginx so test.onest.pet never 502s
# onto empty ports. WLotus stays on 8787/8788.
systemctl daemon-reload
systemctl enable --now onest-mint-api onest-dana-index
systemctl restart onest-mint-api onest-dana-index

echo "provision-test-tpaw: waiting for mint-api on :${MINT_PORT}..."
healthy=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS "http://127.0.0.1:${MINT_PORT}/health" | grep -q onest-mint-api; then
    echo "provision-test-tpaw: mint-api healthy"
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" -ne 1 ]]; then
  echo "provision-test-tpaw: mint-api did not become healthy; not flipping nginx" >&2
  journalctl -u onest-mint-api -n 80 --no-pager >&2 || true
  exit 1
fi

STATUS="$(curl -fsS "http://127.0.0.1:${MINT_PORT}/api/status" || true)"
echo "$STATUS" | node -e '
let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
  try {
    const j=JSON.parse(s);
    console.log("ticker="+j.ticker);
    console.log("tokenId="+(j.tokenId||"").slice(0,12)+"…");
    if (String(j.ticker||"").toUpperCase()==="WLOTUS") {
      console.error("provision-test-tpaw: still serving WLotus — abort");
      process.exit(1);
    }
    if (String(j.ticker||"")!=="tPAW") {
      console.error("provision-test-tpaw: expected ticker tPAW, got "+j.ticker);
      process.exit(1);
    }
  } catch (e) {
    console.error("provision-test-tpaw: could not parse /api/status");
    process.exit(1);
  }
});
'

if [[ -f "$NGINX_SRC" ]]; then
  echo "provision-test-tpaw: pointing test.onest.pet at :${MINT_PORT}/:${DANA_PORT} (WLotus stays on :8787/:8788)"
  install -m 644 "$NGINX_SRC" "$NGINX_DEST"
  nginx -t
  systemctl reload nginx
fi

echo "provision-test-tpaw: rebuilding PWA with VITE_PAW_TICKER=tPAW and the live token id..."
export VITE_PAW_TOKEN_ID="$TOKEN_ID"
export VITE_PAW_TICKER=tPAW
export VITE_PUBLIC_SITE_ORIGIN="$SITE_ORIGIN"
npm run web:build
WEB_DEST="${WEB_DEST:-/var/www/onest-test}"
mkdir -p "$WEB_DEST"
rsync -a --delete "$ROOT/apps/web/dist/" "$WEB_DEST/"
chown -R deploy:deploy "$WEB_DEST" 2>/dev/null || true

echo "provision-test-tpaw: done. tPAW is live; WLotus remains on :8787/:8788 for test.wlotus.org."
echo "TOKEN_ID=${TOKEN_ID}"
