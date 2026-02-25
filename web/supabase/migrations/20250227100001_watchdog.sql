-- Watch Dog: per-device arm/disarm; alert when tracker moves (speed > 5 km/h or distance > 50 m from armed position)

-- Per-device Watch Dog state
alter table public.devices
  add column if not exists watchdog_armed boolean not null default false,
  add column if not exists watchdog_armed_at timestamptz,
  add column if not exists watchdog_ref_lat double precision,
  add column if not exists watchdog_ref_lng double precision;

comment on column public.devices.watchdog_armed is 'When true, alert if tracker moves (speed > 5 km/h or distance > 50 m from ref position)';
comment on column public.devices.watchdog_armed_at is 'When Watch Dog was armed';
comment on column public.devices.watchdog_ref_lat is 'Reference latitude when armed (for 50 m distance check)';
comment on column public.devices.watchdog_ref_lng is 'Reference longitude when armed (for 50 m distance check)';

-- Store emitted alert events (e.g. for notifications / email)
create table if not exists public.device_alert_events (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null, -- 'watchdog', 'geofence', 'battery', etc.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.device_alert_events is 'Emitted device alerts (watchdog movement, geofence, battery) for notification delivery';

create index if not exists idx_device_alert_events_device_created on public.device_alert_events (device_id, created_at desc);
create index if not exists idx_device_alert_events_user_created on public.device_alert_events (user_id, created_at desc);

alter table public.device_alert_events enable row level security;

create policy device_alert_events_own on public.device_alert_events
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

-- Allow service role / backend to insert alert events (e.g. from trigger)
-- Trigger runs in same transaction as locations insert; locations may be inserted by service role.
-- So we need a function that runs with definer rights and inserts into device_alert_events.
create or replace function public.check_watchdog_on_location_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_armed boolean;
  v_ref_lat double precision;
  v_ref_lng double precision;
  v_user_id uuid;
  v_prev_lat double precision;
  v_prev_lng double precision;
  v_speed_kph double precision;
  v_dist_m double precision;
  v_recent_alert_at timestamptz;
begin
  select d.watchdog_armed, d.watchdog_ref_lat, d.watchdog_ref_lng, d.user_id
  into v_armed, v_ref_lat, v_ref_lng, v_user_id
  from public.devices d
  where d.id = new.device_id;

  if not coalesce(v_armed, false) then
    return new;
  end if;

  -- Use reference position when armed; if missing, use previous location
  if v_ref_lat is not null and v_ref_lng is not null then
    v_prev_lat := v_ref_lat;
    v_prev_lng := v_ref_lng;
  else
    select l.latitude, l.longitude into v_prev_lat, v_prev_lng
    from public.locations l
    where l.device_id = new.device_id and l.id <> new.id
    order by l.received_at desc
    limit 1;
    if v_prev_lat is null or v_prev_lng is null then
      return new;
    end if;
  end if;

  -- New position must be valid
  if new.latitude is null or new.longitude is null then
    return new;
  end if;

  -- Distance in meters (Haversine approximation)
  v_dist_m := (
    6371000 * acos(
      least(1, greatest(-1,
        sin(radians(v_prev_lat)) * sin(radians(new.latitude))
        + cos(radians(v_prev_lat)) * cos(radians(new.latitude))
        * cos(radians(new.longitude - v_prev_lng))
      ))
    )
  );
  v_speed_kph := coalesce(new.speed_kph, 0);

  -- Trigger: speed > 5 km/h OR distance > 50 m
  if v_speed_kph > 5 or v_dist_m > 50 then
    -- Throttle: avoid duplicate alerts within 15 minutes per device
    select created_at into v_recent_alert_at
    from public.device_alert_events
    where device_id = new.device_id and alert_type = 'watchdog'
    order by created_at desc
    limit 1;
    if v_recent_alert_at is null or (now() - v_recent_alert_at) > interval '15 minutes' then
      insert into public.device_alert_events (device_id, user_id, alert_type, payload)
      values (
        new.device_id,
        v_user_id,
        'watchdog',
        jsonb_build_object(
          'speed_kph', v_speed_kph,
          'distance_m', round(v_dist_m::numeric, 2),
          'lat', new.latitude,
          'lng', new.longitude,
          'gps_time', new.gps_time,
          'received_at', new.received_at
        )
      );
    end if;
  end if;

  return new;
end;
$$;

-- Trigger on locations insert (runs for every new location row)
drop trigger if exists trigger_check_watchdog_on_location_insert on public.locations;
create trigger trigger_check_watchdog_on_location_insert
  after insert on public.locations
  for each row
  execute function public.check_watchdog_on_location_insert();
