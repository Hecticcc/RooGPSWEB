/**
 * Unit tests for Night Guard: window, valid fix, arm, movement trigger, cooldown.
 * Run from ingest: npx ts-node src/night-guard/night-guard.test.ts
 */
import { isWithinWindow, parseTimeLocal } from './window';
import { getPacketGps, isValidFix, evaluatePacket } from './evaluate';
import { haversineMeters } from './haversine';
import { setRule, getRule } from './rule-cache';
import type { ParsedLocation } from '../parser';
import type { NightGuardRule } from './types';

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// --- Window ---
const start21 = parseTimeLocal('21:00');
const end06 = parseTimeLocal('06:00');
ok(start21 === 21 * 60, '21:00 = 1260 min');
ok(end06 === 6 * 60, '06:00 = 360 min');

ok(isWithinWindow(21 * 60, start21, end06), '21:00 inside overnight window');
ok(isWithinWindow(0, start21, end06), '00:00 inside overnight window');
ok(isWithinWindow(5 * 60, start21, end06), '05:00 inside overnight window');
ok(!isWithinWindow(6 * 60, start21, end06), '06:00 outside overnight window');
ok(!isWithinWindow(12 * 60, start21, end06), '12:00 outside overnight window');
ok(!isWithinWindow(20 * 60, start21, end06), '20:00 outside overnight window');

const start09 = parseTimeLocal('09:00');
const end17 = parseTimeLocal('17:00');
ok(isWithinWindow(12 * 60, start09, end17), '12:00 inside same-day window');
ok(!isWithinWindow(8 * 60, start09, end17), '08:00 outside');
ok(!isWithinWindow(17 * 60, start09, end17), '17:00 outside');

// --- Valid fix ---
function parsed(overrides: Partial<ParsedLocation>): ParsedLocation {
  return {
    device_id: '123',
    gps_time: null,
    gps_valid: null,
    latitude: null,
    longitude: null,
    speed_kph: null,
    course_deg: null,
    event_code: null,
    raw_payload: '',
    extra: {},
    ...overrides,
  };
}

const validFixPayload = { extra: { signal: { gps: { fix_flag: 'A' as const, sats: 4, hdop: 2, speed_kmh: 0 } } }, latitude: -37.8, longitude: 144.9 };
let gps = getPacketGps(parsed(validFixPayload));
ok(isValidFix(gps), 'Valid fix: A, sats 4, hdop 2');

gps = getPacketGps(parsed({ ...validFixPayload, extra: { signal: { gps: { fix_flag: 'V', sats: 4, hdop: 2, speed_kmh: 0 } } } }));
ok(!isValidFix(gps), 'Invalid fix: V');

gps = getPacketGps(parsed({ ...validFixPayload, extra: { signal: { gps: { fix_flag: 'A', sats: 2, hdop: 2, speed_kmh: 0 } } } }));
ok(!isValidFix(gps), 'Invalid fix: sats < 3');

gps = getPacketGps(parsed({ ...validFixPayload, extra: { signal: { gps: { fix_flag: 'A', sats: 4, hdop: 8, speed_kmh: 0 } } } }));
ok(!isValidFix(gps), 'Invalid fix: hdop > 6');

gps = getPacketGps(parsed({ device_id: '123', latitude: null, longitude: null, gps_valid: false }));
ok(!isValidFix(gps), 'Invalid fix: null lat/lon');

// --- Haversine ---
const d = haversineMeters(-37.8, 144.9, -37.801, 144.9);
ok(d > 100 && d < 150, 'Haversine ~111 m for ~0.001 deg lat');

// --- Evaluate with mock Supabase (arm only on valid fix; movement twice triggers; cooldown) ---
async function runEvalTests() {
  const deviceId = 'test-device-ng';
  const userId = '00000000-0000-0000-0000-000000000001';

  const mockInsert: { table: string; row: Record<string, unknown> }[] = [];
  const mockUpdate: { table: string; eq: Record<string, string>; set: Record<string, unknown> }[] = [];

  const mockSupabase = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(row) ? row : [row];
        rows.forEach((r) => mockInsert.push({ table, row: r }));
        return Promise.resolve({ error: null });
      },
      update: (set: Record<string, unknown>) => ({
        eq: (col: string, val: string) => {
          mockUpdate.push({ table, eq: { [col]: val }, set });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;

  function makeRule(overrides: Partial<NightGuardRule> = {}): NightGuardRule {
    return {
      id: 'rule-id',
      user_id: userId,
      device_id: deviceId,
      enabled: true,
      timezone: 'Australia/Melbourne',
      start_time_local: '21:00',
      end_time_local: '06:00',
      radius_m: 200,
      armed_center_lat: null,
      armed_center_lon: null,
      armed_at: null,
      last_alert_at: null,
      cooldown_minutes: 10,
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  function clearMocks() {
    mockInsert.length = 0;
    mockUpdate.length = 0;
  }

  setRule(deviceId, makeRule({ armed_center_lat: null, armed_center_lon: null }));

  await evaluatePacket(mockSupabase, parsed({
    device_id: deviceId,
    latitude: -37.8,
    longitude: 144.9,
    extra: { signal: { gps: { fix_flag: 'A', sats: 4, hdop: 2, speed_kmh: 0 } } },
  }));

  ok(getRule(deviceId) != null, 'Rule still in cache after eval');

  clearMocks();
  setRule(deviceId, makeRule({
    armed_center_lat: -37.8,
    armed_center_lon: 144.9,
    armed_at: new Date().toISOString(),
  }));

  await evaluatePacket(mockSupabase, parsed({
    device_id: deviceId,
    latitude: -37.803,
    longitude: 144.9,
    speed_kph: 2,
    extra: { signal: { gps: { fix_flag: 'A', sats: 4, hdop: 2, speed_kmh: 2 } } },
  }));

  const alertsAfterOne = mockInsert.filter((x) => x.table === 'device_alert_events');
  ok(alertsAfterOne.length === 0, 'Movement outside once does not trigger');

  await evaluatePacket(mockSupabase, parsed({
    device_id: deviceId,
    latitude: -37.804,
    longitude: 144.9,
    speed_kph: 2,
    extra: { signal: { gps: { fix_flag: 'A', sats: 4, hdop: 2, speed_kmh: 2 } } },
  }));

  const alertsAfterTwo = mockInsert.filter((x) => x.table === 'device_alert_events');
  ok(alertsAfterTwo.length >= 1, 'Movement outside twice triggers');

  clearMocks();
  const ruleWithCooldown = getRule(deviceId)!;
  ok(ruleWithCooldown.last_alert_at != null, 'Rule has last_alert_at after trigger');

  await evaluatePacket(mockSupabase, parsed({
    device_id: deviceId,
    latitude: -37.805,
    longitude: 144.9,
    speed_kph: 2,
    extra: { signal: { gps: { fix_flag: 'A', sats: 4, hdop: 2, speed_kmh: 2 } } },
  }));

  const alertsAfterCooldown = mockInsert.filter((x) => x.table === 'device_alert_events');
  ok(alertsAfterCooldown.length === 0, 'Cooldown blocks second alert');

  clearMocks();
  setRule(deviceId, makeRule({ armed_center_lat: null, armed_center_lon: null }));
  await evaluatePacket(mockSupabase, parsed({
    device_id: deviceId,
    latitude: -37.8,
    longitude: 144.9,
    extra: { signal: { gps: { fix_flag: 'V', sats: 2, hdop: 8, speed_kmh: 0 } } },
  }));

  const updatesForInvalidFix = mockUpdate.filter((x) => x.table === 'night_guard_rules');
  ok(updatesForInvalidFix.length === 0, 'Invalid fix does not arm');
}

async function main() {
  await runEvalTests();
  console.log('Night Guard tests OK');
  process.exit(0);
}
main();
