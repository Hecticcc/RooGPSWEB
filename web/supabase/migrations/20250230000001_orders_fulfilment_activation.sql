-- Orders, fulfilment, and activation (see docs/schema-audit.md)
-- Reuses: user_roles, profiles, tracker_stock, devices. No duplicate stock/order tables.

-- Order status lifecycle
create type public.order_status as enum (
  'pending',   -- cart/checkout not completed
  'paid',      -- payment received (Stripe later)
  'fulfilled', -- tracker + sim assigned, activation token created
  'shipped',   -- marked shipped with tracking number
  'activated', -- customer used activation code
  'cancelled'
);

-- Customer orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.order_status not null default 'pending',
  -- Snapshot shipping at order time (or could reference profile)
  shipping_name text,
  shipping_mobile text,
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_suburb text,
  shipping_state text,
  shipping_postcode text,
  shipping_country text not null default 'Australia',
  total_cents integer,
  currency text not null default 'AUD',
  stripe_payment_id text,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is 'Customer orders; status flows pending -> paid -> fulfilled -> shipped -> activated';

create index idx_orders_user_id on public.orders (user_id);
create index idx_orders_status on public.orders (status);
create index idx_orders_created_at on public.orders (created_at desc);

alter table public.orders enable row level security;

-- Customers see own orders; staff see all (via service role or policy)
create policy orders_select_own on public.orders
  for select
  using (auth.uid() = user_id);

-- Customers can insert own (create order at checkout)
create policy orders_insert_own on public.orders
  for insert
  with check (auth.uid() = user_id);

-- Customers can update own only when pending (e.g. cart); staff updates via service role
create policy orders_update_own_pending on public.orders
  for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

-- Order line items: product, quantity, assigned stock + activation token
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_sku text not null,
  quantity integer not null default 1 check (quantity > 0),
  assigned_tracker_stock_id uuid references public.tracker_stock(id) on delete set null,
  assigned_sim_iccid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.order_items is 'Order line items; assigned_tracker_stock_id and assigned_sim_iccid set on fulfilment';

create index idx_order_items_order_id on public.order_items (order_id);

alter table public.order_items enable row level security;

create policy order_items_select_via_order on public.order_items
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- Insert/update order_items only via order ownership or service role (admin assigns)
create policy order_items_insert_via_order on public.order_items
  for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

create policy order_items_update_via_order on public.order_items
  for update
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- Activation tokens: one-time code for post-delivery activation
create table if not exists public.activation_tokens (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  tracker_stock_id uuid not null references public.tracker_stock(id) on delete restrict,
  sim_iccid text not null,
  device_id text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.activation_tokens is 'One-time activation codes; link order + user + tracker + SIM; device_id set when activated';

create index idx_activation_tokens_code on public.activation_tokens (code);
create index idx_activation_tokens_order_id on public.activation_tokens (order_id);
create index idx_activation_tokens_user_id on public.activation_tokens (user_id);

alter table public.activation_tokens enable row level security;

-- User can read own token (by user_id) for /activate page
create policy activation_tokens_select_own on public.activation_tokens
  for select
  using (auth.uid() = user_id);

-- Only backend/service role inserts and updates (fulfilment sets used_at, device_id)
-- No insert/update policy for anon/authenticated so only service role can write

-- Link order_items to activation token (after token created)
alter table public.order_items
  add column if not exists activation_token_id uuid references public.activation_tokens(id) on delete set null;

create index idx_order_items_activation_token_id on public.order_items (activation_token_id);

-- Tracker stock: link to order when assigned
alter table public.tracker_stock
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists idx_tracker_stock_order_id on public.tracker_stock (order_id);

comment on column public.tracker_stock.order_id is 'Set when tracker is assigned to an order (status assigned/sold)';
