create table if not exists public.devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(id) on delete cascade,
  gps_time timestamptz,
  received_at timestamptz not null default now(),
  gps_valid boolean,
  latitude double precision,
  longitude double precision,
  speed_kph double precision,
  course_deg double precision,
  event_code text,
  raw_payload text not null,
  extra jsonb not null default '{}'::jsonb
);

create index if not exists idx_locations_device_received on public.locations (device_id, received_at desc);
create index if not exists idx_locations_device_gps_time on public.locations (device_id, gps_time desc);

alter table public.devices enable row level security;
alter table public.locations enable row level security;

create policy devices_owner on public.devices
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy locations_select_via_device on public.locations
  for select
  using (
    exists (
      select 1 from public.devices d
      where d.id = device_id and d.user_id = auth.uid()
    )
  );
