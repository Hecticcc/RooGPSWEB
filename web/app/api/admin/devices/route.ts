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
    .select('id, user_id, name, model_name, sim_iccid, created_at, last_seen_at, heartbeat_minutes, moving_interval_seconds')
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
  const latestLocations: Record<string, { battery_percent?: number; extra?: unknown; received_at?: string }> = {};
  if (deviceIds.length > 0) {
    const { data: locs } = await admin
      .from('locations')
      .select('device_id, extra, received_at')
      .in('device_id', deviceIds)
      .order('received_at', { ascending: false });
    const byDevice = new Map<string, { extra: unknown; received_at?: string }>();
    for (const loc of locs ?? []) {
      if (!byDevice.has(loc.device_id)) {
        byDevice.set(loc.device_id, { extra: loc.extra, received_at: (loc as { received_at?: string }).received_at });
      }
    }
    Array.from(byDevice.entries()).forEach(([did, v]) => {
      const extra = (v.extra as { battery?: { percent?: number }; pt60_state?: { is_stopped?: boolean } }) ?? null;
      latestLocations[did] = {
        battery_percent: extra?.battery?.percent,
        extra: v.extra,
        received_at: v.received_at,
      };
    });
  }

  const { data: tokens } = await admin
    .from('activation_tokens')
    .select('device_id, sim_iccid, order_id')
    .in('device_id', deviceIds)
    .not('device_id', 'is', null);
  const simIccidByDevice: Record<string, string> = {};
  const orderIdsFromTokens = new Set<string>();
  for (const t of tokens ?? []) {
    if (t.sim_iccid) simIccidByDevice[t.device_id] = t.sim_iccid;
    if (t.order_id) orderIdsFromTokens.add(t.order_id);
  }
  for (const d of deviceList) {
    const deviceIccid = (d as { sim_iccid?: string | null }).sim_iccid?.trim();
    if (deviceIccid) simIccidByDevice[d.id] = deviceIccid;
  }
  const suspendedDeviceIds = new Set<string>();
  const deviceIdToOrderId: Record<string, string> = {};
  if (orderIdsFromTokens.size > 0) {
    const { data: orders } = await admin
      .from('orders')
      .select('id, status')
      .in('id', Array.from(orderIdsFromTokens));
    const suspendedOrderIds = new Set((orders ?? []).filter((o) => o.status === 'suspended').map((o) => o.id));
    for (const t of tokens ?? []) {
      if (t.order_id && t.device_id && suspendedOrderIds.has(t.order_id)) suspendedDeviceIds.add(t.device_id);
      if (t.order_id && t.device_id && !deviceIdToOrderId[t.device_id]) deviceIdToOrderId[t.device_id] = t.order_id;
    }
  }

  const orderIds = Array.from(orderIdsFromTokens);
  let orderIdToTrackerSku: Record<string, string> = {};
  let productModelBySku: Record<string, string | null> = {};
  if (orderIds.length > 0) {
    const { data: orderItems } = await admin
      .from('order_items')
      .select('order_id, product_sku')
      .in('order_id', orderIds);
    for (const i of orderItems ?? []) {
      const sku = (i.product_sku ?? '').trim();
      if (sku && (sku === 'gps_tracker' || sku.includes('gps_tracker')) && !sku.includes('sim_')) {
        if (!orderIdToTrackerSku[i.order_id]) orderIdToTrackerSku[i.order_id] = sku;
      }
    }
    const trackerSkus = Array.from(new Set(Object.values(orderIdToTrackerSku)));
    if (trackerSkus.length > 0) {
      const { data: trackerPricing } = await admin
        .from('product_pricing')
        .select('sku, device_model_name')
        .in('sku', trackerSkus);
      for (const p of trackerPricing ?? []) {
        const row = p as { sku: string; device_model_name?: string | null };
        productModelBySku[row.sku] = row.device_model_name?.trim() ?? null;
      }
    }
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
    // Use effective last seen: max(latest location received_at, devices.last_seen_at) so sleep heartbeats count (same fix as user devices API).
    const locReceivedAt = latestLocations[d.id]?.received_at ?? null;
    const dbLastSeen = d.last_seen_at ?? null;
    const lastSeenAt =
      locReceivedAt && (!dbLastSeen || new Date(locReceivedAt) > new Date(dbLastSeen))
        ? locReceivedAt
        : dbLastSeen;
    const stateResult = computeDeviceState({
      last_seen_at: lastSeenAt,
      moving_interval_seconds: deviceRow.moving_interval_seconds ?? null,
      heartbeat_minutes: deviceRow.heartbeat_minutes ?? null,
      last_known_is_stopped: lastIsStopped,
    });
    const deviceStatus: 'online' | 'sleep' | 'offline' =
      stateResult.device_state === 'ONLINE' ? 'online' : stateResult.device_state === 'SLEEPING' ? 'sleep' : 'offline';
    const status: 'online' | 'sleep' | 'offline' | 'suspended' =
      suspendedDeviceIds.has(d.id) ? 'suspended' : deviceStatus;
    const sim_iccid = simIccidByDevice[d.id] ?? null;
    const rawSimState = sim_iccid ? simStateByIccid.get(normalizeIccid(sim_iccid)) ?? simStateByIccid.get(sim_iccid.replace(/^0+/, '')) : undefined;
    const sim_status = sim_iccid ? (rawSimState ?? 'unknown') : null;
    return {
      id: d.id,
      user_id: d.user_id,
      user_email: d.user_id ? emailByUser.get(d.user_id) ?? null : null,
      user_role: d.user_id ? roleByUser.get(d.user_id) ?? null : null,
      name: d.name,
      model_name: (() => {
        const fromDevice = (d as { model_name?: string | null }).model_name?.trim();
        if (fromDevice) return fromDevice;
        const orderId = deviceIdToOrderId[d.id];
        const sku = orderId ? orderIdToTrackerSku[orderId] : null;
        return (sku ? productModelBySku[sku] : null) ?? null;
      })(),
      status,
      device_state: stateResult.device_state,
      battery_percent: battery ?? null,
      last_seen_at: lastSeenAt,
      created_at: d.created_at,
      sim_iccid,
      sim_status,
    };
  });

  if (filter === 'online') list = list.filter((d) => d.status === 'online');
  else if (filter === 'offline') list = list.filter((d) => d.status === 'offline');
  else if (filter === 'suspended') list = list.filter((d) => d.status === 'suspended');
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
