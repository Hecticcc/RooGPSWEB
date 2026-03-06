import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { transitionDeviceMode } from '@/lib/mode-transition';

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

  const { data: device } = await admin
    .from('devices')
    .select('id, user_id, desired_mode, mode_transition_status')
    .eq('id', deviceId)
    .single();

  if (!device || (device as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const desired = (device as { desired_mode?: string }).desired_mode;
  const status = (device as { mode_transition_status?: string }).mode_transition_status;
  if (desired === 'EMERGENCY' && (status === 'CONFIRMED' || status === 'VERIFYING' || status === 'SENDING')) {
    const { data: updated } = await admin
      .from('devices')
      .select('id, emergency_enabled, emergency_status, desired_mode, applied_mode, mode_transition_status, mode_verify_attempt, mode_verify_deadline_at')
      .eq('id', deviceId)
      .single();
    return NextResponse.json({ message: 'Emergency Mode already on or in progress', device: updated });
  }

  const result = await transitionDeviceMode(admin, deviceId, 'EMERGENCY', user.id);

  const { data: updated } = await admin
    .from('devices')
    .select('id, emergency_enabled, emergency_status, emergency_activated_at, emergency_last_error, desired_mode, applied_mode, mode_transition_status, mode_transition_started_at, mode_verify_deadline_at, mode_verify_attempt')
    .eq('id', deviceId)
    .single();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to enable Emergency Mode', device: updated, status: result.status },
      { status: 400 }
    );
  }

  return NextResponse.json({
    device: updated,
    jobs: result.jobsCreated ?? 0,
    status: result.status,
    error: result.error,
  });
}
