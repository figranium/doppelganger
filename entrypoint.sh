#!/usr/bin/env bash
set -euo pipefail

/app/start-captcha.sh &

exec /app/start-vnc.sh
