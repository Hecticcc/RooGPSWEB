-- Tracker share links: time-limited public URLs to share live tracking of a single device (e.g. for police).
-- Only map and basic location log are visible; link expires at expires_at.

create table if not exists public.tracker_share_links (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade
);

create index if not exists idx_tracker_share_links_token on public.tracker_share_links (token);
create index if not exists idx_tracker_share_links_device_id on public.tracker_share_links (device_id);
create index if not exists idx_tracker_share_links_expires_at on public.tracker_share_links (expires_at);

alter table public.tracker_share_links enable row level security;

-- Only the device owner can insert/delete their share links.
create policy tracker_share_links_owner_all on public.tracker_share_links
  for all
  using (
    exists (
      select 1 from public.devices d
      where d.id = device_id and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.devices d
      where d.id = device_id and d.user_id = auth.uid()
    )
  );

comment on table public.tracker_share_links is 'Time-limited share links for viewing a single tracker (map + basic log). Used e.g. to share with police.';
