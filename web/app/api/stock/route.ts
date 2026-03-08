import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const TRACKER_SKUS = ['gps_tracker', 'gps_tracker_wired'] as const;

/**
 * GET /api/stock – public; returns usable GPS tracker counts for checkout, by type (Wireless vs Wired).
 */
export async function GET() {
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const bySku: Record<string, number> = {};
  for (const sku of TRACKER_SKUS) {
    const { count, error } = await admin
      .from('tracker_stock')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_stock')
      .eq('product_sku', sku);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    bySku[sku] = count ?? 0;
  }
  const usable_trackers = TRACKER_SKUS.reduce((sum, sku) => sum + (bySku[sku] ?? 0), 0);

  return NextResponse.json(
    { usable_trackers, by_sku: bySku },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
