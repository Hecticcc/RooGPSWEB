-- Per-geofence SMS option (in addition to email). When true, send-pending will send SMS for this geofence's alerts.

alter table public.geofences
  add column if not exists alert_sms boolean not null default false;

comment on column public.geofences.alert_sms is 'When true, breach alerts for this geofence are sent via SMS (if user has SMS alerts enabled in Settings).';

-- Include alert_sms in trigger payload so send-pending can decide whether to send SMS for this geofence.
create or replace function public.check_geofence_on_location_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  v_prev_lat double precision;
  v_prev_lng double precision;
  v_dist_new_m double precision;
  v_dist_prev_m double precision;
  v_inside_new boolean;
  v_inside_prev boolean;
  v_fire boolean;
begin
  if new.latitude is null or new.longitude is null then
    return new;
  end if;

  select latitude, longitude into v_prev_lat, v_prev_lng
  from public.locations
  where device_id = new.device_id and id <> new.id
  order by received_at desc
  limit 1;

  for g in
    select id, user_id, device_id, name, center_lat, center_lng, radius_meters, alert_type, alert_sms
    from public.geofences
    where device_id = new.device_id
  loop
    v_dist_new_m := 6371000 * acos(least(1, greatest(-1,
      sin(radians(new.latitude)) * sin(radians(g.center_lat))
      + cos(radians(new.latitude)) * cos(radians(g.center_lat))
        * cos(radians(new.longitude - g.center_lng))
    )));
    v_inside_new := v_dist_new_m <= g.radius_meters;

    if v_prev_lat is not null and v_prev_lng is not null then
      v_dist_prev_m := 6371000 * acos(least(1, greatest(-1,
        sin(radians(v_prev_lat)) * sin(radians(g.center_lat))
        + cos(radians(v_prev_lat)) * cos(radians(g.center_lat))
          * cos(radians(v_prev_lng - g.center_lng))
      )));
      v_inside_prev := v_dist_prev_m <= g.radius_meters;
    else
      v_inside_prev := false;
    end if;

    v_fire := false;
    if g.alert_type = 'keep_in' and v_inside_prev and not v_inside_new then
      v_fire := true;
    elsif g.alert_type = 'keep_out' and not v_inside_prev and v_inside_new then
      v_fire := true;
    end if;

    if not v_fire then
      continue;
    end if;

    insert into public.device_alert_events (device_id, user_id, alert_type, payload)
    values (
      new.device_id,
      g.user_id,
      'geofence',
      jsonb_build_object(
        'geofence_id', g.id,
        'name', g.name,
        'geofence_type', g.alert_type,
        'alert_sms', coalesce(g.alert_sms, false),
        'lat', new.latitude,
        'lng', new.longitude,
        'received_at', new.received_at,
        'distance_m', round(v_dist_new_m::numeric, 2)
      )
    );
  end loop;

  return new;
end;
$$;
