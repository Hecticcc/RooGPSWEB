-- Emergency / Stolen Mode for PT60-L: per-device toggle, profiles, and status.

do $$ begin
  create type public.device_emergency_status as enum (
    'OFF', 'ENABLING', 'ON', 'DISABLING', 'ERROR'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.devices
  add column if not exists emergency_enabled boolean not null default false,
  add column if not exists emergency_activated_at timestamptz,
  add column if not exists emergency_activated_by uuid references auth.users(id) on delete set null,
  add column if not exists emergency_status device_emergency_status not null default 'OFF'::device_emergency_status,
  add column if not exists emergency_last_error text,
  add column if not exists normal_profile jsonb,
  add column if not exists emergency_profile jsonb;

comment on column public.devices.emergency_enabled is 'True when Emergency Mode is active (frequent reporting for recovery).';
comment on column public.devices.emergency_activated_at is 'When Emergency Mode was last turned on.';
comment on column public.devices.emergency_activated_by is 'User who last activated Emergency Mode.';
comment on column public.devices.emergency_status is 'OFF | ENABLING | ON | DISABLING | ERROR.';
comment on column public.devices.emergency_last_error is 'Last error from command send (e.g. SMS failure).';
comment on column public.devices.normal_profile is 'Restore target: { gprs_interval_command_102, sleep_command_124, heartbeat_command_122, ... }.';
comment on column public.devices.emergency_profile is 'Applied emergency profile commands (for reference).';
