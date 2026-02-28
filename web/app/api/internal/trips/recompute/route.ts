import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { segmentTrips, type LocationPoint } from '@/lib/trip-detection';

const CRON_SECRET = process.env.CRON_SECRET ?? process.env.INTERNAL_TRIPS_SECRET ?? '';

function authInternal(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === CRON_SECRET) return true;
  if (request.headers.get('x-internal-secret') === CRON_SECRET) return true;
  return false;
}

export async function POST(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: 'Set CRON_SECRET or INTERNAL_TRIPS_SECRET for trip recompute' },
      { status: 503 }
    );
  }
  if (!authInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId') ?? undefined;

  const deviceIds: string[] = [];
  if (deviceId) {
    const { data: dev } = await supabase.from('devices').select('id').eq('id', deviceId).single();
    if (!dev) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    deviceIds.push(deviceId);
  } else {
    const { data: devs } = await supabase.from('devices').select('id');
    deviceIds.push(...(devs ?? []).map((d) => d.id));
  }

  const results: { device_id: string; trips_created: number; error?: string }[] = [];

  for (const did of deviceIds) {
    try {
      const { data: device } = await supabase.from('devices').select('user_id').eq('id', did).single();
      if (!device?.user_id) {
        results.push({ device_id: did, trips_created: 0, error: 'no user' });
        continue;
      }

      const { data: state } = await supabase.from('trip_state').select('last_processed_at').eq('device_id', did).maybeSingle();
      const originalLastProcessed = state?.last_processed_at ?? null;
      let since = originalLastProcessed ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      if (originalLastProcessed) {
        since = new Date(new Date(since).getTime() - 25 * 60 * 1000).toISOString();
      }

      const { data: rows } = await supabase
        .from('locations')
        .select('id, gps_time, received_at, gps_valid, latitude, longitude, speed_kph, extra')
        .eq('device_id', did)
        .gt('gps_time', since)
        .order('gps_time', { ascending: true })
        .limit(10000);

      const points: LocationPoint[] = (rows ?? []).map((r) => ({
        id: r.id,
        gps_time: r.gps_time,
        received_at: r.received_at,
        gps_valid: r.gps_valid,
        latitude: r.latitude,
        longitude: r.longitude,
        speed_kph: r.speed_kph,
        extra: (r.extra as Record<string, unknown>) ?? {},
      }));

      const segments = segmentTrips(points);
      let lastProcessedAt = originalLastProcessed ?? since;
      let tripsCreated = 0;

      for (const seg of segments) {
        if (originalLastProcessed && seg.endedAt <= originalLastProcessed) continue;
        const first = seg.points[0];
        const last = seg.points[seg.points.length - 1];
        const { data: trip, error: tripErr } = await supabase
          .from('trips')
          .insert({
            user_id: device.user_id,
            device_id: did,
            started_at: seg.startedAt,
            ended_at: seg.endedAt,
            duration_seconds: seg.durationSeconds,
            distance_meters: seg.distanceMeters,
            max_speed_kmh: seg.maxSpeedKmh,
            start_lat: first.latitude,
            start_lon: first.longitude,
            end_lat: last.latitude,
            end_lon: last.longitude,
            start_location_point_id: first.id,
            end_location_point_id: last.id,
          })
          .select('id')
          .single();

        if (tripErr || !trip) {
          results.push({ device_id: did, trips_created, error: tripErr?.message ?? 'trip insert failed' });
          break;
        }
        tripsCreated++;

        const tripPoints = seg.points.map((p) => ({
          trip_id: trip.id,
          device_id: did,
          point_id: p.id,
          occurred_at: p.gps_time ?? p.received_at,
          lat: p.latitude!,
          lon: p.longitude!,
        }));
        const chunk = 200;
        for (let i = 0; i < tripPoints.length; i += chunk) {
          await supabase.from('trip_points').insert(tripPoints.slice(i, i + chunk));
        }

        const segEnd = seg.points[seg.points.length - 1];
        const endTs = segEnd.gps_time ?? segEnd.received_at;
        if (endTs > lastProcessedAt) lastProcessedAt = endTs;
      }

      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        const ts = lastPoint.gps_time ?? lastPoint.received_at;
        if (ts > lastProcessedAt) lastProcessedAt = ts;
      }

      await supabase
        .from('trip_state')
        .upsert(
          { device_id: did, last_processed_at: lastProcessedAt, open_trip_id: null, updated_at: new Date().toISOString() },
          { onConflict: 'device_id' }
        );

      results.push({ device_id: did, trips_created });
    } catch (e) {
      results.push({ device_id: did, trips_created: 0, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
