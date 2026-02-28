-- Trips: consumer trip history from location points (Option A: server-side recompute)
-- Reuses public.devices and public.locations; no duplication of point data.

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null references public.devices(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds int not null,
  distance_meters int not null,
  max_speed_kmh numeric null,
  start_lat numeric null,
  start_lon numeric null,
  end_lat numeric null,
  end_lon numeric null,
  start_odometer_m bigint null,
  end_odometer_m bigint null,
  start_location_point_id uuid null references public.locations(id) on delete set null,
  end_location_point_id uuid null references public.locations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trips_user_started on public.trips (user_id, started_at desc);
create index if not exists idx_trips_device_started on public.trips (device_id, started_at desc);

create table if not exists public.trip_points (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  device_id text not null,
  point_id uuid null references public.locations(id) on delete cascade,
  occurred_at timestamptz not null,
  lat numeric not null,
  lon numeric not null
);

create index if not exists idx_trip_points_trip_occurred on public.trip_points (trip_id, occurred_at asc);

-- Internal state for recompute job (which point was last processed per device)
create table if not exists public.trip_state (
  device_id text primary key references public.devices(id) on delete cascade,
  last_processed_at timestamptz null,
  open_trip_id uuid null references public.trips(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.trips enable row level security;
alter table public.trip_points enable row level security;
alter table public.trip_state enable row level security;

-- Customers: own trips by user_id
create policy trips_select_insert_update_owner on public.trips
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Staff: read-only for support (assumes role in public.user_roles)
create policy trips_select_staff on public.trips
  for select
  using (
    exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('staff','staff_plus','administrator'))
  );

-- Trip points: same as trips (via trip ownership)
create policy trip_points_owner on public.trip_points
  for all
  using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
  );

create policy trip_points_select_staff on public.trip_points
  for select
  using (
    exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('staff','staff_plus','administrator'))
  );

-- Trip state: service role only (no policy for authenticated users; backend uses service role)
-- So RLS will block app users from reading/writing trip_state; recompute uses service key.

comment on table public.trips is 'Trip segments derived from location points (recompute job).';
comment on table public.trip_points is 'Ordered points for trip polyline; references locations.';
comment on table public.trip_state is 'Internal state for trip recompute (last processed point per device).';
