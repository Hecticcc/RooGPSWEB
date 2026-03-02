import type { SupabaseClient } from '@supabase/supabase-js';
import type { NightGuardRule } from './types';

const REFRESH_INTERVAL_MS = 60 * 1000;

/** In-memory cache: device_id -> rule (only enabled rules). Zero DB reads per packet. */
const ruleCache = new Map<string, NightGuardRule>();

let refreshTimer: ReturnType<typeof setInterval> | null = null;

export function getRule(deviceId: string): NightGuardRule | undefined {
  return ruleCache.get(deviceId);
}

export function getAllRules(): Map<string, NightGuardRule> {
  return new Map(ruleCache);
}

export async function refreshRules(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('night_guard_rules')
    .select('id, user_id, device_id, enabled, timezone, start_time_local, end_time_local, radius_m, armed_center_lat, armed_center_lon, armed_at, last_alert_at, cooldown_minutes, updated_at')
    .eq('enabled', true);

  if (error) {
    return;
  }

  const rows = (data ?? []) as NightGuardRule[];
  const newMap = new Map<string, NightGuardRule>();
  for (const r of rows) {
    newMap.set(r.device_id, r);
  }
  ruleCache.clear();
  for (const [k, v] of newMap) {
    ruleCache.set(k, v);
  }
}

export function startRuleRefresh(supabase: SupabaseClient): void {
  if (refreshTimer) return;
  refreshRules(supabase).then(() => {
    refreshTimer = setInterval(() => {
      refreshRules(supabase);
    }, REFRESH_INTERVAL_MS);
  });
}

export function stopRuleRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/** Update in-memory rule after arm or last_alert_at update (so we don't wait 60s). */
export function setRule(deviceId: string, rule: NightGuardRule): void {
  ruleCache.set(deviceId, rule);
}

export function deleteRule(deviceId: string): void {
  ruleCache.delete(deviceId);
}
