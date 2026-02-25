-- User alert settings: battery threshold and delivery (email for now)
create table if not exists public.alert_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  battery_alert_enabled boolean not null default false,
  battery_alert_percent smallint not null default 20 check (battery_alert_percent >= 0 and battery_alert_percent <= 100),
  battery_alert_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.alert_settings is 'Per-user alert preferences: battery low, delivery channels (email)';

alter table public.alert_settings enable row level security;

create policy alert_settings_own on public.alert_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Geo-fences: circle (center + radius); alert when vehicle leaves the area
create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null references public.devices(id) on delete cascade,
  name text not null default 'Geofence',
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null check (radius_meters > 0 and radius_meters <= 50000),
  alert_email boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.geofences is 'User-defined areas; alert when vehicle leaves (radius in meters)';

create index if not exists idx_geofences_user on public.geofences (user_id);

alter table public.geofences enable row level security;

create policy geofences_own on public.geofences
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
