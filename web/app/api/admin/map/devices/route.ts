import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { computeDeviceState } from '@/lib/device-state';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 503 });
  }

  // All devices with enough to compute state + display
  const { data: devices, error: devErr } = await admin
    .from('devices')
    .select('id, user_id, name, model_name, last_seen_at, heartbeat_minutes, moving_interval_seconds, marker_color, marker_icon')
    .order('name', { ascending: true });
  if (devErr) return NextResponse.json({ error: devErr.message }, { status: 500 });

  const deviceList = devices ?? [];
  const deviceIds = deviceList.map((d) => d.id);

  // Lookup emails in parallel with location fetch
  const [authResult, locsResult] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    deviceIds.length > 0
      ? admin.rpc('get_latest_locations_per_device', { p_device_ids: deviceIds, p_n: 1 })
      : Promise.resolve({ data: [] }),
  ]);

  const emailByUser = new Map(
    (authResult.data?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  type LocRow = {
    device_id: string;
    latitude: number | null;
    longitude: number | null;
    received_at: string;
    extra: Record<string, unknown> | null;
  };

  const locByDevice: Record<string, LocRow> = {};
  for (const row of (locsResult.data ?? []) as LocRow[]) {
    if (!locByDevice[row.device_id]) locByDevice[row.device_id] = row;
  }

  const result = deviceList.map((d) => {
    const loc = locByDevice[d.id] ?? null;
    const extra = (loc?.extra ?? null) as Record<string, unknown> | null;

    // Battery
    const batt = extra?.battery as { percent?: number; voltage_v?: number } | undefined;
    const pow = extra?.power as { battery_voltage_v?: number } | undefined;
    const batteryPercent: number | null = batt?.percent ?? null;
    const batteryVoltage: number | null =
      batt?.voltage_v ?? pow?.battery_voltage_v ??
      ((extra?.internal_battery_voltage_v as number) ?? null);

    // Compute state using latest of loc.received_at vs devices.last_seen_at
    const locReceivedAt = loc?.received_at ?? null;
    const dbLastSeen = d.last_seen_at ?? null;
    const lastSeenAt =
      locReceivedAt && (!dbLastSeen || new Date(locReceivedAt) > new Date(dbLastSeen))
        ? locReceivedAt
        : dbLastSeen;

    const stateResult = computeDeviceState({
      last_seen_at: lastSeenAt,
      moving_interval_seconds: (d as { moving_interval_seconds?: number | null }).moving_interval_seconds ?? null,
      heartbeat_minutes: (d as { heartbeat_minutes?: number | null }).heartbeat_minutes ?? null,
    });

    return {
      id: d.id,
      name: d.name,
      model_name: (d as { model_name?: string | null }).model_name ?? null,
      user_id: d.user_id,
      user_email: d.user_id ? (emailByUser.get(d.user_id) ?? null) : null,
      lat: loc?.latitude ?? null,
      lng: loc?.longitude ?? null,
      last_seen_at: lastSeenAt,
      device_state: stateResult.device_state,
      battery_percent: batteryPercent,
      battery_voltage: batteryVoltage,
      marker_color: (d as { marker_color?: string | null }).marker_color ?? '#f97316',
      marker_icon: (d as { marker_icon?: string | null }).marker_icon ?? null,
    };
  });

  return NextResponse.json(result);
}
