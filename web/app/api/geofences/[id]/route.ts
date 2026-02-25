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
  let body: {
    name?: string;
    radius_meters?: number;
    alert_email?: boolean;
    alert_type?: 'keep_in' | 'keep_out';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const nameTrimmed = typeof body.name === 'string' ? body.name.trim() : '';
  if (!nameTrimmed) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const update: Record<string, unknown> = { name: nameTrimmed };
  if (typeof body.radius_meters === 'number') {
    if (body.radius_meters <= 0 || body.radius_meters > 50000) {
      return NextResponse.json({ error: 'radius_meters must be 1–50000' }, { status: 400 });
    }
    update.radius_meters = body.radius_meters;
  }
  if (typeof body.alert_email === 'boolean') update.alert_email = body.alert_email;
  if (body.alert_type === 'keep_out' || body.alert_type === 'keep_in') update.alert_type = body.alert_type;
  const { data, error } = await supabase
    .from('geofences')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, device_id, name, center_lat, center_lng, radius_meters, alert_email, alert_type, created_at')
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
    .from('geofences')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
