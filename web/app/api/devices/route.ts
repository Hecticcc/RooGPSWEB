import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeDeviceState } from '@/lib/device-state';

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

/** Fetch Simbase SIM details for one ICCID; returns connection.carrier or null. */
async function fetchSimbaseCarrier(iccid: string): Promise<string | null> {
  if (!SIMBASE_API_KEY) return null;
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
    if (!res.ok) return null;
    const data = (await res.json()) as { connection?: { carrier?: string } };
    const carrier = data?.connection?.carrier;
    return typeof carrier === 'string' && carrier.trim() ? carrier.trim() : null;
  } catch {
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
  // Base columns only so the query works even if heartbeat/moving_interval migration hasn't been run
  const { data: devices, error: devErr } = await supabase
    .from('devices')
    .select('id, name, created_at, last_seen_at, marker_color, marker_icon, watchdog_armed, watchdog_armed_at, emergency_enabled, emergency_status, heartbeat_minutes, moving_interval_seconds')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (devErr) {
    return NextResponse.json({ error: devErr.message }, { status: 500 });
  }
  type DeviceRow = (typeof devices)[number];
  const devicesWithOpt = devices as DeviceRow[] | null;
  if (!devicesWithOpt?.length) {
    return NextResponse.json([]);
  }
  const deviceIds = devicesWithOpt.map((d) => d.id);
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
    devicesWithOpt.map(async (d) => {
      const { data: loc } = await supabase
        .from('locations')
        .select('latitude, longitude, received_at, extra')
        .eq('device_id', d.id)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const extra = (loc?.extra as {
        battery?: { percent?: number; voltage_v?: number };
        signal?: { gps?: { valid?: boolean; fix_flag?: string; sats?: number; hdop?: number; has_signal?: boolean }; gsm?: { csq?: number; percent?: number | null; quality?: string } };
        pt60_state?: { is_stopped?: boolean };
        gps_lock?: boolean;
        power?: { battery_voltage_v?: number };
        internal_battery_voltage_v?: number;
      } | null) ?? null;
      const connError = latestErrorByDevice[d.id] ?? null;
      const lastBatteryV = extra?.battery?.voltage_v ?? extra?.power?.battery_voltage_v ?? extra?.internal_battery_voltage_v ?? null;
      const lastIsStopped = extra?.pt60_state?.is_stopped ?? null;
      const gpsLockLast = extra?.gps_lock ?? extra?.signal?.gps?.valid ?? null;
      const lastSeenAt = loc?.received_at ?? d.last_seen_at;
      const stateResult = computeDeviceState({
        last_seen_at: lastSeenAt,
        moving_interval_seconds: d.moving_interval_seconds ?? null,
        heartbeat_minutes: d.heartbeat_minutes ?? null,
        last_known_is_stopped: lastIsStopped,
        last_known_battery_voltage: lastBatteryV,
      });
      return {
        ...d,
        latest_lat: loc?.latitude ?? null,
        latest_lng: loc?.longitude ?? null,
        latest_battery_percent: extra?.battery?.percent ?? null,
        latest_battery_voltage_v: extra?.battery?.voltage_v ?? null,
        latest_signal: extra?.signal ?? null,
        marker_color: d.marker_color ?? '#f97316',
        connection_error: connError,
        device_state: stateResult.device_state,
        offline_reason: stateResult.offline_reason,
        gps_lock_last: gpsLockLast,
        last_battery_voltage: lastBatteryV,
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
  const uniqueIccids = Array.from(new Set(Object.values(iccidByDevice)));
  const carrierByIccid: Record<string, string | null> = {};
  await Promise.all(
    uniqueIccids.map(async (iccid) => {
      carrierByIccid[iccid] = await fetchSimbaseCarrier(iccid);
    })
  );
  const { data: nightGuardRules } = await supabase
    .from('night_guard_rules')
    .select('device_id, enabled, start_time_local, end_time_local, timezone, radius_m, home_lat, home_lon')
    .in('device_id', deviceIds);
  const nightGuardByDevice: Record<string, { enabled: boolean; start_time_local: string; end_time_local: string; timezone: string; radius_m: number; home_lat: number | null; home_lon: number | null }> = {};
  for (const r of nightGuardRules ?? []) {
    nightGuardByDevice[r.device_id] = {
      enabled: r.enabled === true,
      start_time_local: r.start_time_local ?? '21:00',
      end_time_local: r.end_time_local ?? '06:00',
      timezone: r.timezone ?? 'Australia/Melbourne',
      radius_m: r.radius_m ?? 50,
      home_lat: r.home_lat != null ? Number(r.home_lat) : null,
      home_lon: r.home_lon != null ? Number(r.home_lon) : null,
    };
  }

  const withCarrier = withLocation.map((d) => {
    const iccid = iccidByDevice[d.id];
    const sim_carrier = iccid ? carrierByIccid[iccid] ?? null : null;
    const ng = nightGuardByDevice[d.id];
    const night_guard_enabled = ng?.enabled === true;
    const night_guard_start_time_local = ng?.start_time_local ?? null;
    const night_guard_end_time_local = ng?.end_time_local ?? null;
    const night_guard_timezone = ng?.timezone ?? null;
    const night_guard_radius_m = ng?.radius_m ?? null;
    const night_guard_home_lat = ng?.home_lat ?? null;
    const night_guard_home_lon = ng?.home_lon ?? null;
    return { ...d, sim_carrier, night_guard_enabled, night_guard_start_time_local, night_guard_end_time_local, night_guard_timezone, night_guard_radius_m, night_guard_home_lat, night_guard_home_lon };
  });

  return NextResponse.json(withCarrier);
}
