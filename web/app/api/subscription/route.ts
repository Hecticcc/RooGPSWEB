import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const SIM_SKUS = ['sim_monthly', 'sim_yearly'];
const ACTIVE_STATUSES = ['paid', 'fulfilled', 'processing', 'shipped', 'activated'];

import { listSimbaseSimcards } from '@/lib/simbase';

function normalizeIccid(iccid: string): string {
  return String(iccid ?? '').trim();
}

/** Build map: token ICCID -> 'enabled' | 'disabled' | 'unknown' from Simbase list (GET /simcards). */
async function fetchSimbaseStatesForIccids(iccids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = Array.from(new Set(iccids.map(normalizeIccid).filter(Boolean)));
  if (unique.length === 0) return result;

  const allSims = await listSimbaseSimcards();
  const byIccid = new Map<string, string>();
  for (const sim of allSims) {
    byIccid.set(sim.iccid, sim.state);
    byIccid.set(sim.iccid.replace(/^0+/, ''), sim.state);
  }
  for (const id of unique) {
    const state = byIccid.get(id) ?? byIccid.get(id.replace(/^0+/, ''));
    if (state) result.set(id, state);
  }
  return result;
}

/** GET /api/subscription – current user's SIM subscription status and details for subscription page */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, order_number, status, total_cents, currency, created_at, subscription_next_billing_date, stripe_subscription_id, trial_enabled_at_signup, trial_months_applied, trial_started_at, trial_ends_at, stripe_subscription_status, billing_state_normalized')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  const orderList = orders ?? [];

  if (orderList.length === 0) {
    return NextResponse.json({
      hasActiveSimSubscription: false,
      hasAnyEnabledSim: false,
      subscriptions: [],
      simTrackerLinks: [],
    });
  }

  const orderIds = orderList.map((o) => o.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('order_id, product_sku, quantity, activation_token_id, assigned_sim_iccid')
    .in('order_id', orderIds);

  const ordersWithSimItems = new Set<string>();
  const orderSimSkus: Record<string, string> = {};
  const orderIdToTrackerSku: Record<string, string> = {};
  for (const i of items ?? []) {
    const sku = (i.product_sku ?? '').trim();
    if (SIM_SKUS.includes(sku) || sku.includes('sim_monthly') || sku.includes('sim_yearly')) {
      ordersWithSimItems.add(i.order_id);
      if (!orderSimSkus[i.order_id]) orderSimSkus[i.order_id] = sku;
    }
    if (sku && (sku === 'gps_tracker' || sku.includes('gps_tracker')) && !sku.includes('sim_')) {
      if (!orderIdToTrackerSku[i.order_id]) orderIdToTrackerSku[i.order_id] = sku;
    }
  }

  const subscriptionOrderIds = orderList
    .filter((o) => ordersWithSimItems.has(o.id))
    .map((o) => o.id);

  const hasActiveSimSubscription = orderList.some(
    (o) => ordersWithSimItems.has(o.id) && (ACTIVE_STATUSES.includes(o.status) || (o as { billing_state_normalized?: string }).billing_state_normalized === 'trialing')
  );

  const { data: pricing } = await supabase
    .from('product_pricing')
    .select('sku, period, device_model_name')
    .in('sku', SIM_SKUS);

  const periodBySku: Record<string, 'month' | 'year'> = {};
  for (const p of pricing ?? []) {
    periodBySku[p.sku] = p.period === 'year' ? 'year' : 'month';
  }

  const trackerSkus = Array.from(new Set(Object.values(orderIdToTrackerSku)));
  const { data: trackerPricing } = await supabase
    .from('product_pricing')
    .select('sku, device_model_name')
    .in('sku', trackerSkus.length > 0 ? trackerSkus : ['gps_tracker']);
  const productModelBySku: Record<string, string | null> = {};
  for (const p of trackerPricing ?? []) {
    const row = p as { sku: string; device_model_name?: string | null };
    productModelBySku[row.sku] = row.device_model_name?.trim() ?? null;
  }

  const { data: tokens } = await supabase
    .from('activation_tokens')
    .select('id, order_id, device_id, sim_iccid')
    .eq('user_id', user.id)
    .not('device_id', 'is', null);

  const tokenList = tokens ?? [];
  const deviceIds = Array.from(new Set(tokenList.map((t) => t.device_id).filter(Boolean))) as string[];
  const deviceModelById: Record<string, string | null> = {};
  let deviceNames: Record<string, string> = {};
  if (deviceIds.length > 0) {
    const { data: devs } = await supabase
      .from('devices')
      .select('id, name, model_name')
      .eq('user_id', user.id)
      .in('id', deviceIds);
    for (const d of devs ?? []) {
      const row = d as { id: string; name: string | null; model_name?: string | null };
      deviceNames[row.id] = row.name ?? row.id;
      deviceModelById[row.id] = row.model_name?.trim() ?? null;
    }
  }
  const orderIdToModel: Record<string, string | null> = {};
  for (const t of tokenList) {
    if (t.order_id && t.device_id) orderIdToModel[t.order_id] = deviceModelById[t.device_id] ?? null;
  }

  const nowMs = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const subscriptions = orderList
    .filter((o) => subscriptionOrderIds.includes(o.id))
    .map((o) => {
      const sku = orderSimSkus[o.id];
      const period = sku ? (periodBySku[sku] ?? 'month') : 'month';
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
      const nextDueMs = new Date(nextDue).getTime();
      const daysUntilDue = Math.ceil((nextDueMs - nowMs) / oneDayMs);
      const oExt = o as {
        trial_enabled_at_signup?: boolean;
        trial_months_applied?: number | null;
        trial_started_at?: string | null;
        trial_ends_at?: string | null;
        stripe_subscription_status?: string | null;
        billing_state_normalized?: string | null;
      };
      return {
        order_id: o.id,
        order_number: o.order_number ?? null,
        model_name: orderIdToModel[o.id] ?? (orderIdToTrackerSku[o.id] ? productModelBySku[orderIdToTrackerSku[o.id]] ?? null : null),
        status: o.status,
        created_at: o.created_at,
        total_cents: o.total_cents,
        currency: o.currency,
        period,
        next_due_estimate: nextDue,
        days_until_due: daysUntilDue,
        stripe_subscription_id: (o as { stripe_subscription_id?: string | null }).stripe_subscription_id ?? null,
        trial_enabled_at_signup: oExt.trial_enabled_at_signup ?? false,
        trial_months_applied: oExt.trial_months_applied ?? null,
        trial_started_at: oExt.trial_started_at ?? null,
        trial_ends_at: oExt.trial_ends_at ?? null,
        stripe_subscription_status: oExt.stripe_subscription_status ?? null,
        billing_state_normalized: oExt.billing_state_normalized ?? null,
        trial_ends_soon:
          oExt.billing_state_normalized === 'trialing' &&
          oExt.trial_ends_at != null &&
          new Date(oExt.trial_ends_at).getTime() - nowMs < 7 * 24 * 60 * 60 * 1000 &&
          new Date(oExt.trial_ends_at).getTime() > nowMs,
      };
    });

  const userIccids = Array.from(new Set(tokenList.map((t) => t.sim_iccid).filter(Boolean))) as string[];
  let simStateByIccid: Map<string, string>;
  try {
    simStateByIccid = await fetchSimbaseStatesForIccids(userIccids);
  } catch {
    simStateByIccid = new Map();
  }
  const hasAnyEnabledSim = tokenList.some((t) => simStateByIccid.get(t.sim_iccid) === 'enabled');

  const orderById: Record<string, { order_number: string | null }> = {};
  for (const o of orderList) {
    orderById[o.id] = { order_number: o.order_number ?? null };
  }

  const simTrackerLinks = tokenList.map((t) => {
    const raw = t.sim_iccid ? simStateByIccid.get(normalizeIccid(t.sim_iccid)) ?? simStateByIccid.get(t.sim_iccid) : undefined;
    const sim_status = raw === 'enabled' || raw === 'disabled' ? raw : raw === 'unknown' ? 'unknown' : null;
    return {
      order_id: t.order_id,
      order_number: orderById[t.order_id]?.order_number ?? null,
      device_id: t.device_id,
      device_name: t.device_id ? (deviceNames[t.device_id] ?? t.device_id) : null,
      sim_linked: true,
      sim_status: sim_status as 'enabled' | 'disabled' | 'unknown' | null,
    };
  });

  return NextResponse.json({
    hasActiveSimSubscription,
    hasAnyEnabledSim,
    subscriptions,
    simTrackerLinks,
  });
}
