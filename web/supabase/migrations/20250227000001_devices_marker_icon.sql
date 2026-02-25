-- Marker icon type for map: car, car_alt, caravan, trailer, truck, misc
alter table public.devices
  add column if not exists marker_icon text not null default 'car'
  check (marker_icon in ('car', 'car_alt', 'caravan', 'trailer', 'truck', 'misc'));

comment on column public.devices.marker_icon is 'Map marker icon type: car, car_alt, caravan, trailer, truck, misc';
