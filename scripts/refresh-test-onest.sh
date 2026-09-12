#!/usr/bin/env bash
# Restart the live tPAW Onest desk as the unprivileged `deploy` user.
#
# Matches /etc/sudoers.d/onest-deploy NOPASSWD commands exactly.
# Does not rewrite /etc/onest/mint.env (mnemonic stays on the VM).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPO_DEST="${REPO_DEST:-$ROOT}"
MINT_PORT="${MINT_API_PORT:-9787}"

chmod +x "$ROOT/deploy/contabo/run-mint-api.sh" "$ROOT/deploy/contabo/run-dana-index.sh"

if [[ -x /usr/local/lib/nodejs-24/bin/node ]]; then
  export PATH="/usr/local/lib/nodejs-24/bin:$PATH"
fi

echo "refresh-test-onest: restarting onest-mint-api and onest-dana-index (not WLotus)"
sudo -n /usr/bin/systemctl restart onest-mint-api.service
sudo -n /usr/bin/systemctl restart onest-dana-index.service

echo "refresh-test-onest: waiting for mint-api on :${MINT_PORT}..."
healthy=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS "http://127.0.0.1:${MINT_PORT}/health" | grep -q onest-mint-api; then
    echo "refresh-test-onest: mint-api healthy"
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" -ne 1 ]]; then
  echo "refresh-test-onest: mint-api did not become healthy" >&2
  journalctl -u onest-mint-api -n 40 --no-pager >&2 || true
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
      console.error("refresh-test-onest: still serving WLotus — abort");
      process.exit(1);
    }
    if (String(j.ticker||"")!=="tPAW") {
      console.error("refresh-test-onest: expected ticker tPAW, got "+j.ticker);
      process.exit(1);
    }
  } catch (e) {
    console.error("refresh-test-onest: could not parse /api/status");
    process.exit(1);
  }
});
'

echo "refresh-test-onest: done"
