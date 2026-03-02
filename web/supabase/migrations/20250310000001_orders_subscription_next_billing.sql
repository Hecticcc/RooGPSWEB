-- Optional admin-set next billing date for subscription orders (overrides computed estimate).

alter table public.orders
  add column if not exists subscription_next_billing_date timestamptz;

comment on column public.orders.subscription_next_billing_date is 'Admin-set next billing/renewal date for subscription orders; used in user detail and subscription UI when present.';
