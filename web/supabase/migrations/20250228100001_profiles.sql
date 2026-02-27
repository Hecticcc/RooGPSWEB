-- User profiles: shipping address and mobile (one row per user, created at signup).
-- Email is stored in auth.users and is unique (one account per email enforced by Supabase Auth).

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mobile text,
  address_line1 text,
  address_line2 text,
  suburb text,
  state text,
  postcode text,
  country text not null default 'Australia',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profile: shipping address and mobile number (ecommerce signup)';

alter table public.profiles enable row level security;

-- Users can read and update their own profile only
create policy profiles_select_own on public.profiles
  for select
  using (auth.uid() = user_id);

create policy profiles_insert_own on public.profiles
  for insert
  with check (auth.uid() = user_id);

create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
