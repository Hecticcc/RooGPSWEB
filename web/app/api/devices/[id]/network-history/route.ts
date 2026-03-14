import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/**
 * Lightweight endpoint for the network-history bar in the Signal tab.
 *
 * Returns an array of carrier segments:
 *   { from: ISO, to: ISO, carrier: string | null }
 *
 * How it works:
 *   1. Fetch up to 20 000 `received_at` timestamps from `locations` for this device
 *      over the requested window.
 *   2. Fetch all rows from `device_carrier_log` over the same window (plus a small
 *      look-back before the window start so the first ping can inherit a carrier).
 *   3. For each ping, find the most-recent carrier-log entry whose `recorded_at` <=
 *      ping's `received_at` — that is the carrier at that moment.
 *   4. Merge consecutive same-carrier pings that are < 4 h apart into one segment.
 *      Gaps > 4 h become a gap segment (carrier: null) so the UI can colour them grey.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? '';
  const to   = searchParams.get('to')   ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20000', 10) || 20000, 20000);

  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── 1. Ping timestamps ────────────────────────────────────────────────────
  let pingsQuery = supabase
    .from('locations')
    .select('received_at')
    .eq('device_id', id)
    .order('received_at', { ascending: true })
    .limit(limit);
  if (from) pingsQuery = pingsQuery.gte('received_at', from);
  if (to)   pingsQuery = pingsQuery.lte('received_at', to);

  // ── 2. Carrier log ────────────────────────────────────────────────────────
  // Look back 48 h before the window start so the very first ping can inherit
  // a carrier that was recorded before the window.
  const lookBackMs = 48 * 60 * 60 * 1000;
  const carrierFrom = from
    ? new Date(new Date(from).getTime() - lookBackMs).toISOString()
    : undefined;

  let carrierQuery = supabase
    .from('device_carrier_log')
    .select('carrier, recorded_at')
    .eq('device_id', id)
    .order('recorded_at', { ascending: true })
    .limit(5000);
  if (carrierFrom) carrierQuery = carrierQuery.gte('recorded_at', carrierFrom);
  if (to)          carrierQuery = carrierQuery.lte('recorded_at', to);

  const [{ data: pingsRaw, error: pErr }, { data: carrierLog, error: cErr }] =
    await Promise.all([pingsQuery, carrierQuery]);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const timestamps = (pingsRaw ?? []).map((r) => r.received_at as string).filter(Boolean);
  if (timestamps.length === 0) return NextResponse.json([]);

  // ── 3. Assign carrier to each ping ───────────────────────────────────────
  // carrier log sorted ascending — binary search for the floor entry.
  const clog = (carrierLog ?? []) as { carrier: string; recorded_at: string }[];
  const clogMs = clog.map((c) => new Date(c.recorded_at).getTime());

  function carrierAtTime(tMs: number): string | null {
    // Find last log entry with recorded_at <= tMs
    let lo = 0, hi = clogMs.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (clogMs[mid]! <= tMs) { idx = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return idx >= 0 ? clog[idx]!.carrier : null;
  }

  // ── 4. Build merged segments ──────────────────────────────────────────────
  const MERGE_GAP_MS = 4 * 60 * 60 * 1000;

  type Seg = { from: number; to: number; carrier: string | null; type: 'data' | 'gap' };
  const merged: Seg[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const tMs  = new Date(timestamps[i]!).getTime();
    const next = timestamps[i + 1] ? new Date(timestamps[i + 1]!).getTime() : tMs + 1;
    const carrier = carrierAtTime(tMs);

    const prev = merged[merged.length - 1];
    const gap  = prev ? tMs - prev.to : 0;

    if (prev && prev.type === 'data' && prev.carrier === carrier && gap <= MERGE_GAP_MS) {
      prev.to = next;
    } else {
      if (prev && gap > MERGE_GAP_MS) {
        // Insert an explicit gap segment
        merged.push({ from: prev.to, to: tMs, carrier: null, type: 'gap' });
      }
      merged.push({ from: tMs, to: next, carrier, type: 'data' });
    }
  }

  // Convert back to ISO strings for the client
  return NextResponse.json(
    merged.map((s) => ({
      from: new Date(s.from).toISOString(),
      to:   new Date(s.to).toISOString(),
      carrier: s.carrier,
      type: s.type,
    }))
  );
}
