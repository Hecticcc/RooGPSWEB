import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** GET current emergency state for the device (owner only). */
export async function GET(
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

  const { data: device, error } = await supabase
    .from('devices')
    .select(
      'id, emergency_enabled, emergency_status, emergency_activated_at, emergency_last_error, desired_mode, applied_mode, mode_transition_status, mode_transition_started_at, mode_verify_deadline_at, mode_verify_attempt, mode_verify_details'
    )
    .eq('id', deviceId)
    .eq('user_id', user.id)
    .single();

  if (error || !device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const d = device as {
    emergency_enabled?: boolean;
    emergency_status?: string;
    emergency_activated_at?: string | null;
    emergency_last_error?: string | null;
    desired_mode?: string | null;
    applied_mode?: string | null;
    mode_transition_status?: string | null;
    mode_transition_started_at?: string | null;
    mode_verify_deadline_at?: string | null;
    mode_verify_attempt?: number | null;
    mode_verify_details?: Record<string, unknown> | null;
  };

  return NextResponse.json({
    emergency_enabled: d.emergency_enabled ?? false,
    emergency_status: d.emergency_status ?? 'OFF',
    emergency_activated_at: d.emergency_activated_at ?? null,
    emergency_last_error: d.emergency_last_error ?? null,
    desired_mode: d.desired_mode ?? 'NORMAL',
    applied_mode: d.applied_mode ?? 'UNKNOWN',
    mode_transition_status: d.mode_transition_status ?? 'IDLE',
    mode_transition_started_at: d.mode_transition_started_at ?? null,
    mode_verify_deadline_at: d.mode_verify_deadline_at ?? null,
    mode_verify_attempt: d.mode_verify_attempt ?? 0,
    mode_verify_details: d.mode_verify_details ?? null,
  });
}
