-- Tracker Toolkit: device SIM phone + command jobs (SMS commands via SMSPortal).
-- Ref: docs/schema-audit-tracker-toolkit.md

alter table public.devices
  add column if not exists sim_phone text;

comment on column public.devices.sim_phone is 'Tracker SIM phone number (E.164 or national) for SMS commands.';

create table if not exists public.device_command_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null check (status in (
    'queued', 'sending', 'sent', 'failed', 'timeout', 'replied', 'manual_reply'
  )),
  command_name text not null,
  command_text text not null,
  target_phone text not null,
  provider text not null default 'smsportal',
  provider_message_id text,
  sent_at timestamptz,
  replied_at timestamptz,
  reply_raw text,
  reply_parsed jsonb,
  error text
);

comment on table public.device_command_jobs is 'SMS command jobs to tracker SIM (SMSPortal). Staff can view; StaffPlus/Admin can create and update.';

create index if not exists idx_device_command_jobs_device_created
  on public.device_command_jobs (device_id, created_at desc);
create index if not exists idx_device_command_jobs_status
  on public.device_command_jobs (status);

alter table public.device_command_jobs enable row level security;

drop policy if exists device_command_jobs_select_staff on public.device_command_jobs;
create policy device_command_jobs_select_staff
  on public.device_command_jobs for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('staff', 'staff_plus', 'administrator')
    )
  );

drop policy if exists device_command_jobs_insert_staff_plus on public.device_command_jobs;
create policy device_command_jobs_insert_staff_plus
  on public.device_command_jobs for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('staff_plus', 'administrator')
    )
  );

drop policy if exists device_command_jobs_update_staff_plus on public.device_command_jobs;
create policy device_command_jobs_update_staff_plus
  on public.device_command_jobs for update
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('staff_plus', 'administrator')
    )
  )
  with check (true);
