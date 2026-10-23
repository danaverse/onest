#!/usr/bin/env bash
# Boot Onest local services for Cloud Agents (idempotent).
set -euo pipefail
cd /workspace

ensure() {
  local name="$1"
  local cmd="$2"
  local log="/tmp/${name}.log"
  if tmux has-session -t "$name" 2>/dev/null; then
    return 0
  fi
  tmux new-session -d -s "$name" "bash -lc 'cd /workspace && ${cmd} 2>&1 | tee ${log}'"
}

ensure mint-api "npm run mint-api"
ensure dana-index "npm run dana-index"
ensure web "npm run web"

# Wait for health endpoints (best-effort; start is not awaited by the platform).
for i in $(seq 1 60); do
  if curl -sf --max-time 2 http://127.0.0.1:8787/health >/dev/null \
    && curl -sf --max-time 2 http://127.0.0.1:8788/health >/dev/null; then
    echo "onest start: mint-api + dana-index healthy"
    exit 0
  fi
  sleep 1
done
echo "onest start: services launched (health not confirmed within 60s)" >&2
exit 0
