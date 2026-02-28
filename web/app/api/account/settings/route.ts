import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { SMS_MONTHLY_LIMIT } from '@/lib/smsportal';

function currentPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** GET – profile (mobile), alert_settings (sms_alerts_enabled, battery*), sms_usage_this_month */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const period = currentPeriod();
  const [profileRes, alertRes, usageRes] = await Promise.all([
    supabase.from('profiles').select('mobile').eq('user_id', user.id).maybeSingle(),
    supabase.from('alert_settings').select('sms_alerts_enabled, battery_alert_enabled, battery_alert_percent, battery_alert_email').eq('user_id', user.id).maybeSingle(),
    supabase.from('sms_usage').select('count').eq('user_id', user.id).eq('period', period).maybeSingle(),
  ]);

  if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });
  if (alertRes.error) return NextResponse.json({ error: alertRes.error.message }, { status: 500 });
  if (usageRes.error) return NextResponse.json({ error: usageRes.error.message }, { status: 500 });

  const profile = profileRes.data;
  const alert = alertRes.data;
  const usage = usageRes.data;

  return NextResponse.json({
    email: user.email ?? null,
    mobile: profile?.mobile ?? null,
    sms_alerts_enabled: alert?.sms_alerts_enabled ?? false,
    sms_usage_this_month: usage?.count ?? 0,
    sms_monthly_limit: SMS_MONTHLY_LIMIT,
    battery_alert_enabled: alert?.battery_alert_enabled ?? false,
    battery_alert_percent: alert?.battery_alert_percent ?? 20,
    battery_alert_email: alert?.battery_alert_email ?? true,
  });
}

/** PATCH – update mobile, sms_alerts_enabled (and optionally battery settings) */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    mobile?: string | null;
    sms_alerts_enabled?: boolean;
    battery_alert_enabled?: boolean;
    battery_alert_percent?: number;
    battery_alert_email?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.mobile !== undefined) {
    const mobile = typeof body.mobile === 'string' ? body.mobile.trim() || null : null;
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, mobile, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const alertUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.sms_alerts_enabled === 'boolean') alertUpdates.sms_alerts_enabled = body.sms_alerts_enabled;
  if (typeof body.battery_alert_enabled === 'boolean') alertUpdates.battery_alert_enabled = body.battery_alert_enabled;
  if (typeof body.battery_alert_percent === 'number') {
    if (body.battery_alert_percent < 0 || body.battery_alert_percent > 100) {
      return NextResponse.json({ error: 'battery_alert_percent must be 0-100' }, { status: 400 });
    }
    alertUpdates.battery_alert_percent = body.battery_alert_percent;
  }
  if (typeof body.battery_alert_email === 'boolean') alertUpdates.battery_alert_email = body.battery_alert_email;

  if (Object.keys(alertUpdates).length > 1) {
    const { error: alertErr } = await supabase
      .from('alert_settings')
      .upsert(
        { user_id: user.id, ...alertUpdates },
        { onConflict: 'user_id' }
      );
    if (alertErr) return NextResponse.json({ error: alertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
