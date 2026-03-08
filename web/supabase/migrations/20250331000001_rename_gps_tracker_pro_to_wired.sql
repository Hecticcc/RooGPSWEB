-- Rename product_pricing SKU gps_tracker_pro → gps_tracker_wired (and update order_items references).

insert into public.product_pricing (sku, label, price_cents, sale_price_cents, period, device_model_name, updated_at)
select 'gps_tracker_wired', label, price_cents, sale_price_cents, period, device_model_name, updated_at
from public.product_pricing
where sku = 'gps_tracker_pro'
on conflict (sku) do update set
  label = excluded.label,
  price_cents = excluded.price_cents,
  sale_price_cents = excluded.sale_price_cents,
  period = excluded.period,
  device_model_name = excluded.device_model_name,
  updated_at = excluded.updated_at;

update public.order_items
  set product_sku = 'gps_tracker_wired'
  where product_sku = 'gps_tracker_pro';

delete from public.product_pricing where sku = 'gps_tracker_pro';
