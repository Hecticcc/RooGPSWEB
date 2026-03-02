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
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: device, error: devErr } = await admin
    .from('devices')
    .select('id, last_seen_at')
    .eq('id', deviceId)
    .single();
  if (devErr || !device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const { data: loc } = await admin
    .from('locations')
    .select('received_at, gps_valid, extra')
    .eq('device_id', deviceId)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const extra = (loc?.extra as {
    battery?: { percent?: number; voltage_v?: number };
    signal?: {
      gps?: { sats?: number; hdop?: number; valid?: boolean; fix_flag?: string };
      gsm?: { csq?: number; quality?: string };
    };
  } | null) ?? null;
  const gps = extra?.signal?.gps;
  const gsm = extra?.signal?.gsm;

  const last_seen_at = device.last_seen_at ?? loc?.received_at ?? null;
  const gps_valid = loc?.gps_valid ?? gps?.valid ?? null;
  const sats = gps?.sats ?? null;
  const hdop = gps?.hdop ?? null;
  const csq = gsm?.csq ?? null;
  const battery_percent = extra?.battery?.percent ?? null;
  const subscription_status = 'active'; // placeholder

  const suggested_fixes: string[] = [];
  const lastSeenMs = last_seen_at ? new Date(last_seen_at).getTime() : 0;
  const staleThresholdMs = 10 * 60 * 1000;
  if (gps_valid === false && (csq == null || csq >= 10)) {
    suggested_fixes.push('GPS can\'t see sky');
  }
  if (csq != null && csq < 10) {
    suggested_fixes.push('Poor mobile signal');
  }
  if (lastSeenMs > 0 && Date.now() - lastSeenMs > staleThresholdMs) {
    suggested_fixes.push('Device offline/sleep/SIM issue');
  }

  return NextResponse.json({
    last_seen_at,
    gps_valid,
    sats,
    hdop,
    csq,
    battery_percent,
    battery_tier: battery_percent == null ? null : battery_percent >= 50 ? 'good' : battery_percent >= 20 ? 'low' : 'critical',
    subscription_status,
    suggested_fixes,
  });
}
