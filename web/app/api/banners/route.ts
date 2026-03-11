import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';

/**
 * GET /api/banners
 * Returns active, non-expired banners for the authenticated user's dashboard.
 * Requires authentication (customer+).
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ banners: [] });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ banners: [] });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ banners: [] });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('system_banners')
    .select('id, title, message, type')
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ banners: [] });

  return NextResponse.json({ banners: data ?? [] });
}
