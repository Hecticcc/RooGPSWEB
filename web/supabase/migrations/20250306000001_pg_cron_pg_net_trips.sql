-- Enable pg_cron and pg_net for scheduling the trip recompute job (production).
-- After this migration, run the schedule SQL once in Supabase SQL Editor (see README).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
