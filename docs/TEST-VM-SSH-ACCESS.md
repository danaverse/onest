# Test VM SSH access (`154.53.59.31` / `test.onest.pet`)

After security hardening, **SSH password login is disabled**. You must use a **private key** as user **`deploy`** (not `root` with password).

## Option A — Cursor / agent key (GitHub artifact)

1. Open the latest successful run of **Setup test VM Cursor SSH key** on `main`:  
   [GitHub Actions → Setup test VM Cursor SSH key](https://github.com/danaverse/onest/actions/workflows/setup-test-cursor-ssh-key.yml)
2. Download artifact **`test-vm-cursor-ssh-private-key`** → `onest_cursor_cloud.pem`
3. Local terminal:

```bash
chmod 600 ~/Downloads/onest_cursor_cloud.pem
ssh -i ~/Downloads/onest_cursor_cloud.pem deploy@154.53.59.31
```

4. Paste the same PEM into your **Cursor environment** secret `TEST_SSH_KEY` and set `TEST_SSH_USER` to `deploy`.

## Option B — Add your laptop key (GitHub Actions)

1. Copy your public key: `cat ~/.ssh/id_ed25519.pub` (or `id_rsa.pub`)
2. GitHub → **Actions** → **Recover test VM SSH access** → **Run workflow**
3. Paste the **public** key line → Run
4. Connect: `ssh deploy@154.53.59.31` (default key)

## Option C — Contabo console (full recovery)

If GitHub `TEST_SSH_KEY` no longer works:

1. Contabo control panel → your VPS → **VNC / console**
2. Log in as **root** (console is not SSH)
3. Either add your pubkey:

```bash
mkdir -p /home/deploy/.ssh
echo 'YOUR_SSH_PUBLIC_KEY_LINE' >> /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

4. Or temporarily restore password login:

```bash
rm -f /etc/ssh/sshd_config.d/99-onest-hardening.conf
# or edit that file: PasswordAuthentication yes, PermitRootLogin prohibit-password
sshd -t && systemctl reload sshd
```

## What does *not* work anymore

- `ssh root@154.53.59.31` with the old **root password**
- SSH without a key that is listed in `deploy`’s `authorized_keys`

GitHub **Deploy to Test** still uses the **`TEST_SSH_KEY`** secret in repo Actions settings (separate from Cursor env).
