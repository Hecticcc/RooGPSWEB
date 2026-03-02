import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, createServiceRoleClient } from '@/lib/admin-auth';
import { applyTimeoutIfNeeded, syncSimbaseRepliesForDevice } from '@/lib/tracker-command-worker';
import { parseReply } from '@/lib/tracker-command-replies';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const guard = await requireRole(request, 'staff');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { jobId } = await params;
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: job, error } = await admin
    .from('device_command_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.target_iccid && (job.status === 'sent' || job.status === 'sending')) {
    await syncSimbaseRepliesForDevice(admin, job.device_id);
  }
  let current = job;
  const { data: afterSync } = await admin.from('device_command_jobs').select('*').eq('id', jobId).single();
  if (afterSync) current = afterSync;
  if (current.status === 'sent' && current.sent_at) {
    await applyTimeoutIfNeeded(admin, {
      id: current.id,
      status: current.status,
      command_text: current.command_text,
      target_phone: current.target_phone,
      sent_at: current.sent_at,
    });
  }
  const { data: fresh } = await admin.from('device_command_jobs').select('*').eq('id', jobId).single();
  return NextResponse.json({ job: fresh ?? current });
}

const patchSchema = z.object({ reply_raw: z.string().min(1) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const guard = await requireRole(request, 'staff_plus');
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status });
  }
  const { jobId } = await params;
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
  }

  let body: { reply_raw: string };
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body: reply_raw required' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }

  const { data: job, error: fetchErr } = await admin
    .from('device_command_jobs')
    .select('id, command_name, status')
    .eq('id', jobId)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const reply_parsed = parseReply(body.reply_raw, job.command_name);

  const { error: updateErr } = await admin
    .from('device_command_jobs')
    .update({
      status: 'manual_reply',
      reply_raw: body.reply_raw,
      replied_at: new Date().toISOString(),
      reply_parsed: reply_parsed ?? undefined,
    })
    .eq('id', jobId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { data: updated } = await admin.from('device_command_jobs').select('*').eq('id', jobId).single();
  return NextResponse.json({ job: updated });
}
