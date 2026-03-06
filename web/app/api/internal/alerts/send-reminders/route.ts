import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { sendSms, SMS_MONTHLY_LIMIT } from '@/lib/smsportal';

const CRON_SECRET = process.env.CRON_SECRET ?? process.env.INTERNAL_TRIPS_SECRET ?? '';
const LOW_QUOTA_THRESHOLD = 5; // Remind when (limit - used) <= 5

function authInternal(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === CRON_SECRET) return true;
  if (request.headers.get('x-internal-secret') === CRON_SECRET) return true;
  return false;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * POST – Send reminder SMS (do NOT count toward quota):
 * - Low quota: user has 5 or fewer SMS left this month (if sms_low_reminder_enabled).
 * - Subscription: 7 days before and 48 hours before next_billing_date.
 * Call from cron daily (e.g. once per day for low-quota + subscription reminders).
 */
export async function POST(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'Set CRON_SECRET for send-reminders' },
      { status: 503 }
    );
  }
  if (!authInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const period = currentPeriod();
  const now = new Date();
  const nowMs = now.getTime();

  let lowQuotaSent = 0;
  let sub7dSent = 0;
  let sub48hSent = 0;

  // ---- Low-quota reminders: used >= (limit - 5), mobile set, reminder enabled, not already sent this period ----
  const { data: usageRows } = await admin
    .from('sms_usage')
    .select('user_id, count')
    .eq('period', period);

  const usersNeedingLowQuotaReminder = (usageRows ?? []).filter(
    (r) => (r.count ?? 0) >= SMS_MONTHLY_LIMIT - LOW_QUOTA_THRESHOLD
  );
  const userIdsLow = usersNeedingLowQuotaReminder.map((r) => r.user_id);

  if (userIdsLow.length > 0) {
    const { data: alreadySent } = await admin
      .from('sms_reminder_log')
      .select('user_id')
      .eq('reminder_type', 'low_quota')
      .eq('period', period)
      .in('user_id', userIdsLow);
    const sentSet = new Set((alreadySent ?? []).map((r) => r.user_id));

    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id, mobile')
      .in('user_id', userIdsLow);
    const { data: settings } = await admin
      .from('alert_settings')
      .select('user_id, sms_low_reminder_enabled')
      .in('user_id', userIdsLow);

    const mobileByUser: Record<string, string> = {};
    for (const p of profiles ?? []) {
      const m = p.mobile?.trim();
      if (m) mobileByUser[p.user_id] = m;
    }
    const reminderEnabled = new Set(
      (settings ?? []).filter((s) => s.sms_low_reminder_enabled === true).map((s) => s.user_id)
    );

    for (const r of usersNeedingLowQuotaReminder) {
      if (sentSet.has(r.user_id) || !reminderEnabled.has(r.user_id)) continue;
      const mobile = mobileByUser[r.user_id];
      if (!mobile) continue;
      const left = Math.max(0, SMS_MONTHLY_LIMIT - (r.count ?? 0));
      const msg = `RooGPS: You have ${left} SMS alert${left === 1 ? '' : 's'} left this month. Top up next month or manage in Settings.`;
      const result = await sendSms(mobile, msg);
      if (!result.ok) continue;
      await admin.from('sms_reminder_log').upsert(
        { user_id: r.user_id, reminder_type: 'low_quota', period, sent_at: new Date().toISOString() },
        { onConflict: 'user_id,reminder_type,period' }
      );
      lowQuotaSent++;
    }
  }

  // ---- Subscription reminders: orders with active SIM subscription and next_billing_date in ~7d or ~48h ----
  const { data: orders } = await admin
    .from('orders')
    .select('id, user_id, subscription_next_billing_date, status')
    .not('subscription_next_billing_date', 'is', null)
    .in('status', ['paid', 'fulfilled', 'processing', 'shipped', 'activated']);

  const simSkuOrderIds = new Set<string>();
  if (orders?.length) {
    const orderIds = orders.map((o) => o.id);
    const { data: items } = await admin
      .from('order_items')
      .select('order_id, product_sku')
      .in('order_id', orderIds);
    const simSkus = ['sim_monthly', 'sim_yearly'];
    for (const i of items ?? []) {
      const sku = (i.product_sku ?? '').trim();
      if (simSkus.includes(sku) || sku.includes('sim_')) simSkuOrderIds.add(i.order_id);
    }
  }

  const activeSubOrders = (orders ?? []).filter((o) => simSkuOrderIds.has(o.id));
  const sevenDayOrders: { order_id: string; user_id: string; next: string }[] = [];
  const fortyEightHourOrders: { order_id: string; user_id: string; next: string }[] = [];

  for (const o of activeSubOrders) {
    const nextStr = (o as { subscription_next_billing_date?: string }).subscription_next_billing_date;
    if (!nextStr) continue;
    const nextDate = new Date(nextStr);
    const nextMs = nextDate.getTime();
    const diffMs = nextMs - nowMs;
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    const diffHours = diffMs / (60 * 60 * 1000);
    if (diffDays >= 6.5 && diffDays <= 7.5) {
      sevenDayOrders.push({ order_id: o.id, user_id: o.user_id, next: nextStr });
    } else if (diffHours >= 46 && diffHours <= 50) {
      fortyEightHourOrders.push({ order_id: o.id, user_id: o.user_id, next: nextStr });
    }
  }

  const formatDateShort = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  for (const { order_id, user_id, next } of sevenDayOrders) {
    const { data: existing } = await admin
      .from('sms_reminder_log')
      .select('id')
      .eq('user_id', user_id)
      .eq('reminder_type', 'subscription_7d')
      .eq('period', order_id)
      .maybeSingle();
    if (existing) continue;

    const { data: profile } = await admin.from('profiles').select('mobile').eq('user_id', user_id).maybeSingle();
    const mobile = profile?.mobile?.trim();
    if (!mobile) continue;

    const msg = `RooGPS: Your SIM subscription renews in 7 days (${formatDateShort(next)}). Manage in Account > Subscription.`;
    const result = await sendSms(mobile, msg);
    if (!result.ok) continue;
    await admin.from('sms_reminder_log').upsert(
      { user_id, reminder_type: 'subscription_7d', period: order_id, sent_at: new Date().toISOString() },
      { onConflict: 'user_id,reminder_type,period' }
    );
    sub7dSent++;
  }

  for (const { order_id, user_id, next } of fortyEightHourOrders) {
    const { data: existing } = await admin
      .from('sms_reminder_log')
      .select('id')
      .eq('user_id', user_id)
      .eq('reminder_type', 'subscription_48h')
      .eq('period', order_id)
      .maybeSingle();
    if (existing) continue;

    const { data: profile } = await admin.from('profiles').select('mobile').eq('user_id', user_id).maybeSingle();
    const mobile = profile?.mobile?.trim();
    if (!mobile) continue;

    const msg = `RooGPS: Your SIM subscription renews in 48 hours (${formatDateShort(next)}). Manage in Account > Subscription.`;
    const result = await sendSms(mobile, msg);
    if (!result.ok) continue;
    await admin.from('sms_reminder_log').upsert(
      { user_id, reminder_type: 'subscription_48h', period: order_id, sent_at: new Date().toISOString() },
      { onConflict: 'user_id,reminder_type,period' }
    );
    sub48hSent++;
  }

  return NextResponse.json({
    low_quota_sent: lowQuotaSent,
    subscription_7d_sent: sub7dSent,
    subscription_48h_sent: sub48hSent,
  });
}
