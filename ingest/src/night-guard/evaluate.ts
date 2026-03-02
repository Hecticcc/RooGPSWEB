import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import { haversineMeters } from './haversine';
import { isWithinWindow, parseTimeLocal } from './window';
import { getRule, setRule } from './rule-cache';
import type { NightGuardRule } from './types';
import type { ParsedLocation } from '../parser';

const GPS_GLITCH_JUMP_M = 3000;
const MIN_SPEED_KMH_TRIGGER = 5;
const CONSECUTIVE_REQUIRED = 2;

/** In-memory state per device (single ingest instance). Multi-instance would use night_guard_state table. */
const inMemoryState = new Map<
  string,
  { consecutive_outside_count: number; last_outside_at: string | null; last_distance_m: number | null }
>();

function getState(deviceId: string) {
  let s = inMemoryState.get(deviceId);
  if (!s) {
    s = { consecutive_outside_count: 0, last_outside_at: null, last_distance_m: null };
    inMemoryState.set(deviceId, s);
  }
  return s;
}

export type ParsedPacketGps = {
  fix_flag: string;
  sats: number;
  hdop: number;
  lat: number | null;
  lon: number | null;
  speed_kmh: number;
};

/** Extract GPS fields from parsed location (extra.signal.gps or fallback). */
export function getPacketGps(parsed: ParsedLocation): ParsedPacketGps {
  const signal = parsed.extra?.signal as { gps?: { fix_flag?: string; sats?: number; hdop?: number; speed_kmh?: number } } | undefined;
  const gps = signal?.gps;
  const fixFlag = gps?.fix_flag ?? (parsed.gps_valid === true ? 'A' : 'V');
  const sats = typeof gps?.sats === 'number' ? gps.sats : parsed.gps_valid ? 4 : 0;
  const hdop = typeof gps?.hdop === 'number' ? gps.hdop : parsed.gps_valid ? 3 : 99;
  const speedKmh = typeof gps?.speed_kmh === 'number' ? gps.speed_kmh : parsed.speed_kph ?? 0;
  return {
    fix_flag: fixFlag,
    sats,
    hdop,
    lat: parsed.latitude,
    lon: parsed.longitude,
    speed_kmh: speedKmh,
  };
}

/** Usable for arming and for movement: fix A, sats >= 3, hdop in (0, 6], valid lat/lon. */
export function isValidFix(gps: ParsedPacketGps): boolean {
  if (gps.fix_flag !== 'A') return false;
  if (gps.sats < 3) return false;
  if (gps.hdop <= 0 || gps.hdop > 6) return false;
  if (gps.lat == null || gps.lon == null) return false;
  if (gps.lat === 0 && gps.lon === 0) return false;
  return true;
}

/** Unrealistic jump: distance > 3 km in one packet; ignore unless speed is high (likely real movement). */
function isLikelyGlitch(distanceM: number, speedKmh: number): boolean {
  return distanceM > GPS_GLITCH_JUMP_M && speedKmh < MIN_SPEED_KMH_TRIGGER;
}

export async function evaluatePacket(
  supabase: SupabaseClient,
  parsed: ParsedLocation
): Promise<void> {
  const deviceId = parsed.device_id;
  const rule = getRule(deviceId);
  if (!rule || !rule.enabled) return;

  const gps = getPacketGps(parsed);
  const now = new Date();
  const nowIso = now.toISOString();

  const localTime = DateTime.now().setZone(rule.timezone);
  const nowLocalMinutes = localTime.hour * 60 + localTime.minute;
  const startMinutes = parseTimeLocal(rule.start_time_local);
  const endMinutes = parseTimeLocal(rule.end_time_local);

  if (!isWithinWindow(nowLocalMinutes, startMinutes, endMinutes)) {
    return;
  }

  if (rule.armed_center_lat == null || rule.armed_center_lon == null) {
    if (!isValidFix(gps) || gps.lat == null || gps.lon == null) return;
    await armRule(supabase, rule, gps.lat, gps.lon, nowIso);
    return;
  }

  if (!isValidFix(gps) || gps.lat == null || gps.lon == null) return;

  const distanceM = haversineMeters(
    rule.armed_center_lat,
    rule.armed_center_lon,
    gps.lat,
    gps.lon
  );

  if (isLikelyGlitch(distanceM, gps.speed_kmh)) return;

  const state = getState(deviceId);
  if (distanceM > rule.radius_m) {
    state.consecutive_outside_count++;
    state.last_outside_at = nowIso;
    state.last_distance_m = distanceM;
  } else {
    state.consecutive_outside_count = 0;
  }

  const cooldownMs = rule.cooldown_minutes * 60 * 1000;
  const lastAlertAt = rule.last_alert_at ? new Date(rule.last_alert_at).getTime() : 0;
  if (now.getTime() - lastAlertAt < cooldownMs) return;

  const triggerBySpeed = gps.speed_kmh >= MIN_SPEED_KMH_TRIGGER;
  const triggerByConsecutive = state.consecutive_outside_count >= CONSECUTIVE_REQUIRED;
  if (distanceM <= rule.radius_m) return;
  if (!triggerBySpeed && !triggerByConsecutive) return;

  await triggerAlert(supabase, rule, parsed, distanceM, gps.speed_kmh, nowIso);
  state.consecutive_outside_count = 0;
}

async function armRule(
  supabase: SupabaseClient,
  rule: NightGuardRule,
  lat: number,
  lon: number,
  nowIso: string
): Promise<void> {
  const { error } = await supabase
    .from('night_guard_rules')
    .update({
      armed_center_lat: lat,
      armed_center_lon: lon,
      armed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', rule.id);

  if (error) return;
  const updated: NightGuardRule = {
    ...rule,
    armed_center_lat: lat,
    armed_center_lon: lon,
    armed_at: nowIso,
    updated_at: nowIso,
  };
  setRule(rule.device_id, updated);
}

async function triggerAlert(
  supabase: SupabaseClient,
  rule: NightGuardRule,
  parsed: ParsedLocation,
  distanceM: number,
  speedKmh: number,
  nowIso: string
): Promise<void> {
  const payload = {
    lat: parsed.latitude,
    lon: parsed.longitude,
    distance_m: distanceM,
    speed_kph: speedKmh,
    armed_at: rule.armed_at,
    armed_center_lat: rule.armed_center_lat,
    armed_center_lon: rule.armed_center_lon,
    gps_time: parsed.gps_time,
    received_at: nowIso,
  };

  await supabase.from('device_alert_events').insert({
    device_id: rule.device_id,
    user_id: rule.user_id,
    alert_type: 'night_guard',
    payload,
  });

  await supabase
    .from('night_guard_rules')
    .update({ last_alert_at: nowIso, updated_at: nowIso })
    .eq('id', rule.id);

  await supabase.from('notifications_queue').insert({
    type: 'night_guard',
    payload: {
      device_id: rule.device_id,
      user_id: rule.user_id,
      ...payload,
    },
    status: 'pending',
  });

  setRule(rule.device_id, {
    ...rule,
    last_alert_at: nowIso,
    updated_at: nowIso,
  });
}
