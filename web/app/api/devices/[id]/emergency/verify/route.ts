import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { verifyDeviceMode } from '@/lib/mode-transition';

/** POST: manually trigger mode verification (e.g. "Verify now" when VERIFYING or PENDING_UNCONFIRMED). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: device, error: devErr } = await admin
    .from('devices')
    .select('id, user_id')
    .eq('id', deviceId)
    .single();

  if (devErr || !device || (device as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const result = await verifyDeviceMode(admin, deviceId);

  const { data: updated } = await admin
    .from('devices')
    .select('id, desired_mode, applied_mode, mode_transition_status, mode_verify_attempt, mode_verify_deadline_at, mode_verify_details, emergency_enabled, emergency_status')
    .eq('id', deviceId)
    .single();

  return NextResponse.json({
    status: result.status,
    applied_mode: result.applied_mode ?? updated?.applied_mode,
    details: result.details,
    device: updated,
  });
}
