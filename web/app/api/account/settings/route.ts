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
    supabase.from('profiles').select('mobile, first_name, last_name, address_line1, address_line2, suburb, state, postcode, country').eq('user_id', user.id).maybeSingle(),
    supabase.from('alert_settings').select('sms_alerts_enabled, sms_low_reminder_enabled, battery_alert_enabled, battery_alert_percent, battery_alert_email').eq('user_id', user.id).maybeSingle(),
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
    first_name: profile?.first_name ?? null,
    last_name: profile?.last_name ?? null,
    address_line1: profile?.address_line1 ?? null,
    address_line2: profile?.address_line2 ?? null,
    suburb: profile?.suburb ?? null,
    state: profile?.state ?? null,
    postcode: profile?.postcode ?? null,
    country: profile?.country ?? 'Australia',
    sms_alerts_enabled: alert?.sms_alerts_enabled ?? false,
    sms_low_reminder_enabled: alert?.sms_low_reminder_enabled ?? true,
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
    first_name?: string | null;
    last_name?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
    country?: string | null;
    sms_alerts_enabled?: boolean;
    sms_low_reminder_enabled?: boolean;
    battery_alert_enabled?: boolean;
    battery_alert_percent?: number;
    battery_alert_email?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const profileUpdates: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  if (body.mobile !== undefined) profileUpdates.mobile = typeof body.mobile === 'string' ? body.mobile.trim() || null : null;
  if (body.first_name !== undefined) profileUpdates.first_name = typeof body.first_name === 'string' ? body.first_name.trim() || null : null;
  if (body.last_name !== undefined) profileUpdates.last_name = typeof body.last_name === 'string' ? body.last_name.trim() || null : null;
  if (body.address_line1 !== undefined) profileUpdates.address_line1 = typeof body.address_line1 === 'string' ? body.address_line1.trim() || null : null;
  if (body.address_line2 !== undefined) profileUpdates.address_line2 = typeof body.address_line2 === 'string' ? body.address_line2.trim() || null : null;
  if (body.suburb !== undefined) profileUpdates.suburb = typeof body.suburb === 'string' ? body.suburb.trim() || null : null;
  if (body.state !== undefined) profileUpdates.state = typeof body.state === 'string' ? body.state.trim() || null : null;
  if (body.postcode !== undefined) profileUpdates.postcode = typeof body.postcode === 'string' ? body.postcode.trim() || null : null;
  if (body.country !== undefined) profileUpdates.country = typeof body.country === 'string' && body.country.trim() ? body.country.trim() : 'Australia';

  if (Object.keys(profileUpdates).length > 2) {
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(profileUpdates as Record<string, unknown>, { onConflict: 'user_id' });
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const alertUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.sms_alerts_enabled === 'boolean') alertUpdates.sms_alerts_enabled = body.sms_alerts_enabled;
  if (typeof body.sms_low_reminder_enabled === 'boolean') alertUpdates.sms_low_reminder_enabled = body.sms_low_reminder_enabled;
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
