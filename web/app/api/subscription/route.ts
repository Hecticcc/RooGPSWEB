import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const SIM_SKUS = ['sim_monthly', 'sim_yearly'];
const ACTIVE_STATUSES = ['paid', 'fulfilled', 'processing', 'shipped', 'activated'];

const SIMBASE_API_BASE = process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2';
const SIMBASE_SIMS_PATH = process.env.SIMBASE_SIMS_PATH ?? '/simcards';
const SIMBASE_API_KEY = process.env.SIMBASE_API_KEY ?? '';

/** Fetch Simbase SIM states for given ICCIDs. Returns map iccid -> 'enabled' | 'disabled' (or unknown if not found). */
async function fetchSimbaseStatesForIccids(iccids: string[]): Promise<Map<string, string>> {
  const set = new Set(iccids);
  const result = new Map<string, string>();
  if (!SIMBASE_API_KEY || set.size === 0) return result;

  try {
    const base = SIMBASE_API_BASE.replace(/\/$/, '');
    const path = SIMBASE_SIMS_PATH.startsWith('/') ? SIMBASE_SIMS_PATH : `/${SIMBASE_SIMS_PATH}`;
    const headers: HeadersInit = {
      Authorization: `Bearer ${SIMBASE_API_KEY}`,
      'Content-Type': 'application/json',
    };
    let cursor: string | null = null;
    let page = 0;
    const maxPages = 100;
    do {
      const url = new URL(base + path);
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (!res.ok) break;
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        break;
      }
      const obj = data as { simcards?: { iccid?: string; id?: string; state?: string }[]; cursor?: string | null };
      const pageList = Array.isArray(data) ? data : (obj.simcards ?? []);
      for (const sim of pageList) {
        const iccid = String(sim.iccid ?? sim.id ?? '');
        if (set.has(iccid)) {
          const state = (sim.state ?? '').toString().toLowerCase();
          result.set(iccid, state === 'enabled' || state === 'disabled' ? state : 'unknown');
        }
      }
      cursor = obj.cursor ?? null;
      page++;
    } while (cursor && page < maxPages);
  } catch {
    // leave result empty on error
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
  const simStateByIccid = await fetchSimbaseStatesForIccids(userIccids);
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
    const state = simStateByIccid.get(t.sim_iccid);
    return {
      order_id: t.order_id,
      order_number: orderById[t.order_id]?.order_number ?? null,
      device_id: t.device_id,
      device_name: t.device_id ? (deviceNames[t.device_id] ?? t.device_id) : null,
      sim_linked: true,
      sim_status: state === 'enabled' || state === 'disabled' ? state : null as string | null,
    };
  });

  return NextResponse.json({
    hasActiveSimSubscription,
    hasAnyEnabledSim,
    subscriptions,
    simTrackerLinks,
  });
}
