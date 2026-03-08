-- Support ticket attachments: Storage bucket and RLS.
-- Path pattern: {ticket_id}/{attachment_id}/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'application/json']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow read if user owns the ticket or is staff
create policy support_attachments_read on storage.objects
  for select
  using (
    bucket_id = 'support-attachments'
    and (
      public.support_is_staff()
      or exists (
        select 1 from public.support_tickets t
        where t.id::text = (storage.foldername(name))[1]
        and t.user_id = auth.uid()
      )
    )
  );

-- Allow insert only for authenticated users who have access to the ticket (owner or staff)
create policy support_attachments_insert on storage.objects
  for insert
  with check (
    bucket_id = 'support-attachments'
    and auth.uid() is not null
    and (
      public.support_is_staff()
      or exists (
        select 1 from public.support_tickets t
        where t.id::text = (storage.foldername(name))[1]
        and t.user_id = auth.uid()
      )
    )
  );

-- Allow delete for ticket owner or staff (optional; can restrict to staff only)
create policy support_attachments_delete on storage.objects
  for delete
  using (
    bucket_id = 'support-attachments'
    and (
      public.support_is_staff()
      or exists (
        select 1 from public.support_tickets t
        where t.id::text = (storage.foldername(name))[1]
        and t.user_id = auth.uid()
      )
    )
  );
