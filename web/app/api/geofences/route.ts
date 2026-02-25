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
    .from('geofences')
    .select('id, device_id, name, center_lat, center_lng, radius_meters, alert_email, alert_type, created_at')
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
    name?: string;
    center_lat: number;
    center_lng: number;
    radius_meters: number;
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
  if (!body.device_id || typeof body.center_lat !== 'number' || typeof body.center_lng !== 'number' || typeof body.radius_meters !== 'number') {
    return NextResponse.json({ error: 'device_id, center_lat, center_lng, radius_meters required' }, { status: 400 });
  }
  if (body.radius_meters <= 0 || body.radius_meters > 50000) {
    return NextResponse.json({ error: 'radius_meters must be 1–50000' }, { status: 400 });
  }
  const alertType = body.alert_type === 'keep_out' ? 'keep_out' : 'keep_in';
  const { data, error } = await supabase
    .from('geofences')
    .insert({
      user_id: user.id,
      device_id: body.device_id,
      name: nameTrimmed,
      center_lat: body.center_lat,
      center_lng: body.center_lng,
      radius_meters: body.radius_meters,
      alert_email: body.alert_email !== false,
      alert_type: alertType,
    })
    .select('id, device_id, name, center_lat, center_lng, radius_meters, alert_email, alert_type, created_at')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
