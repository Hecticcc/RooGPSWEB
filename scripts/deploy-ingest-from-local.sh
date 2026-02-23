#!/usr/bin/env bash
# Deploy ingest to Vultr from your machine (no GitHub needed).
# Usage: VPS_USER=root VPS_IP=1.2.3.4 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/deploy-ingest-from-local.sh
# Or set the vars and run. Requires: rsync, ssh, and the VPS already has Node + ufw + systemd (run once manually or use a minimal bootstrap).

set -e

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
VPS_USER="${VPS_USER:-root}"
VPS_IP="${VPS_IP:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/roogps}"

if [[ -z "$VPS_IP" ]]; then
  echo "Error: Set VPS_IP (and optionally VPS_USER, default root)."
  echo "Example: VPS_IP=1.2.3.4 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... $0"
  exit 1
fi

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "Error: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  exit 1
fi

echo "=== Deploying ingest to $VPS_USER@$VPS_IP:$REMOTE_DIR ==="

echo "[1/3] Syncing repo (excluding node_modules, .next, .git)..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'web/.next' \
  --exclude 'web/node_modules' \
  --exclude 'ingest/node_modules' \
  --exclude 'ingest/dist' \
  --exclude '.git' \
  "$REPO_DIR/" "$VPS_USER@$VPS_IP:$REMOTE_DIR/"

echo "[2/3] Running install + build + service on VPS..."
ssh "$VPS_USER@$VPS_IP" "cd $REMOTE_DIR && npm install && npm run build:ingest"

echo "[3/3] Writing .env and restarting service..."
ssh "$VPS_USER@$VPS_IP" "cat > $REMOTE_DIR/ingest/.env << 'ENVEOF'
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
INGEST_HOST=0.0.0.0
INGEST_PORT=8011
REQUIRE_DEVICE_PREEXIST=true
LOG_LEVEL=info
HEALTH_PORT=8090
MAX_SOCKET_BUFFER_BYTES=1048576
LOG_MAX_PER_SEC=20
SUPABASE_RETRIES=3
ENVEOF
chmod 600 $REMOTE_DIR/ingest/.env
sudo systemctl restart roogps-ingest || true
"

echo "Done."
echo "First-time only: if roogps-ingest service is not set up yet, SSH in and run:"
echo "  cd $REMOTE_DIR && sudo REPO_DIR=$REMOTE_DIR SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/deploy-ingest-vultr.sh"
