import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { computeViewDeviceState } from '@/lib/device-state';

/** GET /api/share/[token] – public. Returns device name, expiry, latest position, view state and motion for the share page. No auth. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: 'invalid' }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: link, error: linkErr } = await admin
    .from('tracker_share_links')
    .select('id, device_id, expires_at')
    .eq('token', token.trim())
    .single();

  if (linkErr || !link) {
    return NextResponse.json({ error: 'invalid' }, { status: 404 });
  }

  const expiresAt = new Date(link.expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const deviceId = link.device_id;

  const { data: device } = await admin
    .from('devices')
    .select('id, name, last_seen_at, heartbeat_minutes, moving_interval_seconds')
    .eq('id', deviceId)
    .single();
  if (!device) {
    return NextResponse.json({ error: 'invalid' }, { status: 404 });
  }

  const { data: latestRow } = await admin
    .from('locations')
    .select('latitude, longitude, received_at, speed_kph, gps_valid, extra')
    .eq('device_id', deviceId)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const from = new Date();
  from.setHours(from.getHours() - 24);
  const { data: historyRows } = await admin
    .from('locations')
    .select('latitude, longitude, received_at, speed_kph')
    .eq('device_id', deviceId)
    .gte('received_at', from.toISOString())
    .order('received_at', { ascending: true })
    .limit(500);

  const history = (historyRows ?? [])
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      received_at: r.received_at,
      speed_kph: r.speed_kph ?? null,
    }));

  const deviceRow = device as {
    id: string;
    name: string | null;
    last_seen_at?: string | null;
    heartbeat_minutes?: number | null;
    moving_interval_seconds?: number | null;
  };
  const extra = (latestRow?.extra as {
    pt60_state?: { is_stopped?: boolean };
    battery?: { voltage_v?: number };
    power?: { battery_voltage_v?: number };
    internal_battery_voltage_v?: number;
    signal?: { gps?: { valid?: boolean } };
    gps_lock?: boolean;
  } | null) ?? null;
  const lastSeenAt = latestRow?.received_at ?? deviceRow.last_seen_at ?? null;
  const batteryV = extra?.battery?.voltage_v ?? extra?.power?.battery_voltage_v ?? extra?.internal_battery_voltage_v ?? null;
  const gpsFixLast = latestRow?.gps_valid ?? extra?.gps_lock ?? extra?.signal?.gps?.valid ?? null;
  const viewStateResult = computeViewDeviceState({
    last_seen_at: lastSeenAt,
    moving_interval_seconds: deviceRow.moving_interval_seconds ?? null,
    heartbeat_minutes: deviceRow.heartbeat_minutes ?? null,
    last_known_is_stopped: extra?.pt60_state?.is_stopped ?? null,
    last_known_battery_voltage: batteryV,
    gps_fix_last: gpsFixLast === true || gpsFixLast === false ? gpsFixLast : null,
  });
  const speedKph = latestRow?.speed_kph ?? null;
  const motion = speedKph != null && speedKph > 0 ? 'in_motion' : 'stopped';

  const latest =
    latestRow?.latitude != null && latestRow?.longitude != null
      ? {
          latitude: latestRow.latitude,
          longitude: latestRow.longitude,
          received_at: latestRow.received_at,
          speed_kph: speedKph,
          gps_valid: latestRow.gps_valid ?? null,
        }
      : null;

  return NextResponse.json({
    device: { id: device.id, name: device.name ?? 'Tracker' },
    expires_at: link.expires_at,
    view_state: viewStateResult.view_state,
    motion,
    latest,
    history,
  });
}
