-- Add 'answered' status: set when staff replies; customer reply sets back to 'open'.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'support_ticket_status' and e.enumlabel = 'answered'
  ) then
    alter type public.support_ticket_status add value 'answered';
  end if;
end $$;
