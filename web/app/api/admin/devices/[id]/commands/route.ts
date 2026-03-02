import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { buildCommandText, TRACKER_COMMAND_PRESETS } from '@/lib/tracker-commands';
import { processCommandJob } from '@/lib/tracker-command-worker';

const setServerSchema = z.object({
  command_key: z.literal('set_server'),
  params: z.object({ host: z.string().min(1).max(253), port: z.number().int().min(1).max(65535) }),
});
const setIntervalSchema = z.object({
  command_key: z.literal('set_upload_interval'),
  params: z.object({ seconds: z.number().int().min(1).max(86400) }),
});
const setApnSchema = z.object({
  command_key: z.literal('set_apn'),
  params: z.object({
    apn: z.string().max(100),
    user: z.string().max(64).optional(),
    pw: z.string().max(64).optional(),
  }),
});
const diagnosticKeys = [
  'live_location',
  'work_status',
  'check_ip_port',
  'check_upload_interval',
  'check_apn',
] as const;
type Body =
  | z.infer<typeof setServerSchema>
  | z.infer<typeof setIntervalSchema>
  | z.infer<typeof setApnSchema>
  | { command_key: (typeof diagnosticKeys)[number]; params?: Record<string, string | number> };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  let body: Body;
  try {
    const raw = await request.json();
    if (raw.command_key === 'set_server') body = setServerSchema.parse(raw);
    else if (raw.command_key === 'set_upload_interval') body = setIntervalSchema.parse(raw);
    else if (raw.command_key === 'set_apn') body = setApnSchema.parse(raw);
    else body = z.object({
      command_key: z.enum(diagnosticKeys as unknown as [string, ...string[]]),
      params: z.record(z.union([z.string(), z.number()])).optional(),
    }).parse(raw) as Body;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.errors.map((x) => x.message).join('; ') : 'Invalid body' },
      { status: 400 }
    );
  }

  const preset = TRACKER_COMMAND_PRESETS[body.command_key];
  if (!preset) {
    return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
  }
  if (preset.adminOnly && guard.role !== 'staff_plus' && guard.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden: admin-only command' }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: device, error: devErr } = await admin
    .from('devices')
    .select('id, sim_phone')
    .eq('id', deviceId)
    .single();
  if (devErr || !device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }
  const simPhone = (device as { sim_phone?: string | null }).sim_phone?.trim() ?? '';
  const { data: tokenRow } = await admin
    .from('activation_tokens')
    .select('sim_iccid')
    .eq('device_id', deviceId)
    .not('sim_iccid', 'is', null)
    .limit(1)
    .maybeSingle();
  const simIccid = (tokenRow as { sim_iccid?: string } | null)?.sim_iccid?.trim() ?? null;
  const useSimbase = !!simIccid;
  if (!useSimbase && !simPhone) {
    return NextResponse.json(
      { error: 'Device has no SIM (no ICCID from activation token and no sim_phone). Configure SIM or use an activated device.' },
      { status: 400 }
    );
  }
  const targetPhone = simPhone || (useSimbase ? `Simbase:${simIccid}` : '');
  if (!targetPhone) {
    return NextResponse.json({ error: 'Device has no SIM phone or ICCID' }, { status: 400 });
  }

  const built = buildCommandText(body.command_key, body.params as Record<string, string | number> | undefined);
  if ('error' in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const { data: job, error: insertErr } = await admin
    .from('device_command_jobs')
    .insert({
      device_id: deviceId,
      user_id: guard.user.id,
      status: 'queued',
      command_name: built.command_name,
      command_text: built.command_text,
      target_phone: targetPhone,
      target_iccid: useSimbase ? simIccid : null,
      provider: useSimbase ? 'simbase' : 'smsportal',
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  processCommandJob(admin, job.id).catch(() => {});

  return NextResponse.json({ job });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { id: deviceId } = await params;
  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: device } = await admin.from('devices').select('id').eq('id', deviceId).single();
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 100);
  const { data: jobs, error } = await admin
    .from('device_command_jobs')
    .select('id, created_at, status, command_name, command_text, target_phone, target_iccid, provider, user_id, sent_at, replied_at, reply_raw, reply_parsed, error')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}
