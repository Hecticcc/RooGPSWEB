import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { id } = await params;
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: device, error: devErr } = await admin
    .from('devices')
    .select('*')
    .eq('id', id)
    .single();
  if (devErr || !device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', device.user_id).maybeSingle();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const owner = authUsers?.users?.find((u) => u.id === device.user_id);

  const { data: tokenRow } = await admin
    .from('activation_tokens')
    .select('sim_iccid')
    .eq('device_id', id)
    .not('sim_iccid', 'is', null)
    .limit(1)
    .maybeSingle();
  const sim_iccid = (tokenRow as { sim_iccid?: string } | null)?.sim_iccid?.trim() ?? null;

  const limit = Math.min(100, Math.max(1, parseInt(new URL(request.url).searchParams.get('limit') ?? '20', 10) || 20));
  const page = Math.max(1, parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10) || 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { count, error: countErr } = await admin
    .from('locations')
    .select('*', { count: 'exact', head: true })
    .eq('device_id', id);
  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }
  const total_payloads = typeof count === 'number' ? count : 0;

  const { data: locations } = await admin
    .from('locations')
    .select('id, gps_time, received_at, latitude, longitude, speed_kph, gps_valid, raw_payload, extra')
    .eq('device_id', id)
    .order('received_at', { ascending: false })
    .range(from, to);

  const payloads = (locations ?? []).map((loc) => {
    const extra = (loc.extra as {
      battery?: { percent?: number; voltage_v?: number };
      power?: { bat_hex?: string };
    } | null) ?? null;
    return {
      id: loc.id,
      gps_time: loc.gps_time,
      received_at: loc.received_at,
      lat: loc.latitude,
      lon: loc.longitude,
      speed_kph: loc.speed_kph,
      gps_valid: loc.gps_valid,
      raw_payload: loc.raw_payload,
      battery_percent: extra?.battery?.percent ?? null,
      battery_voltage_v: extra?.battery?.voltage_v ?? null,
      bat_hex: extra?.power?.bat_hex ?? null,
    };
  });

  return NextResponse.json({
    device: {
      ...device,
      owner_email: owner?.email ?? null,
      owner_role: roleRow?.role ?? null,
      sim_iccid,
    },
    last_payloads: payloads,
    total_payloads,
    payload_page: page,
    payload_limit: limit,
  });
}
