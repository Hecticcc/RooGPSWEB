/**
 * Pure verification helpers for mode transition (no Supabase/worker deps).
 * Used by mode-transition.ts and by unit tests.
 */

export const VERIFY_OFFSETS_SEC = [30, 60, 120, 300] as const;
export const VERIFY_WINDOW_SEC = 300;

export type NormalProfileLike = { gprs_interval_command_102: string };

/** Normal moving interval from profile 102 (first number). Default 120s. */
export function getNormalMovingIntervalSeconds(profile: NormalProfileLike): number {
  const m = profile.gprs_interval_command_102.match(/^102,(\d+)/);
  return m ? parseInt(m[1]!, 10) : 120;
}

/** Cadence verification: Emergency = 30s cadence; need 3 consecutive intervals in [20,60]s or avg last 4 <= 45s. */
export function verifyCadenceEmergency(intervalsSec: number[]): boolean {
  if (intervalsSec.length < 3) return false;
  for (let i = 0; i <= intervalsSec.length - 3; i++) {
    const a = intervalsSec[i]!;
    const b = intervalsSec[i + 1]!;
    const c = intervalsSec[i + 2]!;
    if (a >= 20 && a <= 60 && b >= 20 && b <= 60 && c >= 20 && c <= 60) return true;
  }
  if (intervalsSec.length >= 4) {
    const last4 = intervalsSec.slice(-4);
    const avg = last4.reduce((s, x) => s + x, 0) / last4.length;
    if (avg <= 45) return true;
  }
  return false;
}

/** Cadence verification: Normal = moving interval in [0.7x, 1.6x] of expected, or sleeping (no fail). */
export function verifyCadenceNormal(
  intervalsSec: number[],
  expectedMovingSec: number,
  lastSeenAgeSec: number | null,
  lastKnownStopped: boolean | null,
  heartbeatPlusGraceSec: number
): boolean {
  if (intervalsSec.length === 0) {
    if (lastKnownStopped !== false && lastSeenAgeSec != null && lastSeenAgeSec <= heartbeatPlusGraceSec) return true;
    return false;
  }
  const avg = intervalsSec.reduce((s, x) => s + x, 0) / intervalsSec.length;
  const low = expectedMovingSec * 0.7;
  const high = expectedMovingSec * 1.6;
  if (avg >= low && avg <= high) return true;
  if (lastKnownStopped !== false && lastSeenAgeSec != null && lastSeenAgeSec <= heartbeatPlusGraceSec) return true;
  return false;
}

/** Compute intervals (seconds) between consecutive received_at, newest first then reversed for chronological order. */
export function computeIntervalsFromReceivedAt(receivedAts: string[]): number[] {
  if (receivedAts.length < 2) return [];
  const sorted = [...receivedAts].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const sec = (new Date(sorted[i]!).getTime() - new Date(sorted[i - 1]!).getTime()) / 1000;
    if (sec > 0 && sec < 3600) out.push(sec);
  }
  return out;
}

/** Return true if we should run verification for this device at this time (at a checkpoint). */
export function shouldRunVerificationNow(startedAt: string | null, attempt: number): boolean {
  if (!startedAt || attempt < 0 || attempt >= VERIFY_OFFSETS_SEC.length) return false;
  const start = new Date(startedAt).getTime();
  const offsetMs = VERIFY_OFFSETS_SEC[attempt]! * 1000;
  return Date.now() >= start + offsetMs;
}
