-- Stock management: GPS tracker physical inventory (IMEI list).
-- SIM cards are listed via Simbase API (no local table).

create table if not exists public.tracker_stock (
  id uuid primary key default gen_random_uuid(),
  imei text not null unique,
  status text not null default 'in_stock' check (status in ('in_stock', 'assigned', 'sold', 'returned', 'faulty')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tracker_stock_imei on public.tracker_stock(imei);
create index if not exists idx_tracker_stock_status on public.tracker_stock(status);

comment on table public.tracker_stock is 'Physical GPS tracker inventory by IMEI (admin stock management)';

alter table public.tracker_stock enable row level security;

-- No policies: anon/authenticated have no access. Admin APIs use service role (bypasses RLS).
