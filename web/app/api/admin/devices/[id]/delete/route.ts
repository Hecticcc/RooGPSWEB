import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'administrator');
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

  const { error: locErr } = await admin.from('locations').delete().eq('device_id', deviceId);
  if (locErr) {
    return NextResponse.json({ error: locErr.message }, { status: 500 });
  }
  const { error: devErr } = await admin.from('devices').delete().eq('id', deviceId);
  if (devErr) {
    return NextResponse.json({ error: devErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
