import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: trip } = await supabase
    .from('trips')
    .select('id, user_id, device_id, started_at, ended_at')
    .eq('id', tripId)
    .single();
  if (!trip || trip.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: points, error } = await supabase
    .from('trip_points')
    .select('lat, lon, occurred_at')
    .eq('trip_id', tripId)
    .order('occurred_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (points ?? []).map((p) => ({
    lat: Number(p.lat),
    lon: Number(p.lon),
    occurred_at: p.occurred_at ?? undefined,
    speed_kph: undefined as number | undefined,
  }));

  let fromLocs: { lat: number; lon: number; occurred_at?: string; speed_kph?: number }[] = [];
  if (trip.device_id && trip.started_at && trip.ended_at) {
    const endMs = new Date(trip.ended_at).getTime();
    const endWindowIso = new Date(endMs + 20 * 60 * 1000).toISOString();
    const { data: locs } = await supabase
      .from('locations')
      .select('latitude, longitude, received_at, speed_kph')
      .eq('device_id', trip.device_id)
      .gte('received_at', trip.started_at)
      .lte('received_at', endWindowIso)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('received_at', { ascending: true })
      .limit(5000);
    if (locs && locs.length > 0) {
      fromLocs = locs.map((l) => ({
        lat: Number(l.latitude),
        lon: Number(l.longitude),
        occurred_at: l.received_at ?? undefined,
        speed_kph: l.speed_kph != null ? Number(l.speed_kph) : undefined,
      }));
    }
  }

  // Use whichever source has more points so the route line has maximum detail (follows path better).
  // Raw locations can include where the car stopped; trip_points is the segment used for the trip.
  const result = fromLocs.length > list.length ? fromLocs : list;
  return NextResponse.json(result);
}
