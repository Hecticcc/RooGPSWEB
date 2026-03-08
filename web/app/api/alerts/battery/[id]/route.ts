import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: { threshold_percent?: number; notify_email?: boolean; notify_sms?: boolean; enabled?: boolean; battery_type?: 'main' | 'backup' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const updates: { threshold_percent?: number; notify_email?: boolean; notify_sms?: boolean; enabled?: boolean; battery_type?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.threshold_percent === 'number') {
    updates.threshold_percent = Math.max(0, Math.min(100, body.threshold_percent));
  }
  if (typeof body.notify_email === 'boolean') updates.notify_email = body.notify_email;
  if (typeof body.notify_sms === 'boolean') updates.notify_sms = body.notify_sms;
  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
  if (body.battery_type === 'backup' || body.battery_type === 'main') updates.battery_type = body.battery_type;

  const { data, error } = await supabase
    .from('battery_alerts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, device_id, threshold_percent, notify_email, notify_sms, enabled, battery_type, created_at')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { error } = await supabase
    .from('battery_alerts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
