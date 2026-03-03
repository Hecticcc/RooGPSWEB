import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stock – public; returns usable GPS tracker count for checkout.
 * Usable = tracker_stock where status = 'in_stock'.
 */
export async function GET() {
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { count, error } = await admin
    .from('tracker_stock')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'in_stock');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { usable_trackers: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
