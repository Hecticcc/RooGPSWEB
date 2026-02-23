import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: devices, error: devErr } = await supabase
    .from('devices')
    .select('id, name, created_at, last_seen_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (devErr) {
    return NextResponse.json({ error: devErr.message }, { status: 500 });
  }
  if (!devices?.length) {
    return NextResponse.json([]);
  }
  const withLocation = await Promise.all(
    devices.map(async (d) => {
      const { data: loc } = await supabase
        .from('locations')
        .select('latitude, longitude')
        .eq('device_id', d.id)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        ...d,
        latest_lat: loc?.latitude ?? null,
        latest_lng: loc?.longitude ?? null,
      };
    })
  );
  return NextResponse.json(withLocation);
}
