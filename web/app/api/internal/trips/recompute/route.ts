import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { segmentTrips, isUsablePoint, getSegmentEndPointForPosition, type LocationPoint } from '@/lib/trip-detection';

const CRON_SECRET = process.env.CRON_SECRET ?? process.env.INTERNAL_TRIPS_SECRET ?? '';

function authInternal(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === CRON_SECRET) return true;
  if (request.headers.get('x-internal-secret') === CRON_SECRET) return true;
  return false;
}

/** GET ?deviceId=... – Diagnostics only (no inserts). Use same auth as POST. */
export async function GET(request: Request) {
  if (!CRON_SECRET || !authInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId) {
    return NextResponse.json({ error: 'deviceId required for diagnostics' }, { status: 400 });
  }
  const { data: device } = await supabase.from('devices').select('id, user_id').eq('id', deviceId).single();
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }
  const { data: state } = await supabase.from('trip_state').select('last_processed_at').eq('device_id', deviceId).maybeSingle();
  let originalLastProcessed = state?.last_processed_at ?? null;
  const nowIso = new Date().toISOString();
  if (originalLastProcessed && originalLastProcessed > nowIso) originalLastProcessed = null;
  const lookbackDays = 90;
  let since = originalLastProcessed ?? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  if (originalLastProcessed) {
    since = new Date(new Date(since).getTime() - 25 * 60 * 1000).toISOString();
  }
  const { count: locationsCount } = await supabase
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId)
    .gt('received_at', since);
  const { data: rows } = await supabase
    .from('locations')
    .select('id, gps_time, received_at, gps_valid, latitude, longitude, speed_kph, extra')
    .eq('device_id', deviceId)
    .gt('received_at', since)
    .order('received_at', { ascending: true })
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
  const pointsUsable = points.filter((p) => isUsablePoint(p)).length;
  const segments = segmentTrips(points);
  const { count: tripsCount } = await supabase
    .from('trips')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId);
  return NextResponse.json({
    device_id: deviceId,
    since,
    trip_state_last_processed_at: originalLastProcessed ?? null,
    locations_in_range: locationsCount ?? 0,
    points_fetched: points.length,
    points_usable: pointsUsable,
    segments_found: segments.length,
    existing_trips_count: tripsCount ?? 0,
    hint:
      points.length === 0
        ? `No locations in last ${lookbackDays} days (or since last_processed_at). Add location data or reset trip_state.`
        : segments.length === 0
          ? `Locations exist but no trips detected. Usable points: ${pointsUsable}/${points.length}. Min trip: 2 min, 400 m, 5 km/h avg.`
          : 'Segments found; run POST recompute to insert trips.',
  });
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

  const results: {
    device_id: string;
    trips_created: number;
    error?: string;
    points_fetched?: number;
    segments_found?: number;
    segments_new?: number;
    errors?: string[];
  }[] = [];

  for (const did of deviceIds) {
    try {
      const { data: device } = await supabase.from('devices').select('user_id').eq('id', did).single();
      if (!device?.user_id) {
        results.push({ device_id: did, trips_created: 0, error: 'no user' });
        continue;
      }

      const { data: state } = await supabase.from('trip_state').select('last_processed_at').eq('device_id', did).maybeSingle();
      let originalLastProcessed = state?.last_processed_at ?? null;
      const nowIso = new Date().toISOString();
      if (originalLastProcessed && originalLastProcessed > nowIso) {
        originalLastProcessed = null;
      }
      const lookbackDays = 90;
      let since = originalLastProcessed ?? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
      if (originalLastProcessed) {
        since = new Date(new Date(since).getTime() - 25 * 60 * 1000).toISOString();
      }

      const { data: rows } = await supabase
        .from('locations')
        .select('id, gps_time, received_at, gps_valid, latitude, longitude, speed_kph, extra')
        .eq('device_id', did)
        .gt('received_at', since)
        .order('received_at', { ascending: true })
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
      const segmentErrors: string[] = [];

      /** Same start within 2 minutes = same trip; we update existing instead of inserting a duplicate. */
      const START_MATCH_WINDOW_MS = 2 * 60 * 1000;

      for (const seg of segments) {
        if (originalLastProcessed && seg.endedAt <= originalLastProcessed) continue;
        const first = seg.points[0];
        const endPoint = getSegmentEndPointForPosition(seg, points);
        const startedAtMs = new Date(seg.startedAt).getTime();

        const { data: existing } = await supabase
          .from('trips')
          .select('id, ended_at, distance_meters')
          .eq('device_id', did)
          .gte('started_at', new Date(startedAtMs - START_MATCH_WINDOW_MS).toISOString())
          .lte('started_at', new Date(startedAtMs + START_MATCH_WINDOW_MS).toISOString())
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const existingEndedAt = existing?.ended_at ? new Date(existing.ended_at).getTime() : 0;
        const segEndedAt = new Date(seg.endedAt).getTime();
        const isLonger = segEndedAt > existingEndedAt || seg.distanceMeters > (existing?.distance_meters ?? 0);

        if (existing && isLonger) {
          const { error: updateErr } = await supabase
            .from('trips')
            .update({
              ended_at: seg.endedAt,
              duration_seconds: seg.durationSeconds,
              distance_meters: seg.distanceMeters,
              max_speed_kmh: seg.maxSpeedKmh,
              end_lat: endPoint.latitude,
              end_lon: endPoint.longitude,
              end_location_point_id: endPoint.id,
            })
            .eq('id', existing.id);
          if (updateErr) {
            segmentErrors.push(updateErr.message);
          } else {
            await supabase.from('trip_points').delete().eq('trip_id', existing.id);
            const tripPoints = seg.points.map((p) => ({
              trip_id: existing.id,
              device_id: did,
              point_id: p.id,
              occurred_at: p.received_at ?? p.gps_time,
              lat: p.latitude!,
              lon: p.longitude!,
            }));
            const chunk = 200;
            for (let i = 0; i < tripPoints.length; i += chunk) {
              const { error: ptsErr } = await supabase.from('trip_points').insert(tripPoints.slice(i, i + chunk));
              if (ptsErr) segmentErrors.push(`trip_points: ${ptsErr.message}`);
            }
            tripsCreated++;
          }
          const segEnd = seg.points[seg.points.length - 1];
          const endTs = segEnd.received_at ?? segEnd.gps_time;
          if (endTs > lastProcessedAt) lastProcessedAt = endTs;
          continue;
        }
        if (existing && !isLonger) {
          const segEnd = seg.points[seg.points.length - 1];
          const endTs = segEnd.received_at ?? segEnd.gps_time;
          if (endTs > lastProcessedAt) lastProcessedAt = endTs;
          continue;
        }

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
            end_lat: endPoint.latitude,
            end_lon: endPoint.longitude,
            start_location_point_id: first.id,
            end_location_point_id: endPoint.id,
          })
          .select('id')
          .single();

        if (tripErr || !trip) {
          segmentErrors.push(tripErr?.message ?? 'trip insert failed');
          const segEnd = seg.points[seg.points.length - 1];
          const endTs = segEnd.received_at ?? segEnd.gps_time;
          if (endTs > lastProcessedAt) lastProcessedAt = endTs;
          continue;
        }
        tripsCreated++;

        const tripPoints = seg.points.map((p) => ({
          trip_id: trip.id,
          device_id: did,
          point_id: p.id,
          occurred_at: p.received_at ?? p.gps_time,
          lat: p.latitude!,
          lon: p.longitude!,
        }));
        const chunk = 200;
        for (let i = 0; i < tripPoints.length; i += chunk) {
          const { error: ptsErr } = await supabase.from('trip_points').insert(tripPoints.slice(i, i + chunk));
          if (ptsErr) segmentErrors.push(`trip_points: ${ptsErr.message}`);
        }

        const segEnd = seg.points[seg.points.length - 1];
        const endTs = segEnd.received_at ?? segEnd.gps_time;
        if (endTs > lastProcessedAt) lastProcessedAt = endTs;
      }

      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        const ts = lastPoint.received_at ?? lastPoint.gps_time;
        if (ts > lastProcessedAt) lastProcessedAt = ts;
      }

      const nowIsoForState = new Date().toISOString();
      if (lastProcessedAt > nowIsoForState) lastProcessedAt = nowIsoForState;

      await supabase
        .from('trip_state')
        .upsert(
          { device_id: did, last_processed_at: lastProcessedAt, open_trip_id: null, updated_at: nowIsoForState },
          { onConflict: 'device_id' }
        );

      const segmentsAfterFilter = originalLastProcessed
        ? segments.filter((s) => s.endedAt > originalLastProcessed)
        : segments;
      results.push({
        device_id: did,
        points_fetched: points.length,
        segments_found: segments.length,
        segments_new: segmentsAfterFilter.length,
        trips_created: tripsCreated,
        ...(segmentErrors.length > 0 && { errors: segmentErrors }),
      });
    } catch (e) {
      results.push({ device_id: did, trips_created: 0, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
