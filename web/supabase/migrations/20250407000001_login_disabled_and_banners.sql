-- Login control: allow admins to disable logins for non-staff users
alter table public.system_settings
  add column if not exists login_disabled boolean not null default false;

comment on column public.system_settings.login_disabled is 'When true, only staff_plus and above can log in; customers are rejected after auth';

-- System banners: shown on user dashboards (staff_plus+ can manage)
create table if not exists public.system_banners (
  id          uuid        primary key default gen_random_uuid(),
  title       text,
  message     text        not null,
  type        text        not null default 'info'
                          check (type in ('info', 'warning', 'error', 'success')),
  active      boolean     not null default true,
  expires_at  timestamptz,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.system_banners is 'Platform-wide banners displayed on the user dashboard (staff_plus and above can manage)';
comment on column public.system_banners.type    is 'Visual style: info | warning | error | success';
comment on column public.system_banners.active  is 'Only active banners are shown to users';
comment on column public.system_banners.expires_at is 'Optional: auto-hide after this time (checked server-side)';

alter table public.system_banners enable row level security;
-- No anon/authenticated policies; admin API uses service role key only
