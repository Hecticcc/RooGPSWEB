/**
 * PT60-L device state: ONLINE | SLEEPING | OFFLINE.
 * Used so the UI shows "Sleep mode" when the device is likely sleeping (heartbeat interval)
 * instead of "Offline".
 *
 * When does Sleep mode activate?
 * - After the device has not been seen for longer than the "online" window (e.g. > 10 min).
 * - But still within the "sleeping" window: (heartbeat_minutes * 60 + grace_seconds), e.g. 12h + 1h = 13h.
 * - And we don't know the device was moving (is_stopped is true or null; only is_stopped === false forces Offline).
 * Offline = only after 13–14h (heartbeat+grace) with no ping, or when the last packet said "moving" (so we expect reports).
 */

export type DeviceState = 'ONLINE' | 'SLEEPING' | 'OFFLINE';
export type OfflineReason = 'OFFLINE_LOW_BATTERY' | 'OFFLINE_UNKNOWN' | null;

export const DEVICE_STATE_CONFIG = {
  /** Default online threshold when moving_interval is unknown (seconds). 10 min avoids flipping to Offline between typical 5-min pings. */
  default_online_threshold_seconds: 600,
  /** Multiplier for moving_interval to get online threshold: max(180, moving_interval_seconds * 2). */
  online_threshold_min_seconds: 180,
  /** Grace beyond heartbeat window before marking OFFLINE (seconds). */
  default_grace_seconds: 3600,
  /** Default heartbeat interval when device is sleeping (minutes). PT60-L often 12h = 720. */
  default_heartbeat_minutes: 720,
  /** Battery voltage at or below this when OFFLINE => OFFLINE_LOW_BATTERY (V). */
  low_battery_voltage_threshold: 3.55,
} as const;

export type DeviceStateInput = {
  last_seen_at: string | null;
  moving_interval_seconds?: number | null;
  heartbeat_minutes?: number | null;
  /** From last packet extra.pt60_state.is_stopped */
  last_known_is_stopped?: boolean | null;
  /** From last packet extra.power.battery_voltage_v or extra.internal_battery_voltage_v (V) */
  last_known_battery_voltage?: number | null;
  /** For view_state: true = LIVE when online, false = INDOOR_NO_GPS when online */
  gps_fix_last?: boolean | null;
  /** Override config (for tests). */
  _config?: {
    online_threshold_seconds?: number;
    grace_seconds?: number;
    heartbeat_minutes?: number;
  };
};

export type DeviceStateResult = {
  device_state: DeviceState;
  offline_reason: OfflineReason;
  /** Seconds since last_seen_at (null if no last_seen_at). */
  last_seen_age_seconds: number | null;
};

/** Consumer-facing state for View Tracker: LIVE | SLEEPING | INDOOR_NO_GPS | OFFLINE */
export type ViewDeviceState = 'LIVE' | 'SLEEPING' | 'INDOOR_NO_GPS' | 'OFFLINE';

export type ViewDeviceStateResult = DeviceStateResult & {
  view_state: ViewDeviceState;
  /** When state is SLEEPING, next expected check-in (ISO string). */
  next_expected_checkin_at: string | null;
};

function viewStateFrom(
  device_state: DeviceState,
  gps_fix_last: boolean | null,
  last_seen_at: string | null,
  heartbeat_minutes: number
): ViewDeviceState {
  if (device_state === 'ONLINE') return gps_fix_last === true ? 'LIVE' : 'INDOOR_NO_GPS';
  if (device_state === 'SLEEPING') return 'SLEEPING';
  return 'OFFLINE';
}

/** Compute next expected check-in when SLEEPING: last_seen + heartbeat_minutes. */
function nextExpectedCheckinAt(last_seen_at: string | null, heartbeat_minutes: number): string | null {
  if (!last_seen_at) return null;
  const t = new Date(last_seen_at).getTime() + heartbeat_minutes * 60 * 1000;
  return new Date(t).toISOString();
}

/**
 * Compute device state from last seen time and PT60-L last-known fields.
 * - ONLINE: last_seen within online_threshold.
 * - SLEEPING: beyond online_threshold but within (heartbeat + grace), and last packet was stopped.
 * - OFFLINE: beyond (heartbeat + grace), or beyond online_threshold and not stopped (moving should report).
 */
export function computeDeviceState(input: DeviceStateInput): DeviceStateResult {
  const config = input._config ?? {};
  const graceSeconds = config.grace_seconds ?? DEVICE_STATE_CONFIG.default_grace_seconds;
  const heartbeatMinutes = config.heartbeat_minutes ?? input.heartbeat_minutes ?? DEVICE_STATE_CONFIG.default_heartbeat_minutes;
  const heartbeatSeconds = heartbeatMinutes * 60;
  const sleepingWindowSeconds = heartbeatSeconds + graceSeconds;

  let onlineThresholdSeconds: number;
  if (config.online_threshold_seconds != null) {
    onlineThresholdSeconds = config.online_threshold_seconds;
  } else if (input.moving_interval_seconds != null && input.moving_interval_seconds > 0) {
    onlineThresholdSeconds = Math.max(
      DEVICE_STATE_CONFIG.online_threshold_min_seconds,
      input.moving_interval_seconds * 2
    );
  } else {
    onlineThresholdSeconds = DEVICE_STATE_CONFIG.default_online_threshold_seconds;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const lastSeenAt = input.last_seen_at ? new Date(input.last_seen_at).getTime() : null;
  const lastSeenAgeSeconds =
    lastSeenAt != null ? Math.max(0, nowSeconds - Math.floor(lastSeenAt / 1000)) : null;

  if (lastSeenAgeSeconds == null) {
    return {
      device_state: 'OFFLINE',
      offline_reason: 'OFFLINE_UNKNOWN',
      last_seen_age_seconds: null,
    };
  }

  if (lastSeenAgeSeconds <= onlineThresholdSeconds) {
    return {
      device_state: 'ONLINE',
      offline_reason: null,
      last_seen_age_seconds: lastSeenAgeSeconds,
    };
  }

  // Within heartbeat+grace window: show SLEEPING unless we know the device was moving (is_stopped === false).
  // When is_stopped is null (e.g. no PT60 data), assume it may be sleeping so we don't flip to Offline too soon.
  const wasMoving = input.last_known_is_stopped === false;
  if (!wasMoving && lastSeenAgeSeconds <= sleepingWindowSeconds) {
    return {
      device_state: 'SLEEPING',
      offline_reason: null,
      last_seen_age_seconds: lastSeenAgeSeconds,
    };
  }

  const batteryV = input.last_known_battery_voltage;
  const offlineReason: OfflineReason =
    batteryV != null &&
    batteryV <= DEVICE_STATE_CONFIG.low_battery_voltage_threshold &&
    lastSeenAgeSeconds > sleepingWindowSeconds
      ? 'OFFLINE_LOW_BATTERY'
      : 'OFFLINE_UNKNOWN';

  return {
    device_state: 'OFFLINE',
    offline_reason: offlineReason,
    last_seen_age_seconds: lastSeenAgeSeconds,
  };
}

/**
 * Compute device state and consumer view_state + next_expected_checkin for View Tracker page.
 */
export function computeViewDeviceState(
  input: DeviceStateInput & { gps_fix_last?: boolean | null }
): ViewDeviceStateResult {
  const result = computeDeviceState(input);
  const heartbeatMinutes =
    input._config?.heartbeat_minutes ?? input.heartbeat_minutes ?? DEVICE_STATE_CONFIG.default_heartbeat_minutes;
  const view_state = viewStateFrom(
    result.device_state,
    input.gps_fix_last ?? null,
    input.last_seen_at,
    heartbeatMinutes
  );
  const next_expected_checkin_at =
    result.device_state === 'SLEEPING' ? nextExpectedCheckinAt(input.last_seen_at, heartbeatMinutes) : null;
  return {
    ...result,
    view_state,
    next_expected_checkin_at,
  };
}
