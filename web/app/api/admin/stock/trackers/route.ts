import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const TRACKER_SKUS = ['gps_tracker', 'gps_tracker_wired'] as const;

export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const productSku = searchParams.get('product_sku')?.trim().toLowerCase();
  const filterSku = productSku && TRACKER_SKUS.includes(productSku as (typeof TRACKER_SKUS)[number]) ? productSku : null;

  let query = admin.from('tracker_stock').select('id, imei, status, product_sku, created_at, updated_at').order('created_at', { ascending: false });
  if (filterSku) query = query.eq('product_sku', filterSku);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = data ?? [];
  const ids = list.map((t: { id: string }) => t.id);
  const assignments: { tracker_stock_id: string; order_number: string | null; email: string | null }[] = ids.length
    ? ((await admin.rpc('get_tracker_order_assignments', { tracker_ids: ids })).data ?? [])
    : [];
  const byId = new Map(assignments.map((a: { tracker_stock_id: string; order_number: string | null; email: string | null }) => [a.tracker_stock_id, { order_number: a.order_number ?? null, email: a.email ?? null }]));
  const trackers = list.map((t: { id: string; imei: string; status: string; product_sku: string; created_at: string; updated_at?: string }) => {
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
  let body: { imei?: string; status?: string; product_sku?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const imei = typeof body.imei === 'string' ? body.imei.trim() : '';
  if (!imei || !/^\d{12,20}$/.test(imei)) {
    return NextResponse.json({ error: 'Valid IMEI (12–20 digits) required' }, { status: 400 });
  }
  const productSku = (body.product_sku ?? '').trim().toLowerCase();
  const product_sku = TRACKER_SKUS.includes(productSku as (typeof TRACKER_SKUS)[number]) ? productSku : 'gps_tracker';
  const status = ['in_stock', 'assigned', 'sold', 'returned', 'faulty'].includes(body.status ?? '') ? body.status : 'in_stock';
  const { data, error } = await admin.from('tracker_stock').insert({ imei, status, product_sku }).select('id, imei, status, product_sku, created_at').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'IMEI already in stock' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
