#!/usr/bin/env bash
# systemd entrypoint for Onest mint-api (User=deploy).
# Loads /etc/onest/mint.env via Node dotenv (handles mnemonic spaces).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:/usr/bin:${PATH:-}"
# Onest needs Node 24 (matches WLotus). Side-by-side install; /usr/bin/node is untouched.
if [[ -x /usr/local/lib/nodejs-24/bin/node ]]; then
  export PATH="/usr/local/lib/nodejs-24/bin:$PATH"
fi
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v//; s/\..*//')"
if ! [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || [[ "$NODE_MAJOR" -lt 24 ]]; then
  echo "onest mint-api: Node >=24 required, found $(node -v 2>/dev/null || echo none) ($(command -v node || echo no-node))" >&2
  echo "Fix: install Node 24 at /usr/local/lib/nodejs-24 (see scripts/provision-test-tpaw.sh)" >&2
  exit 1
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
