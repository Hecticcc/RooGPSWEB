-- Idempotency for transactional emails: prevent duplicate sends for the same event.
create table if not exists public.email_sent_log (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  idempotency_key text not null,
  sent_at timestamptz not null default now(),
  recipient_email text,
  constraint email_sent_log_event_key unique (event_name, idempotency_key)
);

create index if not exists idx_email_sent_log_sent_at on public.email_sent_log(sent_at);
comment on table public.email_sent_log is 'Log of sent transactional emails for idempotency and audit';
