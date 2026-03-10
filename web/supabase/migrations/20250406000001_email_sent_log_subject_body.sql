-- Store subject and body for admin "Emails sent" view (WHMCS-style).
-- Ensure table exists (idempotent if 20250404000001_email_sent_log was not applied).
create table if not exists public.email_sent_log (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  idempotency_key text not null,
  sent_at timestamptz not null default now(),
  recipient_email text,
  constraint email_sent_log_event_key unique (event_name, idempotency_key)
);

alter table public.email_sent_log
  add column if not exists subject text,
  add column if not exists body_html text;

create index if not exists idx_email_sent_log_sent_at on public.email_sent_log(sent_at);
comment on table public.email_sent_log is 'Log of sent transactional emails for idempotency and audit';
comment on column public.email_sent_log.subject is 'Email subject line for display in admin';
comment on column public.email_sent_log.body_html is 'HTML body for viewing in admin (optional)';
