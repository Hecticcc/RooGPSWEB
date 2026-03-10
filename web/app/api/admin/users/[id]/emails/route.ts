import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const PER_PAGE = 5;

/** GET /api/admin/users/[id]/emails?page=1 – paginated list of emails sent to this user (subject + sent_at only). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { id: userId } = await params;
  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const recipientEmail = authUser.user.email;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const perPage = Math.min(20, Math.max(1, parseInt(searchParams.get('per_page') ?? String(PER_PAGE), 10)));
  const from = (page - 1) * perPage;

  const { data: rows, count: totalCount, error } = await admin
    .from('email_sent_log')
    .select('id, subject, event_name, sent_at', { count: 'exact' })
    .eq('recipient_email', recipientEmail)
    .order('sent_at', { ascending: false })
    .range(from, from + perPage - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const total = totalCount ?? 0;

  const emails = (rows ?? []).map((r: { id: string; subject: string | null; event_name: string; sent_at: string }) => ({
    id: r.id,
    subject: r.subject ?? r.event_name,
    sent_at: r.sent_at,
  }));

  return NextResponse.json({
    emails,
    total,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  });
}
