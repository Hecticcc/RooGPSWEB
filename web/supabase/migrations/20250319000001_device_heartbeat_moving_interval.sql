-- PT60-L sleep vs offline: per-device heartbeat and moving interval for state computation.

alter table public.devices
  add column if not exists heartbeat_minutes int null,
  add column if not exists moving_interval_seconds int null;

comment on column public.devices.heartbeat_minutes is 'Expected check-in interval in minutes when device is sleeping (e.g. 720 = 12h). Used for SLEEPING vs OFFLINE.';
comment on column public.devices.moving_interval_seconds is 'Reporting interval when moving (e.g. 120). Used to derive online_threshold.';
