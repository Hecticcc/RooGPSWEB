import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '2000', 10) || 2000, 2000);
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
  let q = supabase
    .from('locations')
    .select('id, latitude, longitude, gps_time, received_at, gps_valid, speed_kph, course_deg, event_code')
    .eq('device_id', id)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (from) q = q.gte('received_at', from);
  if (to) q = q.lte('received_at', to);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ordered = (data ?? []).slice().sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  return NextResponse.json(ordered);
}
