-- Support ticket system for RooGPS. Integrated with auth.users and user_roles.
-- Customers see only their tickets; staff (staff, staff_plus, administrator) see all.

-- Enums
create type public.support_ticket_status as enum (
  'open',
  'pending',
  'in_progress',
  'resolved',
  'closed'
);

create type public.support_ticket_priority as enum (
  'low',
  'medium',
  'high',
  'urgent'
);

create type public.support_ticket_source as enum (
  'dashboard',
  'email',
  'system',
  'api'
);

create type public.support_message_sender_type as enum (
  'customer',
  'staff',
  'system'
);

create type public.support_activity_action as enum (
  'created',
  'reply_added',
  'note_added',
  'status_changed',
  'priority_changed',
  'assignment_changed',
  'tag_added',
  'tag_removed',
  'merged',
  'reopened',
  'closed',
  'attachment_uploaded',
  'customer_reopened',
  'customer_closed'
);

-- Sequence for human-readable ticket numbers (e.g. RGP-10001)
create sequence if not exists public.support_ticket_number_seq start with 10001;

-- Main ticket table
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('RGP-' || lpad(nextval('public.support_ticket_number_seq')::text, 5, '0')),
  user_id uuid not null references auth.users(id) on delete restrict,
  subject text not null,
  status public.support_ticket_status not null default 'open',
  priority public.support_ticket_priority not null default 'medium',
  category text not null default 'general',
  source public.support_ticket_source not null default 'dashboard',
  assigned_to uuid references auth.users(id) on delete set null,
  linked_device_id text references public.devices(id) on delete set null,
  linked_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reply_at timestamptz,
  last_customer_reply_at timestamptz,
  last_staff_reply_at timestamptz,
  closed_at timestamptz,
  resolved_at timestamptz,
  reopened_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  allow_customer_close boolean not null default true,
  allow_customer_reopen boolean not null default true,
  reopen_window_hours int not null default 168
);

comment on table public.support_tickets is 'Support tickets; RLS enforces customer own-ticket and staff all-ticket access.';
comment on column public.support_tickets.reopen_window_hours is 'Hours after close during which customer can reopen (default 168 = 7 days).';

create index idx_support_tickets_user_id on public.support_tickets (user_id);
create index idx_support_tickets_status on public.support_tickets (status);
create index idx_support_tickets_assigned_to on public.support_tickets (assigned_to);
create index idx_support_tickets_priority on public.support_tickets (priority);
create index idx_support_tickets_updated_at on public.support_tickets (updated_at desc);
create index idx_support_tickets_created_at on public.support_tickets (created_at desc);
create index idx_support_tickets_last_reply_at on public.support_tickets (last_reply_at desc nulls last);
create index idx_support_tickets_linked_device on public.support_tickets (linked_device_id) where linked_device_id is not null;
create index idx_support_tickets_linked_order on public.support_tickets (linked_order_id) where linked_order_id is not null;
create index idx_support_tickets_category on public.support_tickets (category);
create index idx_support_tickets_ticket_number on public.support_tickets (ticket_number);

-- Messages (replies and internal notes)
create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type public.support_message_sender_type not null,
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

comment on table public.support_ticket_messages is 'Ticket thread; is_internal=true rows are staff-only.';
create index idx_support_messages_ticket_id on public.support_ticket_messages (ticket_id);
create index idx_support_messages_created_at on public.support_ticket_messages (ticket_id, created_at);

-- Attachments (metadata; files in Storage)
create table public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_ticket_messages(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.support_ticket_attachments is 'Attachment metadata; files stored in Storage bucket support-attachments.';
create index idx_support_attachments_ticket_id on public.support_ticket_attachments (ticket_id);
create index idx_support_attachments_message_id on public.support_ticket_attachments (message_id) where message_id is not null;

-- Activity / audit log
create table public.support_ticket_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  action public.support_activity_action not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.support_ticket_messages(id) on delete set null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

comment on table public.support_ticket_activity is 'Audit trail for ticket changes.';
create index idx_support_activity_ticket_id on public.support_ticket_activity (ticket_id);
create index idx_support_activity_created_at on public.support_ticket_activity (ticket_id, created_at desc);

-- Tags (global definitions)
create table public.support_ticket_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table public.support_ticket_tag_links (
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  tag_id uuid not null references public.support_ticket_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, tag_id)
);

create index idx_support_tag_links_tag_id on public.support_ticket_tag_links (tag_id);

-- Saved replies (staff)
create table public.support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.support_saved_replies is 'Canned responses for staff; RLS limits to staff.';
create index idx_support_saved_replies_created_by on public.support_saved_replies (created_by);

-- Helper: true if current user is staff or above (for RLS)
create or replace function public.support_is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
    and ur.role in ('staff', 'staff_plus', 'administrator')
  );
$$;

-- Enable RLS on all
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;
alter table public.support_ticket_activity enable row level security;
alter table public.support_ticket_tags enable row level security;
alter table public.support_ticket_tag_links enable row level security;
alter table public.support_saved_replies enable row level security;

-- RLS: support_tickets
create policy support_tickets_select_customer on public.support_tickets
  for select using (
    auth.uid() = user_id
    or public.support_is_staff()
  );
create policy support_tickets_insert_customer on public.support_tickets
  for insert with check (auth.uid() = user_id);
create policy support_tickets_update_customer on public.support_tickets
  for update using (
    auth.uid() = user_id or public.support_is_staff()
  );
-- No delete policy: tickets are not deleted by users (soft delete could be added later).

-- RLS: support_ticket_messages (customers see only non-internal messages for their tickets)
create policy support_messages_select on public.support_ticket_messages
  for select using (
    (is_internal = false and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    ))
    or (public.support_is_staff() and exists (
      select 1 from public.support_tickets t where t.id = ticket_id
    ))
  );
create policy support_messages_insert_staff on public.support_ticket_messages
  for insert with check (public.support_is_staff());
create policy support_messages_insert_customer on public.support_ticket_messages
  for insert with check (
    is_internal = false
    and sender_type = 'customer'
    and sender_user_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );
create policy support_messages_update on public.support_ticket_messages
  for update using (public.support_is_staff());

-- RLS: support_ticket_attachments
create policy support_attachments_select on public.support_ticket_attachments
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
      and (t.user_id = auth.uid() or public.support_is_staff())
    )
  );
create policy support_attachments_insert on public.support_ticket_attachments
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
      and (t.user_id = auth.uid() or public.support_is_staff())
    )
  );

-- RLS: support_ticket_activity
create policy support_activity_select on public.support_ticket_activity
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
      and (t.user_id = auth.uid() or public.support_is_staff())
    )
  );
create policy support_activity_insert on public.support_ticket_activity
  for insert with check (
    public.support_is_staff()
    or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

-- RLS: support_ticket_tags (read all for staff/customer when viewing a ticket; only staff manage)
create policy support_tags_select on public.support_ticket_tags for select using (true);
create policy support_tags_insert on public.support_ticket_tags for insert with check (public.support_is_staff());
create policy support_tags_update on public.support_ticket_tags for update using (public.support_is_staff());

-- RLS: support_ticket_tag_links
create policy support_tag_links_select on public.support_ticket_tag_links
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
      and (t.user_id = auth.uid() or public.support_is_staff())
    )
  );
create policy support_tag_links_insert on public.support_ticket_tag_links
  for insert with check (public.support_is_staff());
create policy support_tag_links_delete on public.support_ticket_tag_links
  for delete using (public.support_is_staff());

-- RLS: support_saved_replies (staff only)
create policy support_saved_replies_all_staff on public.support_saved_replies
  for all using (public.support_is_staff())
  with check (public.support_is_staff());
