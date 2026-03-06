-- SMS reminders: low-quota reminder (5 left) and subscription expiry (7d, 48h).
-- Reminders are sent via SMS but do NOT count toward sms_usage (quota).

alter table public.alert_settings
  add column if not exists sms_low_reminder_enabled boolean not null default true;

comment on column public.alert_settings.sms_low_reminder_enabled is 'When true, send one SMS when user has 5 alerts left this month. Reminder does not count toward quota.';

-- Log of reminder SMS sent so we do not send twice (per user/period or per order/type).
create table if not exists public.sms_reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_type text not null,
  period text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, reminder_type, period)
);

comment on table public.sms_reminder_log is 'Tracks reminder SMS sent (low quota, subscription expiry). Used so we send each reminder at most once. Reminders do not count toward sms_usage.';
comment on column public.sms_reminder_log.reminder_type is 'low_quota | subscription_7d | subscription_48h';
comment on column public.sms_reminder_log.period is 'For low_quota: YYYY-MM. For subscription: order_id.';

create index if not exists idx_sms_reminder_log_user on public.sms_reminder_log (user_id);
alter table public.sms_reminder_log enable row level security;

create policy sms_reminder_log_service_only on public.sms_reminder_log
  for all
  using (false)
  with check (false);

-- Allow service_role to manage (cron will insert)
grant select, insert on public.sms_reminder_log to service_role;
