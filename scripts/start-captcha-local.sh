#!/usr/bin/env bash
# Runs the ohmycaptcha service outside Docker, for local development against
# the `solve_captcha` agent action. Not needed in the Docker image — there
# start-captcha.sh runs it automatically. Requires python3 + pip on the host.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OHMYCAPTCHA_DIR="$ROOT_DIR/.ohmycaptcha"
DATA_DIR="$ROOT_DIR/data"

mkdir -p "$DATA_DIR"

# ohmycaptcha uses `X | None` union syntax, which requires Python 3.10+. macOS ships an
# older `python3` (Command Line Tools' 3.9) that parses fine but fails at import time, so
# pick the newest 3.10+ interpreter available instead of assuming `python3` is new enough.
PYTHON_BIN=""
for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      PYTHON_BIN="$candidate"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "[captcha-dev] No Python 3.10+ interpreter found (ohmycaptcha requires it)." >&2
  echo "[captcha-dev] Install one, e.g.: brew install python@3.12" >&2
  exit 1
fi
echo "[captcha-dev] Using $($PYTHON_BIN --version) ($PYTHON_BIN)"

if [ -n "${OHMYCAPTCHA_URL:-}" ]; then
  echo "[captcha-dev] OHMYCAPTCHA_URL is set, nothing to run locally — figranium will call that instead."
  exit 0
fi

if [ ! -d "$OHMYCAPTCHA_DIR" ]; then
  echo "[captcha-dev] Cloning ohmycaptcha into $OHMYCAPTCHA_DIR"
  git clone --depth 1 https://github.com/shenhao-stu/ohmycaptcha.git "$OHMYCAPTCHA_DIR"
fi

# Use a dedicated venv (built with the resolved 3.10+ interpreter) rather than the host's
# global pip — that keeps deps isolated from whatever python3/pip3 happen to resolve to
# elsewhere on the system, and avoids installing under one Python but running another.
VENV_DIR="$OHMYCAPTCHA_DIR/.venv"
# Isolated from the app's own Node Playwright browser cache (~/.cache/ms-playwright or
# platform equivalent): `playwright install` prunes browser revisions its own registry
# doesn't know about, so pointing it at the shared default cache would risk deleting the
# app's browsers the next time you run `npm run build`/`npx playwright install`.
BROWSERS_DIR="$OHMYCAPTCHA_DIR/.browsers"
if [ ! -d "$VENV_DIR" ]; then
  echo "[captcha-dev] Creating venv at $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --no-cache-dir -r "$OHMYCAPTCHA_DIR/requirements.txt"
  PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR" "$VENV_DIR/bin/python" -m playwright install chromium
fi
PYTHON_BIN="$VENV_DIR/bin/python"

CLIENT_KEY_FILE="$DATA_DIR/captcha_client_key.txt"
if [ ! -f "$CLIENT_KEY_FILE" ]; then
  openssl rand -base64 24 | tr -d '/+=' > "$CLIENT_KEY_FILE"
fi

export CLIENT_KEY SERVER_HOST SERVER_PORT PLAYWRIGHT_BROWSERS_PATH
CLIENT_KEY=$(cat "$CLIENT_KEY_FILE")
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR"

echo "[captcha-dev] Starting ohmycaptcha on ${SERVER_HOST}:${SERVER_PORT} (client key: $DATA_DIR/captcha_client_key.txt)"
cd "$OHMYCAPTCHA_DIR"
exec "$PYTHON_BIN" main.py
