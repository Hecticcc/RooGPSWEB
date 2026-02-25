import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { validateTrackerName } from '@/lib/device-constants';

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
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  const ICON_VALUES = ['car', 'car_alt', 'caravan', 'trailer', 'truck', 'misc'] as const;
  let body: {
    name?: string | null;
    marker_color?: string | null;
    marker_icon?: string | null;
    watchdog_armed?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: {
    name?: string | null;
    marker_color?: string | null;
    marker_icon?: string | null;
    watchdog_armed?: boolean;
    watchdog_armed_at?: string | null;
    watchdog_ref_lat?: number | null;
    watchdog_ref_lng?: number | null;
  } = {};
  if (body.name !== undefined) {
    const nameVal = body.name === null || body.name === '' ? null : String(body.name).trim() || null;
    const nameValidation = validateTrackerName(nameVal ?? '');
    if (!nameValidation.valid) {
      return NextResponse.json({ error: nameValidation.error ?? 'Invalid name' }, { status: 400 });
    }
    updates.name = nameVal;
  }
  if (body.marker_color !== undefined) {
    const hex = typeof body.marker_color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(body.marker_color)
      ? body.marker_color
      : null;
    if (hex) updates.marker_color = hex;
  }
  if (body.marker_icon !== undefined) {
    const icon = typeof body.marker_icon === 'string' && (ICON_VALUES as readonly string[]).includes(body.marker_icon)
      ? body.marker_icon
      : null;
    if (icon) updates.marker_icon = icon;
  }
  if (body.watchdog_armed !== undefined) {
    const armed = body.watchdog_armed === true;
    updates.watchdog_armed = armed;
    if (armed) {
      updates.watchdog_armed_at = new Date().toISOString();
      const { data: latest } = await supabase
        .from('locations')
        .select('latitude, longitude')
        .eq('device_id', id)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.latitude != null && latest?.longitude != null) {
        updates.watchdog_ref_lat = latest.latitude;
        updates.watchdog_ref_lng = latest.longitude;
      } else {
        updates.watchdog_ref_lat = null;
        updates.watchdog_ref_lng = null;
      }
    } else {
      updates.watchdog_armed_at = null;
      updates.watchdog_ref_lat = null;
      updates.watchdog_ref_lng = null;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('devices')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, marker_color, marker_icon, watchdog_armed, watchdog_armed_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
