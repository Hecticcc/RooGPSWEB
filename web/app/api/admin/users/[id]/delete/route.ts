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
  const { id: targetUserId } = await params;
  if (!targetUserId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
