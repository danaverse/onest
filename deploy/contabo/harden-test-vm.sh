#!/usr/bin/env bash
# Idempotent security baseline for the shared Contabo test VM (test.onest.pet).
# Run as root on the VM after syncing /opt/onest from main.
#
#   REPO=/opt/onest bash /opt/onest/deploy/contabo/harden-test-vm.sh
#
# Flags:
#   --skip-ssh     Do not change sshd (password/key policy).
#   --skip-apt     Skip apt installs (fail2ban, unattended-upgrades).
set -euo pipefail

ROOT="${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
SKIP_SSH=0
SKIP_APT=0
for arg in "$@"; do
  case "$arg" in
    --skip-ssh) SKIP_SSH=1 ;;
    --skip-apt) SKIP_APT=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "harden-test-vm: run as root" >&2
  exit 1
fi

echo "harden-test-vm: repo=$ROOT"

if [[ "$SKIP_APT" -eq 0 ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq fail2ban unattended-upgrades ufw
fi

# --- SSH (key-only root/deploy) ---
if [[ "$SKIP_SSH" -eq 0 ]]; then
  deploy_keys=0
  root_keys=0
  [[ -f /home/deploy/.ssh/authorized_keys ]] && deploy_keys="$(wc -l < /home/deploy/.ssh/authorized_keys)"
  [[ -f /root/.ssh/authorized_keys ]] && root_keys="$(wc -l < /root/.ssh/authorized_keys)"
  if [[ "$deploy_keys" -lt 1 && "$root_keys" -lt 1 ]]; then
    echo "harden-test-vm: refusing SSH hardening — no authorized_keys on deploy or root" >&2
    exit 1
  fi
  install -m 644 "$ROOT/deploy/contabo/sshd-onest-hardening.conf" \
    /etc/ssh/sshd_config.d/99-onest-hardening.conf
  if ! sshd -t; then
    echo "harden-test-vm: sshd -t failed; removing drop-in" >&2
    rm -f /etc/ssh/sshd_config.d/99-onest-hardening.conf
    exit 1
  fi
  systemctl reload sshd || systemctl reload ssh
  echo "harden-test-vm: sshd hardened (key-only; password auth off)"
fi

# --- fail2ban ---
install -d -m 755 /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/onest-sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 4
findtime = 10m
bantime = 1h
backend = systemd
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# --- unattended security upgrades ---
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable unattended-upgrades 2>/dev/null || true

# --- UFW: only web + SSH ---
if command -v ufw >/dev/null; then
  ufw --force default deny incoming
  ufw --force default allow outgoing
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw --force enable
fi

# --- nginx snippets & rate limits ---
install -d -m 755 /etc/nginx/snippets /etc/nginx/conf.d
install -m 644 "$ROOT/deploy/contabo/nginx-onest-hardening.conf" \
  /etc/nginx/snippets/onest-hardening.conf
install -m 644 "$ROOT/deploy/contabo/nginx-onest-security-headers.conf" \
  /etc/nginx/snippets/onest-security-headers.conf
install -m 644 "$ROOT/deploy/contabo/nginx-onest-rate-limits.conf" \
  /etc/nginx/conf.d/onest-rate-limits.conf
if [[ ! -f /etc/nginx/conf.d/wlotus-rate-limit.conf ]]; then
  echo "harden-test-vm: installing wl_challenge zone (missing wlotus-rate-limit.conf)"
  printf '%s\n' \
    'limit_req_zone $binary_remote_addr zone=wl_challenge:10m rate=10r/m;' \
    > /etc/nginx/conf.d/wlotus-rate-limit.conf
fi
if [[ -f "$ROOT/deploy/contabo/nginx-onest-test.conf" ]]; then
  install -m 644 "$ROOT/deploy/contabo/nginx-onest-test.conf" \
    /etc/nginx/sites-enabled/onest-test
fi
grep -q '^server_tokens off;' /etc/nginx/nginx.conf 2>/dev/null || \
  sed -i '/http {/a \    server_tokens off;' /etc/nginx/nginx.conf
nginx -t
systemctl reload nginx

# --- deploy sudoers (CI restart + nginx reload) ---
install -m 440 "$ROOT/deploy/contabo/onest-deploy.sudoers" /etc/sudoers.d/onest-deploy
visudo -c

# --- Onest env: loopback bind (defense in depth behind nginx) ---
ensure_env_kv() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s/^${key}=.*/${key}=${val}/" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}
if [[ -f /etc/onest/mint.env ]]; then
  ensure_env_kv /etc/onest/mint.env MINT_API_BIND 127.0.0.1
  chown root:deploy /etc/onest/mint.env
  chmod 640 /etc/onest/mint.env
fi
if [[ -f /etc/onest/dana-index.env ]]; then
  ensure_env_kv /etc/onest/dana-index.env DANA_INDEX_BIND 127.0.0.1
  chown root:deploy /etc/onest/dana-index.env
  chmod 640 /etc/onest/dana-index.env
fi

install -m 644 "$ROOT/deploy/contabo/onest-mint-api.service" /etc/systemd/system/onest-mint-api.service
install -m 644 "$ROOT/deploy/contabo/onest-dana-index.service" /etc/systemd/system/onest-dana-index.service
systemctl daemon-reload
systemctl restart onest-mint-api onest-dana-index

echo "harden-test-vm: waiting for mint-api health..."
for _ in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:9787/health | grep -q onest-mint-api; then
    echo "harden-test-vm: mint-api ok"
    break
  fi
  sleep 2
done

echo "harden-test-vm: listening sockets (Onest should be 127.0.0.1 only):"
ss -tlnp | grep -E '9787|9788' || true

echo "harden-test-vm: done. Use TEST_SSH_KEY + deploy@host (or root key); password login is disabled."
