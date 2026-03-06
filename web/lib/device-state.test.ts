/**
 * Unit tests for computeDeviceState and computeViewDeviceState (PT60-L View Tracker states).
 * Run: npx ts-node -P tsconfig.test.json lib/device-state.test.ts
 */

import { computeDeviceState, computeViewDeviceState } from './device-state';

function lastSeenAgoSeconds(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

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

  console.log('computeDeviceState\n');

  // ONLINE: last_seen 120s ago, moving_interval=120 => online_threshold = max(180, 240) = 240
  const r1 = computeDeviceState({
    last_seen_at: lastSeenAgoSeconds(120),
    moving_interval_seconds: 120,
  });
  ok(r1.device_state === 'ONLINE', 'ONLINE: last_seen 120s, moving_interval 120s');
  ok(r1.offline_reason === null, 'ONLINE: offline_reason null');

  // SLEEPING: 2h ago, is_stopped true, heartbeat 720, grace 3600
  const twoHours = 2 * 60 * 60;
  const r2 = computeDeviceState({
    last_seen_at: lastSeenAgoSeconds(twoHours),
    heartbeat_minutes: 720,
    last_known_is_stopped: true,
    _config: { grace_seconds: 3600 },
  });
  ok(r2.device_state === 'SLEEPING', 'SLEEPING: 2h ago, is_stopped true, heartbeat 720');

  // SLEEPING when is_stopped unknown (null): within window => assume may be sleeping
  const r2b = computeDeviceState({
    last_seen_at: lastSeenAgoSeconds(twoHours),
    heartbeat_minutes: 720,
    _config: { grace_seconds: 3600 },
  });
  ok(r2b.device_state === 'SLEEPING', 'SLEEPING: 2h ago, is_stopped null (within 13h window)');

  // OFFLINE: 15h ago
  const fifteenHours = 15 * 60 * 60;
  const r3 = computeDeviceState({
    last_seen_at: lastSeenAgoSeconds(fifteenHours),
    heartbeat_minutes: 720,
    last_known_is_stopped: true,
    _config: { grace_seconds: 3600 },
  });
  ok(r3.device_state === 'OFFLINE', 'OFFLINE: 15h ago');
  ok(r3.offline_reason === 'OFFLINE_UNKNOWN', 'OFFLINE: reason UNKNOWN');

  // Edge: 2h ago but is_stopped false => OFFLINE
  const r4 = computeDeviceState({
    last_seen_at: lastSeenAgoSeconds(twoHours),
    heartbeat_minutes: 720,
    last_known_is_stopped: false,
    _config: { grace_seconds: 3600 },
  });
  ok(r4.device_state === 'OFFLINE', 'Edge: 2h ago, is_stopped false => OFFLINE');

  // OFFLINE_LOW_BATTERY when beyond window and battery <= 3.55
  const r5 = computeDeviceState({
    last_seen_at: lastSeenAgoSeconds(fifteenHours),
    heartbeat_minutes: 720,
    last_known_is_stopped: true,
    last_known_battery_voltage: 3.5,
    _config: { grace_seconds: 3600 },
  });
  ok(r5.device_state === 'OFFLINE' && r5.offline_reason === 'OFFLINE_LOW_BATTERY', 'OFFLINE_LOW_BATTERY when battery 3.5V');

  // last_seen_at null => OFFLINE
  const r6 = computeDeviceState({ last_seen_at: null });
  ok(r6.device_state === 'OFFLINE' && r6.last_seen_age_seconds === null, 'last_seen_at null => OFFLINE');

  console.log('\ncomputeViewDeviceState (View Tracker)\n');

  // LIVE: 60s ago, gps_fix true
  const v1 = computeViewDeviceState({
    last_seen_at: lastSeenAgoSeconds(60),
    gps_fix_last: true,
    _config: { grace_seconds: 3600, heartbeat_minutes: 720 },
  });
  ok(v1.view_state === 'LIVE', 'VIEW LIVE: 60s ago, gps_fix true');
  ok(v1.next_expected_checkin_at == null, 'LIVE: no next check-in');

  // INDOOR_NO_GPS: 60s ago, gps_fix false
  const v2 = computeViewDeviceState({
    last_seen_at: lastSeenAgoSeconds(60),
    gps_fix_last: false,
    _config: { grace_seconds: 3600, heartbeat_minutes: 720 },
  });
  ok(v2.view_state === 'INDOOR_NO_GPS', 'VIEW INDOOR_NO_GPS: 60s ago, gps_fix false');

  // SLEEPING: 2h ago, stopped, heartbeat 720 => view_state SLEEPING, next_expected_checkin_at set
  const v3 = computeViewDeviceState({
    last_seen_at: lastSeenAgoSeconds(twoHours),
    heartbeat_minutes: 720,
    last_known_is_stopped: true,
    gps_fix_last: true,
    _config: { grace_seconds: 3600 },
  });
  ok(v3.view_state === 'SLEEPING', 'VIEW SLEEPING: 2h ago, stopped');
  ok(v3.next_expected_checkin_at != null, 'SLEEPING: next_expected_checkin_at set');

  // OFFLINE: 15h ago
  const v4 = computeViewDeviceState({
    last_seen_at: lastSeenAgoSeconds(fifteenHours),
    heartbeat_minutes: 720,
    last_known_is_stopped: true,
    gps_fix_last: true,
    _config: { grace_seconds: 3600 },
  });
  ok(v4.view_state === 'OFFLINE', 'VIEW OFFLINE: 15h ago');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
}

run();
