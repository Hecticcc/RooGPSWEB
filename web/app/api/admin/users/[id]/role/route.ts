import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { isAdministrator } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

const ALLOWED_ROLES: UserRole[] = ['customer', 'staff', 'staff_plus', 'administrator'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  if (!targetUserId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  let body: { role?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const newRole = typeof body.role === 'string' ? body.role.toLowerCase().replace(/\+/g, '_') : null;
  if (!newRole || !ALLOWED_ROLES.includes(newRole as UserRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // StaffPlus can change role except to/from Administrator
  if (!isAdministrator(guard.role) && newRole === 'administrator') {
    return NextResponse.json({ error: 'Only Administrator can set Administrator role' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { error } = await admin
    .from('user_roles')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('user_id', targetUserId);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
