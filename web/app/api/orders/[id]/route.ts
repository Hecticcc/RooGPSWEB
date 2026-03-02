import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** GET /api/orders/[id] – get one order (own only) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (orderErr || !order) return NextResponse.json({ error: orderErr?.message ?? 'Not found' }, { status: 404 });

  const { data: items } = await supabase
    .from('order_items')
    .select('id, product_sku, quantity, assigned_tracker_stock_id, assigned_sim_iccid, activation_token_id')
    .eq('order_id', id);

  const itemList = items ?? [];
  const skus = Array.from(new Set(itemList.map((i) => i.product_sku).filter(Boolean)));
  let pricing: Record<string, { price_cents: number; sale_price_cents: number | null }> = {};
  if (skus.length > 0) {
    const { data: rows } = await supabase
      .from('product_pricing')
      .select('sku, price_cents, sale_price_cents')
      .in('sku', skus);
    for (const r of rows ?? []) {
      pricing[r.sku] = { price_cents: r.price_cents, sale_price_cents: r.sale_price_cents ?? null };
    }
  }
  const itemsWithPrice = itemList.map((i) => {
    const p = pricing[i.product_sku];
    const unit_price_cents = p ? (p.sale_price_cents ?? p.price_cents) : null;
    return { ...i, unit_price_cents };
  });

  return NextResponse.json({
    order: {
      ...order,
      items: itemsWithPrice,
    },
  });
}

/** PATCH /api/orders/[id] – update own order (e.g. mark as paid after payment) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.status !== 'paid') {
    return NextResponse.json({ error: 'Only status=paid is allowed via this endpoint' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'Order is not pending' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('orders')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ order: updated });
}
