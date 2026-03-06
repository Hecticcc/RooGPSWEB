import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** GET – list all share links for the current user's devices (RLS filters by device ownership). */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: links, error } = await supabase
    .from('tracker_share_links')
    .select('id, device_id, token, expires_at, created_at, devices(name)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? (request.headers.get('origin') ?? '').replace(/\/$/, '');
  const list = (links ?? []).map((row) => {
    const device = row.devices as { name?: string | null } | null;
    const url = base ? `${base}/share/${row.token}` : `/share/${row.token}`;
    return {
      id: row.id,
      device_id: row.device_id,
      device_name: device?.name ?? row.device_id,
      token: row.token,
      url,
      expires_at: row.expires_at,
      created_at: row.created_at,
    };
  });

  return NextResponse.json({ links: list });
}
