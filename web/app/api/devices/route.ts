import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

const CARRIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min – carrier names change rarely
const carrierCache = new Map<string, { carrier: string | null; ts: number }>();

/** Fetch Simbase SIM details for one ICCID; returns connection.carrier or null. Cached 5 min. */
async function fetchSimbaseCarrier(iccid: string): Promise<string | null> {
  if (!SIMBASE_API_KEY) return null;
  const now = Date.now();
  const hit = carrierCache.get(iccid);
  if (hit && now - hit.ts < CARRIER_CACHE_TTL_MS) return hit.carrier;
  try {
    const base = SIMBASE_API_BASE.replace(/\/$/, '');
    const url = `${base}/simcards/${encodeURIComponent(iccid)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SIMBASE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      carrierCache.set(iccid, { carrier: null, ts: now });
      return null;
    }
    const data = (await res.json()) as { connection?: { carrier?: string } };
    const carrier = typeof data?.connection?.carrier === 'string' && data.connection.carrier.trim()
      ? data.connection.carrier.trim()
      : null;
    carrierCache.set(iccid, { carrier, ts: now });
    return carrier;
  } catch {
    carrierCache.set(iccid, { carrier: null, ts: now });
    return null;
  }
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: devices, error: devErr } = await supabase
    .from('devices')
    .select('id, name, created_at, last_seen_at, marker_color, marker_icon, watchdog_armed, watchdog_armed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (devErr) {
    return NextResponse.json({ error: devErr.message }, { status: 500 });
  }
  if (!devices?.length) {
    return NextResponse.json([]);
  }
  const deviceIds = devices.map((d) => d.id);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: connectionErrors } = await supabase
    .from('device_connection_errors')
    .select('device_id, error_message, created_at')
    .in('device_id', deviceIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  const latestErrorByDevice: Record<string, { error_message: string; created_at: string }> = {};
  for (const row of connectionErrors ?? []) {
    if (!latestErrorByDevice[row.device_id]) {
      latestErrorByDevice[row.device_id] = { error_message: row.error_message, created_at: row.created_at };
    }
  }
  const withLocation = await Promise.all(
    devices.map(async (d) => {
      const { data: loc } = await supabase
        .from('locations')
        .select('latitude, longitude, extra')
        .eq('device_id', d.id)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const extra = (loc?.extra as {
        battery?: { percent?: number; voltage_v?: number };
        signal?: { gps?: { valid?: boolean; sats?: number; hdop?: number; has_signal?: boolean }; gsm?: { csq?: number; percent?: number | null; quality?: string } };
      } | null) ?? null;
      const connError = latestErrorByDevice[d.id] ?? null;
      return {
        ...d,
        latest_lat: loc?.latitude ?? null,
        latest_lng: loc?.longitude ?? null,
        latest_battery_percent: extra?.battery?.percent ?? null,
        latest_battery_voltage_v: extra?.battery?.voltage_v ?? null,
        latest_signal: extra?.signal ?? null,
        marker_color: d.marker_color ?? '#f97316',
        connection_error: connError,
      };
    })
  );

  const { data: tokens } = await supabase
    .from('activation_tokens')
    .select('device_id, sim_iccid')
    .eq('user_id', user.id)
    .not('device_id', 'is', null)
    .in('device_id', deviceIds);
  const iccidByDevice: Record<string, string> = {};
  for (const t of tokens ?? []) {
    if (t.sim_iccid) iccidByDevice[t.device_id] = t.sim_iccid;
  }
  const uniqueIccids = [...new Set(Object.values(iccidByDevice))];
  const carrierByIccid: Record<string, string | null> = {};
  await Promise.all(
    uniqueIccids.map(async (iccid) => {
      carrierByIccid[iccid] = await fetchSimbaseCarrier(iccid);
    })
  );
  const withCarrier = withLocation.map((d) => {
    const iccid = iccidByDevice[d.id];
    const sim_carrier = iccid ? carrierByIccid[iccid] ?? null : null;
    return { ...d, sim_carrier };
  });

  return NextResponse.json(withCarrier);
}
