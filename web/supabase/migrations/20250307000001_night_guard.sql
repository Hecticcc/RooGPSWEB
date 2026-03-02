-- Night Guard: scheduled movement alert (e.g. 21:00–06:00), radius 100/200/500 m.
-- Evaluated in VPS ingest on every location packet. Alerts go to device_alert_events (alert_type = 'night_guard').

create table if not exists public.night_guard_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null references public.devices(id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null default 'Australia/Melbourne',
  start_time_local text not null,
  end_time_local text not null,
  radius_m int not null check (radius_m in (100, 200, 500)),
  armed_center_lat numeric null,
  armed_center_lon numeric null,
  armed_at timestamptz null,
  last_alert_at timestamptz null,
  cooldown_minutes int not null default 10 check (cooldown_minutes >= 0),
  updated_at timestamptz not null default now(),
  unique (device_id)
);

comment on table public.night_guard_rules is 'Night Guard: movement alert during time window (e.g. 21:00–06:00), radius 100/200/500 m; armed at first valid fix in window';

create index if not exists idx_night_guard_rules_device on public.night_guard_rules (device_id);
create index if not exists idx_night_guard_rules_enabled on public.night_guard_rules (enabled) where enabled = true;

alter table public.night_guard_rules enable row level security;

create policy night_guard_rules_own on public.night_guard_rules
  for all
  using (
    auth.uid() = user_id
    and exists (select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid())
  );

-- Optional: shared state when running multiple ingest instances (consecutive outside count).
create table if not exists public.night_guard_state (
  device_id text primary key references public.devices(id) on delete cascade,
  last_outside_at timestamptz null,
  consecutive_outside_count int not null default 0,
  last_distance_m int null,
  updated_at timestamptz not null default now()
);

comment on table public.night_guard_state is 'Night Guard per-device state for multi-instance ingest (consecutive outside count)';

alter table public.night_guard_state enable row level security;

-- No policy: service role only (ingest uses service role). RLS blocks anon/authenticated.

-- Notification queue: ingest inserts; separate worker sends SMS/email (no inline send in ingest).
create table if not exists public.notifications_queue (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz null
);

comment on table public.notifications_queue is 'Queued notifications (night_guard, etc.); worker sends SMS/email';

create index if not exists idx_notifications_queue_status_created on public.notifications_queue (status, created_at) where status = 'pending';

alter table public.notifications_queue enable row level security;

-- No policy: service role (ingest + worker) only.
