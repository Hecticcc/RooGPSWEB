import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';

const ALLOWED_SKUS = ['gps_tracker_sim_monthly', 'gps_tracker_sim_yearly', 'gps_tracker', 'sim_monthly', 'sim_yearly'];
const ALLOWED_STATUSES = ['paid', 'fulfilled', 'shipped', 'activated'] as const;

function isTrackerSku(sku: string): boolean {
  const s = (sku ?? '').toLowerCase();
  return s === 'gps_tracker' || s.includes('gps_tracker');
}
function isSimSku(sku: string): boolean {
  const s = (sku ?? '').toLowerCase();
  return ['sim_monthly', 'sim_yearly'].includes(s) || s.includes('sim_monthly') || s.includes('sim_yearly');
}

/** POST /api/admin/orders/manual – create a manual order for a user (staff_plus+). No Stripe; admin can assign devices/SIMs and link subscription later. */
export async function POST(request: Request) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  let body: {
    user_id: string;
    status?: string;
    items?: { product_sku: string; quantity?: number }[];
    total_cents?: number;
    sim_plan?: 'monthly' | 'yearly';
    shipping_name?: string;
    shipping_mobile?: string;
    shipping_address_line1?: string;
    shipping_address_line2?: string;
    shipping_suburb?: string;
    shipping_state?: string;
    shipping_postcode?: string;
    shipping_country?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  if (!authUser?.user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const rawItems = Array.isArray(body.items) && body.items.length > 0
    ? body.items.map((i) => ({ product_sku: String(i.product_sku ?? '').trim(), quantity: Math.max(1, Number(i.quantity) || 1) }))
    : [{ product_sku: 'gps_tracker_sim_monthly', quantity: 1 }];

  const items = rawItems.filter((i) => {
    const sku = (i.product_sku ?? '').toLowerCase();
    return ALLOWED_SKUS.some((a) => sku === a || sku.includes(a));
  });
  if (items.length === 0) return NextResponse.json({ error: 'At least one valid item required (e.g. gps_tracker_sim_monthly, sim_monthly, sim_yearly)' }, { status: 400 });

  const statusInput = (body.status ?? 'paid').toLowerCase();
  const status = ALLOWED_STATUSES.includes(statusInput as (typeof ALLOWED_STATUSES)[number])
    ? (statusInput as (typeof ALLOWED_STATUSES)[number])
    : 'paid';

  const hasYearlySim = items.some((i) => (i.product_sku ?? '').toLowerCase().includes('sim_yearly'));
  const simPlan = (body.sim_plan === 'yearly' || body.sim_plan === 'monthly') ? body.sim_plan : (hasYearlySim ? 'yearly' : 'monthly');

  const quantityBySku: Record<string, number> = {};
  for (const i of items) {
    if (!isTrackerSku(i.product_sku)) continue;
    const sku = (i.product_sku ?? '').trim().toLowerCase();
    const key = sku === 'gps_tracker_wired' ? 'gps_tracker_wired' : 'gps_tracker';
    quantityBySku[key] = (quantityBySku[key] ?? 0) + (i.quantity ?? 1);
  }
  for (const [sku, needed] of Object.entries(quantityBySku)) {
    const { count } = await admin
      .from('tracker_stock')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_stock')
      .eq('product_sku', sku);
    if ((count ?? 0) < needed) {
      return NextResponse.json({ error: `Not enough ${sku === 'gps_tracker_wired' ? 'Wired' : 'Wireless'} trackers in stock (need ${needed}, have ${count ?? 0})` }, { status: 409 });
    }
  }

  const totalCents = typeof body.total_cents === 'number' && body.total_cents >= 0 ? body.total_cents : null;
  const shippingName = typeof body.shipping_name === 'string' ? body.shipping_name.trim() || null : null;
  const shippingMobile = typeof body.shipping_mobile === 'string' ? body.shipping_mobile.trim() || null : null;
  const shippingAddressLine1 = typeof body.shipping_address_line1 === 'string' ? body.shipping_address_line1.trim() || null : null;
  const shippingAddressLine2 = typeof body.shipping_address_line2 === 'string' ? body.shipping_address_line2.trim() || null : null;
  const shippingSuburb = typeof body.shipping_suburb === 'string' ? body.shipping_suburb.trim() || null : null;
  const shippingState = typeof body.shipping_state === 'string' ? body.shipping_state.trim() || null : null;
  const shippingPostcode = typeof body.shipping_postcode === 'string' ? body.shipping_postcode.trim() || null : null;
  const shippingCountry = typeof body.shipping_country === 'string' ? body.shipping_country.trim() || 'Australia' : 'Australia';

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      user_id: userId,
      status,
      sim_plan: simPlan,
      total_cents: totalCents,
      currency: 'AUD',
      discount_cents: 0,
      shipping_name: shippingName,
      shipping_mobile: shippingMobile,
      shipping_address_line1: shippingAddressLine1,
      shipping_address_line2: shippingAddressLine2,
      shipping_suburb: shippingSuburb,
      shipping_state: shippingState,
      shipping_postcode: shippingPostcode,
      shipping_country: shippingCountry,
      updated_at: new Date().toISOString(),
    })
    .select('id, order_number, status')
    .single();

  if (orderErr || !order) return NextResponse.json({ error: orderErr?.message ?? 'Failed to create order' }, { status: 500 });

  const itemRows = items.map((i) => ({ order_id: order.id, product_sku: i.product_sku, quantity: i.quantity }));
  const { error: itemsErr } = await admin.from('order_items').insert(itemRows);
  if (itemsErr) {
    await admin.from('orders').delete().eq('id', order.id);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    order_id: order.id,
    order_number: order.order_number ?? null,
    status: order.status,
  });
}
