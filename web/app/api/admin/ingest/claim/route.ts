import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  let body: { device_id?: string; user_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : null;
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : null;
  if (!deviceId || !userId) {
    return NextResponse.json({ error: 'device_id and user_id required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: existing } = await admin.from('devices').select('id, user_id').eq('id', deviceId).maybeSingle();
  if (existing) {
    const { error } = await admin.from('devices').update({ user_id: userId }).eq('id', deviceId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, claimed: true, reassigned: true });
  }
  const { error } = await admin.from('devices').insert({ id: deviceId, user_id: userId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, claimed: true });
}
