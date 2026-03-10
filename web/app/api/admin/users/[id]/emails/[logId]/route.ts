import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

/** GET /api/admin/users/[id]/emails/[logId] – single email body for admin view. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id: userId, logId } = await params;
  if (!userId || !logId) return NextResponse.json({ error: 'User ID and email log ID required' }, { status: 400 });

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const recipientEmail = authUser.user.email;

  const { data: row, error } = await admin
    .from('email_sent_log')
    .select('id, subject, event_name, body_html, sent_at, recipient_email')
    .eq('id', logId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Email not found' }, { status: 404 });
  if ((row as { recipient_email: string }).recipient_email !== recipientEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const r = row as { id: string; subject: string | null; event_name: string; body_html: string | null; sent_at: string };
  return NextResponse.json({
    id: r.id,
    subject: r.subject ?? r.event_name,
    body_html: r.body_html,
    sent_at: r.sent_at,
  });
}
