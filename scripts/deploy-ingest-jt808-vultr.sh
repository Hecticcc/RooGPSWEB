#!/usr/bin/env bash
# Optional second ingest: JT808 binary TCP (e.g. GAT24). Does not modify roogps-ingest (line ingest).
set -e

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
INGEST_DIR="$REPO_DIR/ingest"
INGEST_JT808_PORT="${INGEST_JT808_PORT:-8012}"
HEALTH_JT808_PORT="${HEALTH_JT808_PORT:-8091}"
SERVICE_USER="${SUDO_USER:-$USER}"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Error: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running."
  echo "Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... ./scripts/deploy-ingest-jt808-vultr.sh"
  exit 1
fi

if [[ ! -d "$INGEST_DIR" ]]; then
  echo "Error: ingest directory not found at $INGEST_DIR"
  exit 1
fi

echo "=== RooGPS JT808 ingest (parallel) - Vultr VPS ==="
echo "Repo:     $REPO_DIR"
echo "TCP:      $INGEST_JT808_PORT"
echo "Health:   $HEALTH_JT808_PORT"
echo ""

echo "[1/5] Build ingest..."
cd "$REPO_DIR"
npm install
npm run build --prefix ingest

echo "[2/5] Append JT808 env to ingest/.env (merge-safe)..."
touch "$INGEST_DIR/.env"
if ! grep -q '^INGEST_JT808_PORT=' "$INGEST_DIR/.env" 2>/dev/null; then
  {
    echo ""
    echo "# --- JT808 parallel ingest (added by deploy-ingest-jt808-vultr.sh) ---"
    echo "INGEST_JT808_PORT=$INGEST_JT808_PORT"
    echo "HEALTH_JT808_PORT=$HEALTH_JT808_PORT"
    echo "INGEST_JT808_SERVER_NAME=${INGEST_JT808_SERVER_NAME:-GAT24-test}"
    echo "JT808_AUTH_CODE=${JT808_AUTH_CODE:-123456}"
  } >> "$INGEST_DIR/.env"
  echo "  Appended JT808 variables to $INGEST_DIR/.env"
else
  echo "  ingest/.env already contains INGEST_JT808_PORT; not appending defaults."
fi

# Ensure Supabase vars exist in .env (user may only export in shell)
if ! grep -q '^SUPABASE_URL=' "$INGEST_DIR/.env" 2>/dev/null; then
  echo "SUPABASE_URL=$SUPABASE_URL" >> "$INGEST_DIR/.env"
fi
if ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=' "$INGEST_DIR/.env" 2>/dev/null; then
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" >> "$INGEST_DIR/.env"
fi
chmod 600 "$INGEST_DIR/.env"

echo "[3/5] Firewall (ufw) — allow JT808 + health ports..."
if command -v ufw &>/dev/null; then
  sudo ufw allow "${INGEST_JT808_PORT}/tcp" comment 'RooGPS JT808 ingest' || true
  sudo ufw allow "${HEALTH_JT808_PORT}/tcp" comment 'RooGPS JT808 health' || true
  sudo ufw status | head -20 || true
else
  echo "  ufw not found; open ports $INGEST_JT808_PORT and $HEALTH_JT808_PORT manually."
fi

echo "[4/5] systemd unit roogps-ingest-jt808.service..."
SVC_ENV=""
[[ -n "${INGEST_JT808_SERVER_NAME:-}" ]] && SVC_ENV="Environment=INGEST_JT808_SERVER_NAME=$INGEST_JT808_SERVER_NAME"
sudo tee /etc/systemd/system/roogps-ingest-jt808.service > /dev/null << SVCEOF
[Unit]
Description=RooGPS JT808 TCP Ingest (parallel)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INGEST_DIR
Environment=NODE_ENV=production
EnvironmentFile=$INGEST_DIR/.env
$SVC_ENV
ExecStart=$(command -v node) dist/jt808-server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

echo "[5/5] Enable and start..."
sudo systemctl daemon-reload
sudo systemctl enable roogps-ingest-jt808
sudo systemctl restart roogps-ingest-jt808

echo ""
echo "=== Done ==="
echo "Service:  roogps-ingest-jt808"
echo "TCP:      0.0.0.0:$INGEST_JT808_PORT"
echo "Health:   http://localhost:$HEALTH_JT808_PORT/"
echo ""
echo "  sudo systemctl status roogps-ingest-jt808"
echo "  curl -s http://127.0.0.1:$HEALTH_JT808_PORT/ | jq ."
echo ""
echo "Main line ingest (8011) is unchanged. See docs/jt808-ingest.md."
