#!/usr/bin/env bash
set -e

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
INGEST_DIR="$REPO_DIR/ingest"
INGEST_PORT="${INGEST_PORT:-8011}"
HEALTH_PORT="${HEALTH_PORT:-8090}"
SERVICE_USER="${SUDO_USER:-$USER}"

# Ingest server name (e.g. Skippy, Joey). Defaults to first part of hostname with capital.
# Override: INGEST_SERVER_NAME=Joey ./scripts/deploy-ingest-vultr.sh
if [[ -z "${INGEST_SERVER_NAME:-}" ]]; then
  HOST_FIRST=$(hostname -s 2>/dev/null | cut -d'-' -f1)
  if [[ -n "$HOST_FIRST" ]]; then
    INGEST_SERVER_NAME="$(echo "${HOST_FIRST:0:1}" | tr '[:lower:]' '[:upper:]')${HOST_FIRST:1}"
  fi
fi

if [[ ! -d "$INGEST_DIR" ]]; then
  echo "Error: ingest directory not found at $INGEST_DIR. Set REPO_DIR or run from repo root."
  exit 1
fi

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "Error: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running."
  echo "Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... ./scripts/deploy-ingest-vultr.sh"
  exit 1
fi

echo "=== RooGPS Ingest - Vultr VPS deploy ==="
echo "Repo:    $REPO_DIR"
echo "Ingest:  $INGEST_DIR"
echo "Server:  ${INGEST_SERVER_NAME:-(not set)}"
echo "Ports:   TCP $INGEST_PORT (ingest), TCP $HEALTH_PORT (health)"
echo "User:    $SERVICE_USER"
echo ""

echo "[1/6] Installing Node.js LTS (if missing)..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "  Node $(node -v) already installed."
fi

echo "[2/6] Installing dependencies and building ingest..."
cd "$REPO_DIR"
npm install
npm run build:ingest

echo "[3/6] Creating ingest/.env..."
{
  cat << EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
INGEST_HOST=0.0.0.0
INGEST_PORT=$INGEST_PORT
REQUIRE_DEVICE_PREEXIST=true
LOG_LEVEL=info
HEALTH_PORT=$HEALTH_PORT
MAX_SOCKET_BUFFER_BYTES=1048576
LOG_MAX_PER_SEC=20
SUPABASE_RETRIES=3
DEVICE_TIMEZONE=Australia/Melbourne
EOF
  [[ -n "${INGEST_SERVER_NAME:-}" ]] && echo "INGEST_SERVER_NAME=$INGEST_SERVER_NAME"
} > "$INGEST_DIR/.env"
chmod 600 "$INGEST_DIR/.env"
echo "  Created $INGEST_DIR/.env"
if [[ -n "$SUDO_USER" ]]; then
  sudo chown -R "$SUDO_USER:$SUDO_USER" "$INGEST_DIR"
  echo "  Set ingest dir owner to $SUDO_USER"
fi

echo "[4/6] Configuring firewall (ufw)..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow "${INGEST_PORT}/tcp" comment 'RooGPS ingest'
sudo ufw allow "${HEALTH_PORT}/tcp" comment 'RooGPS health'
sudo ufw --force enable
sudo ufw status

echo "[5/6] Creating systemd service..."
SVC_ENV_LINE=""
[[ -n "${INGEST_SERVER_NAME:-}" ]] && SVC_ENV_LINE="Environment=INGEST_SERVER_NAME=$INGEST_SERVER_NAME"
sudo tee /etc/systemd/system/roogps-ingest.service > /dev/null << SVCEOF
[Unit]
Description=RooGPS TCP Ingest
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INGEST_DIR
Environment=NODE_ENV=production
EnvironmentFile=$INGEST_DIR/.env
$SVC_ENV_LINE
ExecStart=$(command -v node) dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

echo "[6/6] Enabling and starting roogps-ingest..."
sudo systemctl daemon-reload
sudo systemctl enable roogps-ingest
sudo systemctl restart roogps-ingest

echo ""
echo "=== Done ==="
echo "Service:  roogps-ingest"
echo "Server:   ${INGEST_SERVER_NAME:-(not set)}"
echo "Ingest:   0.0.0.0:$INGEST_PORT (TCP)"
echo "Health:   http://localhost:$HEALTH_PORT/health"
echo ""
echo "Commands:"
echo "  sudo systemctl status roogps-ingest"
echo "  sudo journalctl -u roogps-ingest -f"
echo "  curl http://localhost:$HEALTH_PORT/health"
echo ""
echo "Point your GPS GPRS server to this machine's public IP and port $INGEST_PORT."
