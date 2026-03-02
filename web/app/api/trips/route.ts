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

  /** Add one year to an ISO date string (for device clock wrong-year workaround). */
  function addYear(iso: string): string {
    const d = new Date(iso);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString();
  }

  let trips: { id: string; device_id: string; started_at: string; ended_at: string; duration_seconds: number; distance_meters: number; max_speed_kmh: number | null; start_lat: number | null; start_lon: number | null; end_lat: number | null; end_lon: number | null }[] = [];

  if (from && to) {
    const fromNext = addYear(from);
    const toNext = addYear(to);
    const [res1, res2] = await Promise.all([
      supabase
        .from('trips')
        .select('id, device_id, started_at, ended_at, duration_seconds, distance_meters, max_speed_kmh, start_lat, start_lon, end_lat, end_lon')
        .eq('device_id', deviceId)
        .gte('ended_at', from)
        .lte('started_at', to)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('trips')
        .select('id, device_id, started_at, ended_at, duration_seconds, distance_meters, max_speed_kmh, start_lat, start_lon, end_lat, end_lon')
        .eq('device_id', deviceId)
        .gte('ended_at', fromNext)
        .lte('started_at', toNext)
        .order('started_at', { ascending: false })
        .limit(100),
    ]);
    if (res1.error) return NextResponse.json({ error: res1.error.message }, { status: 500 });
    if (res2.error) return NextResponse.json({ error: res2.error.message }, { status: 500 });
    const seen = new Set<string>();
    for (const t of [...(res1.data ?? []), ...(res2.data ?? [])]) {
      if (!t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      trips.push(t);
    }
    trips.sort((a, b) => (b.started_at < a.started_at ? -1 : b.started_at > a.started_at ? 1 : 0));
    trips = trips.slice(0, 100);
  } else {
    let q = supabase
      .from('trips')
      .select('id, device_id, started_at, ended_at, duration_seconds, distance_meters, max_speed_kmh, start_lat, start_lon, end_lat, end_lon')
      .eq('device_id', deviceId)
      .order('started_at', { ascending: false })
      .limit(100);
    if (from) q = q.gte('ended_at', from);
    if (to) q = q.lte('started_at', to);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    trips = data ?? [];
  }

  return NextResponse.json(trips);
}
