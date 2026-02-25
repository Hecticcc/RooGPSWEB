import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data, error } = await supabase
    .from('alert_settings')
    .select('battery_alert_enabled, battery_alert_percent, battery_alert_email')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({
      battery_alert_enabled: false,
      battery_alert_percent: 20,
      battery_alert_email: true,
    });
  }
  return NextResponse.json({
    battery_alert_enabled: data.battery_alert_enabled ?? false,
    battery_alert_percent: data.battery_alert_percent ?? 20,
    battery_alert_email: data.battery_alert_email ?? true,
  });
}

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
    battery_alert_enabled?: boolean;
    battery_alert_percent?: number;
    battery_alert_email?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const updates: {
    battery_alert_enabled?: boolean;
    battery_alert_percent?: number;
    battery_alert_email?: boolean;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };
  if (typeof body.battery_alert_enabled === 'boolean') updates.battery_alert_enabled = body.battery_alert_enabled;
  if (typeof body.battery_alert_percent === 'number') {
    if (body.battery_alert_percent < 0 || body.battery_alert_percent > 100) {
      return NextResponse.json({ error: 'battery_alert_percent must be 0-100' }, { status: 400 });
    }
    updates.battery_alert_percent = body.battery_alert_percent;
  }
  if (typeof body.battery_alert_email === 'boolean') updates.battery_alert_email = body.battery_alert_email;

  const { data, error } = await supabase
    .from('alert_settings')
    .upsert(
      { user_id: user.id, ...updates },
      { onConflict: 'user_id' }
    )
    .select('battery_alert_enabled, battery_alert_percent, battery_alert_email')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
