import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { listSimbaseSimcards } from '@/lib/simbase';

export type StockSummary = {
  usable: { trackers: number; simcards: number | null };
  used: { trackers: number; simcards: number | null };
};

/**
 * GET /api/admin/stock/summary – counts for usable vs used stock (trackers + SIM cards).
 * Usable: trackers in_stock, SIMs disabled. Used: trackers assigned/sold/etc., SIMs enabled.
 */
export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Service role not configured' },
      { status: 503 }
    );
  }

  const [usableTrackersRes, usedTrackersRes] = await Promise.all([
    admin.from('tracker_stock').select('*', { count: 'exact', head: true }).eq('status', 'in_stock'),
    admin.from('tracker_stock').select('*', { count: 'exact', head: true }).neq('status', 'in_stock'),
  ]);

  const usableTrackers = (usableTrackersRes as { count?: number })?.count ?? 0;
  const usedTrackers = (usedTrackersRes as { count?: number })?.count ?? 0;

  let simcardsUsable: number | null = null;
  let simcardsUsed: number | null = null;
  try {
    const allSims = await listSimbaseSimcards();
    if (allSims.length >= 0) {
      const enabled = allSims.filter((s) => s.state === 'enabled').length;
      const disabled = allSims.filter((s) => s.state === 'disabled').length;
      simcardsUsable = disabled;
      simcardsUsed = enabled;
    }
  } catch {
    // leave null on Simbase error
  }

  const body: StockSummary = {
    usable: { trackers: usableTrackers, simcards: simcardsUsable },
    used: { trackers: usedTrackers, simcards: simcardsUsed },
  };

  return NextResponse.json(body);
}
