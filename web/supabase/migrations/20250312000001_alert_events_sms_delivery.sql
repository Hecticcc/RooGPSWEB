-- Allow delivery of device_alert_events (WatchDog, etc.) via SMS.
-- Internal job (cron) calls API to process unsent events and send SMS.

alter table public.device_alert_events
  add column if not exists sms_sent_at timestamptz null;

comment on column public.device_alert_events.sms_sent_at is 'When an SMS was sent for this alert (null = not yet sent).';

-- Atomic increment for SMS usage when called by internal/cron (no auth.uid() check).
create or replace function public.increment_sms_usage_internal(p_user_id uuid, p_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sms_usage (user_id, period, count)
  values (p_user_id, p_period, 1)
  on conflict (user_id, period)
  do update set count = sms_usage.count + 1;
end;
$$;
comment on function public.increment_sms_usage_internal is 'Increment SMS usage (internal/cron only; no auth check).';
grant execute on function public.increment_sms_usage_internal(uuid, text) to service_role;
