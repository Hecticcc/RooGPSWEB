/**
 * Carrier Poller — periodically queries Simbase for the current carrier of
 * every active device's SIM, and writes a row to `device_carrier_log` whenever
 * the carrier changes (or when no row exists yet for that device).
 *
 * Why here and not in the web app?
 *   The ingest server is a long-running Node process with access to the
 *   Supabase service-role key, so it can write to the log without RLS.
 *   Polling from the web app would require a scheduled job and an extra secret.
 *
 * Poll strategy:
 *   - Every CARRIER_POLL_INTERVAL_MS (default 30 min) fetch all device→ICCID
 *     mappings from Supabase, then call Simbase /simcards/{iccid} for each.
 *   - If the returned carrier differs from the last value we logged, insert a
 *     new row. If no row exists yet, always insert.
 *   - Uses a simple in-memory "last known" map so a restart will re-record the
 *     current carrier once (harmless duplicate; the UI deduplicates by time).
 */

import { SupabaseClient } from '@supabase/supabase-js';

const SIMBASE_API_BASE = (process.env.SIMBASE_API_URL ?? 'https://api.simbase.com/v2').replace(/\/$/, '');
const SIMBASE_API_KEY  = process.env.SIMBASE_API_KEY ?? '';
const CARRIER_POLL_INTERVAL_MS = parseInt(process.env.CARRIER_POLL_INTERVAL_MS ?? '1800000', 10) || 1800000;

/** carrier last written to DB, keyed by device_id */
const lastWrittenCarrier = new Map<string, string>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function fetchCarrierFromSimbase(iccid: string): Promise<string | null> {
  if (!SIMBASE_API_KEY || !iccid) return null;
  try {
    const url = `${SIMBASE_API_BASE}/simcards/${encodeURIComponent(iccid)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SIMBASE_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { connection?: { carrier?: string } };
    const c = data?.connection?.carrier;
    return typeof c === 'string' && c.trim() ? c.trim() : null;
  } catch {
    return null;
  }
}

async function pollOnce(supabase: SupabaseClient, log: (level: string, msg: string, meta?: Record<string, unknown>) => void) {
  // Fetch all devices that have a SIM ICCID
  const { data: devices, error } = await supabase
    .from('devices')
    .select('id, sim_iccid')
    .not('sim_iccid', 'is', null);

  if (error) {
    log('warn', 'carrier-poller: failed to fetch devices', { err: error.message });
    return;
  }
  if (!devices || devices.length === 0) return;

  for (const device of devices) {
    const iccid = (device as { id: string; sim_iccid: string | null }).sim_iccid;
    const deviceId = (device as { id: string }).id;
    if (!iccid) continue;

    const carrier = await fetchCarrierFromSimbase(iccid);
    if (!carrier) continue;

    const last = lastWrittenCarrier.get(deviceId);
    if (last === carrier) continue; // no change since last poll

    // Insert into DB
    const { error: insertErr } = await supabase
      .from('device_carrier_log')
      .insert({ device_id: deviceId, carrier, recorded_at: new Date().toISOString() });

    if (insertErr) {
      log('warn', 'carrier-poller: insert failed', { device_id: deviceId, err: insertErr.message });
    } else {
      log('info', 'carrier-poller: carrier change logged', { device_id: deviceId, from: last ?? '(none)', to: carrier });
      lastWrittenCarrier.set(deviceId, carrier);
    }
  }
}

export function initCarrierPoller(
  supabase: SupabaseClient,
  log: (level: string, msg: string, meta?: Record<string, unknown>) => void
) {
  if (!SIMBASE_API_KEY) {
    log('info', 'carrier-poller: SIMBASE_API_KEY not set, carrier history tracking disabled');
    return;
  }
  if (running) return;
  running = true;
  log('info', `carrier-poller: starting, interval ${CARRIER_POLL_INTERVAL_MS / 1000}s`);

  // Run immediately on start, then on interval
  pollOnce(supabase, log).catch(() => {});

  function schedule() {
    pollTimer = setTimeout(() => {
      pollOnce(supabase, log)
        .catch(() => {})
        .finally(schedule);
    }, CARRIER_POLL_INTERVAL_MS);
    pollTimer.unref(); // don't prevent process exit
  }
  schedule();
}

export function shutdownCarrierPoller() {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
