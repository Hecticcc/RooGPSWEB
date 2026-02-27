-- Functions for admin stock UI: resolve tracker/SIM assignments to order number and customer email.
-- SECURITY DEFINER so we can read auth.users; only call from admin (service role) code.

create or replace function public.get_tracker_order_assignments(tracker_ids uuid[])
returns table(tracker_stock_id uuid, order_number text, email text)
language sql
security definer
set search_path = public, auth
as $$
  select oi.assigned_tracker_stock_id, o.order_number, u.email::text
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join auth.users u on u.id = o.user_id
  where oi.assigned_tracker_stock_id = any(tracker_ids);
$$;

comment on function public.get_tracker_order_assignments(uuid[]) is 'Returns order_number and customer email for given tracker_stock ids (admin stock UI)';

create or replace function public.get_sim_order_assignments(iccids text[])
returns table(iccid text, order_number text, email text)
language sql
security definer
set search_path = public, auth
as $$
  select oi.assigned_sim_iccid, o.order_number, u.email::text
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join auth.users u on u.id = o.user_id
  where oi.assigned_sim_iccid is not null
    and oi.assigned_sim_iccid = any(iccids);
$$;

comment on function public.get_sim_order_assignments(text[]) is 'Returns order_number and customer email for given SIM ICCIDs (admin stock UI)';
