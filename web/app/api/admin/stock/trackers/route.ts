import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data, error } = await admin.from('tracker_stock').select('id, imei, status, created_at, updated_at').order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = data ?? [];
  const ids = list.map((t: { id: string }) => t.id);
  const assignments: { tracker_stock_id: string; order_number: string | null; email: string | null }[] = ids.length
    ? ((await admin.rpc('get_tracker_order_assignments', { tracker_ids: ids })).data ?? [])
    : [];
  const byId = new Map(assignments.map((a: { tracker_stock_id: string; order_number: string | null; email: string | null }) => [a.tracker_stock_id, { order_number: a.order_number ?? null, email: a.email ?? null }]));
  const trackers = list.map((t: { id: string; imei: string; status: string; created_at: string; updated_at?: string }) => {
    const a = byId.get(t.id);
    return { ...t, order_number: a?.order_number ?? null, email: a?.email ?? null };
  });
  return NextResponse.json({ trackers, total: trackers.length });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  let body: { imei?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const imei = typeof body.imei === 'string' ? body.imei.trim() : '';
  if (!imei || !/^\d{12,20}$/.test(imei)) {
    return NextResponse.json({ error: 'Valid IMEI (12–20 digits) required' }, { status: 400 });
  }
  const status = ['in_stock', 'assigned', 'sold', 'returned', 'faulty'].includes(body.status ?? '') ? body.status : 'in_stock';
  const { data, error } = await admin.from('tracker_stock').insert({ imei, status }).select('id, imei, status, created_at').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'IMEI already in stock' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
