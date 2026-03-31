# JT808 parallel ingest (GAT24 and similar)

This is a **second TCP process** alongside the main line-based ingest (`ingest/dist/index.js`). It speaks **JT/T 808**–style binary frames (not `&&…` text). It writes to the **same Supabase** `locations` table when `INGEST_SERVER_NAME` / `INGEST_JT808_SERVER_NAME` is set (default label: `GAT24-test`).

## Ports (defaults)

| Service | Env | Default |
|--------|-----|--------|
| JT808 TCP | `INGEST_JT808_PORT` | 8012 |
| Health HTTP | `HEALTH_JT808_PORT` | 8091 |

## Run locally

From repo root (after `npm run build --prefix ingest`):

```bash
cd ingest
set SUPABASE_URL=...
set SUPABASE_SERVICE_ROLE_KEY=...
node dist/jt808-server.js
```

Or: `npm run start:jt808 --prefix ingest` (same as `node dist/jt808-server.js`).

## Environment

Uses the same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as the main ingest (see `ingest/.env.example`). Important JT808-specific variables:

- `INGEST_JT808_PORT` — TCP listen port for trackers.
- `HEALTH_JT808_PORT` — JSON health endpoint.
- `INGEST_JT808_SERVER_NAME` or `INGEST_SERVER_NAME` — stored on each `locations.ingest_server` row (default `GAT24-test`).
- `JT808_AUTH_CODE` — ASCII auth string in the `0x8100` registration response (default `123456`).

## Capturing traffic (Wireshark / tcpdump)

Before changing firmware or if a device misbehaves, capture bytes to confirm message IDs and field layout:

**Linux (VPS):**

```bash
sudo tcpdump -i any -nn -s0 -w /tmp/jt808.pcap tcp port 8012
```

**Windows (Wireshark):** capture on the interface that carries tracker traffic, filter `tcp.port == 8012`.

Inspect frames: payload between `0x7e` … `0x7e`, unescape `0x7d 0x01` → `0x7e`. Compare message IDs (bytes 0–1 of unescaped body) with the implementation in `ingest/src/jt808-server.ts` (`0x0100`, `0x0200`, etc.).

## Device ID in RooGPS

Register the device in Admin with **Device ID** equal to the IMEI/terminal ID the tracker sends (often from the `0x0100` body or the 12-digit BCD phone field in the header). Unknown devices are rejected when `REQUIRE_DEVICE_PREEXIST=true` (same as main ingest).

## Deploy on Vultr

### Dedicated JT808-only VPS (recommended for isolation)

Paste **[`scripts/vultr-startup-jt808.sh`](../scripts/vultr-startup-jt808.sh)** into **Server → Settings → Startup Script**. The script is pre-filled with this repo’s Supabase project URL (`emkgmhhdjjsdngzrpwop`), GitHub `Hecticcc/RooGPSWEB`, branch `main`, ports **8012** / **8091**, and server name **GAT24-test**. You must still:

1. Replace **`PASTE_SERVICE_ROLE_KEY`** with your Supabase **service role** key (Dashboard → Project Settings → API).
2. Set **`GITHUB_PAT_B64`** to the output of `echo -n 'YOUR_GITHUB_PAT' | base64 -w0` (private repo clone), **or** set **`CODE_ZIP_URL`** to a downloadable zip of the repo (then leave `GITHUB_PAT_B64` empty).

Do not commit real keys into git; edit only in the Vultr textarea before saving.

Installs to **`/opt/roogps-jt808`**, opens **8012** and **8091** only (plus SSH), runs **`roogps-ingest-jt808`** — no line ingest (8011).

### JT808 on an existing server (repo already present)

See [`scripts/deploy-ingest-jt808-vultr.sh`](../scripts/deploy-ingest-jt808-vultr.sh): firewall, `roogps-ingest-jt808.service`, `node dist/jt808-server.js`.

To **remove** the JT808 service: `sudo systemctl disable --now roogps-ingest-jt808`, remove `/etc/systemd/system/roogps-ingest-jt808.service`, `sudo ufw delete allow 8012/tcp` (and health port), `sudo systemctl daemon-reload`.
