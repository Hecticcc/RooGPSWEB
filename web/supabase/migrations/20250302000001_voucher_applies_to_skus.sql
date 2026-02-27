-- Voucher applies_to_skus: restrict discount to specific products (empty = all products)
alter table public.vouchers
  add column if not exists applies_to_skus text[] default '{}';

comment on column public.vouchers.applies_to_skus is 'Product SKUs this voucher applies to; empty = entire order. E.g. {gps_tracker} or {sim_monthly,sim_yearly}.';
