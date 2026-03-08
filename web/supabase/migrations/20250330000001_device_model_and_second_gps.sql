-- Device model name (shown everywhere devices are shown).
-- Two GPS pricing options: gps_tracker (Standard) and gps_tracker_wired (Wired).

alter table public.devices
  add column if not exists model_name text;

comment on column public.devices.model_name is 'GPS model name (e.g. Standard, Pro); set from order product at activation or manually in admin.';

-- Product pricing: optional device model name for tracker SKUs (used at activation).
alter table public.product_pricing
  add column if not exists device_model_name text;

comment on column public.product_pricing.device_model_name is 'For tracker SKUs: model name to set on device at activation (e.g. Standard, Pro).';

-- Ensure existing gps_tracker has a model name; add second GPS product.
update public.product_pricing
  set device_model_name = 'Standard'
  where sku = 'gps_tracker' and (device_model_name is null or device_model_name = '');

insert into public.product_pricing (sku, label, price_cents, sale_price_cents, period, device_model_name)
values
  ('gps_tracker_wired', 'GPS Tracker Wired', 7900, null, 'one-time', 'Wired')
on conflict (sku) do update set
  label = excluded.label,
  device_model_name = excluded.device_model_name;
