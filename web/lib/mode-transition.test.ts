/**
 * Unit tests for mode transition: verification scheduler, cadence verifier, sleeping normal, mismatch.
 * Run: npx ts-node -P tsconfig.test.json lib/mode-transition.test.ts (or npm run test if configured)
 */

import {
  VERIFY_OFFSETS_SEC,
  VERIFY_WINDOW_SEC,
  shouldRunVerificationNow,
  verifyCadenceEmergency,
  verifyCadenceNormal,
  computeIntervalsFromReceivedAt,
  getNormalMovingIntervalSeconds,
} from './mode-transition-verify';
import { DEFAULT_NORMAL_PROFILE } from './emergency-mode';

function run() {
  let passed = 0;
  let failed = 0;
  function ok(cond: boolean, msg: string) {
    if (cond) {
      passed++;
      console.log('  OK:', msg);
    } else {
      failed++;
      console.error('  FAIL:', msg);
    }
  }

  console.log('Mode transition: scheduler offsets\n');
  ok(VERIFY_OFFSETS_SEC.length === 4, '4 verification checkpoints');
  ok(VERIFY_OFFSETS_SEC[0] === 30 && VERIFY_OFFSETS_SEC[1] === 60 && VERIFY_OFFSETS_SEC[2] === 120 && VERIFY_OFFSETS_SEC[3] === 300, 'Offsets 30, 60, 120, 300s');
  ok(VERIFY_WINDOW_SEC === 300, 'Verify window 300s');

  ok(!shouldRunVerificationNow(null, 0), 'shouldRunVerificationNow(null, 0) false');
  ok(!shouldRunVerificationNow('', -1), 'shouldRunVerificationNow(_, -1) false');
  const nowMs = Date.now();
  const started29sAgo = new Date(nowMs - 29 * 1000).toISOString();
  const started31sAgo = new Date(nowMs - 31 * 1000).toISOString();
  const started61sAgo = new Date(nowMs - 61 * 1000).toISOString();
  ok(!shouldRunVerificationNow(started29sAgo, 0), 'At +29s attempt 0: not yet');
  ok(shouldRunVerificationNow(started31sAgo, 0), 'At +31s attempt 0: run');
  ok(shouldRunVerificationNow(started61sAgo, 1), 'At +61s attempt 1: run');

  console.log('\nCadence: emergency\n');
  ok(!verifyCadenceEmergency([]), 'Emergency: empty intervals false');
  ok(!verifyCadenceEmergency([35]), 'Emergency: single interval false');
  ok(!verifyCadenceEmergency([35, 50]), 'Emergency: two intervals false');
  ok(verifyCadenceEmergency([35, 40, 45]), 'Emergency: 3 consecutive in [20,60] true');
  ok(verifyCadenceEmergency([10, 35, 40, 45]), 'Emergency: 3 consecutive in [20,60] (with one outside) true');
  ok(!verifyCadenceEmergency([90, 100, 110]), 'Emergency: 3 consecutive outside [20,60] false');
  ok(verifyCadenceEmergency([30, 35, 40, 42]), 'Emergency: avg last 4 <= 45 true');
  ok(!verifyCadenceEmergency([70, 70, 70, 70]), 'Emergency: avg 70 > 45 and outside [20,60] false');

  console.log('\nCadence: normal (moving + sleeping)\n');
  const expectedMoving = getNormalMovingIntervalSeconds(DEFAULT_NORMAL_PROFILE);
  ok(expectedMoving === 120, 'Normal moving interval 120s');
  const heartbeatPlusGrace = 720 * 60 + 3600;
  ok(verifyCadenceNormal([100, 120, 130], 120, null, null, heartbeatPlusGrace), 'Normal: avg in [84,192] true');
  ok(!verifyCadenceNormal([30, 40, 50], 120, null, null, heartbeatPlusGrace), 'Normal: avg too low false');
  ok(verifyCadenceNormal([], 120, 3600, true, heartbeatPlusGrace), 'Normal: no intervals, stopped, within heartbeat+grace (sleeping) true');
  ok(verifyCadenceNormal([], 120, 3600, null, heartbeatPlusGrace), 'Normal: no intervals, stopped unknown, within window true');
  ok(!verifyCadenceNormal([], 120, heartbeatPlusGrace + 100, false, heartbeatPlusGrace), 'Normal: no intervals, moving, past window false');

  console.log('\nIntervals from received_at\n');
  const received = [
    '2025-01-01T12:00:00Z',
    '2025-01-01T12:00:30Z',
    '2025-01-01T12:01:00Z',
    '2025-01-01T12:01:35Z',
  ];
  const intervals = computeIntervalsFromReceivedAt(received);
  ok(intervals.length === 3, '3 intervals from 4 timestamps');
  ok(Math.abs(intervals[0]! - 30) < 1 && Math.abs(intervals[1]! - 30) < 1 && Math.abs(intervals[2]! - 35) < 1, 'Intervals ~30, 30, 35s');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run();
