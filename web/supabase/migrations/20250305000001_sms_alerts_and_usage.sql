-- SMS alerts: enable/disable and monthly usage limit (30 per user per month).
-- Ref: SMSPortal API https://docs.smsportal.com/docs/api-keys

alter table public.alert_settings
  add column if not exists sms_alerts_enabled boolean not null default false;

comment on column public.alert_settings.sms_alerts_enabled is 'When true, GPS tracking alerts (e.g. WatchDog) can be sent via SMS to profile.mobile';

-- Monthly SMS usage per user for limit enforcement (30/month).
create table if not exists public.sms_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, period)
);

comment on table public.sms_usage is 'SMS count per user per month (period = YYYY-MM) for tracking alert limit';

create index if not exists idx_sms_usage_user on public.sms_usage (user_id);

alter table public.sms_usage enable row level security;

-- Only service role or same user can read/insert/update (server increments count).
create policy sms_usage_own on public.sms_usage
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Atomic increment for SMS usage (avoids race when recording send).
create or replace function public.increment_sms_usage(p_user_id uuid, p_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Can only increment own usage';
  end if;
  insert into public.sms_usage (user_id, period, count)
  values (p_user_id, p_period, 1)
  on conflict (user_id, period)
  do update set count = sms_usage.count + 1;
end;
$$;
comment on function public.increment_sms_usage is 'Increment SMS usage for user/period (call after sending one SMS).';
grant execute on function public.increment_sms_usage(uuid, text) to authenticated;
