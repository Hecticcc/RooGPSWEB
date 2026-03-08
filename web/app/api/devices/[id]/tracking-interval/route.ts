import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { processCommandJob } from '@/lib/tracker-command-worker';

/** Allowed GPS tracking intervals (seconds) for wired trackers. iStartek command 102. */
const ALLOWED_INTERVALS = [60, 300, 600, 1800, 3600] as const;

/**
 * POST /api/devices/[id]/tracking-interval
 * Body: { interval_seconds: number } — one of 60, 300, 600, 1800, 3600 (1 min, 5 min, 10 min, 30 min, 1 hr).
 * Sends SMS command to the tracker and returns when sent or failed.
 * Device must be owned by the current user and wired-capable (e.g. RG-WF1).
 */
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

  let body: { interval_seconds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const seconds = typeof body?.interval_seconds === 'number' ? body.interval_seconds : undefined;
  if (seconds == null || !ALLOWED_INTERVALS.includes(seconds as (typeof ALLOWED_INTERVALS)[number])) {
    return NextResponse.json(
      { error: 'interval_seconds must be one of: 60, 300, 600, 1800, 3600 (1 min, 5 min, 10 min, 30 min, 1 hr)' },
      { status: 400 }
    );
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

  if (devErr || !device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }
  if ((device as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const { data: deviceSim } = await admin
    .from('devices')
    .select('sim_phone, sim_iccid')
    .eq('id', deviceId)
    .single();
  const simPhone = (deviceSim as { sim_phone?: string | null } | null)?.sim_phone?.trim() ?? '';
  const deviceIccid = (deviceSim as { sim_iccid?: string | null } | null)?.sim_iccid?.trim() ?? null;
  const { data: tokenRow } = await admin
    .from('activation_tokens')
    .select('sim_iccid')
    .eq('device_id', deviceId)
    .not('sim_iccid', 'is', null)
    .limit(1)
    .maybeSingle();
  const tokenIccid = (tokenRow as { sim_iccid?: string } | null)?.sim_iccid?.trim() ?? null;
  const simIccid = deviceIccid ?? tokenIccid;
  const useSimbase = !!simIccid;
  const targetPhone = simPhone || (useSimbase ? `Simbase:${simIccid}` : '');
  if (!targetPhone) {
    return NextResponse.json(
      { error: 'Device has no SIM configured. Add a SIM (activation) or contact support.' },
      { status: 400 }
    );
  }

  const commandText = `0000,102,${seconds}`;
  const commandName = 'Set upload interval (102)';

  const { data: job, error: insertErr } = await admin
    .from('device_command_jobs')
    .insert({
      device_id: deviceId,
      user_id: user.id,
      status: 'queued',
      command_name: commandName,
      command_text: commandText,
      target_phone: targetPhone,
      target_iccid: useSimbase ? simIccid : null,
      provider: useSimbase ? 'simbase' : 'smsportal',
    })
    .select('id')
    .single();

  if (insertErr || !job) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'Failed to queue command' },
      { status: 500 }
    );
  }

  const result = await processCommandJob(admin, job.id);

  if (result.status === 'sent') {
    await admin.from('devices').update({ moving_interval_seconds: seconds }).eq('id', deviceId);
    return NextResponse.json({
      job_id: job.id,
      status: 'sent',
      interval_seconds: seconds,
      message: 'Updated Interval has been sent to the tracker. The new tracking interval will take effect shortly.',
    });
  }
  return NextResponse.json(
    {
      job_id: job.id,
      status: result.status,
      error: result.error ?? 'SMS could not be sent',
    },
    { status: 400 }
  );
}
