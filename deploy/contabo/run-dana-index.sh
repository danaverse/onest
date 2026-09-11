#!/usr/bin/env bash
# systemd entrypoint for Onest dana-index (User=deploy).
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
  echo "onest dana-index: missing $TSX" >&2
  exit 1
fi

ENV_FILE=/etc/onest/dana-index.env
if [[ -e "$ENV_FILE" && ! -r "$ENV_FILE" ]]; then
  echo "onest dana-index: cannot read $ENV_FILE as $(id -un)" >&2
  echo "Fix: sudo chown root:deploy $ENV_FILE && sudo chmod 640 $ENV_FILE" >&2
  exit 1
fi

echo "onest dana-index: start root=$ROOT user=$(id -un) node=$(command -v node) $(node -v) tsx=$TSX" >&2
exec "$TSX" apps/dana-index/src/server.ts
