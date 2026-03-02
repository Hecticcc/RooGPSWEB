-- Optional user-set Home position for Night Guard. When set, ingest uses this as the alert center; when null, uses tracker position at window start.
alter table public.night_guard_rules
  add column if not exists home_lat numeric null,
  add column if not exists home_lon numeric null;

comment on column public.night_guard_rules.home_lat is 'User-set Home latitude for Night Guard; when set, used as alert center instead of first fix in window';
comment on column public.night_guard_rules.home_lon is 'User-set Home longitude for Night Guard';
