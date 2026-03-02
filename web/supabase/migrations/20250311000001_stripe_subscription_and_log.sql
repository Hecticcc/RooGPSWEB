-- Stripe: customer link on profile, subscription + sim_plan on order, payment/event log for audit.

-- Profile: Stripe Customer ID for reuse across orders
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

comment on column public.profiles.stripe_customer_id is 'Stripe Customer ID; created on first checkout, reused for subscriptions.';

-- Order: subscription and plan used for recurring SIM billing
alter table public.orders
  add column if not exists stripe_subscription_id text,
  add column if not exists sim_plan text check (sim_plan is null or sim_plan in ('monthly', 'yearly'));

comment on column public.orders.stripe_subscription_id is 'Stripe Subscription ID for SIM recurring billing (created after initial payment).';
comment on column public.orders.sim_plan is 'SIM plan for this order: monthly or yearly (set at checkout).';

create index if not exists idx_orders_stripe_subscription_id on public.orders (stripe_subscription_id) where stripe_subscription_id is not null;

-- Audit log: all Stripe-related events for orders (webhook payloads and key fields)
create table if not exists public.stripe_payment_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null,
  stripe_event_id text,
  stripe_object_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.stripe_payment_log is 'Audit log of Stripe webhook events (checkout.session.completed, invoice.paid, etc.) for orders and subscriptions.';

create index if not exists idx_stripe_payment_log_order_id on public.stripe_payment_log (order_id);
create index if not exists idx_stripe_payment_log_created_at on public.stripe_payment_log (created_at desc);
create index if not exists idx_stripe_payment_log_stripe_event_id on public.stripe_payment_log (stripe_event_id) where stripe_event_id is not null;

alter table public.stripe_payment_log enable row level security;

-- Only service role / admin APIs read this table; no direct client access
create policy stripe_payment_log_admin on public.stripe_payment_log
  for all
  using (false)
  with check (false);
