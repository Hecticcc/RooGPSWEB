import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { listSimbaseSimcards } from '@/lib/simbase';

/** Display order for known tracker SKUs (matches admin stock / pricing). */
const TRACKER_SKU_ORDER = ['gps_tracker', 'gps_tracker_wired'] as const;

export type TrackerModelStockRow = {
  product_sku: string;
  /** Human-readable name for dashboards (falls back to sku). */
  label: string;
  in_stock: number;
  deployed: number;
  total: number;
};

export type StockSummary = {
  usable: { trackers: number; simcards: number | null };
  used: { trackers: number; simcards: number | null };
  /** Per product_sku breakdown from tracker_stock. */
  trackers_by_model: TrackerModelStockRow[];
};

const SKU_LABELS: Record<string, string> = {
  gps_tracker: 'PT60 LTE (standard)',
  gps_tracker_wired: 'PT60 LTE (wired)',
};

function labelForSku(sku: string): string {
  return SKU_LABELS[sku] ?? sku.replace(/_/g, ' ');
}

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

  const [usableTrackersRes, usedTrackersRes, stockRowsRes] = await Promise.all([
    admin.from('tracker_stock').select('*', { count: 'exact', head: true }).eq('status', 'in_stock'),
    admin.from('tracker_stock').select('*', { count: 'exact', head: true }).neq('status', 'in_stock'),
    admin.from('tracker_stock').select('product_sku, status'),
  ]);

  const usableTrackers = (usableTrackersRes as { count?: number })?.count ?? 0;
  const usedTrackers = (usedTrackersRes as { count?: number })?.count ?? 0;

  const counts = new Map<string, { in_stock: number; deployed: number }>();
  for (const row of (stockRowsRes.data ?? []) as { product_sku?: string | null; status?: string | null }[]) {
    const raw = typeof row.product_sku === 'string' && row.product_sku.trim() ? row.product_sku.trim().toLowerCase() : 'gps_tracker';
    const cur = counts.get(raw) ?? { in_stock: 0, deployed: 0 };
    if (row.status === 'in_stock') cur.in_stock += 1;
    else cur.deployed += 1;
    counts.set(raw, cur);
  }

  const known = new Set<string>(TRACKER_SKU_ORDER);
  const trackers_by_model: TrackerModelStockRow[] = [];
  for (const sku of TRACKER_SKU_ORDER) {
    const c = counts.get(sku) ?? { in_stock: 0, deployed: 0 };
    trackers_by_model.push({
      product_sku: sku,
      label: labelForSku(sku),
      in_stock: c.in_stock,
      deployed: c.deployed,
      total: c.in_stock + c.deployed,
    });
  }
  for (const [sku, c] of counts) {
    if (known.has(sku)) continue;
    trackers_by_model.push({
      product_sku: sku,
      label: labelForSku(sku),
      in_stock: c.in_stock,
      deployed: c.deployed,
      total: c.in_stock + c.deployed,
    });
  }

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
    trackers_by_model,
  };

  return NextResponse.json(body);
}
