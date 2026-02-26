-- Admin: soft-block device ingest; system settings for maintenance and ingest accept/reject

-- Devices: allow admin to disable ingest for a device (soft block)
alter table public.devices
  add column if not exists ingest_disabled boolean not null default false;

comment on column public.devices.ingest_disabled is 'When true, ingest service should not accept locations for this device (admin soft block)';

-- System settings: single-row config (maintenance mode, ingest accept, etc.)
create table if not exists public.system_settings (
  id text primary key default 'default',
  maintenance_mode boolean not null default false,
  ingest_accept boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.system_settings is 'Platform-wide settings: maintenance mode, ingest accept/reject (admin only)';

insert into public.system_settings (id, maintenance_mode, ingest_accept)
values ('default', false, true)
on conflict (id) do nothing;

alter table public.system_settings enable row level security;

-- Only service role can read/update (no anon/authenticated policies; admin API uses service role)
-- So no policies: RLS enabled, no grants for anon = only service role can access
