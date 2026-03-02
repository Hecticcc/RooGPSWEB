-- Geofence breach detection: on each location insert, check keep_in / keep_out zones
-- and insert into device_alert_events so SMS/email delivery can run (e.g. send-pending cron).

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
  v_dist_prev_m double precision;  -- distance from previous point to zone center
  v_inside_new boolean;
  v_inside_prev boolean;
  v_fire boolean;
begin
  if new.latitude is null or new.longitude is null then
    return new;
  end if;

  -- Previous location for this device (to detect "left" vs "entered")
  select latitude, longitude into v_prev_lat, v_prev_lng
  from public.locations
  where device_id = new.device_id and id <> new.id
  order by received_at desc
  limit 1;

  for g in
    select id, user_id, device_id, name, center_lat, center_lng, radius_meters, alert_type
    from public.geofences
    where device_id = new.device_id
  loop
    -- Distance from new point to zone center (Haversine, meters)
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

    -- Fire only on transition (one SMS per breach). Resets when state reverses.
    -- keep_in: fire when leaves zone (in → out). No more SMS while outside; when back inside, reset so next leave fires again.
    -- keep_out: fire when enters zone (out → in). No more SMS while inside; when back outside, reset so next enter fires again.
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

comment on function public.check_geofence_on_location_insert is 'On location insert: check geofences for this device; if keep_in (left zone) or keep_out (entered zone), insert device_alert_events.';

drop trigger if exists trigger_check_geofence_on_location_insert on public.locations;
create trigger trigger_check_geofence_on_location_insert
  after insert on public.locations
  for each row
  execute function public.check_geofence_on_location_insert();
