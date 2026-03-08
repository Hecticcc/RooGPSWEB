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

  const isTrackerSku = (sku: string) => (sku ?? '').toLowerCase() === 'gps_tracker' || (sku ?? '').toLowerCase().includes('gps_tracker');
  const trackerItems = items.filter((i) => isTrackerSku(i.product_sku));
  if (trackerItems.length > 0) {
    const quantityBySku: Record<string, number> = {};
    for (const i of trackerItems) {
      const sku = (i.product_sku ?? '').trim().toLowerCase();
      if (sku !== 'gps_tracker' && sku !== 'gps_tracker_wired') continue;
      quantityBySku[sku] = (quantityBySku[sku] ?? 0) + (i.quantity ?? 1);
    }
    for (const [sku, needed] of Object.entries(quantityBySku)) {
      const { count } = await admin
        .from('tracker_stock')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_stock')
        .eq('product_sku', sku);
      const usable = (count ?? 0) as number;
      if (usable < needed) {
        return NextResponse.json(
          { error: usable === 0 ? 'That GPS tracker type is currently out of stock. Please try again later.' : `Only ${usable} available for that tracker type. Please reduce quantity or try again later.` },
          { status: 409 }
        );
      }
    }
  }

  const discountCents = Math.max(0, Math.floor(Number(body.discount_cents) ?? 0));
  const voucherId = typeof body.voucher_id === 'string' && body.voucher_id.trim() ? body.voucher_id.trim() : null;
  const hasYearlySim = items.some((i) => (i.product_sku ?? '').toLowerCase().includes('sim_yearly'));
  const simPlan = hasYearlySim ? 'yearly' : 'monthly';

  let shippingName = (body.shipping_name ?? '').trim() || null;
  let shippingMobile = (body.shipping_mobile ?? '').trim() || null;
  let shippingAddressLine1 = (body.shipping_address_line1 ?? '').trim() || null;
  let shippingAddressLine2 = (body.shipping_address_line2 ?? '').trim() || null;
  let shippingSuburb = (body.shipping_suburb ?? '').trim() || null;
  let shippingState = (body.shipping_state ?? '').trim() || null;
  let shippingPostcode = (body.shipping_postcode ?? '').trim() || null;
  let shippingCountry = (body.shipping_country ?? '').trim() || 'Australia';

  if (!shippingName || !shippingAddressLine1 || !shippingMobile) {
    const { data: profile } = await admin.from('profiles').select('first_name, last_name, mobile, address_line1, address_line2, suburb, state, postcode, country').eq('user_id', user.id).maybeSingle();
    if (profile) {
      if (!shippingName && (profile.first_name || profile.last_name)) {
        shippingName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || null;
      }
      if (!shippingMobile && profile.mobile) shippingMobile = profile.mobile;
      if (!shippingAddressLine1 && profile.address_line1) shippingAddressLine1 = profile.address_line1;
      if (!shippingAddressLine2 && profile.address_line2) shippingAddressLine2 = profile.address_line2;
      if (!shippingSuburb && profile.suburb) shippingSuburb = profile.suburb;
      if (!shippingState && profile.state) shippingState = profile.state;
      if (!shippingPostcode && profile.postcode) shippingPostcode = profile.postcode;
      if (shippingCountry === 'Australia' && profile.country) shippingCountry = profile.country;
    }
  }

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      user_id: user.id,
      status: 'pending',
      sim_plan: simPlan,
      shipping_name: shippingName,
      shipping_mobile: shippingMobile,
      shipping_address_line1: shippingAddressLine1,
      shipping_address_line2: shippingAddressLine2,
      shipping_suburb: shippingSuburb,
      shipping_state: shippingState,
      shipping_postcode: shippingPostcode,
      shipping_country: shippingCountry,
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
