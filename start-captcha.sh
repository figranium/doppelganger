#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/data

# Skip entirely if the user points at an external ohmycaptcha instance instead.
if [ -n "${OHMYCAPTCHA_URL:-}" ]; then
  echo "[captcha] OHMYCAPTCHA_URL is set, skipping embedded ohmycaptcha instance"
  exit 0
fi

CLIENT_KEY_FILE="/app/data/captcha_client_key.txt"
if [ ! -f "$CLIENT_KEY_FILE" ]; then
  openssl rand -base64 24 | tr -d '/+=' > "$CLIENT_KEY_FILE"
fi
export CLIENT_KEY SERVER_HOST SERVER_PORT
CLIENT_KEY=$(cat "$CLIENT_KEY_FILE")
SERVER_HOST=127.0.0.1
SERVER_PORT=8000

echo "[captcha] Starting embedded ohmycaptcha on ${SERVER_HOST}:${SERVER_PORT}"
cd /opt/ohmycaptcha
while true; do
  echo "[captcha] ($(date -u +%FT%TZ)) launching ohmycaptcha" >> /app/data/captcha.log
  python3 main.py >> /app/data/captcha.log 2>&1
  echo "[captcha] ($(date -u +%FT%TZ)) ohmycaptcha exited, restarting in 1s" >> /app/data/captcha.log
  sleep 1
done
