-- Stock: separate inventory for Wireless (gps_tracker) vs Wired (gps_tracker_wired).
alter table public.tracker_stock
  add column if not exists product_sku text;

-- Default existing rows to wireless; then set not null and check.
update public.tracker_stock
  set product_sku = 'gps_tracker'
  where product_sku is null;

alter table public.tracker_stock
  alter column product_sku set not null;

alter table public.tracker_stock
  add constraint tracker_stock_product_sku_check
  check (product_sku in ('gps_tracker', 'gps_tracker_wired'));

create index if not exists idx_tracker_stock_product_sku on public.tracker_stock(product_sku);

comment on column public.tracker_stock.product_sku is 'Product this unit fulfils: gps_tracker (Wireless) or gps_tracker_wired (Wired).';

-- Pricing: allow hiding a product from the checkout area.
alter table public.product_pricing
  add column if not exists show_in_checkout boolean not null default true;

comment on column public.product_pricing.show_in_checkout is 'When false, product is not shown as an option on the order/checkout page.';
