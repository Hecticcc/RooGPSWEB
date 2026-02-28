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
  const unique = [...new Set(iccids.map(normalizeIccid).filter(Boolean))];
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
    .select('id, order_number, status, total_cents, currency, created_at')
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
  for (const i of items ?? []) {
    const sku = (i.product_sku ?? '').trim();
    if (SIM_SKUS.includes(sku) || sku.includes('sim_monthly') || sku.includes('sim_yearly')) {
      ordersWithSimItems.add(i.order_id);
      if (!orderSimSkus[i.order_id]) orderSimSkus[i.order_id] = sku;
    }
  }

  const subscriptionOrderIds = orderList
    .filter((o) => ordersWithSimItems.has(o.id))
    .map((o) => o.id);

  const hasActiveSimSubscription = orderList.some(
    (o) => ordersWithSimItems.has(o.id) && ACTIVE_STATUSES.includes(o.status)
  );

  const { data: pricing } = await supabase
    .from('product_pricing')
    .select('sku, period')
    .in('sku', SIM_SKUS);

  const periodBySku: Record<string, 'month' | 'year'> = {};
  for (const p of pricing ?? []) {
    periodBySku[p.sku] = p.period === 'year' ? 'year' : 'month';
  }

  const subscriptions = orderList
    .filter((o) => subscriptionOrderIds.includes(o.id))
    .map((o) => {
      const sku = orderSimSkus[o.id];
      const period = sku ? (periodBySku[sku] ?? 'month') : 'month';
      const created = new Date(o.created_at);
      const nextDue = new Date(created);
      if (period === 'year') nextDue.setFullYear(nextDue.getFullYear() + 1);
      else nextDue.setMonth(nextDue.getMonth() + 1);
      return {
        order_id: o.id,
        order_number: o.order_number ?? null,
        status: o.status,
        created_at: o.created_at,
        total_cents: o.total_cents,
        currency: o.currency,
        period,
        next_due_estimate: nextDue.toISOString(),
      };
    });

  const { data: tokens } = await supabase
    .from('activation_tokens')
    .select('id, order_id, device_id, sim_iccid')
    .eq('user_id', user.id)
    .not('device_id', 'is', null);

  const tokenList = tokens ?? [];
  const userIccids = [...new Set(tokenList.map((t) => t.sim_iccid).filter(Boolean))] as string[];
  let simStateByIccid: Map<string, string>;
  try {
    simStateByIccid = await fetchSimbaseStatesForIccids(userIccids);
  } catch {
    simStateByIccid = new Map();
  }
  const hasAnyEnabledSim = tokenList.some((t) => simStateByIccid.get(t.sim_iccid) === 'enabled');

  const deviceIds = [...new Set(tokenList.map((t) => t.device_id).filter(Boolean))] as string[];
  let deviceNames: Record<string, string> = {};
  if (deviceIds.length > 0) {
    const { data: devs } = await supabase
      .from('devices')
      .select('id, name')
      .eq('user_id', user.id)
      .in('id', deviceIds);
    for (const d of devs ?? []) {
      deviceNames[d.id] = d.name ?? d.id;
    }
  }

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
