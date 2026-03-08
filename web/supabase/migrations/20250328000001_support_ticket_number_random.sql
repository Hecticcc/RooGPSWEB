-- Ticket numbers: random unique instead of sequential.
-- Keeps prefix RGP- and uses 8 random digits (100M possibilities); retries until unique.

alter table public.support_tickets alter column ticket_number drop default;

create or replace function public.support_ticket_number_new()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'RGP-' || lpad((floor(random() * 100000000))::int::text, 8, '0');
    if not exists (select 1 from public.support_tickets where ticket_number = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

comment on function public.support_ticket_number_new() is 'Generates a random unique ticket number for support_tickets (RGP-XXXXXXXX).';

alter table public.support_tickets alter column ticket_number set default public.support_ticket_number_new();

-- Optional: drop the old sequence (no longer used)
drop sequence if exists public.support_ticket_number_seq;
