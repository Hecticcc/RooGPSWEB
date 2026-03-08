-- Admin-configurable Stripe subscription trial (default trial length in months).
-- Applies to new subscriptions only; existing subscriptions keep the trial they were created with.

alter table public.system_settings
  add column if not exists stripe_trial_enabled boolean not null default false,
  add column if not exists stripe_trial_default_months integer check (stripe_trial_default_months is null or (stripe_trial_default_months >= 0 and stripe_trial_default_months <= 24)),
  add column if not exists stripe_trial_updated_at timestamptz,
  add column if not exists stripe_trial_updated_by uuid references auth.users(id) on delete set null;

comment on column public.system_settings.stripe_trial_enabled is 'When true, new subscriptions get a free trial (length from stripe_trial_default_months).';
comment on column public.system_settings.stripe_trial_default_months is 'Default trial length in calendar months for new subscriptions (0–24).';
comment on column public.system_settings.stripe_trial_updated_at is 'When trial settings were last changed.';
comment on column public.system_settings.stripe_trial_updated_by is 'Admin user who last updated trial settings.';
