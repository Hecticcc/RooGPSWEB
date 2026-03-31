import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { ADMIN_DEVICE_MODEL_CODES } from '@/lib/device-capabilities';

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
  const tokenSim = (tokenRow as { sim_iccid?: string } | null)?.sim_iccid?.trim() ?? null;
  const deviceSim = (device as { sim_iccid?: string | null }).sim_iccid?.trim() ?? null;
  const sim_iccid = deviceSim ?? tokenSim ?? null;

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
    .select('id, gps_time, received_at, latitude, longitude, speed_kph, course_deg, gps_valid, event_code, raw_payload, extra')
    .eq('device_id', id)
    .order('received_at', { ascending: false })
    .range(from, to);

  const payloads = (locations ?? []).map((loc) => {
    const extra = (loc.extra as {
      battery?: { percent?: number; voltage_v?: number };
      power?: { bat_hex?: string; ext_voltage_v?: number };
      signal?: { gps?: { sats?: number; hdop?: number }; gsm?: { csq?: number } };
      altitude_m?: number;
      odometer_m?: number;
    } | null) ?? null;
    return {
      id: loc.id,
      gps_time: loc.gps_time,
      received_at: loc.received_at,
      lat: loc.latitude,
      lon: loc.longitude,
      speed_kph: loc.speed_kph,
      course_deg: loc.course_deg ?? null,
      gps_valid: loc.gps_valid,
      event_code: loc.event_code ?? null,
      raw_payload: loc.raw_payload,
      // Battery (iStartek v2.2 tailToken ext-V|bat-V)
      battery_percent: extra?.battery?.percent ?? null,
      battery_voltage_v: extra?.battery?.voltage_v ?? null,
      bat_hex: extra?.power?.bat_hex ?? null,
      // GPS signal (from extra.signal, parsed per Protocol v2.2 §3)
      sats: extra?.signal?.gps?.sats ?? null,
      hdop: extra?.signal?.gps?.hdop ?? null,
      // Altitude and odometer (parsed from positions [12] and [13])
      altitude_m: extra?.altitude_m ?? null,
      odometer_m: extra?.odometer_m ?? null,
      // External voltage (non-null means car power is connected)
      ext_voltage_v: extra?.power?.ext_voltage_v ?? null,
      csq: extra?.signal?.gsm?.csq ?? null,
    };
  });

  const { data: trackerPricing } = await admin
    .from('product_pricing')
    .select('device_model_name')
    .or('sku.eq.gps_tracker,sku.eq.gps_tracker_wired');
  const fromPricing = (trackerPricing ?? [])
    .map((p) => (p as { device_model_name?: string | null }).device_model_name?.trim())
    .filter((s): s is string => Boolean(s));
  const available_models = Array.from(new Set([...ADMIN_DEVICE_MODEL_CODES, ...fromPricing])).sort();

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
    available_models,
  });
}

/** PATCH /api/admin/devices/[id] – update device (staff+). Body: { sim_iccid?: string; model_name?: string | null; name?: string | null }. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const { id: deviceId } = await params;
  if (!deviceId) return NextResponse.json({ error: 'Device ID required' }, { status: 400 });

  let body: { sim_iccid?: string; model_name?: string | null; name?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const simIccid = typeof body.sim_iccid === 'string' ? body.sim_iccid.trim() : null;
  if (simIccid) {
    const { data: token, error: tokenErr } = await admin
      .from('activation_tokens')
      .select('id, order_id')
      .eq('device_id', deviceId)
      .limit(1)
      .maybeSingle();
    if (tokenErr) return NextResponse.json({ error: tokenErr.message }, { status: 500 });

    if (token) {
      const { error: updateErr } = await admin
        .from('activation_tokens')
        .update({ sim_iccid: simIccid })
        .eq('id', token.id);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

      const { data: orderItem } = await admin
        .from('order_items')
        .select('id')
        .eq('activation_token_id', token.id)
        .maybeSingle();
      if (orderItem) {
        await admin
          .from('order_items')
          .update({ assigned_sim_iccid: simIccid })
          .eq('id', orderItem.id);
      }
    }

    const { error: deviceErr } = await admin
      .from('devices')
      .update({ sim_iccid: simIccid })
      .eq('id', deviceId);
    if (deviceErr) return NextResponse.json({ error: deviceErr.message }, { status: 500 });
  }

  const deviceUpdates: { model_name?: string | null; name?: string | null } = {};
  if (body.model_name !== undefined) deviceUpdates.model_name = body.model_name === null || body.model_name === '' ? null : String(body.model_name).trim() || null;
  if (body.name !== undefined) deviceUpdates.name = body.name === null || body.name === '' ? null : String(body.name).trim() || null;
  if (Object.keys(deviceUpdates).length > 0) {
    const { error: devErr } = await admin.from('devices').update(deviceUpdates).eq('id', deviceId);
    if (devErr) return NextResponse.json({ error: devErr.message }, { status: 500 });
  }

  if (simIccid && Object.keys(deviceUpdates).length === 0) return NextResponse.json({ ok: true, sim_iccid: simIccid });
  return NextResponse.json({ ok: true, ...(simIccid && { sim_iccid: simIccid }) });
}
