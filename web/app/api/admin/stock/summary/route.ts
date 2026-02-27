import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_SIMS_PATH = process.env.SIMBASE_SIMS_PATH ?? '/simcards';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

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

  if (SIMBASE_API_KEY) {
    try {
      const base = SIMBASE_API_BASE.replace(/\/$/, '');
      const path = SIMBASE_SIMS_PATH.startsWith('/') ? SIMBASE_SIMS_PATH : `/${SIMBASE_SIMS_PATH}`;
      const headers: HeadersInit = {
        Authorization: `Bearer ${SIMBASE_API_KEY}`,
        'Content-Type': 'application/json',
      };
      let enabled = 0;
      let disabled = 0;
      let cursor: string | null = null;
      const maxPages = 100;
      let page = 0;
      do {
        const url = new URL(base + path);
        if (cursor) url.searchParams.set('cursor', cursor);
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        if (!res.ok) break;
        let data: unknown;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          break;
        }
        const obj = data as { simcards?: { state?: string }[]; cursor?: string | null };
        const pageList = Array.isArray(data) ? data : (obj.simcards ?? []);
        for (const sim of pageList) {
          const s = sim as { state?: string };
          const state = (s.state ?? '').toString().toLowerCase();
          if (state === 'enabled') enabled++;
          else if (state === 'disabled') disabled++;
        }
        cursor = obj.cursor ?? null;
        page++;
      } while (cursor && page < maxPages);
      simcardsUsable = disabled;
      simcardsUsed = enabled;
    } catch {
      // leave null on Simbase error
    }
  }

  const body: StockSummary = {
    usable: { trackers: usableTrackers, simcards: simcardsUsable },
    used: { trackers: usedTrackers, simcards: simcardsUsed },
  };

  return NextResponse.json(body);
}
