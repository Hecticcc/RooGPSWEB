-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- 1. Replace YOUR_APP_URL with your FULL app URL INCLUDING https://
--    Example: https://musical-beignet-540a9c.netlify.app  (do not omit https://)
-- 2. Replace YOUR_CRON_SECRET with the same value as CRON_SECRET in your app env (Netlify / Vercel / etc.).
-- Requires: pg_cron and pg_net enabled (migration 20250306000001_pg_cron_pg_net_trips.sql).
--
-- If you see "Out of memory" when inserting into net.http_request_queue: pg_net on Supabase
-- has limited memory; the cron job can fail under load. Reliable fix: use an EXTERNAL cron
-- (e.g. cron-job.org or Netlify scheduled function) to POST to
--   https://YOUR_APP_URL/api/internal/alerts/send-pending
-- with header Authorization: Bearer YOUR_CRON_SECRET every 2 minutes. Then unschedule this job.

select cron.schedule(
  'alerts-send-pending',
  '*/2 * * * *',
  $$select net.http_post(
    url := 'https://musical-beignet-540a9c.netlify.app/api/internal/alerts/send-pending',
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'VMgzSn3Yk4Kh')
  ) as request_id;$$
);

-- To unschedule later: select cron.unschedule('alerts-send-pending');
