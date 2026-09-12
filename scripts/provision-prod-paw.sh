#!/usr/bin/env bash
# Provision the production Onest desk on PAW (mainnet, https://onest.pet).
#
# First-time genesis needs PROD_DESK_SEEDS (or MINT_MNEMONIC).
# Later deploys can omit the seed: PAW metadata in deployments/mainnet-paw.json
# and the mnemonic already in /etc/onest/mint.env are reused.
# Safe to re-run: reuses deployments/mainnet-paw.json when present.
#
# Run as root on the prod VM (or with sudo). Bootstrap is idempotent:
# creates the `deploy` user, sudoers, Node 22, systemd units, nginx vhost.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO_DEST="${REPO_DEST:-/opt/onest}"
MINT_ENV="${ONEST_MINT_ENV:-/etc/onest/mint.env}"
DANA_ENV="${ONEST_DANA_INDEX_ENV:-/etc/onest/dana-index.env}"
MINT_PORT="${MINT_API_PORT:-9787}"
DANA_PORT="${DANA_INDEX_PORT:-9788}"
SITE_ORIGIN="${PUBLIC_SITE_ORIGIN:-https://onest.pet}"
CHRONIK_URLS="${CHRONIK_URLS:-https://chronik.e.cash,https://xec.paybutton.org}"
SOFT_WAIT="${MINT_MIN_PRAY_SECONDS:-54}"
NGINX_SRC="$ROOT/deploy/contabo/nginx-onest-prod.conf"
NGINX_DEST="${NGINX_DEST:-/etc/nginx/sites-enabled/onest-prod}"

REFRESH_ONLY=0
if [[ -z "${PROD_DESK_SEEDS:-}" && -z "${MINT_MNEMONIC:-}" && -z "${GENESIS_MNEMONIC:-}" ]]; then
  if [[ -f "$ROOT/deployments/mainnet-paw.json" && -f "$MINT_ENV" ]] \
    && grep -q '^MINT_MNEMONIC=' "$MINT_ENV"; then
    REFRESH_ONLY=1
    echo "provision-prod-paw: no seed in env; refreshing existing PAW desk"
  else
    echo "provision-prod-paw: PROD_DESK_SEEDS (or MINT_MNEMONIC) is required for first-time genesis" >&2
    exit 1
  fi
fi

# --- Fresh-VM bootstrap (idempotent, root only) ---
if [[ "$(id -u)" -eq 0 ]]; then
  if ! id deploy >/dev/null 2>&1; then
    echo "provision-prod-paw: creating deploy user"
    useradd -m -s /bin/bash deploy
  fi
  SUDOERS_FILE=/etc/sudoers.d/onest-deploy
  if [[ ! -f "$SUDOERS_FILE" ]]; then
    echo "provision-prod-paw: installing sudoers for deploy"
    printf '%s\n' \
      'deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart onest-mint-api.service' \
      'deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart onest-dana-index.service' \
      'deploy ALL=(ALL) NOPASSWD: /usr/bin/chown -R deploy\:deploy /opt/onest' \
      'deploy ALL=(ALL) NOPASSWD: /bin/chown -R deploy\:deploy /opt/onest' \
      > "$SUDOERS_FILE"
    chmod 440 "$SUDOERS_FILE"
    visudo -c
  fi
  mkdir -p "$REPO_DEST" /var/www/onest /etc/onest /etc/nginx/snippets
  chown -R deploy:deploy "$REPO_DEST" 2>/dev/null || true
fi

export PATH="$ROOT/node_modules/.bin:/usr/local/bin:/usr/bin:${PATH:-}"
if [[ ! -x /usr/local/lib/nodejs-22/bin/node ]]; then
  echo "provision-prod-paw: installing Node 22 to /usr/local/lib/nodejs-22"
  curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz -o /tmp/node-v22.14.0-linux-x64.tar.xz
  mkdir -p /usr/local/lib/nodejs-22
  tar -xJf /tmp/node-v22.14.0-linux-x64.tar.xz -C /usr/local/lib/nodejs-22 --strip-components=1
  rm -f /tmp/node-v22.14.0-linux-x64.tar.xz
fi
if [[ -x /usr/local/lib/nodejs-22/bin/node ]]; then
  export PATH="/usr/local/lib/nodejs-22/bin:$PATH"
fi
chmod +x "$ROOT/deploy/contabo/run-mint-api.sh" "$ROOT/deploy/contabo/run-dana-index.sh"

mkdir -p "$(dirname "$MINT_ENV")" "$(dirname "$DANA_ENV")" "$ROOT/deployments" "$ROOT/data"

if [[ "$REFRESH_ONLY" -eq 0 ]]; then
  echo "provision-prod-paw: inspecting desk address (no broadcast)..."
  ADDRESS_OUT="$(npx tsx scripts/create-paw-token.ts --prod --address)"
  echo "$ADDRESS_OUT" | grep -E 'Genesis Address:|Current Balance:|Ticker:|Mode:' || true
  echo "provision-prod-paw: creating PAW genesis if needed..."
  npx tsx scripts/create-paw-token.ts --prod
else
  echo "provision-prod-paw: skipping genesis (using existing deployments/mainnet-paw.json)"
fi

DEP_JSON="$ROOT/deployments/mainnet-paw.json"
if [[ ! -f "$DEP_JSON" ]]; then
  echo "provision-prod-paw: missing $DEP_JSON after genesis" >&2
  exit 1
fi
TOKEN_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DEP_JSON','utf8')).tokenId || '')")"
if [[ ! "$TOKEN_ID" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "provision-prod-paw: invalid tokenId in $DEP_JSON" >&2
  exit 1
fi
echo "provision-prod-paw: PAW tokenId=${TOKEN_ID:0:8}…"

# Persist desk env. Quote the mnemonic so dotenv keeps the phrase intact.
SEED_SRC="${PROD_DESK_SEEDS:-${GENESIS_MNEMONIC:-${MINT_MNEMONIC:-}}}"
export SEED_SRC TOKEN_ID REPO_DEST SOFT_WAIT CHRONIK_URLS SITE_ORIGIN MINT_ENV DANA_ENV
export MINT_PORT DANA_PORT
umask 077
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
function readEnvValue(path, key) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line.startsWith(key + "=")) continue;
      let v = line.slice(key.length + 1).trim();
      if (
        (v.startsWith("\"") && v.endsWith("\"")) ||
        (v.startsWith("'\''") && v.endsWith("'\''"))
      ) {
        v = v.slice(1, -1);
      }
      return v;
    }
  } catch {
    /* missing file */
  }
  return "";
}
const seed =
  process.env.SEED_SRC ||
  readEnvValue(process.env.MINT_ENV, "MINT_MNEMONIC") ||
  readEnvValue(process.env.MINT_ENV, "GENESIS_MNEMONIC");
if (!seed) {
  console.error("provision-prod-paw: no desk mnemonic in env or mint.env");
  process.exit(1);
}
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
  `VITE_PAW_TICKER=PAW`,
  `DEPLOYMENT_JSON=${repo}/deployments/mainnet-paw.json`,
  `DANA_INDEX_URL=http://127.0.0.1:${danaPort}`,
  `CHRONIK_URLS=${chronik}`,
  `PUBLIC_SITE_ORIGIN=${origin}`,
  "",
].join("\n"));
writeFileSync(process.env.DANA_ENV, [
  `DANA_INDEX_PORT=${danaPort}`,
  `TOKEN_ID=${tokenId}`,
  `VITE_PAW_TOKEN_ID=${tokenId}`,
  `VITE_PAW_TICKER=PAW`,
  `DEPLOYMENT_JSON=${repo}/deployments/mainnet-paw.json`,
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
VITE_PAW_TICKER=PAW
DEPLOYMENT_JSON=${REPO_DEST}/deployments/mainnet-paw.json
DANA_INDEX_URL=http://127.0.0.1:${DANA_PORT}
PUBLIC_SITE_ORIGIN=${SITE_ORIGIN}
EOF

chmod +x "$ROOT/deploy/contabo/run-mint-api.sh" "$ROOT/deploy/contabo/run-dana-index.sh"
if [[ "$(readlink -f "$ROOT")" != "$(readlink -f "$REPO_DEST")" ]]; then
  install -d -m 755 "$REPO_DEST/deploy/contabo"
  install -m 755 "$ROOT/deploy/contabo/run-mint-api.sh" "$REPO_DEST/deploy/contabo/run-mint-api.sh"
  install -m 755 "$ROOT/deploy/contabo/run-dana-index.sh" "$REPO_DEST/deploy/contabo/run-dana-index.sh"
fi
install -m 644 "$ROOT/deploy/contabo/onest-mint-api.service" /etc/systemd/system/onest-mint-api.service
install -m 644 "$ROOT/deploy/contabo/onest-dana-index.service" /etc/systemd/system/onest-dana-index.service

# Start Onest on :9787/:9788 before flipping nginx so onest.pet never 502s
# onto empty ports.
systemctl daemon-reload
systemctl enable --now onest-mint-api onest-dana-index
systemctl restart onest-mint-api onest-dana-index

echo "provision-prod-paw: waiting for mint-api on :${MINT_PORT}..."
healthy=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS "http://127.0.0.1:${MINT_PORT}/health" | grep -q onest-mint-api; then
    echo "provision-prod-paw: mint-api healthy"
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" -ne 1 ]]; then
  echo "provision-prod-paw: mint-api did not become healthy; not flipping nginx" >&2
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
      console.error("provision-prod-paw: still serving WLotus — abort");
      process.exit(1);
    }
    if (String(j.ticker||"")!=="PAW") {
      console.error("provision-prod-paw: expected ticker PAW, got "+j.ticker);
      process.exit(1);
    }
  } catch (e) {
    console.error("provision-prod-paw: could not parse /api/status");
    process.exit(1);
  }
});
'

if [[ -f "$NGINX_SRC" ]]; then
  echo "provision-prod-paw: pointing onest.pet at :${MINT_PORT}/:${DANA_PORT}"
  # Rate-limit zone used by the hardening snippet (WLotus defines its own
  # wl_challenge zone on the test VM; the fresh prod VM needs one).
  printf '%s\n' 'limit_req_zone $binary_remote_addr zone=wl_challenge:10m rate=10r/m;' \
    > /etc/nginx/conf.d/onest-limits.conf
  install -m 644 "$ROOT/deploy/contabo/nginx-onest-hardening.conf" /etc/nginx/snippets/onest-hardening.conf
  install -m 644 "$NGINX_SRC" "$NGINX_DEST"
  nginx -t
  systemctl reload nginx
fi

echo "provision-prod-paw: rebuilding PWA with VITE_PAW_TICKER=PAW and the live token id..."
export VITE_PAW_TOKEN_ID="$TOKEN_ID"
export VITE_PAW_TICKER=PAW
export VITE_PUBLIC_SITE_ORIGIN="$SITE_ORIGIN"
npm run web:build
WEB_DEST="${WEB_DEST:-/var/www/onest}"
mkdir -p "$WEB_DEST"
rsync -a --delete "$ROOT/apps/web/dist/" "$WEB_DEST/"
# nginx workers (www-data) must traverse and read the web root.
chown -R deploy:www-data "$WEB_DEST" 2>/dev/null || chown -R deploy:deploy "$WEB_DEST" 2>/dev/null || true
chmod -R u+rwX,g+rX,o+rX "$WEB_DEST"

echo "provision-prod-paw: done. PAW is live on ${SITE_ORIGIN}."
echo "TOKEN_ID=${TOKEN_ID}"
