#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"

mkdir -p /app/data
rm -f /tmp/.X${DISPLAY#*:}-lock 2>/dev/null || true

echo "[vnc] Starting Xvfb on $DISPLAY"
(
  set +e
  while true; do
    rm -f /tmp/.X${DISPLAY#*:}-lock 2>/dev/null || true
    echo "[vnc] ($(date -u +%FT%TZ)) launching Xvfb" >> /app/data/xvfb.log
    Xvfb "$DISPLAY" -screen 0 1920x1080x24 -nolisten tcp -ac >> /app/data/xvfb.log 2>&1
    echo "[vnc] ($(date -u +%FT%TZ)) Xvfb exited, restarting in 1s" >> /app/data/xvfb.log
    sleep 1
  done
) &

echo "[vnc] Starting x11vnc on :5900"
# Generate a random VNC password if it doesn't exist
VNC_PW_FILE="/app/data/vnc_password.txt"
if [ ! -f "$VNC_PW_FILE" ]; then
  # Use openssl to generate a secure random password
  openssl rand -base64 12 > "$VNC_PW_FILE"
fi
VNC_PW=$(cat "$VNC_PW_FILE")

# Wait for Xvfb's socket to be ready before starting x11vnc
for _ in {1..50}; do
  if [ -e "/tmp/.X11-unix/X${DISPLAY#*:}" ]; then
    break
  fi
  sleep 0.1
done

# Secure x11vnc:
# 1. -localhost: Only allow connections from localhost (websockify)
# 2. -passwd: Use the generated password
# 3. -rfbport 5900: Listen on the default VNC port
X11VNC_OPTS="-display $DISPLAY -forever -shared -localhost -passwd \"$VNC_PW\" -rfbport 5900 -wait 5"
(
  set +e
  while true; do
    echo "[vnc] ($(date -u +%FT%TZ)) launching x11vnc" >> /app/data/x11vnc.log
    x11vnc $X11VNC_OPTS >> /app/data/x11vnc.log 2>&1
    echo "[vnc] ($(date -u +%FT%TZ)) x11vnc exited, restarting in 1s" >> /app/data/x11vnc.log
    sleep 1
  done
) &

NOVNC_DIR="/opt/novnc"
if [ ! -d "$NOVNC_DIR" ]; then
  echo "[vnc] noVNC not found, downloading..."
  mkdir -p /opt/novnc
  if curl -fsSL https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz \
    | tar -xz --strip-components=1 -C /opt/novnc; then
    NOVNC_DIR="/opt/novnc"
  elif [ -d "/usr/share/novnc" ]; then
    NOVNC_DIR="/usr/share/novnc"
  fi
fi

echo "[vnc] Serving noVNC on 0.0.0.0:54311"
pkill -f websockify >/dev/null 2>&1 || true
pkill -f novnc_proxy >/dev/null 2>&1 || true
NOVNC_PROXY="$NOVNC_DIR/utils/novnc_proxy"
if [ -x "$NOVNC_PROXY" ]; then
  "$NOVNC_PROXY" --web "$NOVNC_DIR" --listen 0.0.0.0:54311 --vnc 127.0.0.1:5900 --heartbeat 30 --idle-timeout 0 >> /app/data/novnc.log 2>&1 &
elif command -v websockify >/dev/null 2>&1; then
  for _ in {1..50}; do
    if bash -c "echo > /dev/tcp/127.0.0.1/5900" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done

  (
    while true; do
      websockify --web "$NOVNC_DIR" 0.0.0.0:54311 127.0.0.1:5900 >> /app/data/novnc.log 2>&1
      sleep 1
    done
  ) &
else
  echo "[vnc] websockify not found" >> /app/data/novnc.log
fi

echo "[vnc] Starting server"
exec node /app/server.js
