import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 500 });
  const users = authData?.users ?? [];
  const userIds = users.map((u) => u.id);

  if (userIds.length === 0) {
    return NextResponse.json([]);
  }

  const [rolesRes, devicesRes] = await Promise.all([
    admin.from('user_roles').select('user_id, role, created_at').in('user_id', userIds),
    admin.from('devices').select('user_id'),
  ]);

  const roleByUser = new Map<string, { role: string; created_at: string }>();
  for (const r of rolesRes.data ?? []) {
    roleByUser.set(r.user_id, { role: r.role, created_at: r.created_at });
  }
  const deviceCountByUser = new Map<string, number>();
  for (const d of devicesRes.data ?? []) {
    deviceCountByUser.set(d.user_id, (deviceCountByUser.get(d.user_id) ?? 0) + 1);
  }

  const list = users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    role: roleByUser.get(u.id)?.role ?? 'customer',
    created_at: u.created_at ?? null,
    role_created_at: roleByUser.get(u.id)?.created_at ?? null,
    device_count: deviceCountByUser.get(u.id) ?? 0,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }));

  return NextResponse.json(list);
}
