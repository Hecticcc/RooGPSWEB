-- Per-order subscription trial and normalized billing state.
-- Store exact trial values at signup; never retroactively change them.

alter table public.orders
  add column if not exists trial_enabled_at_signup boolean not null default false,
  add column if not exists trial_months_applied integer check (trial_months_applied is null or (trial_months_applied >= 0 and trial_months_applied <= 24)),
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_subscription_status text,
  add column if not exists billing_state_normalized text check (billing_state_normalized is null or billing_state_normalized in (
    'trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'incomplete', 'incomplete_expired'
  ));

comment on column public.orders.trial_enabled_at_signup is 'True if this subscription was created with a free trial.';
comment on column public.orders.trial_months_applied is 'Trial length in months applied at signup (stored, never changed).';
comment on column public.orders.trial_started_at is 'When the Stripe subscription trial started.';
comment on column public.orders.trial_ends_at is 'When the trial ends (Stripe will charge saved payment method).';
comment on column public.orders.stripe_subscription_status is 'Current Stripe subscription status (trialing, active, past_due, etc.).';
comment on column public.orders.billing_state_normalized is 'Normalized billing state for UI and service access (trialing, active, past_due, etc.).';

create index if not exists idx_orders_billing_state on public.orders (billing_state_normalized) where billing_state_normalized is not null;
create index if not exists idx_orders_trial_ends_at on public.orders (trial_ends_at) where trial_ends_at is not null;
