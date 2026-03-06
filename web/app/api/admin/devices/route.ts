import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { listSimbaseSimcards } from '@/lib/simbase';
import { computeDeviceState } from '@/lib/device-state';

function normalizeIccid(iccid: string): string {
  return String(iccid ?? '').trim();
}

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
  const searchDeviceId = (searchParams.get('searchDeviceId') ?? '').trim().toLowerCase();
  const searchUser = (searchParams.get('searchUser') ?? '').trim().toLowerCase();

  const { data: devices, error: devErr } = await admin
    .from('devices')
    .select('id, user_id, name, created_at, last_seen_at, heartbeat_minutes, moving_interval_seconds')
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

  const deviceIds = deviceList.map((d) => d.id);
  const latestLocations: Record<string, { battery_percent?: number; extra?: unknown }> = {};
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
      const extra = (v.extra as { battery?: { percent?: number }; pt60_state?: { is_stopped?: boolean } }) ?? null;
      latestLocations[did] = {
        battery_percent: extra?.battery?.percent,
        extra: v.extra,
      };
    });
  }

  const { data: tokens } = await admin
    .from('activation_tokens')
    .select('device_id, sim_iccid')
    .in('device_id', deviceIds)
    .not('device_id', 'is', null);
  const simIccidByDevice: Record<string, string> = {};
  for (const t of tokens ?? []) {
    if (t.sim_iccid) simIccidByDevice[t.device_id] = t.sim_iccid;
  }
  const allIccids = Array.from(new Set(Object.values(simIccidByDevice)));
  let simStateByIccid = new Map<string, string>();
  try {
    const sims = await listSimbaseSimcards();
    for (const s of sims) {
      simStateByIccid.set(s.iccid, s.state);
      simStateByIccid.set(s.iccid.replace(/^0+/, ''), s.state);
    }
  } catch {
    // Simbase not configured or error
  }

  type DeviceRow = (typeof deviceList)[number] & { heartbeat_minutes?: number | null; moving_interval_seconds?: number | null };
  let list = deviceList.map((d) => {
    const battery = latestLocations[d.id]?.battery_percent;
    const locExtra = latestLocations[d.id]?.extra as { pt60_state?: { is_stopped?: boolean } } | undefined;
    const lastIsStopped = locExtra?.pt60_state?.is_stopped ?? null;
    const deviceRow = d as DeviceRow;
    const stateResult = computeDeviceState({
      last_seen_at: d.last_seen_at,
      moving_interval_seconds: deviceRow.moving_interval_seconds ?? null,
      heartbeat_minutes: deviceRow.heartbeat_minutes ?? null,
      last_known_is_stopped: lastIsStopped,
    });
    const status: 'online' | 'sleep' | 'offline' =
      stateResult.device_state === 'ONLINE' ? 'online' : stateResult.device_state === 'SLEEPING' ? 'sleep' : 'offline';
    const sim_iccid = simIccidByDevice[d.id] ?? null;
    const rawSimState = sim_iccid ? simStateByIccid.get(normalizeIccid(sim_iccid)) ?? simStateByIccid.get(sim_iccid.replace(/^0+/, '')) : undefined;
    const sim_status = sim_iccid ? (rawSimState ?? 'unknown') : null;
    return {
      id: d.id,
      user_id: d.user_id,
      user_email: d.user_id ? emailByUser.get(d.user_id) ?? null : null,
      user_role: d.user_id ? roleByUser.get(d.user_id) ?? null : null,
      name: d.name,
      status,
      device_state: stateResult.device_state,
      battery_percent: battery ?? null,
      last_seen_at: d.last_seen_at,
      created_at: d.created_at,
      sim_iccid,
      sim_status,
    };
  });

  if (filter === 'online') list = list.filter((d) => d.status === 'online');
  else if (filter === 'offline') list = list.filter((d) => d.status === 'offline');
  else if (filter === 'unassigned') list = list.filter((d) => !d.user_id);
  else if (filter === 'low_battery') list = list.filter((d) => d.battery_percent != null && d.battery_percent < 20);

  if (searchDeviceId) {
    list = list.filter((d) => d.id.toLowerCase().includes(searchDeviceId));
  }
  if (searchUser) {
    list = list.filter((d) => {
      const email = (d.user_email ?? '').toLowerCase();
      const uid = (d.user_id ?? '').toLowerCase();
      return email.includes(searchUser) || uid.includes(searchUser);
    });
  }

  return NextResponse.json(list);
}
