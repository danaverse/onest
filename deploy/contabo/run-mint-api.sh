#!/usr/bin/env bash
# systemd entrypoint for Onest mint-api (User=deploy).
# Loads /etc/onest/mint.env via Node dotenv (handles mnemonic spaces).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:/usr/bin:${PATH:-}"
# Onest needs Node >=20 (better-sqlite3 13 + Vite 6). Keep /usr/bin/node at 18 for WLotus.
if [[ -x /usr/local/lib/nodejs-22/bin/node ]]; then
  export PATH="/usr/local/lib/nodejs-22/bin:$PATH"
fi

TSX="$ROOT/node_modules/.bin/tsx"
if [[ ! -x "$TSX" ]]; then
  echo "onest mint-api: missing $TSX" >&2
  echo "Fix: sudo -u deploy -H bash -lc 'cd /opt/onest && npm ci'" >&2
  exit 1
fi
if [[ ! -f "$ROOT/apps/mint-api/src/server.ts" ]]; then
  echo "onest mint-api: missing $ROOT/apps/mint-api/src/server.ts" >&2
  exit 1
fi
ENV_FILE=/etc/onest/mint.env
if [[ -e "$ENV_FILE" && ! -r "$ENV_FILE" ]]; then
  echo "onest mint-api: cannot read $ENV_FILE as $(id -un)" >&2
  echo "Fix: sudo chown root:deploy $ENV_FILE && sudo chmod 640 $ENV_FILE" >&2
  exit 1
fi

echo "onest mint-api: start root=$ROOT user=$(id -un) node=$(command -v node) $(node -v) tsx=$TSX" >&2
exec "$TSX" apps/mint-api/src/server.ts
