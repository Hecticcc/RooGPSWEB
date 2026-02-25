-- Add optional marker color for dashboard map (hex, e.g. #f97316)
alter table public.devices
  add column if not exists marker_color text default '#f97316';

comment on column public.devices.marker_color is 'Hex color for map car icon, e.g. #f97316';
