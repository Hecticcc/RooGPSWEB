-- Unified mode transition with staggered verification (Emergency ON / Normal OFF).
-- desired_mode = what user requested; applied_mode = last confirmed; status drives UI and cron.

do $$ begin
  create type public.device_desired_mode as enum ('NORMAL', 'EMERGENCY');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.device_applied_mode as enum ('NORMAL', 'EMERGENCY', 'UNKNOWN');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.device_mode_transition_status as enum (
    'IDLE', 'SENDING', 'VERIFYING', 'CONFIRMED',
    'PENDING_UNCONFIRMED', 'ERROR_MISMATCH', 'ERROR_SEND'
  );
exception when duplicate_object then null;
end $$;

alter table public.devices
  add column if not exists desired_mode public.device_desired_mode not null default 'NORMAL',
  add column if not exists applied_mode public.device_applied_mode not null default 'UNKNOWN',
  add column if not exists mode_transition_status public.device_mode_transition_status not null default 'IDLE',
  add column if not exists mode_transition_started_at timestamptz,
  add column if not exists mode_verify_deadline_at timestamptz,
  add column if not exists mode_verify_attempt int not null default 0,
  add column if not exists mode_verify_details jsonb;

comment on column public.devices.desired_mode is 'Target mode requested by user (NORMAL or EMERGENCY).';
comment on column public.devices.applied_mode is 'Last confirmed mode on tracker (or UNKNOWN).';
comment on column public.devices.mode_transition_status is 'IDLE|SENDING|VERIFYING|CONFIRMED|PENDING_UNCONFIRMED|ERROR_*.';
comment on column public.devices.mode_transition_started_at is 'When current transition started (commands sent).';
comment on column public.devices.mode_verify_deadline_at is 'Verification window end (started_at + 300s).';
comment on column public.devices.mode_verify_attempt is 'Current verification attempt index (0..3 → 30s, 60s, 120s, 300s).';
comment on column public.devices.mode_verify_details is 'Expected vs actual; cadence stats; last query replies (admin).';

-- Backfill from existing emergency_enabled/emergency_status so UI and cron behave.
update public.devices
set desired_mode = case when emergency_enabled = true then 'EMERGENCY'::public.device_desired_mode else 'NORMAL'::public.device_desired_mode end,
    applied_mode = case
      when emergency_enabled = true and emergency_status = 'ON' then 'EMERGENCY'::public.device_applied_mode
      when emergency_enabled = false and emergency_status = 'OFF' then 'NORMAL'::public.device_applied_mode
      else 'UNKNOWN'::public.device_applied_mode
    end
where desired_mode = 'NORMAL' and applied_mode = 'UNKNOWN';
