import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeDeviceState } from '@/lib/device-state';
import { getDeviceCapabilities, getWiredPowerFromExtra } from '@/lib/device-capabilities';

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
    .select('id, name, model_name, created_at, last_seen_at, marker_color, marker_icon, watchdog_armed, watchdog_armed_at, emergency_enabled, emergency_status, heartbeat_minutes, moving_interval_seconds')
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
      const caps = getDeviceCapabilities((d as { model_name?: string | null }).model_name);
      const limit = caps.isWired ? 8 : 1;
      const { data: locs } = await supabase
        .from('locations')
        .select('latitude, longitude, received_at, extra')
        .eq('device_id', d.id)
        .order('received_at', { ascending: false })
        .limit(limit);
      const list = (locs ?? []) as { latitude: number | null; longitude: number | null; received_at: string; extra: Record<string, unknown> | null }[];
      const loc = list[0] ?? null;
      const extra = (loc?.extra as Record<string, unknown> | null) ?? null;
      const hasBatteryData = (e: Record<string, unknown> | null) => {
        if (!e) return false;
        if (e.wired_power != null) return true;
        const bat = e.battery as { percent?: number; voltage_v?: number } | undefined;
        const pow = e.power as { battery_voltage_v?: number } | undefined;
        return bat?.percent != null || bat?.voltage_v != null || pow?.battery_voltage_v != null;
      };
      const hasSignal = (e: Record<string, unknown> | null) => e?.signal != null;
      const locForBattery = caps.isWired && list.length > 1 && !hasBatteryData(extra)
        ? list.find((l) => hasBatteryData(l.extra as Record<string, unknown> | null)) ?? loc
        : loc;
      const locForSignal = caps.isWired && list.length > 1 && !hasSignal(extra)
        ? list.find((l) => hasSignal(l.extra as Record<string, unknown> | null)) ?? loc
        : loc;
      const extraForBattery = (locForBattery?.extra as Record<string, unknown> | null) ?? null;
      const extraForSignal = (locForSignal?.extra as Record<string, unknown> | null) ?? null;
      const extraTelemetry = extraForBattery;
      const connError = latestErrorByDevice[d.id] ?? null;
      const batt = extra?.battery as { voltage_v?: number } | undefined;
      const pwr = extra?.power as { battery_voltage_v?: number } | undefined;
      const internalV = (extra as { internal_battery_voltage_v?: number })?.internal_battery_voltage_v;
      const lastBatteryV = batt?.voltage_v ?? pwr?.battery_voltage_v ?? (typeof internalV === 'number' ? internalV : null);
      const lastIsStopped = (extra?.pt60_state as { is_stopped?: boolean })?.is_stopped ?? null;
      const gpsLockFromExtra = (e: Record<string, unknown> | null) =>
        (e?.gps_lock as boolean) ?? (e?.signal as { gps?: { valid?: boolean } })?.gps?.valid ?? null;
      const gpsLockLast = caps.isWired && locForSignal ? gpsLockFromExtra(extraForSignal) : gpsLockFromExtra(extra);
      const lastSeenAt = loc?.received_at ?? d.last_seen_at;
      const stateResult = computeDeviceState({
        last_seen_at: lastSeenAt,
        moving_interval_seconds: d.moving_interval_seconds ?? null,
        heartbeat_minutes: d.heartbeat_minutes ?? null,
        last_known_is_stopped: lastIsStopped,
        last_known_battery_voltage: lastBatteryV,
      });
      const wiredPower = getWiredPowerFromExtra(caps.isWired ? extraForBattery : extra);
      return {
        ...d,
        latest_lat: loc?.latitude ?? null,
        latest_lng: loc?.longitude ?? null,
        latest_battery_percent: (extraForBattery?.battery as { percent?: number })?.percent ?? null,
        latest_battery_voltage_v: (extraForBattery?.battery as { voltage_v?: number })?.voltage_v ?? null,
        latest_signal: extraForSignal?.signal ?? extraTelemetry?.signal ?? null,
        marker_color: d.marker_color ?? '#f97316',
        connection_error: connError,
        device_state: stateResult.device_state,
        offline_reason: stateResult.offline_reason,
        gps_lock_last: gpsLockLast,
        last_battery_voltage: lastBatteryV,
        capabilities: caps,
        latest_external_power_connected: caps.isWired ? wiredPower.external_power_connected : undefined,
        latest_backup_battery_percent: caps.isWired ? wiredPower.backup_battery_percent : undefined,
        latest_acc_status: caps.isWired ? wiredPower.acc_status : undefined,
        latest_power_source: caps.isWired ? wiredPower.power_source : undefined,
      };
    })
  );

  const { data: tokens } = await supabase
    .from('activation_tokens')
    .select('device_id, sim_iccid, order_id')
    .eq('user_id', user.id)
    .not('device_id', 'is', null)
    .in('device_id', deviceIds);
  const iccidByDevice: Record<string, string> = {};
  const orderIdByDevice: Record<string, string> = {};
  for (const t of tokens ?? []) {
    if (t.sim_iccid) iccidByDevice[t.device_id] = t.sim_iccid;
    if (t.order_id) orderIdByDevice[t.device_id] = t.order_id;
  }
  const suspendedDeviceIds = new Set<string>();
  const orderIdsFromTokens = Array.from(new Set(Object.values(orderIdByDevice)));
  if (orderIdsFromTokens.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, status')
      .in('id', orderIdsFromTokens);
    const suspendedOrderIds = new Set((orders ?? []).filter((o) => o.status === 'suspended').map((o) => o.id));
    for (const [deviceId, orderId] of Object.entries(orderIdByDevice)) {
      if (suspendedOrderIds.has(orderId)) suspendedDeviceIds.add(deviceId);
    }
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
    const subscription_suspended = suspendedDeviceIds.has(d.id);
    return { ...d, sim_carrier, night_guard_enabled, night_guard_start_time_local, night_guard_end_time_local, night_guard_timezone, night_guard_radius_m, night_guard_home_lat, night_guard_home_lon, subscription_suspended };
  });

  return NextResponse.json(withCarrier);
}
