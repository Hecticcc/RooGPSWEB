-- Allow manual SIM assignment on devices when no activation token exists (admin dashboard).
-- GET device uses activation_tokens.sim_iccid when present, else devices.sim_iccid.

alter table public.devices
  add column if not exists sim_iccid text;

comment on column public.devices.sim_iccid is 'SIM ICCID assigned via order fulfilment (activation_tokens) or manually by admin when no token.';
