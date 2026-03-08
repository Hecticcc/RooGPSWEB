import { NextResponse } from 'next/server';
import { getSupportAuth, getServiceRoleClient } from '../auth';

export const dynamic = 'force-dynamic';

/** GET /api/support/stats – staff only. Counts for dashboard. */
export async function GET(request: Request) {
  const authResult = await getSupportAuth(request);
  if (!authResult.ok) return authResult.response;
  if (!authResult.auth.isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const [
    { count: open },
    { count: in_progress },
    { count: answered },
    { count: pending },
    { count: resolved },
    { count: unassigned },
    { data: recent },
  ] = await Promise.all([
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'answered'),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['resolved', 'closed']),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).is('assigned_to', null).in('status', ['open', 'answered', 'pending', 'in_progress']),
    admin.from('support_tickets').select('id, ticket_number, subject, status, updated_at').order('updated_at', { ascending: false }).limit(10),
  ]);

  const openCount = open ?? 0;
  const inProgressCount = in_progress ?? 0;

  return NextResponse.json({
    open: openCount,
    in_progress: inProgressCount,
    open_and_in_progress: openCount + inProgressCount,
    answered: answered ?? 0,
    pending: pending ?? 0,
    resolved: resolved ?? 0,
    unassigned: unassigned ?? 0,
    recently_updated: recent ?? [],
  });
}
