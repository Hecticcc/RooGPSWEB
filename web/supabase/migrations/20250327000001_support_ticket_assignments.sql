-- Multiple staff assignees per support ticket.
-- support_tickets.assigned_to remains for backward compatibility (kept in sync with first assignee for list views).

create table if not exists public.support_ticket_assignments (
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create index idx_support_ticket_assignments_ticket_id on public.support_ticket_assignments (ticket_id);
create index idx_support_ticket_assignments_user_id on public.support_ticket_assignments (user_id);

comment on table public.support_ticket_assignments is 'Staff members assigned to a support ticket; multiple per ticket.';

-- Backfill from existing assigned_to (one row per ticket that has assigned_to)
insert into public.support_ticket_assignments (ticket_id, user_id)
select id, assigned_to
from public.support_tickets
where assigned_to is not null
on conflict (ticket_id, user_id) do nothing;
