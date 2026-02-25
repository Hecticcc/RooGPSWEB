-- Multiple battery alert rules per user, each scoped to a device
create table if not exists public.battery_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null references public.devices(id) on delete cascade,
  threshold_percent smallint not null check (threshold_percent >= 0 and threshold_percent <= 100),
  notify_email boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.battery_alerts is 'Per-device battery low alerts: notify when battery drops below threshold';

create index if not exists idx_battery_alerts_user on public.battery_alerts (user_id);

alter table public.battery_alerts enable row level security;

create policy battery_alerts_own on public.battery_alerts
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.user_id = auth.uid()
    )
  );
