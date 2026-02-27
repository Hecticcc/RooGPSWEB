-- Unique human-readable order number for customers and staff (e.g. ROO-10001)
create sequence if not exists public.order_number_seq start with 10001;

alter table public.orders
  add column if not exists order_number text unique;

-- Backfill existing orders in created_at order
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from public.orders
  where order_number is null
)
update public.orders o
set order_number = 'ROO-' || (10000 + n.rn)::text
from numbered n
where o.id = n.id;

-- Set sequence so next new order gets the next number
select setval(
  'public.order_number_seq',
  (select coalesce(max((substring(order_number from 5))::int), 10000) from public.orders)
);

alter table public.orders
  alter column order_number set not null;

comment on column public.orders.order_number is 'Human-readable order number shown to customer and staff (e.g. ROO-10001)';

-- Trigger: assign order_number on insert
create or replace function public.set_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'ROO-' || nextval('public.order_number_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_order_number on public.orders;
create trigger orders_set_order_number
  before insert on public.orders
  for each row
  execute function public.set_order_number();
