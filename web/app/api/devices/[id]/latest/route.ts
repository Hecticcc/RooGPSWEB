import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: device } = await supabase.from('devices').select('id').eq('id', id).eq('user_id', user.id).single();
  if (!device) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { data, error } = await supabase
    .from('locations')
    .select('latitude, longitude, gps_time, received_at, gps_valid, speed_kph, course_deg, event_code, extra')
    .eq('device_id', id)
    .order('received_at', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(null);
  }
  const extra = (data.extra as { battery?: { percent?: number; voltage_v?: number } } | null) ?? null;
  const { extra: _e, ...rest } = data;
  return NextResponse.json({
    ...rest,
    battery_percent: extra?.battery?.percent ?? null,
    battery_voltage_v: extra?.battery?.voltage_v ?? null,
  });
}
