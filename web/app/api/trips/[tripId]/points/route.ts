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

  const list = points ?? [];
  // Prefer raw locations for the route when we can get more points: full path and true last
  // position (trip.ended_at is "last moving" time; extend by 20 min to include where they stopped).
  if (trip.device_id && trip.started_at && trip.ended_at) {
    const endMs = new Date(trip.ended_at).getTime();
    const endWindowIso = new Date(endMs + 20 * 60 * 1000).toISOString();
    const { data: locs } = await supabase
      .from('locations')
      .select('latitude, longitude, received_at')
      .eq('device_id', trip.device_id)
      .gte('received_at', trip.started_at)
      .lte('received_at', endWindowIso)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('received_at', { ascending: true });
    if (locs && locs.length > list.length) {
      const fromLocs = locs.map((l) => ({
        lat: Number(l.latitude),
        lon: Number(l.longitude),
        occurred_at: l.received_at ?? undefined,
      }));
      return NextResponse.json(fromLocs);
    }
  }
  return NextResponse.json(list);
}
