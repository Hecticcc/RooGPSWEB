import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { setSimbaseSimState } from '@/lib/simbase';

/** POST /api/activation – consume activation code, link device to user, mark token used */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return NextResponse.json({ error: 'Activation code required' }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data: token, error: tokenErr } = await admin
    .from('activation_tokens')
    .select('id, order_id, user_id, tracker_stock_id, sim_iccid, used_at')
    .eq('code', code)
    .single();
  if (tokenErr || !token) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 404 });
  if (token.used_at) return NextResponse.json({ error: 'This code has already been used' }, { status: 400 });
  if (token.user_id !== user.id) return NextResponse.json({ error: 'This code is not for your account' }, { status: 403 });

  const { data: tracker } = await admin.from('tracker_stock').select('id, imei').eq('id', token.tracker_stock_id).single();
  if (!tracker) return NextResponse.json({ error: 'Tracker not found' }, { status: 500 });

  const deviceId = tracker.imei;

  const { data: existing } = await admin.from('devices').select('id, user_id').eq('id', deviceId).maybeSingle();
  if (existing) {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'This device is already linked to another account' }, { status: 409 });
    }
  } else {
    const { error: insertErr } = await admin.from('devices').insert({
      id: deviceId,
      user_id: user.id,
      name: null,
    });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from('activation_tokens')
    .update({ used_at: new Date().toISOString(), device_id: deviceId })
    .eq('id', token.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await admin
    .from('orders')
    .update({ status: 'activated', updated_at: new Date().toISOString() })
    .eq('id', token.order_id);

  let sim_enabled = false;
  if (token.sim_iccid && token.sim_iccid.trim()) {
    const result = await setSimbaseSimState(token.sim_iccid.trim(), 'enabled');
    sim_enabled = result.ok;
  }

  return NextResponse.json({
    ok: true,
    message: 'Device activated successfully',
    device_id: deviceId,
    sim_enabled,
  });
}
