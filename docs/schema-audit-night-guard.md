# Schema audit: Night Guard

**Purpose:** Real-time scheduled movement alert (e.g. 21:00–06:00) with configurable radius. Evaluated on every incoming location packet in the VPS ingest service.

## Existing schema relevant to Night Guard

### Reuse

| Table / column | Use for Night Guard |
|----------------|---------------------|
| **device_alert_events** | Store Night Guard alerts. Insert row with `alert_type = 'night_guard'`, `payload` with lat/lon, distance_m, speed_kph, etc. Same pattern as `watchdog`, `geofence`, `battery`. |
| **devices** | `id`, `user_id` for rule ownership and alert delivery. |
| **locations** | Ingest writes here; Night Guard evaluates **before** or **after** insert using the same parsed packet. No new location storage. |

### Do not reuse for rules

| Table | Reason |
|-------|--------|
| **geofences** | Different model: fixed center/radius, keep_in/keep_out, no time window. Night Guard needs time window, per-rule radius (100/200/500 m), and **arming** at first valid fix in window. |
| **battery_alerts** | Device + threshold only; no time window or radius. |
| **devices** (watchdog columns) | Watch Dog is always-on arm/disarm; Night Guard is scheduled window + radius options. |

### New tables required

| Table | Purpose |
|-------|--------|
| **night_guard_rules** | Per-device rule: enabled, timezone, start_time_local, end_time_local, radius_m (100/200/500), armed_center_lat/lon, armed_at, last_alert_at, cooldown_minutes. |
| **night_guard_state** | Optional per-device state for **multiple ingest instances**: last_outside_at, consecutive_outside_count, last_distance_m. Single instance can use in-memory Map only. |
| **notifications_queue** | Queue table for notification jobs (SMS/email). Ingest inserts row with type `night_guard` and payload; separate worker sends. Avoids doing SMS inline in ingest. |

## device_alert_events (existing)

- **Columns:** `id`, `device_id`, `user_id`, `alert_type`, `payload`, `created_at`
- **RLS:** user owns device. Service role can insert (ingest uses service role).
- **Use:** Insert with `alert_type = 'night_guard'`, `payload` e.g. `{ lat, lon, distance_m, speed_kph, armed_at, gps_time, received_at }`.

## locations (existing)

- **Columns:** `device_id`, `gps_time`, `received_at`, `gps_valid`, `latitude`, `longitude`, `speed_kph`, `extra` (jsonb).
- **extra:** Can contain `signal.gps`: `fix_flag`, `sats`, `hdop`, `speed_kmh`. Ingest parser sets these for position-based packets.
- Night Guard reads from **parsed packet** in ingest (same shape as inserted row); no extra location query.

## devices (existing)

- **Columns:** `id`, `user_id`, `name`, `last_seen_at`, `ingest_disabled`, watchdog_armed, watchdog_armed_at, watchdog_ref_lat/lng.
- Night Guard uses `user_id` from rule (rule has user_id); no new device columns.

## Summary

- **Alerts:** Reuse `device_alert_events` with `alert_type = 'night_guard'`.
- **Rules:** New table `night_guard_rules`.
- **State (multi-instance):** New table `night_guard_state`.
- **Notifications:** New table `notifications_queue`; ingest only inserts; worker sends SMS/email.
