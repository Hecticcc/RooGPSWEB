# Alerts send-pending: external cron (avoid pg_net OOM)

If the Supabase cron job fails with **"Out of memory"** when inserting into `net.http_request_queue`, use an external service to call the endpoint every 2 minutes instead.

## 1. Unschedule the Supabase cron

In Supabase SQL Editor run:

```sql
select cron.unschedule('alerts-send-pending');
```

## 2. Call the endpoint from outside

**URL:** `https://YOUR_APP_URL/api/internal/alerts/send-pending`  
**Method:** POST  
**Header:** `Authorization: Bearer YOUR_CRON_SECRET`  
**Schedule:** Every 2 minutes (e.g. `*/2 * * * *`)

Use the same `CRON_SECRET` value as in your Netlify (or app) environment variables.

### Option A: cron-job.org

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Create a new cron job:
   - **URL:** `https://musical-beignet-540a9c.netlify.app/api/internal/alerts/send-pending` (use your real app URL).
   - **Schedule:** Every 2 minutes.
   - **Request method:** POST.
   - **Request headers:** Add `Authorization` = `Bearer YOUR_CRON_SECRET` (replace with your real secret).

### Option B: Netlify scheduled function

You can trigger a Netlify function on a schedule (e.g. via Netlify’s cron or an external cron that hits a small “trigger” endpoint) which then calls your send-pending API with the secret.

### Option C: Other cron services

Any service that can HTTP POST to your URL with the `Authorization: Bearer YOUR_CRON_SECRET` header every 2 minutes will work (e.g. EasyCron, GitHub Actions scheduled workflow).

## 3. Fix the URL if you keep using Supabase cron

If you prefer to keep using the Supabase cron, the URL **must** include `https://`:

- **Wrong:** `musical-beignet-540a9c.netlify.app/api/internal/alerts/send-pending`
- **Correct:** `https://musical-beignet-540a9c.netlify.app/api/internal/alerts/send-pending`

Even with the correct URL, pg_net on Supabase can still hit memory limits; external cron is the reliable fix.
