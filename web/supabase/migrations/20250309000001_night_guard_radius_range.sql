-- Night Guard: allow radius 25–100 m (continuous range) instead of fixed 100/200/500.
-- Migrate existing values: clamp 200/500 to 100.
update public.night_guard_rules set radius_m = 100 where radius_m > 100;

alter table public.night_guard_rules drop constraint if exists night_guard_rules_radius_m_check;

alter table public.night_guard_rules add constraint night_guard_rules_radius_m_check
  check (radius_m >= 25 and radius_m <= 100);

comment on table public.night_guard_rules is 'Night Guard: movement alert during time window, radius 25–100 m; armed at first valid fix in window or user Home';
