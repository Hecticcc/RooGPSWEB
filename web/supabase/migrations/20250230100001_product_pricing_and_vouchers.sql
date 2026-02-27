-- Product pricing (admin-editable); sale price shown when set
create table if not exists public.product_pricing (
  sku text primary key,
  label text not null,
  price_cents integer not null check (price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or (sale_price_cents >= 0 and sale_price_cents <= price_cents)),
  period text not null check (period in ('one-time', 'month', 'year')),
  updated_at timestamptz not null default now()
);

comment on table public.product_pricing is 'Sellable product prices; sale_price_cents shown on checkout when set';

-- Seed default pricing (matches current hardcoded values)
insert into public.product_pricing (sku, label, price_cents, sale_price_cents, period)
values
  ('gps_tracker', 'GPS Tracker', 4900, null, 'one-time'),
  ('sim_monthly', 'SIM plan (monthly)', 2999, null, 'month'),
  ('sim_yearly', 'SIM plan (yearly)', 24900, null, 'year')
on conflict (sku) do nothing;

-- Vouchers
create type public.voucher_discount_type as enum ('percent', 'fixed');

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type public.voucher_discount_type not null,
  discount_value integer not null check (discount_value > 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  max_uses integer check (max_uses is null or max_uses >= 0),
  use_count integer not null default 0 check (use_count >= 0),
  min_order_cents integer check (min_order_cents is null or min_order_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voucher_percent_range check (
    discount_type <> 'percent' or (discount_value > 0 and discount_value <= 100)
  )
);

comment on table public.vouchers is 'Discount codes for checkout; discount_value is cents for fixed, 1-100 for percent';

create index idx_vouchers_code on public.vouchers (lower(trim(code)));
create index idx_vouchers_valid on public.vouchers (valid_from, valid_until);

alter table public.vouchers enable row level security;

-- Only service role / admin APIs manage vouchers; no direct client access needed
create policy vouchers_admin_all on public.vouchers
  for all
  using (false)
  with check (false);

-- Allow anon to read nothing; we validate via API (service role)
-- So no select policy for customers. Validation is done in API with service client.

-- Orders: store discount and voucher reference
alter table public.orders
  add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0),
  add column if not exists voucher_id uuid references public.vouchers(id) on delete set null;

comment on column public.orders.discount_cents is 'Discount applied at checkout (from voucher)';
comment on column public.orders.voucher_id is 'Voucher used at checkout, if any';

-- Trigger to bump updated_at for product_pricing and vouchers
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists product_pricing_updated_at on public.product_pricing;
create trigger product_pricing_updated_at
  before update on public.product_pricing
  for each row execute function public.set_updated_at();

drop trigger if exists vouchers_updated_at on public.vouchers;
create trigger vouchers_updated_at
  before update on public.vouchers
  for each row execute function public.set_updated_at();
