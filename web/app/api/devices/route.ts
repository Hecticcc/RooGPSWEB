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
  const { data: devices, error: devErr } = await supabase
    .from('devices')
    .select('id, name, created_at, last_seen_at, marker_color, marker_icon, watchdog_armed, watchdog_armed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (devErr) {
    return NextResponse.json({ error: devErr.message }, { status: 500 });
  }
  if (!devices?.length) {
    return NextResponse.json([]);
  }
  const deviceIds = devices.map((d) => d.id);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: connectionErrors } = await supabase
    .from('device_connection_errors')
    .select('device_id, error_message, created_at')
    .in('device_id', deviceIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  const latestErrorByDevice: Record<string, { error_message: string; created_at: string }> = {};
  for (const row of connectionErrors ?? []) {
    if (!latestErrorByDevice[row.device_id]) {
      latestErrorByDevice[row.device_id] = { error_message: row.error_message, created_at: row.created_at };
    }
  }
  const withLocation = await Promise.all(
    devices.map(async (d) => {
      const { data: loc } = await supabase
        .from('locations')
        .select('latitude, longitude, extra')
        .eq('device_id', d.id)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const extra = (loc?.extra as { battery?: { percent?: number; voltage_v?: number } } | null) ?? null;
      const connError = latestErrorByDevice[d.id] ?? null;
      return {
        ...d,
        latest_lat: loc?.latitude ?? null,
        latest_lng: loc?.longitude ?? null,
        latest_battery_percent: extra?.battery?.percent ?? null,
        latest_battery_voltage_v: extra?.battery?.voltage_v ?? null,
        marker_color: d.marker_color ?? '#f97316',
        connection_error: connError,
      };
    })
  );
  return NextResponse.json(withLocation);
}
