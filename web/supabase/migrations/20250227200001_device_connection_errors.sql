-- Connection errors from ingest: record which device had a socket/connection error so the dashboard can show an indicator
create table if not exists public.device_connection_errors (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(id) on delete cascade,
  error_message text not null,
  created_at timestamptz not null default now()
);

comment on table public.device_connection_errors is 'Connection/socket errors from ingest server, per device (e.g. ECONNRESET)';

create index if not exists idx_device_connection_errors_device_created on public.device_connection_errors (device_id, created_at desc);

alter table public.device_connection_errors enable row level security;

-- Users can only see errors for their own devices
create policy device_connection_errors_select_own on public.device_connection_errors
  for select
  using (
    exists (
      select 1 from public.devices d
      where d.id = device_id and d.user_id = auth.uid()
    )
  );

-- Insert is done by ingest with service role (bypasses RLS)
