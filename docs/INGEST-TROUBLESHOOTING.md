# RooGPS Ingest – Is the VPS receiving data?

Use these steps to check if the ingest on your VPS (Vultr) is running and receiving GPS data.

## 1. Run the check script on the VPS

SSH into your Vultr server, then run the project’s check script:

```bash
# If you have the repo on the server (e.g. /opt/roogps):
cd /opt/roogps
bash scripts/check-ingest-vps.sh
```

Or copy the script onto the server and run it. The script will show:

- Whether the **roogps-ingest** service is running
- Whether **ports 8011** (TCP ingest) and **8090** (health) are listening
- The **health endpoint** response (counts: `parsed_lines`, `inserted_rows`, `rejected_unknown_device`, `errors`)
- **Recent logs** and **firewall** status

## 2. Check health from your PC

From your own machine (replace `YOUR_VPS_IP` with the server’s public IP):

```bash
curl http://YOUR_VPS_IP:8090
```

You should get JSON like:

```json
{
  "status": "ok",
  "uptime_seconds": 12345,
  "connections": 0,
  "parsed_lines": 100,
  "inserted_rows": 98,
  "deadletter_writes": 0,
  "fallback_writes": 0,
  "rejected_unknown_device": 2,
  "errors": 0
}
```

- **`parsed_lines`** increasing over time → TCP ingest is receiving and parsing data.
- **`inserted_rows`** increasing → Data is being written to Supabase; the dashboard should show it.
- **`rejected_unknown_device`** > 0 → At least one device ID is not in your dashboard; add that device first (same ID the tracker sends).
- **`errors`** > 0 → Check service logs and Supabase env (URL and service role key).

## 3. Service and logs on the VPS

```bash
# Is the service running?
sudo systemctl status roogps-ingest

# Start / restart
sudo systemctl start roogps-ingest
sudo systemctl restart roogps-ingest

# Follow logs live
sudo journalctl -u roogps-ingest -f
```

## 4. GPS device configuration

The tracker must send data **to the VPS**:

- **IP:** Your Vultr server’s **public IP** (the same you use for SSH or for `curl http://YOUR_VPS_IP:8090`).
- **Port:** **8011** (TCP).
- **Format:** PT60-L style lines starting with `&&`, ending with `\r\n`, e.g.  
  `&&867747070319866,240223123456,A,2234.5678,N,11345.1234,E,25.5,180,0\r\n`

The **device ID** is the value the parser extracts (first or second field after `&&`, depending on format). That exact value must exist in the dashboard as the **Device ID** (not the display name). Example: if the tracker sends IMEI `867747070319866`, add a device with **Device ID** `867747070319866` and you can set the **Name** to "car" or "test2". A device with Device ID "car" will only get data if the tracker actually sends "car" in the payload (most hardware sends IMEI).

## 5. Send a test packet from the VPS

From the VPS (with the repo and ingest running), you can send one sample line to confirm TCP is working:

```bash
cd /opt/roogps/ingest
# Replace 867747070319866 with a device ID that exists in your dashboard
echo $'&&867747070319866,240223123456,A,2234.5678,N,11345.1234,E,25.5,180,0\r\n' | nc -q 1 127.0.0.1 8011
```

Then check health again: `parsed_lines` and `inserted_rows` should increase by one (and the point may appear on the map for that device).

## 6. See what the device is sending (raw lines)

On the VPS, rejected lines are appended to a deadletter file. To see the exact payload and device ID the parser read:

```bash
sudo cat /opt/roogps/ingest/data/deadletter.log
```

Each line is: `timestamp`, `device_id`, then the **raw line** from the tracker. Use this to see the real format (e.g. if device_id is `:120`, the tracker is sending that as the first field after `&&`).

After the next ingest deploy, when a device is rejected the log will also include the raw line (e.g. `"raw": "&&:120,..."`).

## 7. Fix "Unknown key name 'StartLimitIntervalSec'" on existing servers

If the ingest was installed with an older startup script, the systemd unit may still contain `StartLimitIntervalSec` / `StartLimitBurst`, which older systemd doesn’t accept. To remove the warning and use the current unit:

On the VPS:

```bash
sudo sed -i '/StartLimitIntervalSec/d; /StartLimitBurst/d' /etc/systemd/system/roogps-ingest.service
sudo systemctl daemon-reload
```

Or re-create the service from the repo (from `scripts/vultr-startup.sh` step 7) and run `systemctl daemon-reload` then `systemctl restart roogps-ingest`.

## 8. Still no data?

- Confirm the **device is added** in the dashboard (device ID must match the **first field after `&&`** in the payload).
- If the parser shows device_id `:120`, add a device with ID **`:120`** in the dashboard to test, or change the GPS to send the full IMEI as the first field.
- Confirm **firewall** on the VPS allows **TCP 8011** (e.g. `sudo ufw allow 8011/tcp` and `sudo ufw reload`).
- Confirm the **GPS device** is configured with the correct server **IP** and **port 8011**.
- Check **Supabase**: correct `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the ingest `.env` and that the `devices` and `locations` tables exist with the expected schema.

## 9. Shutdown timeout / "forcing exit"

If the ingest hits "shutdown timeout, forcing exit" when systemd stops it, the updated code closes all client TCP connections on SIGTERM so the server can shut down quickly. After pulling and redeploying, restarts should complete without the 15s timeout.
