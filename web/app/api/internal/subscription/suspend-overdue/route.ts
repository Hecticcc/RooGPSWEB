import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { setSimbaseSimState } from '@/lib/simbase';

const CRON_SECRET = process.env.CRON_SECRET ?? process.env.INTERNAL_TRIPS_SECRET ?? '';
const ACTIVE_STATUSES = ['paid', 'fulfilled', 'processing', 'shipped', 'activated'];

function authInternal(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === CRON_SECRET) return true;
  if (request.headers.get('x-internal-secret') === CRON_SECRET) return true;
  return false;
}

/**
 * POST – Suspend overdue SIM subscriptions:
 * - Find orders with SIM product, status in (paid, fulfilled, ...), subscription_next_billing_date < now.
 * - Set order status to 'suspended', then disable each order's SIM(s) in Simbase.
 * Call from cron daily (e.g. after send-reminders).
 */
export async function POST(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Set CRON_SECRET for suspend-overdue' }, { status: 503 });
  }
  if (!authInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const now = new Date().toISOString();

  const { data: ordersRaw } = await admin
    .from('orders')
    .select('id, user_id, order_number, subscription_next_billing_date, status, billing_state_normalized')
    .lt('subscription_next_billing_date', now)
    .in('status', ACTIVE_STATUSES);

  const orders = (ordersRaw ?? []).filter(
    (o) => (o as { billing_state_normalized?: string | null }).billing_state_normalized !== 'trialing'
  );
  if (!orders.length) {
    return NextResponse.json({ suspended_count: 0, order_ids: [] });
  }

  const orderIds = orders.map((o) => o.id);
  const { data: items } = await admin
    .from('order_items')
    .select('order_id, product_sku')
    .in('order_id', orderIds);
  const simSkus = ['sim_monthly', 'sim_yearly'];
  const orderIdsWithSim = new Set<string>();
  for (const i of items ?? []) {
    const sku = (i.product_sku ?? '').trim();
    if (simSkus.includes(sku) || sku.includes('sim_')) orderIdsWithSim.add(i.order_id);
  }

  const overdueOrders = orders.filter((o) => orderIdsWithSim.has(o.id));
  const suspended: string[] = [];
  const errors: { order_id: string; error: string }[] = [];

  for (const order of overdueOrders) {
    const { error: updateErr } = await admin
      .from('orders')
      .update({
        status: 'suspended',
        billing_state_normalized: 'past_due',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);
    if (updateErr) {
      errors.push({ order_id: order.id, error: updateErr.message });
      continue;
    }
    suspended.push(order.id);

    const { data: tokens } = await admin
      .from('activation_tokens')
      .select('sim_iccid')
      .eq('order_id', order.id)
      .not('sim_iccid', 'is', null);
    const iccids = Array.from(new Set((tokens ?? []).map((t) => t.sim_iccid).filter(Boolean))) as string[];
    for (const iccid of iccids) {
      const result = await setSimbaseSimState(iccid, 'disabled');
      if (!result.ok) {
        errors.push({ order_id: order.id, error: `SIM ${iccid}: ${result.error ?? 'unknown'}` });
      }
    }
  }

  return NextResponse.json({
    suspended_count: suspended.length,
    order_ids: suspended,
    errors: errors.length ? errors : undefined,
  });
}
