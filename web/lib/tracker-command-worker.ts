/**
 * Process a single device command job: send SMS via Simbase (when ICCID present) or SMSPortal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSms } from '@/lib/smsportal';
import { sendSimbaseSms } from '@/lib/simbase';

const COMMAND_TIMEOUT_SEC = 120;
const MAX_SEND_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export type CommandJobRow = {
  id: string;
  status: string;
  command_text: string;
  target_phone: string;
  target_iccid?: string | null;
  provider?: string | null;
  sent_at: string | null;
};

/**
 * Send one queued job: set sending -> Simbase or SMSPortal -> set sent/failed.
 */
export async function processCommandJob(
  admin: SupabaseClient,
  jobId: string
): Promise<{ status: string; error?: string }> {
  const { data: job, error: fetchErr } = await admin
    .from('device_command_jobs')
    .select('id, status, command_text, target_phone, target_iccid, provider')
    .eq('id', jobId)
    .single();

  if (fetchErr || !job) {
    return { status: 'failed', error: fetchErr?.message ?? 'Job not found' };
  }
  if (job.status !== 'queued') {
    return { status: job.status };
  }

  await admin
    .from('device_command_jobs')
    .update({ status: 'sending' })
    .eq('id', jobId);

  const useSimbase = !!(job.target_iccid && String(job.target_iccid).trim());
  let ok = false;
  let error: string | undefined;
  let messageId: string | null = null;

  for (let attempt = 1; attempt <= MAX_SEND_RETRIES; attempt++) {
    if (useSimbase) {
      const result = await sendSimbaseSms(job.target_iccid!.trim(), job.command_text);
      ok = result.ok;
      error = result.error;
    } else {
      const result = await sendSms(job.target_phone, job.command_text);
      ok = result.ok;
      error = result.error;
      messageId = result.messageId ?? null;
    }
    if (ok) break;
    if (attempt < MAX_SEND_RETRIES) {
      const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (ok) {
    await admin
      .from('device_command_jobs')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider: useSimbase ? 'simbase' : job.provider ?? 'smsportal',
        provider_message_id: messageId,
        error: null,
      })
      .eq('id', jobId);
    return { status: 'sent' };
  }

  await admin
    .from('device_command_jobs')
    .update({
      status: 'failed',
      error: error ?? 'Send failed',
    })
    .eq('id', jobId);
  return { status: 'failed', error };
}

export function getTimeoutSeconds(): number {
  return COMMAND_TIMEOUT_SEC;
}

/**
 * If job is sent and sent_at is older than COMMAND_TIMEOUT_SEC, set status to timeout.
 */
export async function applyTimeoutIfNeeded(
  admin: SupabaseClient,
  job: CommandJobRow
): Promise<void> {
  if (job.status !== 'sent' || !job.sent_at) return;
  const sent = new Date(job.sent_at).getTime();
  if (Date.now() - sent < COMMAND_TIMEOUT_SEC * 1000) return;
  await admin
    .from('device_command_jobs')
    .update({ status: 'timeout' })
    .eq('id', job.id);
}

/**
 * Fetch Simbase MO (replies from SIM) for the device's ICCID and match to pending jobs.
 * Updates jobs with status replied, reply_raw, replied_at, reply_parsed.
 */
export async function syncSimbaseRepliesForDevice(
  admin: SupabaseClient,
  deviceId: string
): Promise<void> {
  const { listSimbaseSms } = await import('@/lib/simbase');
  const { parseReply } = await import('@/lib/tracker-command-replies');
  const { data: token } = await admin
    .from('activation_tokens')
    .select('sim_iccid')
    .eq('device_id', deviceId)
    .not('sim_iccid', 'is', null)
    .limit(1)
    .maybeSingle();
  const iccid = (token as { sim_iccid?: string } | null)?.sim_iccid?.trim();
  if (!iccid) return;
  const result = await listSimbaseSms(iccid, { direction: 'mo', limit: 50 });
  if (!result.sms.length) return;
  const { data: pendingJobs } = await admin
    .from('device_command_jobs')
    .select('id, command_name, sent_at')
    .eq('device_id', deviceId)
    .in('status', ['sent', 'sending'])
    .not('target_iccid', 'is', null)
    .order('sent_at', { ascending: false });
  if (!pendingJobs?.length) return;
  const windowStart = Date.now() - 10 * 60 * 1000;
  for (const sms of result.sms) {
    const ts = new Date(sms.timestamp).getTime();
    if (ts < windowStart) continue;
    const { data: alreadyUsed } = await admin
      .from('device_command_jobs')
      .select('id')
      .eq('device_id', deviceId)
      .eq('reply_raw', sms.message)
      .limit(1)
      .maybeSingle();
    if (alreadyUsed) continue;
    const job = pendingJobs.find((j) => j.sent_at && new Date(j.sent_at).getTime() <= ts);
    if (!job) continue;
    const reply_parsed = parseReply(sms.message, job.command_name);
    await admin
      .from('device_command_jobs')
      .update({
        status: 'replied',
        reply_raw: sms.message,
        replied_at: sms.timestamp,
        reply_parsed: reply_parsed ?? undefined,
      })
      .eq('id', job.id);
    pendingJobs.splice(pendingJobs.indexOf(job), 1);
    if (pendingJobs.length === 0) break;
  }
}
