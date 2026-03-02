-- Tracker Toolkit: Simbase SMS – target_iccid and provider 'simbase'.
-- Enables sending/receiving via Simbase API (POST/GET /simcards/{iccid}/sms).

alter table public.device_command_jobs
  add column if not exists target_iccid text;

comment on column public.device_command_jobs.target_iccid is 'SIM ICCID when using Simbase (GET/POST /simcards/{iccid}/sms).';

-- Provider remains text; use 'simbase' when sending via Simbase API.
