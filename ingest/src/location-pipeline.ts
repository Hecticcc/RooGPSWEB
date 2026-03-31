import type { SupabaseClient } from '@supabase/supabase-js';

export type ParsedLocationLike = {
  device_id: string;
  gps_time: string | null;
  gps_valid: boolean | null;
  latitude: number | null;
  longitude: number | null;
  speed_kph: number | null;
  course_deg: number | null;
  event_code: string | null;
  raw_payload: string;
  extra: Record<string, unknown>;
};

export type LocationPipelineHooks = {
  log: (level: string, msg: string, meta?: Record<string, unknown>) => void;
  appendFallback: (raw: string) => void;
  onLastError: (msg: string) => void;
  onInsertedRow: () => void;
  onErrorCount: () => void;
};

export type LocationPipelineOptions = {
  supabase: SupabaseClient | null;
  ingestServerName: string | null;
  deviceCacheTtlMs: number;
  supabaseRetries: number;
  dedupWindowMs: number;
  hooks: LocationPipelineHooks;
};

export function createLocationPipeline(opts: LocationPipelineOptions) {
  const { supabase, ingestServerName, deviceCacheTtlMs, supabaseRetries, dedupWindowMs, hooks } = opts;
  const { log, appendFallback, onLastError, onInsertedRow, onErrorCount } = hooks;

  let systemSettingsCache: { ingest_accept: boolean; at: number } | null = null;
  const SYSTEM_SETTINGS_TTL_MS = 60 * 1000;

  async function getIngestAccept(): Promise<boolean> {
    if (!supabase) return false;
    const now = Date.now();
    if (systemSettingsCache && now - systemSettingsCache.at < SYSTEM_SETTINGS_TTL_MS) {
      return systemSettingsCache.ingest_accept;
    }
    const { data, error } = await supabase.from('system_settings').select('ingest_accept').eq('id', 'default').maybeSingle();
    if (error) {
      onLastError(`devices check: ${error.message}`);
      systemSettingsCache = { ingest_accept: true, at: now };
      return true;
    }
    if (!data) {
      systemSettingsCache = { ingest_accept: true, at: now };
      return true;
    }
    systemSettingsCache = { ingest_accept: !!data.ingest_accept, at: now };
    return systemSettingsCache.ingest_accept;
  }

  const deviceCache = new Map<string, { allowed: boolean; at: number }>();
  const DEVICE_CACHE_NEGATIVE_TTL_MS = Math.min(30000, Math.max(5000, Math.floor(deviceCacheTtlMs / 2)));

  function setDeviceCacheEntry(deviceId: string, allowed: boolean) {
    deviceCache.set(deviceId, { allowed, at: Date.now() });
  }

  async function ensureDeviceFresh(deviceId: string): Promise<boolean> {
    if (!supabase) return false;
    const { data, error } = await supabase.from('devices').select('id, ingest_disabled').eq('id', deviceId).maybeSingle();
    if (error) {
      onErrorCount();
      onLastError(`devices check: ${error.message}`);
      log('error', 'devices check failed', { err: error.message });
      return false;
    }
    if (!data || data.ingest_disabled) return false;
    return true;
  }

  async function ensureDevice(deviceId: string): Promise<boolean> {
    const now = Date.now();
    const cached = deviceCache.get(deviceId);
    if (cached) {
      const ttl = cached.allowed ? deviceCacheTtlMs : DEVICE_CACHE_NEGATIVE_TTL_MS;
      if (now - cached.at < ttl) return cached.allowed;
    }
    const allowed = await ensureDeviceFresh(deviceId);
    deviceCache.set(deviceId, { allowed, at: now });
    return allowed;
  }

  const dedupCache = new Map<string, number>();
  let dedupSkipped = 0;

  function isDuplicatePacket(deviceId: string, gpsTime: string): boolean {
    const key = `${deviceId}:${gpsTime}`;
    const now = Date.now();
    const last = dedupCache.get(key);
    if (last !== undefined && now - last < dedupWindowMs) return true;
    dedupCache.set(key, now);
    if (dedupCache.size > 5000) {
      const cutoff = now - dedupWindowMs;
      for (const [k, v] of dedupCache) {
        if (v < cutoff) dedupCache.delete(k);
      }
    }
    return false;
  }

  async function insertLocation(parsed: ParsedLocationLike | null): Promise<boolean> {
    if (!supabase || !parsed) return false;
    const accept = await getIngestAccept();
    if (!accept) {
      log('info', 'ingest accept disabled, skipping insert');
      return false;
    }

    if (parsed.gps_time && isDuplicatePacket(parsed.device_id, parsed.gps_time)) {
      dedupSkipped++;
      log('debug', 'dedup: skipping duplicate packet', { device_id: parsed.device_id, gps_time: parsed.gps_time });
      supabase
        .from('devices')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', parsed.device_id)
        .then(({ error }) => {
          if (error) log('debug', 'last_seen_at update (dedup path) failed', { err: error.message });
        });
      return false;
    }
    const row: Record<string, unknown> = {
      device_id: parsed.device_id,
      gps_time: parsed.gps_time,
      gps_valid: parsed.gps_valid,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      speed_kph: parsed.speed_kph,
      course_deg: parsed.course_deg,
      event_code: parsed.event_code,
      raw_payload: parsed.raw_payload,
      extra: parsed.extra,
    };
    if (ingestServerName) row.ingest_server = ingestServerName;
    const backoffMs = [100, 300, 900];
    for (let attempt = 0; attempt < supabaseRetries; attempt++) {
      const { error: insertErr } = await supabase.from('locations').insert(row);
      if (!insertErr) {
        onInsertedRow();
        const { error: updateErr } = await supabase
          .from('devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', parsed.device_id);
        if (updateErr)
          log('error', 'devices last_seen_at update failed (device may show offline)', {
            device_id: parsed.device_id,
            err: updateErr.message,
          });
        return true;
      }
      if (attempt < supabaseRetries - 1) {
        const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)];
        await sleep(delay);
      } else {
        onErrorCount();
        onLastError(`locations insert: ${insertErr.message}`);
        log('error', 'locations insert failed after retries', { err: insertErr.message });
        appendFallback(parsed.raw_payload);
        return false;
      }
    }
    return false;
  }

  return {
    getIngestAccept,
    ensureDevice,
    ensureDeviceFresh,
    insertLocation,
    setDeviceCacheEntry,
    getDedupSkipped: () => dedupSkipped,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
