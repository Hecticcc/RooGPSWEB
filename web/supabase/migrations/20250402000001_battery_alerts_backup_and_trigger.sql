-- Battery alerts: support main vs backup battery (same principle: threshold % + email/SMS).
-- Backup = wired_power.backup_battery_percent; main = battery.percent.
-- Trigger on location insert: evaluate enabled battery_alerts and insert device_alert_events when below threshold.

alter table public.battery_alerts
  add column if not exists battery_type text not null default 'main' check (battery_type in ('main', 'backup'));

comment on column public.battery_alerts.battery_type is 'Which battery to monitor: main (battery.percent) or backup (wired_power.backup_battery_percent, for wired trackers).';

-- Throttle: avoid duplicate battery alerts for same rule within 24 hours
create or replace function public.check_battery_on_location_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_battery_pct int;
  v_user_id uuid;
  v_recent_at timestamptz;
begin
  select d.user_id into v_user_id from public.devices d where d.id = new.device_id;
  if v_user_id is null then
    return new;
  end if;

  for r in
    select ba.id, ba.threshold_percent, ba.notify_email, ba.notify_sms, ba.battery_type
    from public.battery_alerts ba
    where ba.device_id = new.device_id and ba.enabled = true
  loop
    if r.battery_type = 'backup' then
      v_battery_pct := (new.extra->'wired_power'->>'backup_battery_percent')::int;
      if v_battery_pct is null then
        v_battery_pct := (new.extra->'battery'->>'percent')::int;
      end if;
    else
      v_battery_pct := (new.extra->'battery'->>'percent')::int;
      if v_battery_pct is null and (new.extra->'wired_power') is not null then
        v_battery_pct := (new.extra->'wired_power'->>'backup_battery_percent')::int;
      end if;
    end if;

    if v_battery_pct is null then
      continue;
    end if;

    if v_battery_pct >= r.threshold_percent then
      continue;
    end if;

    select created_at into v_recent_at
    from public.device_alert_events
    where device_id = new.device_id
      and alert_type = 'battery'
      and (payload->>'battery_alert_id') = r.id::text
    order by created_at desc
    limit 1;
    if v_recent_at is not null and (now() - v_recent_at) < interval '24 hours' then
      continue;
    end if;

    insert into public.device_alert_events (device_id, user_id, alert_type, payload)
    values (
      new.device_id,
      v_user_id,
      'battery',
      jsonb_build_object(
        'threshold_percent', r.threshold_percent,
        'alert_sms', coalesce(r.notify_sms, false),
        'alert_email', coalesce(r.notify_email, true),
        'battery_type', r.battery_type,
        'battery_alert_id', r.id,
        'battery_percent', v_battery_pct
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trigger_check_battery_on_location_insert on public.locations;
create trigger trigger_check_battery_on_location_insert
  after insert on public.locations
  for each row
  execute function public.check_battery_on_location_insert();

comment on function public.check_battery_on_location_insert is 'On location insert: for each enabled battery_alert for this device, if battery (main or backup) is below threshold, insert device_alert_events (throttled 24h per rule).';
