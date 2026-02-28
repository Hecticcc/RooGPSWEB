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

  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, device_id, user_id, started_at, ended_at, duration_seconds, distance_meters, max_speed_kmh, start_lat, start_lon, end_lat, end_lon, start_location_point_id, end_location_point_id')
    .eq('id', tripId)
    .single();

  if (error || !trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (trip.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(trip);
}
