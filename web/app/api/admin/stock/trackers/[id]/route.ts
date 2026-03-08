import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const VALID_STATUSES = ['in_stock', 'assigned', 'sold', 'returned', 'faulty'] as const;

/**
 * PATCH /api/admin/stock/trackers/[id] – update a tracker's status (e.g. set to assigned after manual assignment).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Tracker ID required' }, { status: 400 });
  }
  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const status = typeof body.status === 'string' && VALID_STATUSES.includes(body.status as (typeof VALID_STATUSES)[number])
    ? body.status
    : null;
  if (!status) {
    return NextResponse.json({ error: 'status must be one of: in_stock, assigned, sold, returned, faulty' }, { status: 400 });
  }
  const { data, error } = await admin
    .from('tracker_stock')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, imei, status, created_at, updated_at')
    .single();
  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Tracker not found' }, { status: 404 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
