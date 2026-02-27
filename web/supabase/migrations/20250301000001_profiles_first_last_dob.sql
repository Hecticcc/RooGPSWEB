-- Add first name, last name and date of birth to profiles (e.g. for register form).

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists date_of_birth date;

comment on column public.profiles.first_name is 'Customer first name (from registration)';
comment on column public.profiles.last_name is 'Customer last name (from registration)';
comment on column public.profiles.date_of_birth is 'Customer date of birth (from registration)';
