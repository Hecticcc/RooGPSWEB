-- User group / role system: Customer (default), Staff, StaffPlus, Administrator

create type public.user_role as enum (
  'customer',
  'staff',
  'staff_plus',
  'administrator'
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_roles is 'User group: customer (default), staff, staff_plus, administrator';

alter table public.user_roles enable row level security;

-- Users can read their own role only
create policy user_roles_select_own on public.user_roles
  for select
  using (auth.uid() = user_id);

-- Only administrators can update roles (for promoting staff etc.)
create policy user_roles_update_admin on public.user_roles
  for update
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'administrator'
    )
  )
  with check (true);

-- Service role or trigger will insert; no policy for insert by regular users so only trigger/backend can create
-- Allow insert when the row is for the current user (self-registration gets customer via trigger)
create policy user_roles_insert_own on public.user_roles
  for insert
  with check (auth.uid() = user_id);

-- Trigger on auth.users: when a new user signs up, give them customer role
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Supabase Auth: trigger is attached to auth.users
-- Note: trigger must be created in the auth schema; we use a hook that Supabase supports
-- Ref: https://supabase.com/docs/guides/auth/auth-hooks (database hook) or trigger on auth.users
drop trigger if exists on_auth_user_created_set_role on auth.users;
create trigger on_auth_user_created_set_role
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- Backfill: ensure any existing auth users have a role (default customer)
insert into public.user_roles (user_id, role)
select id, 'customer'::public.user_role
from auth.users
on conflict (user_id) do nothing;

-- If the trigger on auth.users fails (e.g. restricted schema), new users will still get
-- the customer role from the app when they register (RegisterForm upserts user_roles).
