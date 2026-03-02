# Checking ingest data on the VPS

Ways to see what the ingest is receiving and doing on the server.

---

## 1. Ingest application logs

The ingest writes **JSON lines** to **stdout** (e.g. `{"level":"info","msg":"parsed",...}`). How you see them depends on how you run it.

### If you use systemd

```bash
# Last 100 lines, then follow
journalctl -u roogps-ingest -n 100 -f

# Or whatever your service name is, e.g.:
journalctl -u ingest -f
```

### If you use PM2

```bash
pm2 logs roogps-ingest
# or
pm2 logs 0
```

### If you run in a terminal (foreground)

```bash
cd /opt/roogps
npm run start
# or: node dist/index.js
```

Everything the ingest logs (new connections, parsed lines, errors) will appear there.

---

## 2. Verbose logging (see raw data)

To see **raw TCP data** as it arrives (and more detail), set **LOG_LEVEL=debug** and restart the ingest.

```bash
# Example with systemd: add to the service file, or run once:
LOG_LEVEL=debug node dist/index.js
```

Or in your env file (e.g. `/opt/roogps/.env`):

```
LOG_LEVEL=debug
```

Then restart the service. You’ll get log lines like:

- `"msg":"socket data"` – each chunk received (length + first 200 chars)
- `"msg":"parsed"` – each successfully parsed line (device, lat, lon, etc.)
- All errors and warnings

Revert to `LOG_LEVEL=info` when you’re done to avoid noisy logs.

---

## 3. Raw TCP traffic on port 8011 (without ingest)

To see **what is actually sent to port 8011** (even when ingest is stopped), use **tcpdump**:

```bash
# Capture packets on port 8011; print payload in hex and ASCII
sudo tcpdump -i any -A -s 0 'tcp port 8011'
```

- `-i any` – all interfaces  
- `-A` – print payload (ASCII)  
- `-s 0` – full packet  
- Stop with Ctrl+C  

To write to a file and inspect later:

```bash
sudo tcpdump -i any -w /tmp/ingest-8011.pcap 'tcp port 8011'
# Then: tcpdump -A -r /tmp/ingest-8011.pcap
```

---

## 4. Quick “is anything connecting?” check

```bash
# See if anything is connected to 8011 right now
ss -tn state established '( dport = :8011 )'
```

If you see lines, something is connected. If empty, no current connections.

---

## 5. Health endpoint (summary only)

From the VPS or your machine:

```bash
curl -s http://localhost:8090
# or
curl -s http://YOUR_VPS_IP:8090
```

You get JSON: `connections`, `inserted_rows`, `errors`, `last_error`, etc. No raw payloads.

---

## Summary

| Goal                         | Command / action                          |
|-----------------------------|-------------------------------------------|
| Live app logs               | `journalctl -u roogps-ingest -f` or PM2 logs |
| See raw data received       | Set `LOG_LEVEL=debug`, restart, watch logs |
| See TCP payloads on 8011    | `sudo tcpdump -i any -A -s 0 'tcp port 8011'` |
| See current connections     | `ss -tn state established '( dport = :8011 )'` |
