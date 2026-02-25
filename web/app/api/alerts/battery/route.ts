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
    .from('battery_alerts')
    .select('id, device_id, threshold_percent, notify_email, enabled, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: {
    device_id: string;
    threshold_percent?: number;
    notify_email?: boolean;
    enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.device_id) {
    return NextResponse.json({ error: 'device_id required' }, { status: 400 });
  }
  const threshold = typeof body.threshold_percent === 'number'
    ? Math.max(0, Math.min(100, body.threshold_percent))
    : 20;
  const { data, error } = await supabase
    .from('battery_alerts')
    .insert({
      user_id: user.id,
      device_id: body.device_id,
      threshold_percent: threshold,
      notify_email: body.notify_email !== false,
      enabled: body.enabled !== false,
      updated_at: new Date().toISOString(),
    })
    .select('id, device_id, threshold_percent, notify_email, enabled, created_at')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
