-- Geo alert type: keep_in = notify when tracker leaves area; keep_out = notify when tracker enters area
alter table public.geofences
  add column if not exists alert_type text not null default 'keep_in'
  check (alert_type in ('keep_in', 'keep_out'));

comment on column public.geofences.alert_type is 'keep_in: alert when vehicle leaves area; keep_out: alert when vehicle enters area';
