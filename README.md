# RooGPS

Web dashboard (Next.js + Supabase) and TCP ingest service for GPS trackers (iStartek PT60-L).

## Structure

- `/web` – Next.js app (Netlify + Supabase)
- `/ingest` – Node.js TCP ingest (Vultr VPS)

The repo uses **npm workspaces**. Install from the root once; scripts run both apps from the root.

## Run locally (from repo root)

```bash
npm install
```

Then:

- **Web only:** `npm run dev:web`
- **Ingest only:** `npm run dev:ingest`
- **Both:** `npm run dev` (runs web and ingest concurrently)

Configure env before running:

- **Web:** copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`.
- **Ingest:** copy `ingest/.env.example` to `ingest/.env` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `INGEST_PORT`, `HEALTH_PORT`, etc.).

## Supabase setup

1. Create a project at https://supabase.com
2. In Project Settings > API: copy **Project URL** and **anon** key for the web app; copy **service_role** key for the ingest service only (never in browser).
3. Run the SQL migrations:
   - Open SQL Editor in Supabase Dashboard
   - Run each file in `/web/supabase/migrations/` in order (by filename), or use Supabase CLI from `/web`: `npx supabase db push` if you have Supabase CLI linked

## Web app (Netlify + Supabase)

### Run locally

From repo root: `npm run dev:web` (or `npm run dev` to run web + ingest). Ensure `web/.env.local` exists with Supabase and Mapbox vars (see above).

### Deploy to Netlify

1. Connect the repo; set base directory to `web`.
2. Build command: `npm run build` (or `npx next build`).
3. Publish directory: `.next` for Next.js runtime, or use Netlify’s Next.js plugin (auto-detected).
4. In Site settings > Environment variables add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_MAPBOX_TOKEN`
5. For the **admin backend** (optional): add `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never exposed to the client) and `INGEST_HEALTH_URL` (e.g. `http://your-ingest-vps:8090`) so admin dashboard and ingest pages can show stats and deadletter. Without these, the app still runs; admin routes will return 503 or show “not configured”.

## Admin backend

The app has a protected **Admin** section at `/admin` for staff and above. Roles are stored in `user_roles` (see migration `20250224000001_user_roles.sql`).

### Roles and permissions

| Role         | Hierarchy | Access |
|-------------|-----------|--------|
| Customer    | 0         | Normal app only (dashboard, devices, alerts). No admin. |
| Staff       | 1         | **Read-only** admin: dashboard stats, users list, devices list, device detail, ingest deadletter, system status. |
| StaffPlus   | 2         | Staff + **write**: change user role (except to/from Administrator), reassign device, disable device ingest, force mark device offline. |
| Administrator | 3      | Full access: change any role, disable/delete user, delete device + history, system toggles (maintenance mode, ingest accept/reject), trigger retention cleanup. |

- **Role guard:** `requireRole(request, minRole)` in `web/lib/admin-auth.ts` is used in all admin API routes. Admin pages check role via `/api/me` and redirect if not Staff+.
- **Server enforcement:** Admin APIs use the service role client only on the server; role is always checked from `user_roles` before any privileged action.
- **RLS:** `user_roles` is protected by RLS (users read own row; only Administrator can update roles). Admin APIs use the service role key and do not rely on client role alone.

### Admin routes

| Path | Purpose |
|------|--------|
| `/admin` | Redirects to `/admin/dashboard`. |
| `/admin/dashboard` | At-a-glance: total users/devices, online/offline, locations 24h, deadletter count, ingest health. |
| `/admin/users` | User list (email, role, created, device count, last login). StaffPlus: change role (except Admin). Administrator: change any role, disable user, delete user. |
| `/admin/devices` | Device list with filters (online/offline/unassigned/low battery). Link to device detail. |
| `/admin/devices/[deviceId]` | Device metadata, owner, last 20 raw payloads (parsed fields + battery). Actions: reassign, disable ingest, force offline; Administrator: delete device + history. |
| `/admin/ingest` | Ingest health JSON, deadletter log (unknown device IDs). Copy raw payload, claim device to user. |
| `/admin/system` | Supabase/ingest status, app version, env. Administrator: toggle maintenance mode, toggle ingest accept, trigger retention cleanup. |

### Environment (admin)

- **Web:** `SUPABASE_SERVICE_ROLE_KEY` – required for admin API routes (server-only).  
- **Web:** `INGEST_HEALTH_URL` – base URL of ingest health server (e.g. `http://vps:8090`) for dashboard stats and ingest/deadletter pages.  
- **Web:** `ADMIN_RETENTION_DAYS` – optional; default 90 for retention cleanup job.  
- **Web:** `NEXT_PUBLIC_APP_VERSION`, `GIT_COMMIT_SHA` (or `VERCEL_GIT_COMMIT_SHA`) – optional; shown on admin System page.

### Database (admin)

- Migration `20250228000001_admin_system_and_ingest_disabled.sql`: adds `devices.ingest_disabled` and table `system_settings` (maintenance_mode, ingest_accept). Ingest service respects these when writing locations.

## Ingest service (Vultr VPS)

### Run locally

From repo root: `npm run dev:ingest` (or `npm run dev` to run web + ingest). Ensure `ingest/.env` exists (see above). For production build: `npm run build:ingest` then run from `ingest`: `node dist/index.js`.

Test with: from `ingest`, `npx ts-node scripts/send-sample.ts` (or run `npm run dev:ingest` and the script in another terminal).

### Deploy to Vultr without GitHub

**Option 1 – Zip from Supabase Storage (no Git)**  
1. Zip the repo (from repo root; zip should contain `package.json` and `ingest/` at top level or in one subfolder).  
2. In Supabase: Storage → create a bucket (e.g. `deploy`) → upload the zip → get a public or signed URL.  
3. In Vultr: create a server, add a **Startup Script**. Paste `scripts/vultr-startup.sh`, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and **`CODE_ZIP_URL`** to the zip URL. Leave `GIT_REPO_URL` empty.  
4. Deploy. The script will download the zip, unzip, install Node, build, configure firewall, and start the service.

**Option 2 – Deploy from your machine (no Git, no zip)**  
1. Create a VPS on Vultr (e.g. Ubuntu), open SSH (port 22).  
2. First-time setup on the VPS: copy the repo to the server (e.g. `rsync` or SCP), then SSH in and run:  
   `cd /opt/roogps && sudo REPO_DIR=/opt/roogps SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/deploy-ingest-vultr.sh`  
   (Or run `scripts/deploy-ingest-from-local.sh` from your laptop with `VPS_IP`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set; it rsyncs the repo and builds. Then SSH in once and run the deploy script to set up ufw and systemd.)  
3. For later updates, from your machine:  
   `VPS_IP=1.2.3.4 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/deploy-ingest-from-local.sh`  
   This syncs the repo and restarts the ingest (no GitHub needed).

**Option 3 – Startup script with Git clone**  
If you use GitHub: paste `scripts/vultr-startup.sh` into Vultr, set `GIT_REPO_URL` (and optionally `GIT_BRANCH`). The script will clone the repo at first boot.

### Deploy to Vultr (automated, SSH)

From your machine, copy the repo to the VPS (e.g. `rsync` or `git clone`), then on the VPS:

```bash
cd /path/to/RooGPSWEB
chmod +x scripts/deploy-ingest-vultr.sh
SUPABASE_URL=https://YOUR_PROJECT.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... sudo ./scripts/deploy-ingest-vultr.sh
```

The script installs Node.js LTS (if needed), builds the ingest, creates `ingest/.env`, configures **ufw** (SSH 22, ingest 8011, health 8090), and installs the **systemd** service. Optional env: `INGEST_PORT`, `HEALTH_PORT`, `REPO_DIR`.

### Deploy to Vultr (manual)

1. Create a VPS (e.g. Ubuntu); SSH in.
2. Install Node.js (e.g. LTS via NodeSource or nvm).
3. Clone repo; from root run `npm install`, then `npm run build:ingest` (or from `ingest`: `npm run build`).
4. Create `ingest/.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_PORT`, `HEALTH_PORT`, etc.
5. **Firewall (ufw best practice):**
   - Default deny incoming, allow outgoing; allow SSH first so you don’t lock yourself out:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow 22/tcp
   sudo ufw allow 8011/tcp
   sudo ufw allow 8090/tcp
   sudo ufw enable
   sudo ufw status
   ```
   - Replace `8011`/`8090` with your `INGEST_PORT`/`HEALTH_PORT` if different.
6. **systemd service** with a safe restart policy (avoid restart loops). Create `/etc/systemd/system/roogps-ingest.service`:

```ini
[Unit]
Description=RooGPS TCP Ingest
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/repo/ingest
Environment=NODE_ENV=production
EnvironmentFile=/path/to/repo/ingest/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
```

- `Restart=on-failure`: restart only on non-zero exit or signals, not on clean shutdown.
- `StartLimitIntervalSec=300` and `StartLimitBurst=5`: allow at most 5 restarts in 5 minutes; after that systemd stops trying and you get a failed state to investigate.

Then: `sudo systemctl daemon-reload`, `sudo systemctl enable roogps-ingest`, `sudo systemctl start roogps-ingest`.

**Production behaviour:** Unknown devices (when `REQUIRE_DEVICE_PREEXIST=true`) are written to `ingest/data/deadletter.log`. If Supabase insert fails after retries, the raw line is written to `ingest/data/fallback.log`. Monitor these files and the `/health` JSON (uptime, connections, inserted_rows, deadletter_writes, fallback_writes, errors) for alerts.

### ECONNRESET and overnight disconnects

The ingest health panel may show **Last error: socket error: read ECONNRESET**. That means “connection reset by peer”: the other side (the tracker or something in the network) closed the TCP connection. Common causes overnight:

- **NAT/firewall idle timeout** – No traffic for a long time; the router or carrier closes the connection. The ingest service enables **TCP keepalive** (probes after ~30s idle) to reduce this.
- **Device sleep / power saving** – The tracker closes the connection or loses power; when it wakes or reconnects, it will open a new connection and send data again.
- **Carrier or network drop** – Mobile networks can tear down idle connections.

When the connection is reset, no new location or battery data is written until the device connects again and sends a new message. So “GPS comes online” (device reconnects) is correct; position and battery % will only update when the next packet is received and inserted. Battery is stored in `locations.extra.battery` from the same IStartek packet as the position; if you see position updates but not battery, the device may be sending some report types without battery in the payload.

## PT60-L configuration

- GPRS mode: TCP (not UDP).
- Report mode: “No needs server’s confirmation” (or equivalent so it doesn’t wait for ACK).
- Server: set to the Vultr public IP of the VPS.
- Port: same as `INGEST_PORT` (e.g. 8011).

After saving, the device will connect to the ingest service and locations will appear in the web app for that device (after the device is added under Devices).
