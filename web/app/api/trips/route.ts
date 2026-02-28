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

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId required' }, { status: 400 });
  }

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', deviceId)
    .eq('user_id', user.id)
    .single();
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  let q = supabase
    .from('trips')
    .select('id, device_id, started_at, ended_at, duration_seconds, distance_meters, max_speed_kmh, start_lat, start_lon, end_lat, end_lon')
    .eq('device_id', deviceId)
    .order('started_at', { ascending: false })
    .limit(100);
  if (from) q = q.gte('ended_at', from);
  if (to) q = q.lte('started_at', to);
  const { data: trips, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(trips ?? []);
}
