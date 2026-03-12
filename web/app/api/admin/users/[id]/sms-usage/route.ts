import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

/**
 * DELETE /api/admin/users/[id]/sms-usage
 * Resets (deletes) all SMS usage records for the user.
 * Administrator only.
 *
 * Optional body: { period: "2026-03" } to reset a single month only.
 * Without a body, all periods are cleared.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'administrator');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { id: userId } = await params;
  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

  let period: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.period === 'string' && body.period.trim()) {
      period = body.period.trim();
    }
  } catch {
    // no body — delete all
  }

  let query = admin.from('sms_usage').delete().eq('user_id', userId);
  if (period) {
    query = query.eq('period', period);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, period: period ?? 'all' });
}
