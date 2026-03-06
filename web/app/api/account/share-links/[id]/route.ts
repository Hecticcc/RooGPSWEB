import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const EXTEND_SECONDS: Record<string, number> = {
  '1h': 60 * 60,
  '6h': 6 * 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
};

/** PATCH – extend a share link's expiry. Body: { extend_by: '1h' | '6h' | '24h' | '7d' }. RLS ensures ownership. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Link ID required' }, { status: 400 });
  }

  let body: { extend_by?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const extendBy = body.extend_by ?? '24h';
  const seconds = EXTEND_SECONDS[extendBy];
  if (!seconds) {
    return NextResponse.json({ error: 'Invalid extend_by; use 1h, 6h, 24h, or 7d' }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('tracker_share_links')
    .select('expires_at')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
  }

  const now = new Date();
  const currentExpires = new Date(existing.expires_at);
  const from = currentExpires.getTime() > now.getTime() ? currentExpires : now;
  const newExpiresAt = new Date(from.getTime() + seconds * 1000);

  const { data: updated, error: updateErr } = await supabase
    .from('tracker_share_links')
    .update({ expires_at: newExpiresAt.toISOString() })
    .eq('id', id)
    .select('id, expires_at')
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  return NextResponse.json({ id: updated.id, expires_at: updated.expires_at });
}

/** DELETE – revoke a share link. RLS ensures ownership. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Link ID required' }, { status: 400 });
  }

  const { error } = await supabase.from('tracker_share_links').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
