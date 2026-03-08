import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  let body: { user_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : null;
  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { error } = await admin.from('devices').update({ user_id: userId }).eq('id', deviceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Keep stock status in sync: device assigned to user → tracker_stock assigned
  await admin.from('tracker_stock').update({ status: 'assigned', updated_at: new Date().toISOString() }).eq('imei', deviceId);
  return NextResponse.json({ ok: true });
}
