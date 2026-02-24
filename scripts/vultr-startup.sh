#!/usr/bin/env bash
# RooGPS Ingest - Vultr Startup Script
# Paste into Vultr: Server > Settings > Startup Script. Set the variables below.
# Get code either by CODE_ZIP_URL (no GitHub) or GIT_REPO_URL (clone).

set -e

# === EDIT WHEN PASTING INTO VULTR (do not commit real keys to git) ===
SUPABASE_URL="${SUPABASE_URL:-https://emkgmhhdjjsdngzrpwop.supabase.co}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-YOUR_SERVICE_ROLE_KEY}"
# Option A - No GitHub: upload a zip of the repo to Supabase Storage (or any URL), set this to the public/signed URL.
# Zip from repo root so unzip gives one folder (e.g. RooGPSWEB/) with package.json, ingest/, web/ inside.
CODE_ZIP_URL="${CODE_ZIP_URL:-}"
# Option B - Clone from Git. For private repo use GITHUB_PAT_B64 (base64 of your token).
# Create token: GitHub -> Settings -> Developer settings -> Personal access tokens (repo scope).
# Encode it locally: echo -n "github_pat_xxx" | base64 -w0  then paste below (avoids Vultr stripping raw tokens).
GITHUB_PAT_B64="${GITHUB_PAT_B64:-}"
GIT_REPO_OWNER="${GIT_REPO_OWNER:-Hecticcc}"
GIT_REPO_NAME="${GIT_REPO_NAME:-RooGPSWEB}"
GIT_BRANCH="${GIT_BRANCH:-main}"
# =======================================================

if [[ -z "$CODE_ZIP_URL" ]]; then
  if [[ -n "$GITHUB_PAT_B64" ]]; then
    GITHUB_PAT=$(echo "$GITHUB_PAT_B64" | base64 -d 2>/dev/null || true)
    if [[ -z "$GITHUB_PAT" ]]; then
      echo "Error: GITHUB_PAT_B64 is set but failed to decode. Use: echo -n YOUR_TOKEN | base64 -w0"
      exit 1
    fi
    GIT_REPO_URL="https://${GITHUB_PAT}@github.com/${GIT_REPO_OWNER}/${GIT_REPO_NAME}.git"
  else
    echo "Error: For private repo set GITHUB_PAT_B64 (base64 of token). Or set CODE_ZIP_URL."
    exit 1
  fi
fi

REPO_DIR="/opt/roogps"
INGEST_DIR="$REPO_DIR/ingest"
INGEST_PORT="${INGEST_PORT:-8011}"
HEALTH_PORT="${HEALTH_PORT:-8090}"
SERVICE_USER="root"
if id -u ubuntu &>/dev/null; then
  SERVICE_USER="ubuntu"
fi

export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

echo "=== RooGPS Ingest - Vultr first-boot setup ==="

echo "[1/7] Apt update and install curl (and git only if using clone)..."
apt-get update -qq
apt-get install -y curl unzip
if [[ -z "$CODE_ZIP_URL" ]]; then
  apt-get install -y git
fi

echo "[2/7] Installing Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs

echo "[3/7] Getting code to $REPO_DIR..."
mkdir -p "$(dirname "$REPO_DIR")"
if [[ -n "$CODE_ZIP_URL" ]]; then
  TMP_ZIP="/tmp/roogps.zip"
  TMP_EXT="/tmp/roogps_extract"
  rm -rf "$TMP_EXT"
  mkdir -p "$TMP_EXT"
  curl -fsSL "$CODE_ZIP_URL" -o "$TMP_ZIP"
  unzip -q -o "$TMP_ZIP" -d "$TMP_EXT"
  rm -f "$TMP_ZIP"
  SUBDIR=$(find "$TMP_EXT" -maxdepth 1 -type d ! -path "$TMP_EXT" | head -1)
  if [[ -n "$SUBDIR" && -f "$SUBDIR/package.json" && -d "$SUBDIR/ingest" ]]; then
    mv "$SUBDIR" "$REPO_DIR"
  elif [[ -f "$TMP_EXT/package.json" && -d "$TMP_EXT/ingest" ]]; then
    mv "$TMP_EXT" "$REPO_DIR"
  else
    echo "Error: Zip must contain package.json and ingest/ at top level or in one subfolder."
    exit 1
  fi
  rm -rf "$TMP_EXT"
else
  if [[ -d "$REPO_DIR/.git" ]]; then
    cd "$REPO_DIR" && git fetch && git checkout -q "$GIT_BRANCH" && git pull -q || true
    cd -
  else
    git clone -b "$GIT_BRANCH" --depth 1 "$GIT_REPO_URL" "$REPO_DIR"
  fi
fi

echo "[4/7] Installing dependencies and building ingest..."
cd "$REPO_DIR"
npm install
npm run build:ingest

echo "[5/7] Creating ingest/.env..."
cat > "$INGEST_DIR/.env" << EOF
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
chmod 600 "$INGEST_DIR/.env"
chown -R "$SERVICE_USER:$SERVICE_USER" "$REPO_DIR"

echo "[6/7] Configuring firewall (ufw)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow "${INGEST_PORT}/tcp" comment 'RooGPS ingest'
ufw allow "${HEALTH_PORT}/tcp" comment 'RooGPS health'
ufw --force enable
ufw status

echo "[7/7] Creating systemd service..."
NODE_PATH=$(command -v node)
tee /etc/systemd/system/roogps-ingest.service > /dev/null << EOF
[Unit]
Description=RooGPS TCP Ingest
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INGEST_DIR
Environment=NODE_ENV=production
EnvironmentFile=$INGEST_DIR/.env
ExecStart=$NODE_PATH dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable roogps-ingest
systemctl start roogps-ingest

echo ""
echo "=== RooGPS Ingest ready ==="
echo "Ingest:  0.0.0.0:$INGEST_PORT (TCP)"
echo "Health:  http://$(curl -s ifconfig.me 2>/dev/null || echo 'SERVER_IP'):$HEALTH_PORT"
echo "Check:   systemctl status roogps-ingest"
