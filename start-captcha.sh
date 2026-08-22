#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/data

# Skip entirely if the user points at an external ohmycaptcha instance instead.
if [ -n "${OHMYCAPTCHA_URL:-}" ]; then
  echo "[captcha] OHMYCAPTCHA_URL is set, skipping embedded ohmycaptcha instance"
  exit 0
fi

# solve_captcha already refuses to run under 2 GB (captcha-client.js's assertMemoryAllowed),
# so starting this process on a smaller host would just burn its limited RAM on a service
# that can never be used. Mirrors that check here: cgroup limit if present (containers are
# often capped below host RAM), else /proc/meminfo.
MIN_REQUIRED_MB=2048
effective_mb() {
  for f in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory/memory.limit_in_bytes; do
    if [ -r "$f" ]; then
      local raw
      raw=$(cat "$f" 2>/dev/null || echo "")
      if [ "$raw" != "max" ] && [ -n "$raw" ] && [ "$raw" -gt 0 ] 2>/dev/null; then
        echo $((raw / 1024 / 1024))
        return
      fi
    fi
  done
  awk '/MemTotal/ { print int($2/1024) }' /proc/meminfo 2>/dev/null || echo 0
}
HOST_MB=$(effective_mb)
if [ "$HOST_MB" -gt 0 ] && [ "$HOST_MB" -lt "$MIN_REQUIRED_MB" ]; then
  echo "[captcha] Skipping embedded ohmycaptcha instance: ${HOST_MB}MB available, needs ${MIN_REQUIRED_MB}MB (matches solve_captcha's own memory guard)"
  exit 0
fi

CLIENT_KEY_FILE="/app/data/captcha_client_key.txt"
if [ ! -f "$CLIENT_KEY_FILE" ]; then
  openssl rand -base64 24 | tr -d '/+=' > "$CLIENT_KEY_FILE"
fi
export CLIENT_KEY SERVER_HOST SERVER_PORT PLAYWRIGHT_BROWSERS_PATH
CLIENT_KEY=$(cat "$CLIENT_KEY_FILE")
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
# Isolated from the app's own /ms-playwright cache — see the Dockerfile install step.
PLAYWRIGHT_BROWSERS_PATH=/opt/ohmycaptcha-browsers

echo "[captcha] Starting embedded ohmycaptcha on ${SERVER_HOST}:${SERVER_PORT}"
cd /opt/ohmycaptcha
while true; do
  echo "[captcha] ($(date -u +%FT%TZ)) launching ohmycaptcha" >> /app/data/captcha.log
  python3 main.py >> /app/data/captcha.log 2>&1
  echo "[captcha] ($(date -u +%FT%TZ)) ohmycaptcha exited, restarting in 1s" >> /app/data/captcha.log
  sleep 1
done
