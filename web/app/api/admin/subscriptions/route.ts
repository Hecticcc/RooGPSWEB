import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { getStripeServer } from '@/lib/stripe';

const SIM_SKUS = ['sim_monthly', 'sim_yearly'];

/** GET /api/admin/subscriptions – list all SIM subscription orders (staff+). Optionally enriched with Stripe status. */
export async function GET(request: Request) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Admin API requires SUPABASE_SERVICE_ROLE_KEY' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = (searchParams.get('status') ?? '').trim().toLowerCase();
  const search = (searchParams.get('search') ?? '').trim().toLowerCase();

  const { data: orders, error: ordersErr } = await admin
    .from('orders')
    .select('id, order_number, user_id, status, total_cents, currency, created_at, subscription_next_billing_date, stripe_subscription_id, trial_enabled_at_signup, trial_months_applied, trial_started_at, trial_ends_at, stripe_subscription_status, billing_state_normalized')
    .order('created_at', { ascending: false });
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  const orderList = orders ?? [];

  if (orderList.length === 0) {
    return NextResponse.json({ subscriptions: [], total: 0 });
  }

  const orderIds = orderList.map((o) => o.id);
  const { data: items } = await admin
    .from('order_items')
    .select('order_id, product_sku')
    .in('order_id', orderIds);
  const ordersWithSim = new Set<string>();
  const skuByOrder: Record<string, string> = {};
  for (const i of items ?? []) {
    const sku = (i.product_sku ?? '').trim();
    if (SIM_SKUS.includes(sku) || sku.includes('sim_monthly') || sku.includes('sim_yearly')) {
      ordersWithSim.add(i.order_id);
      if (!skuByOrder[i.order_id]) skuByOrder[i.order_id] = sku;
    }
  }

  const subscriptionOrders = orderList.filter((o) => ordersWithSim.has(o.id));
  if (subscriptionOrders.length === 0) {
    return NextResponse.json({ subscriptions: [], total: 0 });
  }

  const userIds = Array.from(new Set(subscriptionOrders.map((o) => o.user_id).filter(Boolean)));
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailByUser = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const { data: pricing } = await admin
    .from('product_pricing')
    .select('sku, period')
    .in('sku', SIM_SKUS);
  const periodBySku: Record<string, 'month' | 'year'> = {};
  for (const p of pricing ?? []) {
    periodBySku[p.sku] = p.period === 'year' ? 'year' : 'month';
  }

  const nowMs = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const stripe = getStripeServer();
  const stripeSubIds = Array.from(
    new Set(
      subscriptionOrders
        .map((o) => (o as { stripe_subscription_id?: string | null }).stripe_subscription_id)
        .filter(Boolean) as string[]
    )
  );
  const stripeStatusBySubId: Record<string, string> = {};
  if (stripe && stripeSubIds.length > 0) {
    await Promise.all(
      stripeSubIds.map(async (subId) => {
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          stripeStatusBySubId[subId] = sub.status;
        } catch {
          stripeStatusBySubId[subId] = 'unknown';
        }
      })
    );
  }

  let list = subscriptionOrders.map((o) => {
    const sku = skuByOrder[o.id];
    const period = sku ? periodBySku[sku] ?? 'month' : 'month';
    const created = new Date(o.created_at);
    let nextDue: string;
    if (o.subscription_next_billing_date) {
      nextDue = new Date(o.subscription_next_billing_date).toISOString();
    } else {
      const est = new Date(created);
      if (period === 'year') est.setFullYear(est.getFullYear() + 1);
      else est.setMonth(est.getMonth() + 1);
      nextDue = est.toISOString();
    }
    const daysUntilDue = Math.ceil((new Date(nextDue).getTime() - nowMs) / oneDayMs);
    const oExt = o as {
      trial_enabled_at_signup?: boolean;
      trial_months_applied?: number | null;
      trial_started_at?: string | null;
      trial_ends_at?: string | null;
      stripe_subscription_status?: string | null;
      billing_state_normalized?: string | null;
    };
    const stripeSubId = (o as { stripe_subscription_id?: string | null }).stripe_subscription_id ?? null;
    return {
      order_id: o.id,
      order_number: o.order_number ?? null,
      user_id: o.user_id,
      user_email: o.user_id ? emailByUser.get(o.user_id) ?? null : null,
      status: o.status,
      stripe_status: stripeSubId ? stripeStatusBySubId[stripeSubId] ?? null : null,
      stripe_subscription_id: stripeSubId,
      total_cents: o.total_cents,
      currency: o.currency,
      period,
      next_due_estimate: nextDue,
      days_until_due: daysUntilDue,
      created_at: o.created_at,
      trial_enabled_at_signup: oExt.trial_enabled_at_signup ?? false,
      trial_months_applied: oExt.trial_months_applied ?? null,
      trial_started_at: oExt.trial_started_at ?? null,
      trial_ends_at: oExt.trial_ends_at ?? null,
      stripe_subscription_status: oExt.stripe_subscription_status ?? null,
      billing_state_normalized: oExt.billing_state_normalized ?? null,
    };
  });

  const total_subscriptions = list.length;
  const total_suspended = list.filter((s) => s.status === 'suspended').length;

  if (statusFilter) {
    list = list.filter((s) => s.status.toLowerCase() === statusFilter);
  }
  if (search) {
    list = list.filter(
      (s) =>
        (s.order_number ?? '').toLowerCase().includes(search) ||
        (s.user_email ?? '').toLowerCase().includes(search) ||
        (s.user_id ?? '').toLowerCase().includes(search)
    );
  }

  return NextResponse.json({
    subscriptions: list,
    total: list.length,
    total_subscriptions,
    total_suspended,
  });
}
