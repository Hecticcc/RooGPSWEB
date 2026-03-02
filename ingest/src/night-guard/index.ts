import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedLocation } from '../parser';
import { startRuleRefresh, stopRuleRefresh } from './rule-cache';
import { evaluatePacket } from './evaluate';

export { haversineMeters } from './haversine';
export { isWithinWindow, parseTimeLocal } from './window';
export { getPacketGps, isValidFix } from './evaluate';
export type { NightGuardRule, NightGuardState } from './types';

export function initNightGuard(supabase: SupabaseClient | null): void {
  if (!supabase) return;
  startRuleRefresh(supabase);
}

export function shutdownNightGuard(): void {
  stopRuleRefresh();
}

/**
 * Call on every incoming location packet (after device is known). Uses in-memory rules; DB writes only on arm or trigger.
 */
export function runNightGuard(supabase: SupabaseClient | null, parsed: ParsedLocation): void {
  if (!supabase) return;
  evaluatePacket(supabase, parsed).catch((_) => {
    // avoid breaking ingest on NG errors
  });
}
