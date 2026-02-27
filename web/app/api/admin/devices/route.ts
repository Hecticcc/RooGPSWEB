import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin API requires SUPABASE_SERVICE_ROLE_KEY in server environment (see .env.local or deployment env)' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get('filter') ?? ''; // online | offline | unassigned | low_battery

  const { data: devices, error: devErr } = await admin
    .from('devices')
    .select('id, user_id, name, created_at, last_seen_at, ingest_disabled')
    .order('created_at', { ascending: false });
  if (devErr) {
    return NextResponse.json({ error: devErr.message }, { status: 500 });
  }
  const deviceList = devices ?? [];

  const userIds = Array.from(new Set(deviceList.map((d) => d.user_id).filter(Boolean)));
  const { data: rolesData } = await admin.from('user_roles').select('user_id, role').in('user_id', userIds);
  const roleByUser = new Map((rolesData ?? []).map((r) => [r.user_id, r.role]));

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 500 });
  const emailByUser = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const now = Date.now();
  const onlineCutoff = new Date(now - ONLINE_THRESHOLD_MS).toISOString();

  const deviceIds = deviceList.map((d) => d.id);
  const latestLocations: Record<string, { battery_percent?: number }> = {};
  if (deviceIds.length > 0) {
    const { data: locs } = await admin
      .from('locations')
      .select('device_id, extra')
      .in('device_id', deviceIds)
      .order('received_at', { ascending: false });
    const byDevice = new Map<string, { extra: unknown }>();
    for (const loc of locs ?? []) {
      if (!byDevice.has(loc.device_id)) {
        byDevice.set(loc.device_id, { extra: loc.extra });
      }
    }
    Array.from(byDevice.entries()).forEach(([did, v]) => {
      const extra = (v.extra as { battery?: { percent?: number } }) ?? null;
      latestLocations[did] = { battery_percent: extra?.battery?.percent };
    });
  }

  let list = deviceList.map((d) => {
    const isOnline = d.last_seen_at && d.last_seen_at >= onlineCutoff;
    const battery = latestLocations[d.id]?.battery_percent;
    return {
      id: d.id,
      user_id: d.user_id,
      user_email: d.user_id ? emailByUser.get(d.user_id) ?? null : null,
      user_role: d.user_id ? roleByUser.get(d.user_id) ?? null : null,
      name: d.name,
      status: isOnline ? 'online' : 'offline',
      battery_percent: battery ?? null,
      last_seen_at: d.last_seen_at,
      created_at: d.created_at,
      ingest_disabled: d.ingest_disabled ?? false,
    };
  });

  if (filter === 'online') list = list.filter((d) => d.status === 'online');
  else if (filter === 'offline') list = list.filter((d) => d.status === 'offline');
  else if (filter === 'unassigned') list = list.filter((d) => !d.user_id);
  else if (filter === 'low_battery') list = list.filter((d) => d.battery_percent != null && d.battery_percent < 20);

  return NextResponse.json(list);
}
