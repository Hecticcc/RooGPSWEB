import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { listSimbaseSms } from '@/lib/simbase';

/**
 * GET /api/admin/devices/[id]/sms
 * Returns Simbase SMS messages for the device's SIM (ICCID from activation_tokens).
 * Query: direction=mo|mt (optional), limit=1-250 (default 100), cursor (optional).
 */
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

  const { data: device } = await admin.from('devices').select('id').eq('id', deviceId).single();
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const { data: token } = await admin
    .from('activation_tokens')
    .select('sim_iccid')
    .eq('device_id', deviceId)
    .not('sim_iccid', 'is', null)
    .limit(1)
    .maybeSingle();
  const iccid = (token as { sim_iccid?: string } | null)?.sim_iccid?.trim();
  if (!iccid) {
    return NextResponse.json({
      sms: [],
      cursor: null,
      has_more: false,
      count: 0,
      message: 'No SIM ICCID for this device (activation_tokens).',
    });
  }

  const url = new URL(request.url);
  const direction = url.searchParams.get('direction') === 'mo' || url.searchParams.get('direction') === 'mt'
    ? url.searchParams.get('direction') as 'mo' | 'mt'
    : undefined;
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 100), 250);
  const cursor = url.searchParams.get('cursor') || undefined;
  const day = url.searchParams.get('day') || undefined;

  const result = await listSimbaseSms(iccid, { direction, limit, cursor: cursor ?? null, day });

  return NextResponse.json({
    ...result,
    iccid,
  });
}
