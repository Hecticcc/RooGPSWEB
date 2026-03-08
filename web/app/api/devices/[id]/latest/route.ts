import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeViewDeviceState } from '@/lib/device-state';
import { getBatteryStatus } from '@/lib/battery';
import { csqToBars } from '@/lib/signal';
import { getDeviceCapabilities, getWiredPowerFromExtra } from '@/lib/device-capabilities';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: device } = await supabase
    .from('devices')
    .select('id, model_name, last_seen_at, heartbeat_minutes, moving_interval_seconds')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!device) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  type DeviceRow = (typeof device) & { model_name?: string | null; heartbeat_minutes?: number; moving_interval_seconds?: number };
  const deviceRow = device as DeviceRow;
  const { data, error } = await supabase
    .from('locations')
    .select('latitude, longitude, gps_time, received_at, gps_valid, speed_kph, course_deg, event_code, extra')
    .eq('device_id', id)
    .order('received_at', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(null);
  }
  const extra = (data.extra as Record<string, unknown> | null) ?? null;
  const batt = extra?.battery as { percent?: number; voltage_v?: number } | undefined;
  const pwr = extra?.power as { battery_voltage_v?: number } | undefined;
  const internalV = (extra as { internal_battery_voltage_v?: number })?.internal_battery_voltage_v;
  const batteryV = batt?.voltage_v ?? pwr?.battery_voltage_v ?? (typeof internalV === 'number' ? internalV : null);
  const gpsFixLast = data.gps_valid ?? (extra?.gps_lock as boolean) ?? (extra?.signal as { gps?: { valid?: boolean } })?.gps?.valid ?? null;
  const lastSeenAt = data.received_at ?? (device as { last_seen_at?: string | null }).last_seen_at;
  const viewState = computeViewDeviceState({
    last_seen_at: lastSeenAt,
    moving_interval_seconds: deviceRow.moving_interval_seconds ?? null,
    heartbeat_minutes: deviceRow.heartbeat_minutes ?? null,
    last_known_is_stopped: (extra?.pt60_state as { is_stopped?: boolean })?.is_stopped ?? null,
    last_known_battery_voltage: batteryV,
    gps_fix_last: gpsFixLast === true || gpsFixLast === false ? gpsFixLast : null,
  });
  const caps = getDeviceCapabilities(deviceRow.model_name);
  const wiredPower = getWiredPowerFromExtra(extra);
  const batteryStatus = getBatteryStatus({
    voltage_v: batteryV ?? undefined,
    percent: caps.showPrimaryBatteryAsMain ? (batt?.percent ?? undefined) : (wiredPower.backup_battery_percent ?? undefined),
  });
  const csq = (extra?.signal as { gsm?: { csq?: number } })?.gsm?.csq ?? null;
  const lastSeenAge = viewState.last_seen_age_seconds;
  const last_seen_relative =
    lastSeenAge == null ? null : lastSeenAge < 60 ? `${lastSeenAge}s ago` : lastSeenAge < 3600 ? `${Math.floor(lastSeenAge / 60)}m ago` : lastSeenAge < 86400 ? `${Math.floor(lastSeenAge / 3600)}h ago` : `${Math.floor(lastSeenAge / 86400)}d ago`;

  const { extra: _e, ...rest } = data;
  const heartbeatMinutes = deviceRow.heartbeat_minutes ?? 720;
  const base: Record<string, unknown> = {
    ...rest,
    battery_percent: batt?.percent ?? null,
    battery_voltage_v: batteryV,
    signal: extra?.signal ?? null,
    device_state: viewState.device_state,
    view_state: viewState.view_state,
    next_expected_checkin_at: viewState.next_expected_checkin_at,
    heartbeat_minutes: viewState.next_expected_checkin_at ? heartbeatMinutes : null,
    last_seen_iso: lastSeenAt,
    last_seen_relative,
    gps_fix_last: gpsFixLast,
    battery_voltage_last: batteryV,
    battery_level_label: batteryStatus.label,
    csq_last: csq,
    signal_bars: csq != null ? csqToBars(csq) : null,
    offline_reason: viewState.offline_reason,
    capabilities: caps,
  };
  if (caps.isWired) {
    base.external_power_connected = wiredPower.external_power_connected;
    base.backup_battery_percent = wiredPower.backup_battery_percent;
    base.acc_status = wiredPower.acc_status;
    base.power_source = wiredPower.power_source;
    base.backup_battery_voltage_v = wiredPower.backup_battery_voltage_v;
  }
  return NextResponse.json(base);
}
