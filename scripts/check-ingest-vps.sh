#!/usr/bin/env bash
# Run this script ON the VPS (e.g. after SSH) to check if the ingest is running and receiving data.
# Usage: bash check-ingest-vps.sh   or   ./check-ingest-vps.sh

set -e

SERVICE_NAME="${ROOGPS_SERVICE:-roogps-ingest}"
INGEST_PORT="${INGEST_PORT:-8011}"
HEALTH_PORT="${HEALTH_PORT:-8090}"

echo "=============================================="
echo "  RooGPS Ingest – VPS check"
echo "=============================================="
echo ""

echo "1) Service status"
echo "-------------------"
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  echo "   $SERVICE_NAME: RUNNING"
else
  echo "   $SERVICE_NAME: NOT RUNNING (start with: sudo systemctl start $SERVICE_NAME)"
  systemctl status "$SERVICE_NAME" 2>/dev/null || true
fi
echo ""

echo "2) Ports listening (ingest TCP $INGEST_PORT, health HTTP $HEALTH_PORT)"
echo "-------------------"
if command -v ss &>/dev/null; then
  ss -tlnp 2>/dev/null | grep -E ":$INGEST_PORT |:$HEALTH_PORT " || echo "   No process found on $INGEST_PORT or $HEALTH_PORT"
else
  netstat -tlnp 2>/dev/null | grep -E ":$INGEST_PORT |:$HEALTH_PORT " || echo "   (ss/netstat not available)"
fi
echo ""

echo "3) Health endpoint (localhost:$HEALTH_PORT)"
echo "-------------------"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$HEALTH_PORT" 2>/dev/null || echo "000")
if [[ "$HEALTH" == "200" ]]; then
  echo "   HTTP 200 OK"
  curl -s "http://127.0.0.1:$HEALTH_PORT" 2>/dev/null | head -c 500
  echo ""
else
  echo "   Failed (HTTP $HEALTH). Is the service running?"
fi
echo ""
echo ""

echo "4) Recent logs (last 20 lines)"
echo "-------------------"
journalctl -u "$SERVICE_NAME" -n 20 --no-pager 2>/dev/null || echo "   (journalctl not available or no logs)"
echo ""

echo "5) Firewall (ufw) – ingest and health ports should be allowed"
echo "-------------------"
if command -v ufw &>/dev/null; then
  ufw status 2>/dev/null | grep -E "Status|$INGEST_PORT|$HEALTH_PORT" || ufw status
else
  echo "   ufw not installed"
fi
echo ""

echo "=============================================="
echo "  What to look for"
echo "=============================================="
echo "  • parsed_lines / inserted_rows increasing => ingest is receiving and storing data"
echo "  • rejected_unknown_device > 0 => device ID not in dashboard; add the device first"
echo "  • errors > 0 => check logs and Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
echo "  • GPS must send to this server IP, port $INGEST_PORT, format: &&DEVICE_ID,...\\r\\n"
echo "  • From your PC, test health: curl http://YOUR_VPS_IP:$HEALTH_PORT"
echo ""
