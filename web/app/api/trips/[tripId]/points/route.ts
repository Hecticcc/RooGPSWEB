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
    .select('lat, lon, occurred_at, point_id')
    .eq('trip_id', tripId)
    .order('occurred_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pointIds = (points ?? []).map((p) => (p as { point_id?: string }).point_id).filter(Boolean) as string[];

  // Fetch speed + gps_valid for each trip_point via its source location row.
  let speedByPointId: Record<string, number | undefined> = {};
  let gpsValidByPointId: Record<string, boolean> = {};
  if (pointIds.length > 0) {
    const { data: locs } = await supabase
      .from('locations')
      .select('id, speed_kph, gps_valid')
      .in('id', pointIds);
    for (const loc of locs ?? []) {
      if (loc.id != null) {
        if (loc.speed_kph != null) speedByPointId[loc.id] = Number(loc.speed_kph);
        if (loc.gps_valid != null) gpsValidByPointId[loc.id] = loc.gps_valid;
      }
    }
  }

  // Build the enriched trip_points list.
  const listWithSpeed = (points ?? []).map((p) => {
    const row = p as { lat: number; lon: number; occurred_at: string | null; point_id?: string };
    return {
      lat: Number(row.lat),
      lon: Number(row.lon),
      occurred_at: row.occurred_at ?? undefined,
      speed_kph: row.point_id != null ? speedByPointId[row.point_id] : undefined,
      gps_valid: row.point_id != null ? (gpsValidByPointId[row.point_id] ?? undefined) : undefined,
    };
  });

  // If trip_points exist (recompute has run), use them — they are the canonical, clean waypoints.
  if (listWithSpeed.length >= 2) {
    return NextResponse.json(listWithSpeed);
  }

  // Fallback: trip_points not yet populated (e.g. recompute hasn't run yet).
  // Return raw locations within the trip window so the route is still visible.
  if (trip.device_id && trip.started_at && trip.ended_at) {
    const { data: locs } = await supabase
      .from('locations')
      .select('latitude, longitude, received_at, speed_kph, gps_valid')
      .eq('device_id', trip.device_id)
      .gte('received_at', trip.started_at)
      .lte('received_at', trip.ended_at)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('received_at', { ascending: true })
      .limit(5000);

    if (locs && locs.length >= 2) {
      return NextResponse.json(
        locs.map((l) => ({
          lat: Number(l.latitude),
          lon: Number(l.longitude),
          occurred_at: l.received_at ?? undefined,
          speed_kph: l.speed_kph != null ? Number(l.speed_kph) : undefined,
          gps_valid: l.gps_valid ?? undefined,
        }))
      );
    }
  }

  return NextResponse.json(listWithSpeed);
}
