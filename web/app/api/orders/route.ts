import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** GET /api/orders – list current user's orders */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, status, total_cents, discount_cents, currency, tracking_number, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = orders ?? [];
  if (list.length === 0) return NextResponse.json({ orders: [] });
  const orderIds = list.map((o) => o.id);
  const { data: itemRows } = await supabase.from('order_items').select('order_id').in('order_id', orderIds);
  const countByOrder: Record<string, number> = {};
  for (const r of itemRows ?? []) countByOrder[r.order_id] = (countByOrder[r.order_id] ?? 0) + 1;
  const ordersWithCount = list.map((o) => ({ ...o, items_count: countByOrder[o.id] ?? 0 }));
  return NextResponse.json({ orders: ordersWithCount });
}

/** POST /api/orders – create order (customer checkout) */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    shipping_name?: string;
    shipping_mobile?: string;
    shipping_address_line1?: string;
    shipping_address_line2?: string;
    shipping_suburb?: string;
    shipping_state?: string;
    shipping_postcode?: string;
    shipping_country?: string;
    total_cents?: number;
    discount_cents?: number;
    voucher_id?: string;
    items?: { product_sku: string; quantity?: number }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const items = Array.isArray(body.items) && body.items.length > 0
    ? body.items.map((i) => ({ product_sku: String(i.product_sku ?? '').trim(), quantity: Math.max(1, Number(i.quantity) || 1) }))
    : [{ product_sku: 'gps_tracker_sim_monthly', quantity: 1 }];

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const discountCents = Math.max(0, Math.floor(Number(body.discount_cents) ?? 0));
  const voucherId = typeof body.voucher_id === 'string' && body.voucher_id.trim() ? body.voucher_id.trim() : null;
  const hasYearlySim = items.some((i) => (i.product_sku ?? '').toLowerCase().includes('sim_yearly'));
  const simPlan = hasYearlySim ? 'yearly' : 'monthly';

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      user_id: user.id,
      status: 'pending',
      sim_plan: simPlan,
      shipping_name: body.shipping_name ?? null,
      shipping_mobile: body.shipping_mobile ?? null,
      shipping_address_line1: body.shipping_address_line1 ?? null,
      shipping_address_line2: body.shipping_address_line2 ?? null,
      shipping_suburb: body.shipping_suburb ?? null,
      shipping_state: body.shipping_state ?? null,
      shipping_postcode: body.shipping_postcode ?? null,
      shipping_country: body.shipping_country ?? 'Australia',
      total_cents: body.total_cents ?? null,
      discount_cents: discountCents,
      voucher_id: voucherId,
      currency: 'AUD',
    })
    .select('id, order_number, status, created_at')
    .single();
  if (orderErr || !order) return NextResponse.json({ error: orderErr?.message ?? 'Failed to create order' }, { status: 500 });

  const itemRows = items.map((i) => ({ order_id: order.id, product_sku: i.product_sku, quantity: i.quantity }));
  const { error: itemsErr } = await admin.from('order_items').insert(itemRows);
  if (itemsErr) {
    await admin.from('orders').delete().eq('id', order.id);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  if (voucherId) {
    const { data: v } = await admin.from('vouchers').select('use_count').eq('id', voucherId).single();
    if (v?.use_count != null) {
      await admin.from('vouchers').update({ use_count: (v.use_count ?? 0) + 1 }).eq('id', voucherId);
    }
  }

  return NextResponse.json({ order: { id: order.id, order_number: order.order_number, status: order.status, created_at: order.created_at } });
}
