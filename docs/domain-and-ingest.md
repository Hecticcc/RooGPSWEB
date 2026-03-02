# Domain change (roogps.com) and GPS ingest

## Why GPS trackers stopped pinging after changing to roogps.com

Changing your **Netlify** site to use **roogps.com** only affects the **website** (dashboard, login, admin). It does **not** change where the ingest service runs or what the ingest code does.

GPS trackers send location data over **raw TCP** to a **host + port** that is **stored in each device**. You set that with the Tracker Toolkit command **Set server host+port** (e.g. `0000,100,1,<host>,<port>`).

- **Ingest** = separate Node.js TCP server (e.g. on your Vultr VPS). It listens on **port 8011** (configurable via `INGEST_PORT`). It is **not** on Netlify.
- **Netlify** = only serves the web app (HTTP/HTTPS). It does **not** accept TCP connections on port 8011.

So if your trackers were configured with a hostname that **now points to Netlify** (e.g. you pointed `roogps.com` to Netlify), they are trying to open a TCP connection to Netlify on port 8011. Netlify will not accept that, so the trackers get no connection and stop pinging.

**Conclusion:** The ingest app itself does **not** need to be updated for the domain change. The **trackers** need to be pointed at the **ingest server** (your VPS), not at the web domain.

---

## What to do

1. **Use a hostname or IP that points to the ingest server**
   - Option A: Use the **VPS IP** where the ingest runs (e.g. `123.45.67.89`) and port **8011**.
   - Option B: Use a **subdomain** for ingest (e.g. `ingest.roogps.com`) and point that DNS A record to the **same VPS IP**. Then use host `ingest.roogps.com` and port **8011** in the trackers.

2. **Reconfigure each tracker**
   - In **Admin → Devices → [device] → Tracker Toolkit**, open the **Commands** tab.
   - Under **Advanced (SET)**, set **Server host** to your ingest host (e.g. `ingest.roogps.com` or the VPS IP) and **Port** to **8011**.
   - Confirm and send the command. Repeat for each device (or only those that were using the old hostname).

3. **Keep the ingest service running on the VPS**
   - The ingest runs on the VPS (e.g. `INGEST_PORT=8011`, `HEALTH_PORT=8090`). No code or config change is required there for the roogps.com domain change.
   - Ensure the VPS firewall allows **inbound TCP 8011** so trackers can connect.

4. **Web app env (Netlify)**
   - **INGEST_HEALTH_URL** should point to the **ingest health endpoint** (HTTP), e.g. `http://your-vps-ip:8090` or `http://ingest.roogps.com` if you put a reverse proxy in front of the VPS. This is only used by the admin dashboard to show ingest status; it does not affect the trackers. No change needed unless the previous value no longer reaches the VPS.

---

## Summary

| Component              | Role                         | Affected by roogps.com? | Action |
|------------------------|------------------------------|-------------------------|--------|
| Netlify (roogps.com)   | Web app only                 | Yes (that’s the new URL) | None for ingest |
| Ingest (VPS)           | TCP server on port 8011      | No                      | No update needed |
| Tracker config (per device) | Host + port for TCP       | Yes if they used the same hostname | Set host to ingest server (e.g. ingest.roogps.com or VPS IP), port 8011 |
| INGEST_HEALTH_URL      | Admin dashboard → ingest health | No (should stay as ingest server URL) | Set to ingest health URL (e.g. http://vps:8090) |
