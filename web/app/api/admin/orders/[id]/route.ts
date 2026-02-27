import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { hasMinRole } from '@/lib/roles';
import { randomBytes } from 'crypto';

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

/** PATCH Simbase SIM card: set name to "Full Name OrderNumber" and tags to ["Assigned"]. Returns null on success, error message on failure. */
async function updateSimbaseSimOnAssign(
  iccid: string,
  shippingName: string | null,
  orderNumber: string | null
): Promise<string | null> {
  if (!SIMBASE_API_KEY) return null;
  const fullName = (shippingName ?? 'Customer').trim() || 'Customer';
  const orderNum = (orderNumber ?? '').trim();
  const name = orderNum ? `${fullName} ${orderNum}` : fullName;
  const base = SIMBASE_API_BASE.replace(/\/$/, '');
  const url = `${base}/simcards/${encodeURIComponent(iccid)}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SIMBASE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, tags: ['Assigned'] }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) {
      return `Simbase PATCH ${res.status}: ${text.slice(0, 200)}`;
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** GET /api/admin/orders/[id] – order detail with items and available stock (staff+) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data: order, error: orderErr } = await admin.from('orders').select('*').eq('id', id).single();
  if (orderErr || !order) return NextResponse.json({ error: orderErr?.message ?? 'Not found' }, { status: 404 });

  const { data: items } = await admin
    .from('order_items')
    .select('id, product_sku, quantity, assigned_tracker_stock_id, assigned_sim_iccid, activation_token_id')
    .eq('order_id', id);

  const trackerIds = (items ?? []).map((i) => i.assigned_tracker_stock_id).filter(Boolean) as string[];
  const trackerImeiById: Record<string, string> = {};
  if (trackerIds.length > 0) {
    const { data: trackers } = await admin.from('tracker_stock').select('id, imei').in('id', trackerIds);
    (trackers ?? []).forEach((t) => { trackerImeiById[t.id] = t.imei ?? ''; });
  }
  const itemsWithImei = (items ?? []).map((i) => ({
    ...i,
    assigned_tracker_imei: i.assigned_tracker_stock_id ? trackerImeiById[i.assigned_tracker_stock_id] ?? null : null,
  }));

  const { data: trackersAvailable } = await admin
    .from('tracker_stock')
    .select('id, imei, status')
    .eq('status', 'in_stock');

  let activation_code: string | null = null;
  const { data: tokenRow } = await admin
    .from('activation_tokens')
    .select('code')
    .eq('order_id', id)
    .limit(1)
    .maybeSingle();
  if (tokenRow?.code) activation_code = tokenRow.code as string;

  const can_edit_assignments = hasMinRole(guard.role, 'staff_plus');

  return NextResponse.json({
    order: { ...order, items: itemsWithImei },
    trackers_available: trackersAvailable ?? [],
    activation_code,
    can_edit_assignments: !!can_edit_assignments,
  });
}

/** PATCH /api/admin/orders/[id] – fulfil (assign tracker+sim, create token) or mark shipped (staff_plus+) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const { id: orderId } = await params;
  if (!orderId) return NextResponse.json({ error: 'Order ID required' }, { status: 400 });

  let body: { action: string; tracking_number?: string; order_item_id?: string; tracker_stock_id?: string; sim_iccid?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const isTrackerSku = (sku: string) => {
    const s = (sku ?? '').toLowerCase();
    return s === 'gps_tracker' || s.includes('gps_tracker');
  };
  const isSimOnlySku = (sku: string) => {
    const s = (sku ?? '').toLowerCase();
    return ['sim_monthly', 'sim_yearly'].includes(s) || s.includes('sim_monthly') || s.includes('sim_yearly');
  };

  if (body.action === 'ship') {
    const { data: orderRow } = await admin.from('orders').select('status').eq('id', orderId).single();
    if (!orderRow || !['fulfilled', 'processing'].includes(orderRow.status as string)) {
      return NextResponse.json({ error: 'Order can only be marked shipped from Stock Assigned or Processing' }, { status: 400 });
    }
    const tracking = typeof body.tracking_number === 'string' ? body.tracking_number.trim() : null;
    const { error } = await admin
      .from('orders')
      .update({
        status: 'shipped',
        tracking_number: tracking || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'shipped' });
  }

  if (body.action === 'mark_processing') {
    const { data: orderRow } = await admin.from('orders').select('status').eq('id', orderId).single();
    if (!orderRow || orderRow.status !== 'fulfilled') {
      return NextResponse.json({ error: 'Order must be Stock Assigned to mark as Processing' }, { status: 400 });
    }
    const { error } = await admin
      .from('orders')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'processing' });
  }

  if (body.action === 'fulfil') {
    const orderItemId = body.order_item_id;
    const trackerStockId = body.tracker_stock_id;
    const simIccid = typeof body.sim_iccid === 'string' ? body.sim_iccid.trim() : null;

    if (!orderItemId) {
      return NextResponse.json({ error: 'order_item_id required' }, { status: 400 });
    }

    const { data: order } = await admin
      .from('orders')
      .select('id, user_id, status, shipping_name, order_number')
      .eq('id', orderId)
      .single();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'paid' && order.status !== 'pending') {
      return NextResponse.json({ error: 'Order cannot be fulfilled in current status' }, { status: 400 });
    }

    const { data: orderItem } = await admin
      .from('order_items')
      .select('id, product_sku')
      .eq('id', orderItemId)
      .eq('order_id', orderId)
      .single();
    if (!orderItem) return NextResponse.json({ error: 'Order item not found' }, { status: 404 });

    const sku = (orderItem.product_sku ?? '').toLowerCase();
    const isSimOnlyProduct = ['sim_monthly', 'sim_yearly'].includes(sku) || sku.includes('sim_monthly') || sku.includes('sim_yearly');

    if (isSimOnlyProduct) {
      // SIM-only product: assign SIM and link to tracker (create activation token if order has assigned tracker)
      if (!simIccid) {
        return NextResponse.json({ error: 'sim_iccid required for SIM product' }, { status: 400 });
      }
      const { error: itemErr } = await admin
        .from('order_items')
        .update({
          assigned_sim_iccid: simIccid,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderItemId)
        .eq('order_id', orderId);
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

      // Update SIM card in Simbase: name (full name + order number) and tags to Assigned
      const simbaseNameError = await updateSimbaseSimOnAssign(
        simIccid,
        (order as { shipping_name?: string | null; order_number?: string | null }).shipping_name ?? null,
        (order as { order_number?: string | null }).order_number ?? null
      );

      // Find a tracker line on this order that has tracker assigned but no activation token yet
      const isTrackerSku = (sku: string) => {
        const s = (sku ?? '').toLowerCase();
        return s === 'gps_tracker' || s.includes('gps_tracker');
      };
      const { data: allOrderItems } = await admin
        .from('order_items')
        .select('id, product_sku, assigned_tracker_stock_id, activation_token_id')
        .eq('order_id', orderId);
      const trackerLine = (allOrderItems ?? []).find(
        (i) => isTrackerSku(i.product_sku ?? '') && i.assigned_tracker_stock_id && !i.activation_token_id
      );
      let activationCode: string | null = null;
      if (trackerLine?.assigned_tracker_stock_id) {
        const code = randomBytes(8).toString('hex').toUpperCase();
        const { data: token, error: tokenErr } = await admin
          .from('activation_tokens')
          .insert({
            code,
            order_id: orderId,
            user_id: order.user_id,
            tracker_stock_id: trackerLine.assigned_tracker_stock_id,
            sim_iccid: simIccid,
          })
          .select('id')
          .single();
        if (!tokenErr && token) {
          activationCode = code;
          await admin
            .from('order_items')
            .update({
              assigned_sim_iccid: simIccid,
              activation_token_id: token.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', trackerLine.id)
            .eq('order_id', orderId);
        }
      }

      const { data: allItems } = await admin.from('order_items').select('product_sku, assigned_tracker_stock_id, assigned_sim_iccid, activation_token_id').eq('order_id', orderId);
      const allFulfilled = (allItems ?? []).every((i) => {
        const s = (i.product_sku ?? '').toLowerCase();
        const simOnly = ['sim_monthly', 'sim_yearly'].includes(s) || s.includes('sim_monthly') || s.includes('sim_yearly');
        if (simOnly) return !!i.assigned_sim_iccid;
        return !!i.assigned_tracker_stock_id && !!i.activation_token_id;
      });
      if (allFulfilled) {
        await admin.from('orders').update({ status: 'fulfilled', updated_at: new Date().toISOString() }).eq('id', orderId);
      }
      return NextResponse.json({
        ok: true,
        status: allFulfilled ? 'fulfilled' : 'paid',
        activation_code: activationCode ?? undefined,
        ...(simbaseNameError && { simbase_name_error: simbaseNameError }),
      });
    }

    // Tracker product: assign tracker only (SIM is linked when sim_monthly is fulfilled)
    if (!trackerStockId) {
      return NextResponse.json({ error: 'tracker_stock_id required for tracker product' }, { status: 400 });
    }

    const { data: tracker } = await admin.from('tracker_stock').select('id, imei, status').eq('id', trackerStockId).eq('status', 'in_stock').single();
    if (!tracker) return NextResponse.json({ error: 'Tracker not found or not in stock' }, { status: 400 });

    const { error: itemErr } = await admin
      .from('order_items')
      .update({
        assigned_tracker_stock_id: trackerStockId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderItemId)
      .eq('order_id', orderId);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

    const { error: stockErr } = await admin
      .from('tracker_stock')
      .update({ status: 'assigned', order_id: orderId, updated_at: new Date().toISOString() })
      .eq('id', trackerStockId);
    if (stockErr) return NextResponse.json({ error: stockErr.message }, { status: 500 });

    const { data: allItems } = await admin.from('order_items').select('product_sku, assigned_tracker_stock_id, assigned_sim_iccid, activation_token_id').eq('order_id', orderId);
    const allFulfilled = (allItems ?? []).every((i) => {
      const s = (i.product_sku ?? '').toLowerCase();
      const simOnly = ['sim_monthly', 'sim_yearly'].includes(s) || s.includes('sim_monthly') || s.includes('sim_yearly');
      if (simOnly) return !!i.assigned_sim_iccid;
      return !!i.assigned_tracker_stock_id && !!i.activation_token_id;
    });
    if (allFulfilled) {
      await admin.from('orders').update({ status: 'fulfilled', updated_at: new Date().toISOString() }).eq('id', orderId);
    }

    return NextResponse.json({ ok: true, status: allFulfilled ? 'fulfilled' : 'paid' });
  }

  if (body.action === 'reassign_tracker') {
    const orderItemId = body.order_item_id;
    const newTrackerStockId = body.tracker_stock_id;
    if (!orderItemId || !newTrackerStockId) {
      return NextResponse.json({ error: 'order_item_id and tracker_stock_id required' }, { status: 400 });
    }
    const { data: order } = await admin.from('orders').select('id, user_id').eq('id', orderId).single();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    const { data: orderItem } = await admin
      .from('order_items')
      .select('id, product_sku, assigned_tracker_stock_id')
      .eq('id', orderItemId)
      .eq('order_id', orderId)
      .single();
    if (!orderItem || !isTrackerSku(orderItem.product_sku ?? '')) {
      return NextResponse.json({ error: 'Order item not found or not a tracker product' }, { status: 404 });
    }
    const oldTrackerStockId = orderItem.assigned_tracker_stock_id;
    if (!oldTrackerStockId) return NextResponse.json({ error: 'Item has no tracker assigned to reassign' }, { status: 400 });
    const { data: newTracker } = await admin
      .from('tracker_stock')
      .select('id, imei, status')
      .eq('id', newTrackerStockId)
      .single();
    if (!newTracker) return NextResponse.json({ error: 'New tracker not found' }, { status: 404 });
    if (newTracker.id === oldTrackerStockId) return NextResponse.json({ error: 'Same tracker already assigned' }, { status: 400 });
    const inStock = newTracker.status === 'in_stock';
    if (!inStock) return NextResponse.json({ error: 'New tracker is not available (must be in_stock)' }, { status: 400 });

    const { data: token } = await admin
      .from('activation_tokens')
      .select('id, tracker_stock_id, device_id')
      .eq('order_id', orderId)
      .maybeSingle();

    const { data: oldTracker } = await admin.from('tracker_stock').select('id, imei').eq('id', oldTrackerStockId).single();
    const oldImei = oldTracker?.imei ?? null;
    const newImei = newTracker.imei;

    await admin.from('order_items').update({
      assigned_tracker_stock_id: newTrackerStockId,
      updated_at: new Date().toISOString(),
    }).eq('id', orderItemId).eq('order_id', orderId);

    if (token) {
      await admin.from('activation_tokens').update({
        tracker_stock_id: newTrackerStockId,
        ...(token.device_id ? { device_id: newImei } : {}),
      }).eq('id', token.id);
    }

    await admin.from('tracker_stock').update({
      status: 'in_stock',
      order_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', oldTrackerStockId);

    await admin.from('tracker_stock').update({
      status: 'assigned',
      order_id: orderId,
      updated_at: new Date().toISOString(),
    }).eq('id', newTrackerStockId);

    if (token?.device_id && oldImei) {
      await admin.from('devices').update({ user_id: null }).eq('id', oldImei);
      const { data: existingNew } = await admin.from('devices').select('id, user_id').eq('id', newImei).maybeSingle();
      if (existingNew) {
        if (existingNew.user_id !== order.user_id) {
          await admin.from('devices').update({ user_id: order.user_id }).eq('id', newImei);
        }
      } else {
        await admin.from('devices').insert({ id: newImei, user_id: order.user_id, name: null });
      }
    }

    return NextResponse.json({ ok: true, message: 'Tracker reassigned' });
  }

  if (body.action === 'reassign_sim') {
    const orderItemId = body.order_item_id;
    const newSimIccid = typeof body.sim_iccid === 'string' ? body.sim_iccid.trim() : null;
    if (!orderItemId || !newSimIccid) {
      return NextResponse.json({ error: 'order_item_id and sim_iccid required' }, { status: 400 });
    }
    const { data: order } = await admin
      .from('orders')
      .select('id, user_id, shipping_name, order_number')
      .eq('id', orderId)
      .single();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    const { data: orderItem } = await admin
      .from('order_items')
      .select('id, product_sku, assigned_sim_iccid')
      .eq('id', orderItemId)
      .eq('order_id', orderId)
      .single();
    if (!orderItem || !isSimOnlySku(orderItem.product_sku ?? '')) {
      return NextResponse.json({ error: 'Order item not found or not a SIM product' }, { status: 404 });
    }
    const oldSimIccid = orderItem.assigned_sim_iccid;
    if (!oldSimIccid) return NextResponse.json({ error: 'Item has no SIM assigned to reassign' }, { status: 400 });
    if (oldSimIccid === newSimIccid) return NextResponse.json({ error: 'Same SIM already assigned' }, { status: 400 });

    await admin.from('order_items').update({
      assigned_sim_iccid: newSimIccid,
      updated_at: new Date().toISOString(),
    }).eq('id', orderItemId).eq('order_id', orderId);

    const { data: token } = await admin
      .from('activation_tokens')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();
    if (token) {
      await admin.from('activation_tokens').update({ sim_iccid: newSimIccid }).eq('id', token.id);
      const { data: trackerLine } = await admin
        .from('order_items')
        .select('id')
        .eq('order_id', orderId)
        .eq('activation_token_id', token.id)
        .maybeSingle();
      if (trackerLine) {
        await admin.from('order_items').update({
          assigned_sim_iccid: newSimIccid,
          updated_at: new Date().toISOString(),
        }).eq('id', trackerLine.id).eq('order_id', orderId);
      }
    }

    const orderWithNumber = order as { shipping_name?: string | null; order_number?: string | null };
    const simbaseErr = await updateSimbaseSimOnAssign(
      newSimIccid,
      orderWithNumber.shipping_name ?? null,
      orderWithNumber.order_number ?? null
    );

    return NextResponse.json({
      ok: true,
      message: 'SIM reassigned',
      ...(simbaseErr && { simbase_name_error: simbaseErr }),
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
