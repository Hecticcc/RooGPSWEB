#!/usr/bin/env bash
# RooGPS JT808 ingest only (GAT24 / binary TCP) - Vultr Startup Script
# Paste into Vultr: Server > Settings > Startup Script. Edit variables below.
# Does NOT install line ingest (8011) or web app. Isolated from scripts/vultr-startup.sh.
# Code: CODE_ZIP_URL or private Git clone (same pattern as main startup script).

set -e

# ========== EDIT THIS BLOCK BEFORE YOU SAVE IN VULTR ==========
#
# 1) On the line that says PASTE_SERVICE_ROLE_KEY_HERE - delete that text and put your
#    real key inside the quotes. Same key as your other ingest server. Get it from:
#    Supabase -> Project Settings -> API -> service_role (secret)
#
# 2) Get the repo onto the server - pick ONE:
#    - Leave CODE_ZIP_URL empty and put your GitHub PAT as base64 in GITHUB_PAT_B64, OR
#    - Put a zip download URL in CODE_ZIP_URL and leave GITHUB_PAT_B64 empty.
#
SUPABASE_URL="https://emkgmhhdjjsdngzrpwop.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="PASTE_SERVICE_ROLE_KEY_HERE"

CODE_ZIP_URL=""
GITHUB_PAT_B64=""

GIT_REPO_OWNER="Hecticcc"
GIT_REPO_NAME="RooGPSWEB"
GIT_BRANCH="main"
INGEST_JT808_PORT="8012"
HEALTH_JT808_PORT="8091"
INGEST_JT808_SERVER_NAME="GAT24-test"
JT808_AUTH_CODE="123456"
REPO_DIR="/opt/roogps-jt808"
# ========== END EDIT ==========

if [[ "$SUPABASE_SERVICE_ROLE_KEY" == "PASTE_SERVICE_ROLE_KEY_HERE" ]]; then
  echo "Error: You must edit SUPABASE_SERVICE_ROLE_KEY above - replace PASTE_SERVICE_ROLE_KEY_HERE with your real Supabase service role key."
  exit 1
fi

if [[ -z "$CODE_ZIP_URL" ]]; then
  if [[ -n "$GITHUB_PAT_B64" ]]; then
    GITHUB_PAT=$(echo "$GITHUB_PAT_B64" | base64 -d 2>/dev/null || true)
    if [[ -z "$GITHUB_PAT" ]]; then
      echo "Error: GITHUB_PAT_B64 set but decode failed. Use: echo -n YOUR_TOKEN | base64 -w0"
      exit 1
    fi
    GIT_REPO_URL="https://${GITHUB_PAT}@github.com/${GIT_REPO_OWNER}/${GIT_REPO_NAME}.git"
  else
    echo "Error: Set CODE_ZIP_URL to a zip of the repo, or set GITHUB_PAT_B64 (base64 of GitHub PAT) for clone."
    exit 1
  fi
fi

INGEST_DIR="$REPO_DIR/ingest"
SERVICE_USER="root"
if id -u ubuntu &>/dev/null; then
  SERVICE_USER="ubuntu"
fi

export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

echo "=== RooGPS JT808 ingest only - Vultr first-boot ==="

echo "[1/7] Apt: curl, unzip, git if needed..."
apt-get update -qq
apt-get install -y curl unzip
if [[ -z "$CODE_ZIP_URL" ]]; then
  apt-get install -y git
fi

echo "[2/7] Node.js LTS..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs

echo "[3/7] Repo to $REPO_DIR..."
mkdir -p "$(dirname "$REPO_DIR")"
if [[ -n "$CODE_ZIP_URL" ]]; then
  TMP_ZIP="/tmp/roogps-jt808.zip"
  TMP_EXT="/tmp/roogps_jt808_extract"
  rm -rf "$TMP_EXT"
  mkdir -p "$TMP_EXT"
  curl -fsSL "$CODE_ZIP_URL" -o "$TMP_ZIP"
  unzip -q -o "$TMP_ZIP" -d "$TMP_EXT"
  rm -f "$TMP_ZIP"
  SUBDIR=$(find "$TMP_EXT" -maxdepth 1 -type d ! -path "$TMP_EXT" | head -1)
  if [[ -n "$SUBDIR" && -f "$SUBDIR/package.json" && -d "$SUBDIR/ingest" ]]; then
    rm -rf "$REPO_DIR"
    mv "$SUBDIR" "$REPO_DIR"
  elif [[ -f "$TMP_EXT/package.json" && -d "$TMP_EXT/ingest" ]]; then
    rm -rf "$REPO_DIR"
    mv "$TMP_EXT" "$REPO_DIR"
  else
    echo "Error: Zip must contain package.json and ingest/ at top level or in one subfolder."
    exit 1
  fi
  rm -rf "$TMP_EXT"
else
  if [[ -d "$REPO_DIR/.git" ]]; then
    cd "$REPO_DIR" && git fetch && git checkout -q "$GIT_BRANCH" && git pull -q || true
    cd - >/dev/null
  else
    rm -rf "$REPO_DIR"
    git clone -b "$GIT_BRANCH" --depth 1 "$GIT_REPO_URL" "$REPO_DIR"
  fi
fi

echo "[4/7] npm install + build (ingest only)..."
cd "$INGEST_DIR"
npm install
npm run build

echo "[5/7] ingest/.env (JT808 only)..."
{
  cat << EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
INGEST_JT808_HOST=0.0.0.0
INGEST_JT808_PORT=$INGEST_JT808_PORT
HEALTH_JT808_PORT=$HEALTH_JT808_PORT
INGEST_JT808_SERVER_NAME=$INGEST_JT808_SERVER_NAME
JT808_AUTH_CODE=$JT808_AUTH_CODE
REQUIRE_DEVICE_PREEXIST=true
LOG_LEVEL=info
MAX_SOCKET_BUFFER_BYTES=1048576
LOG_MAX_PER_SEC=20
SUPABASE_RETRIES=3
EOF
} > "$INGEST_DIR/.env"
chmod 600 "$INGEST_DIR/.env"
chown -R "$SERVICE_USER:$SERVICE_USER" "$REPO_DIR"

echo "[6/7] ufw: SSH + JT808 + health only..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow "${INGEST_JT808_PORT}/tcp" comment 'RooGPS JT808 ingest'
ufw allow "${HEALTH_JT808_PORT}/tcp" comment 'RooGPS JT808 health'
ufw --force enable
ufw status

echo "[7/7] systemd: roogps-ingest-jt808..."
NODE_PATH=$(command -v node)
tee /etc/systemd/system/roogps-ingest-jt808.service > /dev/null << SVCEOF
[Unit]
Description=RooGPS JT808 TCP Ingest (standalone)
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
ExecStart=$NODE_PATH dist/jt808-server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable roogps-ingest-jt808
systemctl start roogps-ingest-jt808

echo ""
echo "=== RooGPS JT808 ingest ready (isolated) ==="
echo "Repo:    $REPO_DIR"
echo "TCP:     0.0.0.0:$INGEST_JT808_PORT"
echo "Health:  http://$(curl -s ifconfig.me 2>/dev/null || echo SERVER_IP):$HEALTH_JT808_PORT/"
echo "Server:  $INGEST_JT808_SERVER_NAME"
echo "Check:   systemctl status roogps-ingest-jt808"
echo "Line ingest (8011) was not installed. Main script: scripts/vultr-startup.sh"
