import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** GET: return Night Guard rule for this device (owned by user). */
export async function GET(
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
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
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

  const { data: rule, error } = await supabase
    .from('night_guard_rules')
    .select('enabled, start_time_local, end_time_local, radius_m, timezone, home_lat, home_lon')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rule) {
    return NextResponse.json({ enabled: false, start_time_local: '21:00', end_time_local: '06:00', radius_m: 50, timezone: 'Australia/Melbourne', home_lat: null, home_lon: null });
  }
  return NextResponse.json(rule);
}

const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

function normalizeTime(s: string): string | null {
  const trimmed = String(s).trim();
  if (!TIME_RE.test(trimmed)) return null;
  const [h, m] = trimmed.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** PATCH: set Night Guard enabled and/or time window (upsert rule with defaults if missing). */
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
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
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

  const RADIUS_MIN = 25;
  const RADIUS_MAX = 100;
  let body: { enabled?: boolean; start_time_local?: string; end_time_local?: string; timezone?: string; radius_m?: number; home_lat?: number | null; home_lon?: number | null } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.enabled === undefined && body.start_time_local === undefined && body.end_time_local === undefined && body.timezone === undefined && body.radius_m === undefined && body.home_lat === undefined && body.home_lon === undefined) {
    return NextResponse.json({ error: 'At least one of enabled, start_time_local, end_time_local, timezone, radius_m, home_lat, home_lon is required' }, { status: 400 });
  }

  const updates: { enabled?: boolean; start_time_local?: string; end_time_local?: string; timezone?: string; radius_m?: number; home_lat?: number | null; home_lon?: number | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (body.enabled !== undefined) updates.enabled = body.enabled === true;
  if (body.start_time_local !== undefined) {
    const t = normalizeTime(body.start_time_local);
    if (!t) return NextResponse.json({ error: 'Invalid start_time_local; use HH:MM (24h)' }, { status: 400 });
    updates.start_time_local = t;
  }
  if (body.end_time_local !== undefined) {
    const t = normalizeTime(body.end_time_local);
    if (!t) return NextResponse.json({ error: 'Invalid end_time_local; use HH:MM (24h)' }, { status: 400 });
    updates.end_time_local = t;
  }
  if (body.timezone !== undefined) {
    const tz = typeof body.timezone === 'string' && body.timezone.trim().length > 0 ? body.timezone.trim() : null;
    if (!tz) return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    updates.timezone = tz;
  }
  if (body.radius_m !== undefined) {
    const r = Number(body.radius_m);
    if (!Number.isInteger(r) || r < RADIUS_MIN || r > RADIUS_MAX) {
      return NextResponse.json({ error: `Invalid radius_m; use an integer between ${RADIUS_MIN} and ${RADIUS_MAX}` }, { status: 400 });
    }
    updates.radius_m = r;
  }
  if (body.home_lat !== undefined || body.home_lon !== undefined) {
    const lat = body.home_lat === null || body.home_lat === undefined ? null : Number(body.home_lat);
    const lon = body.home_lon === null || body.home_lon === undefined ? null : Number(body.home_lon);
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      return NextResponse.json({ error: 'Invalid home_lat' }, { status: 400 });
    }
    if (lon !== null && (Number.isNaN(lon) || lon < -180 || lon > 180)) {
      return NextResponse.json({ error: 'Invalid home_lon' }, { status: 400 });
    }
    if ((lat === null) !== (lon === null)) {
      return NextResponse.json({ error: 'Provide both home_lat and home_lon, or both null' }, { status: 400 });
    }
    updates.home_lat = lat;
    updates.home_lon = lon;
  }

  const { data: existing } = await supabase
    .from('night_guard_rules')
    .select('id, enabled, start_time_local, end_time_local, timezone, radius_m, home_lat, home_lon')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (existing) {
    const merged = {
      ...existing,
      ...updates,
    };
    const { data: updated, error } = await supabase
      .from('night_guard_rules')
      .update({
        enabled: merged.enabled,
        start_time_local: merged.start_time_local,
        end_time_local: merged.end_time_local,
        timezone: merged.timezone,
        radius_m: merged.radius_m ?? 50,
        home_lat: merged.home_lat ?? null,
        home_lon: merged.home_lon ?? null,
        updated_at: merged.updated_at,
      })
      .eq('device_id', deviceId)
      .select('enabled, start_time_local, end_time_local, timezone, radius_m, home_lat, home_lon')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(updated);
  }

  const { data: inserted, error } = await supabase
    .from('night_guard_rules')
    .insert({
      user_id: user.id,
      device_id: deviceId,
      enabled: updates.enabled ?? false,
      timezone: updates.timezone ?? 'Australia/Melbourne',
      start_time_local: updates.start_time_local ?? '21:00',
      end_time_local: updates.end_time_local ?? '06:00',
      radius_m: updates.radius_m ?? 50,
      home_lat: updates.home_lat ?? null,
      home_lon: updates.home_lon ?? null,
    })
    .select('enabled, start_time_local, end_time_local, timezone, radius_m, home_lat, home_lon')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(inserted);
}
