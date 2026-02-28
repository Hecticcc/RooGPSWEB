import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { sendSms, SMS_MONTHLY_LIMIT } from '@/lib/smsportal';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * POST – Send one GPS tracking alert SMS for the current user.
 * Checks: sms_alerts_enabled, profile.mobile, and monthly limit (30).
 * Body: { message: string }
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const [profileRes, alertRes, usageRes] = await Promise.all([
    supabase.from('profiles').select('mobile').eq('user_id', user.id).maybeSingle(),
    supabase.from('alert_settings').select('sms_alerts_enabled').eq('user_id', user.id).maybeSingle(),
    supabase.from('sms_usage').select('count').eq('user_id', user.id).eq('period', currentPeriod()).maybeSingle(),
  ]);

  if (profileRes.error || alertRes.error || usageRes.error) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }

  const mobile = profileRes.data?.mobile?.trim();
  const enabled = alertRes.data?.sms_alerts_enabled === true;
  const used = usageRes.data?.count ?? 0;

  if (!enabled) {
    return NextResponse.json({ error: 'SMS alerts are disabled. Enable them in Settings.' }, { status: 400 });
  }
  if (!mobile) {
    return NextResponse.json({ error: 'No mobile number set. Add one in Settings.' }, { status: 400 });
  }
  if (used >= SMS_MONTHLY_LIMIT) {
    return NextResponse.json(
      { error: `Monthly SMS limit (${SMS_MONTHLY_LIMIT}) reached. Resets next month.` },
      { status: 429 }
    );
  }

  const result = await sendSms(mobile, message);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Failed to send SMS' }, { status: 502 });
  }

  const period = currentPeriod();
  const { error: rpcErr } = await supabase.rpc('increment_sms_usage', {
    p_user_id: user.id,
    p_period: period,
  });
  if (rpcErr) {
    return NextResponse.json({ error: 'SMS sent but usage could not be recorded' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, used: used + 1, limit: SMS_MONTHLY_LIMIT });
}
