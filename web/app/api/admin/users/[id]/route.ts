import { NextResponse } from 'next/server';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { listSimbaseSimcards } from '@/lib/simbase';

const SIM_SKUS = ['sim_monthly', 'sim_yearly'];
const ACTIVE_STATUSES = ['paid', 'fulfilled', 'processing', 'shipped', 'activated'];

function normalizeIccid(iccid: string): string {
  return String(iccid ?? '').trim();
}

async function fetchSimbaseStatesForIccids(iccids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = Array.from(new Set(iccids.map(normalizeIccid).filter(Boolean)));
  if (unique.length === 0) return result;
  try {
    const allSims = await listSimbaseSimcards();
    for (const sim of allSims) {
      result.set(sim.iccid, sim.state);
      result.set(sim.iccid.replace(/^0+/, ''), sim.state);
    }
  } catch {
    // Simbase not configured
  }
  return result;
}

/** GET /api/admin/users/[id] – full user detail for admin View (profile, devices, SIMs, subscriptions). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { id: userId } = await params;
  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const u = authUser.user;

  const [profileRow, roleRow, devicesRows, ordersRows, tokensRows] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, address_line1, address_line2, suburb, state, postcode, country, mobile').eq('user_id', userId).maybeSingle(),
    admin.from('user_roles').select('role, created_at').eq('user_id', userId).maybeSingle(),
    admin.from('devices').select('id, name, created_at, last_seen_at, ingest_disabled').eq('user_id', userId).order('created_at', { ascending: false }),
    admin.from('orders').select('id, order_number, status, total_cents, currency, created_at, subscription_next_billing_date').eq('user_id', userId).order('created_at', { ascending: false }),
    admin.from('activation_tokens').select('id, order_id, device_id, sim_iccid').eq('user_id', userId),
  ]);

  const profile = profileRow.data ?? null;
  const role = roleRow.data?.role ?? 'customer';
  const roleCreatedAt = roleRow.data?.created_at ?? null;
  const devices = devicesRows.data ?? [];
  const orders = ordersRows.data ?? [];
  const tokens = tokensRows.data ?? [];

  const orderIds = orders.map((o) => o.id);
  const { data: items } = orderIds.length > 0
    ? await admin.from('order_items').select('order_id, product_sku, assigned_sim_iccid').in('order_id', orderIds)
    : { data: [] as { order_id: string; product_sku: string | null; assigned_sim_iccid: string | null }[] };

  const ordersWithSimItems = new Set<string>();
  const orderSimSkus: Record<string, string> = {};
  for (const i of items ?? []) {
    const sku = (i.product_sku ?? '').trim();
    if (SIM_SKUS.includes(sku) || sku.includes('sim_monthly') || sku.includes('sim_yearly')) {
      ordersWithSimItems.add(i.order_id);
      if (!orderSimSkus[i.order_id]) orderSimSkus[i.order_id] = sku;
    }
  }

  const { data: pricing } = await admin.from('product_pricing').select('sku, period').in('sku', SIM_SKUS);
  const periodBySku: Record<string, 'month' | 'year'> = {};
  for (const p of pricing ?? []) {
    periodBySku[p.sku] = p.period === 'year' ? 'year' : 'month';
  }

  const subscriptionOrderIds = orders.filter((o) => ordersWithSimItems.has(o.id)).map((o) => o.id);
  const subscriptions = orders
    .filter((o) => subscriptionOrderIds.includes(o.id))
    .map((o) => {
      const sku = orderSimSkus[o.id];
      const period = sku ? (periodBySku[sku] ?? 'month') : 'month';
      const storedNext = (o as { subscription_next_billing_date?: string | null }).subscription_next_billing_date;
      let nextDue: Date;
      if (storedNext) {
        nextDue = new Date(storedNext);
      } else {
        const created = new Date(o.created_at);
        nextDue = new Date(created);
        if (period === 'year') nextDue.setFullYear(nextDue.getFullYear() + 1);
        else nextDue.setMonth(nextDue.getMonth() + 1);
      }
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

  const userIccids = Array.from(new Set(tokens.map((t) => t.sim_iccid).filter(Boolean))) as string[];
  const simStateByIccid = await fetchSimbaseStatesForIccids(userIccids);
  const deviceIds = Array.from(new Set(tokens.map((t) => t.device_id).filter(Boolean))) as string[];
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const devices_with_sim = tokens
    .filter((t) => t.device_id && t.sim_iccid)
    .map((t) => {
      const raw = simStateByIccid.get(normalizeIccid(t.sim_iccid)) ?? simStateByIccid.get(t.sim_iccid?.replace(/^0+/, '') ?? '');
      const sim_status = raw === 'enabled' || raw === 'disabled' ? raw : (raw ? 'unknown' : null);
      const dev = deviceById.get(t.device_id!);
      const order = orderById.get(t.order_id);
      return {
        activation_token_id: t.id,
        order_id: t.order_id,
        order_number: order?.order_number ?? null,
        device_id: t.device_id,
        device_name: dev?.name ?? t.device_id,
        sim_iccid: t.sim_iccid,
        sim_status: sim_status as 'enabled' | 'disabled' | 'unknown' | null,
      };
    });

  return NextResponse.json({
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    role,
    role_created_at: roleCreatedAt,
    profile: profile ? {
      first_name: profile.first_name ?? null,
      last_name: profile.last_name ?? null,
      address_line1: profile.address_line1 ?? null,
      address_line2: profile.address_line2 ?? null,
      suburb: profile.suburb ?? null,
      state: profile.state ?? null,
      postcode: profile.postcode ?? null,
      country: profile.country ?? null,
      mobile: profile.mobile ?? null,
    } : null,
    devices,
    subscriptions,
    devices_with_sim,
  });
}
