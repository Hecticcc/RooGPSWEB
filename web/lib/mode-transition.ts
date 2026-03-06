/**
 * Unified mode transition: Emergency ON and Normal OFF with staggered verification.
 * Both flows use the same SENDING -> VERIFYING -> CONFIRMED | PENDING_UNCONFIRMED | ERROR_*.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { processCommandJob } from './tracker-command-worker';
import {
  DEFAULT_NORMAL_PROFILE,
  DEFAULT_EMERGENCY_PROFILE,
  getEmergencyJobPayloads,
  getNormalJobPayloads,
  type NormalProfile,
  type EmergencyProfile,
} from './emergency-mode';
import type { Parsed808Config } from './tracker-command-replies';
import {
  VERIFY_OFFSETS_SEC,
  VERIFY_WINDOW_SEC,
  getNormalMovingIntervalSeconds,
  verifyCadenceEmergency,
  verifyCadenceNormal,
  computeIntervalsFromReceivedAt,
  shouldRunVerificationNow,
} from './mode-transition-verify';

export type DeviceMode = 'NORMAL' | 'EMERGENCY';
export type ModeTransitionStatus =
  | 'IDLE'
  | 'SENDING'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'PENDING_UNCONFIRMED'
  | 'ERROR_MISMATCH'
  | 'ERROR_SEND';

export {
  VERIFY_OFFSETS_SEC,
  VERIFY_WINDOW_SEC,
  getNormalMovingIntervalSeconds,
  verifyCadenceEmergency,
  verifyCadenceNormal,
  computeIntervalsFromReceivedAt,
  shouldRunVerificationNow,
};

export type TransitionResult = {
  ok: boolean;
  status: ModeTransitionStatus;
  error?: string;
  jobsCreated?: number;
};

export async function transitionDeviceMode(
  admin: SupabaseClient,
  deviceId: string,
  targetMode: DeviceMode,
  userId: string
): Promise<TransitionResult> {
  const { data: device, error: devErr } = await admin
    .from('devices')
    .select(
      'id, user_id, sim_phone, normal_profile, emergency_profile, desired_mode, mode_transition_status'
    )
    .eq('id', deviceId)
    .single();

  if (devErr || !device) {
    return { ok: false, status: 'ERROR_SEND', error: 'Device not found' };
  }
  if ((device as { user_id: string }).user_id !== userId) {
    return { ok: false, status: 'ERROR_SEND', error: 'Forbidden' };
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
    return { ok: false, status: 'ERROR_SEND', error: 'Device has no SIM. Configure SIM or activate the device first.' };
  }
  const targetPhone = simPhone || (useSimbase ? `Simbase:${simIccid}` : '');

  const normalProfile: NormalProfile =
    (device as { normal_profile?: NormalProfile | null }).normal_profile ?? DEFAULT_NORMAL_PROFILE;
  const emergencyProfile: EmergencyProfile =
    (device as { emergency_profile?: EmergencyProfile | null }).emergency_profile ?? DEFAULT_EMERGENCY_PROFILE;

  const payloads =
    targetMode === 'EMERGENCY'
      ? getEmergencyJobPayloads(emergencyProfile)
      : getNormalJobPayloads(normalProfile);

  await admin
    .from('devices')
    .update({
      desired_mode: targetMode,
      mode_transition_status: 'SENDING',
      mode_transition_started_at: null,
      mode_verify_deadline_at: null,
      mode_verify_attempt: 0,
      mode_verify_details: null,
      emergency_enabled: targetMode === 'EMERGENCY',
      emergency_status: targetMode === 'EMERGENCY' ? 'ENABLING' : 'DISABLING',
      emergency_last_error: null,
      ...(targetMode === 'EMERGENCY'
        ? {
            emergency_activated_at: new Date().toISOString(),
            emergency_activated_by: userId,
            emergency_profile: emergencyProfile,
          }
        : {}),
      ...(targetMode === 'NORMAL' ? { emergency_activated_at: null, emergency_activated_by: null } : {}),
    })
    .eq('id', deviceId);

  const jobs: { id: string }[] = [];
  for (const p of payloads) {
    const { data: job, error: insertErr } = await admin
      .from('device_command_jobs')
      .insert({
        device_id: deviceId,
        user_id: userId,
        status: 'queued',
        command_name: p.command_name,
        command_text: p.command_text,
        target_phone: targetPhone,
        target_iccid: useSimbase ? simIccid : null,
        provider: useSimbase ? 'simbase' : 'smsportal',
      })
      .select('id')
      .single();
    if (insertErr || !job) {
      await admin
        .from('devices')
        .update({
          mode_transition_status: 'ERROR_SEND',
          mode_verify_details: { error: insertErr?.message ?? 'Failed to create command job' },
          emergency_status: 'ERROR',
          emergency_last_error: insertErr?.message ?? 'Failed to create command job',
        })
        .eq('id', deviceId);
      return { ok: false, status: 'ERROR_SEND', error: insertErr?.message ?? 'Failed to create command job' };
    }
    jobs.push(job);
  }

  let lastError: string | null = null;
  for (const job of jobs) {
    const result = await processCommandJob(admin, job.id);
    if (result.status === 'failed' && result.error && !lastError) lastError = result.error;
  }

  if (lastError) {
    await admin
      .from('devices')
      .update({
        mode_transition_status: 'ERROR_SEND',
        mode_verify_details: { error: lastError },
        emergency_status: 'ERROR',
        emergency_last_error: lastError,
      })
      .eq('id', deviceId);
    return { ok: false, status: 'ERROR_SEND', error: lastError, jobsCreated: jobs.length };
  }

  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + VERIFY_WINDOW_SEC * 1000);
  await admin
    .from('devices')
    .update({
      mode_transition_status: 'VERIFYING',
      mode_transition_started_at: startedAt.toISOString(),
      mode_verify_deadline_at: deadlineAt.toISOString(),
      mode_verify_attempt: 0,
      mode_verify_details: null,
      emergency_status: targetMode === 'EMERGENCY' ? 'ON' : 'OFF',
    })
    .eq('id', deviceId);

  if (!(device as { normal_profile?: unknown }).normal_profile && targetMode === 'NORMAL') {
    await admin.from('devices').update({ normal_profile: normalProfile }).eq('id', deviceId);
  }
  if (targetMode === 'EMERGENCY') {
    await admin.from('devices').update({ normal_profile: normalProfile }).eq('id', deviceId);
  }

  return {
    ok: true,
    status: 'VERIFYING',
    jobsCreated: jobs.length,
  };
}

/** Compare config line (e.g. "102,120,,600") to expected (same format). Allow flexible match for optional fields. */
function configLinesMatch(actual: string, expected: string): boolean {
  const a = actual.trim().split(',');
  const e = expected.trim().split(',');
  if (a[0] !== e[0]) return false;
  for (let i = 1; i < Math.max(a.length, e.length); i++) {
    const av = a[i] ?? '';
    const ev = e[i] ?? '';
    if (ev === '' || av === ev) continue;
    if (av !== ev) return false;
  }
  return true;
}

/** Verify via query replies: compare latest 102/124/122 replies to expected profile. */
async function verifyByQueryReplies(
  admin: SupabaseClient,
  deviceId: string,
  targetMode: DeviceMode,
  expected102: string,
  expected124: string,
  expected122: string
): Promise<{ verified: boolean; mismatch?: { expected: unknown; actual: unknown } }> {
  const { data: jobs } = await admin
    .from('device_command_jobs')
    .select('id, command_name, reply_raw, reply_parsed, status')
    .eq('device_id', deviceId)
    .in('status', ['replied', 'sent'])
    .order('replied_at', { ascending: false })
    .limit(20);

  if (!jobs?.length) return { verified: false };

  const getConfig = (code: 102 | 124 | 122): string | null => {
    const nameContains = (n: string) => n.includes(String(code));
    const j = jobs.find((x) => nameContains((x as { command_name: string }).command_name));
    if (!j) return null;
    const parsed = (j as { reply_parsed?: Parsed808Config | null }).reply_parsed;
    if (parsed && typeof parsed === 'object' && 'config_line' in parsed) return (parsed as Parsed808Config).config_line;
    const raw = (j as { reply_raw?: string | null }).reply_raw;
    if (raw && new RegExp(`^${code},`).test(raw.trim())) return raw.trim();
    return null;
  };

  const actual102 = getConfig(102);
  const actual124 = getConfig(124);
  const actual122 = getConfig(122);

  const expected = [expected102, expected124, expected122];
  const actual = [actual102, actual124, actual122];
  for (let i = 0; i < 3; i++) {
    const exp = expected[i]!;
    const act = actual[i];
    if (act != null && !configLinesMatch(act, exp)) {
      return {
        verified: false,
        mismatch: { expected: { 102: expected102, 124: expected124, 122: expected122 }, actual: { 102: actual102, 124: actual124, 122: actual122 } },
      };
    }
  }
  if (actual102 != null && actual124 != null && actual122 != null) {
    return { verified: true };
  }
  return { verified: false };
}

export type VerifyResult = {
  status: ModeTransitionStatus;
  applied_mode?: 'NORMAL' | 'EMERGENCY' | 'UNKNOWN';
  details?: Record<string, unknown>;
};

export async function verifyDeviceMode(admin: SupabaseClient, deviceId: string): Promise<VerifyResult> {
  const { data: device, error: devErr } = await admin
    .from('devices')
    .select(
      'id, desired_mode, applied_mode, mode_transition_status, mode_transition_started_at, mode_verify_deadline_at, mode_verify_attempt, normal_profile, emergency_profile'
    )
    .eq('id', deviceId)
    .single();

  if (devErr || !device) {
    return { status: 'IDLE' };
  }

  const status = (device as { mode_transition_status?: ModeTransitionStatus }).mode_transition_status;
  if (status !== 'VERIFYING' && status !== 'PENDING_UNCONFIRMED') {
    return { status: status ?? 'IDLE' };
  }

  const desiredMode = (device as { desired_mode?: DeviceMode }).desired_mode ?? 'NORMAL';
  const normalProfile: NormalProfile =
    (device as { normal_profile?: NormalProfile | null }).normal_profile ?? DEFAULT_NORMAL_PROFILE;
  const emergencyProfile: EmergencyProfile =
    (device as { emergency_profile?: EmergencyProfile | null }).emergency_profile ?? DEFAULT_EMERGENCY_PROFILE;

  const expected102 =
    desiredMode === 'EMERGENCY' ? emergencyProfile.gprs_interval_command_102 : normalProfile.gprs_interval_command_102;
  const expected124 =
    desiredMode === 'EMERGENCY' ? emergencyProfile.sleep_command_124 : normalProfile.sleep_command_124;
  const expected122 =
    desiredMode === 'EMERGENCY' ? emergencyProfile.heartbeat_command_122 : normalProfile.heartbeat_command_122;

  const queryResult = await verifyByQueryReplies(
    admin,
    deviceId,
    desiredMode,
    expected102,
    expected124,
    expected122
  );
  if (queryResult.verified) {
    await admin
      .from('devices')
      .update({
        mode_transition_status: 'CONFIRMED',
        applied_mode: desiredMode,
        mode_transition_started_at: null,
        mode_verify_deadline_at: null,
        mode_verify_attempt: 0,
        mode_verify_details: { method: 'query_reply', at: new Date().toISOString() },
        emergency_enabled: desiredMode === 'EMERGENCY',
        emergency_status: desiredMode === 'EMERGENCY' ? 'ON' : 'OFF',
        emergency_last_error: null,
      })
      .eq('id', deviceId);
    return { status: 'CONFIRMED', applied_mode: desiredMode };
  }

  if (queryResult.mismatch && !queryResult.verified) {
    const deadline = (device as { mode_verify_deadline_at?: string | null }).mode_verify_deadline_at;
    const now = Date.now();
    if (deadline && now >= new Date(deadline).getTime()) {
      await admin
        .from('devices')
        .update({
          mode_transition_status: 'ERROR_MISMATCH',
          mode_verify_details: {
            method: 'query_reply',
            mismatch: queryResult.mismatch,
            at: new Date().toISOString(),
          },
        })
        .eq('id', deviceId);
      return { status: 'ERROR_MISMATCH', details: queryResult.mismatch };
    }
  }
  const { data: locations } = await admin
    .from('locations')
    .select('received_at, extra')
    .eq('device_id', deviceId)
    .order('received_at', { ascending: false })
    .limit(11);

  const receivedAts = (locations ?? []).map((r) => (r as { received_at: string }).received_at);
  const intervals = computeIntervalsFromReceivedAt(receivedAts);
  const lastExtra = (locations?.[0] as { extra?: { pt60_state?: { is_stopped?: boolean } } } | undefined)?.extra;
  const lastKnownStopped = lastExtra?.pt60_state?.is_stopped ?? null;
  const lastSeenAt = receivedAts[0] ? new Date(receivedAts[0]).getTime() : null;
  const lastSeenAgeSec = lastSeenAt != null ? (Date.now() - lastSeenAt) / 1000 : null;
  const heartbeatMin = 720;
  const graceSec = 3600;
  const heartbeatPlusGraceSec = heartbeatMin * 60 + graceSec;

  let cadenceVerified = false;
  if (desiredMode === 'EMERGENCY') {
    cadenceVerified = verifyCadenceEmergency(intervals);
  } else {
    const expectedMoving = getNormalMovingIntervalSeconds(normalProfile);
    cadenceVerified = verifyCadenceNormal(
      intervals,
      expectedMoving,
      lastSeenAgeSec,
      lastKnownStopped,
      heartbeatPlusGraceSec
    );
  }

  if (cadenceVerified) {
    await admin
      .from('devices')
      .update({
        mode_transition_status: 'CONFIRMED',
        applied_mode: desiredMode,
        mode_transition_started_at: null,
        mode_verify_deadline_at: null,
        mode_verify_attempt: 0,
        mode_verify_details: {
          method: 'cadence',
          intervals: intervals.slice(-5),
          last_seen_age_sec: lastSeenAgeSec,
          at: new Date().toISOString(),
        },
        emergency_enabled: desiredMode === 'EMERGENCY',
        emergency_status: desiredMode === 'EMERGENCY' ? 'ON' : 'OFF',
        emergency_last_error: null,
      })
      .eq('id', deviceId);
    return { status: 'CONFIRMED', applied_mode: desiredMode };
  }

  const startedAt = (device as { mode_transition_started_at?: string | null }).mode_transition_started_at;
  const deadlineAt = (device as { mode_verify_deadline_at?: string | null }).mode_verify_deadline_at;
  const attempt = (device as { mode_verify_attempt?: number }).mode_verify_attempt ?? 0;
  const now = Date.now();
  const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : 0;

  const details: Record<string, unknown> = {
    last_seen_at: receivedAts[0] ?? null,
    intervals: intervals.slice(-5),
    last_known_stopped: lastKnownStopped,
    last_seen_age_sec: lastSeenAgeSec,
    at: new Date().toISOString(),
  };

  if (now >= deadlineMs) {
    await admin
      .from('devices')
      .update({
        mode_transition_status: 'PENDING_UNCONFIRMED',
        mode_verify_details: {
          ...details,
          message:
            'Tracker may be asleep or out of coverage. Move vehicle slightly to wake and re-verify.',
        },
      })
      .eq('id', deviceId);
    return { status: 'PENDING_UNCONFIRMED', details };
  }

  const nextAttempt = attempt + 1;
  await admin
    .from('devices')
    .update({
      mode_verify_attempt: nextAttempt,
      mode_verify_details: details,
    })
    .eq('id', deviceId);

  return { status: 'VERIFYING', details };
}

export async function runScheduledVerifications(admin: SupabaseClient): Promise<number> {
  const { data: devices } = await admin
    .from('devices')
    .select('id, mode_transition_started_at, mode_verify_attempt')
    .eq('mode_transition_status', 'VERIFYING');

  let count = 0;
  for (const d of devices ?? []) {
    const started = (d as { mode_transition_started_at?: string | null }).mode_transition_started_at;
    const attempt = (d as { mode_verify_attempt?: number }).mode_verify_attempt ?? 0;
    if (shouldRunVerificationNow(started ?? null, attempt)) {
      await verifyDeviceMode(admin, (d as { id: string }).id);
      count++;
    }
  }
  return count;
}
