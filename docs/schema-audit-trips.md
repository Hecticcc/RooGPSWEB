# Schema audit: Trips feature

## What exists

### `public.devices`
- **Location:** `web/supabase/migrations/20240223000001_devices_and_locations.sql`
- **Columns:** `id` (text PK), `user_id` (uuid, FK auth.users), `name`, `created_at`, `last_seen_at`; plus later migrations for `marker_color`, `marker_icon`, `watchdog_armed`, `watchdog_armed_at`, `ingest_disabled`, etc.
- **RLS:** Owner can do all by `auth.uid() = user_id`.
- **Reuse:** Trips will reference `device_id` (text) and we resolve `user_id` via devices for RLS.

### `public.locations`
- **Location:** same migration.
- **Columns:** `id` (uuid PK), `device_id` (text FK devices), `gps_time` (timestamptz), `received_at` (timestamptz), `gps_valid` (boolean), `latitude`, `longitude` (double precision), `speed_kph`, `course_deg`, `event_code`, `raw_payload`, `extra` (jsonb).
- **Indexes:** `(device_id, received_at desc)`, `(device_id, gps_time desc)`.
- **RLS:** Select only, via device ownership (`exists (select 1 from devices d where d.id = device_id and d.user_id = auth.uid())`).
- **Reuse:** Trip detection reads from `locations`. Trip summaries can reference `locations.id` for start/end. No new “points” table needed for raw data; optional `trip_points` will reference `locations.id` for fast map polyline.

### Parsed fields available for trip logic
- **From columns:** `gps_time`, `gps_valid`, `latitude`, `longitude`, `speed_kph`, `course_deg`.
- **From `extra`:** `extra.signal.gps` → `fix_flag`, `sats`, `hdop`, `speed_kmh`, `course_deg`, `has_signal`. Use `gps_valid` for fix (A/V); when `extra.signal.gps` exists, prefer it for sats/hdop.
- **Odometer:** Not currently stored. Parser has token index (ODOMETER_IDX) but does not populate it in output. Trip distance will use Haversine; when odometer is added to parser + `extra` (or a column), trip logic can prefer it with sanity checks.

### Trips table
- **Exists:** No. No existing “trips” or “journeys” table.

---

## What will be reused

- **devices:** For `user_id` and device identity; no change.
- **locations:** Sole source of points. Trip detection queries locations by `device_id` and `gps_time`/`received_at`. Start/end and polyline reference `locations.id`. No duplication of point data.

---

## What must be added

### 1. `public.trips`
- New table: `id` (uuid PK), `user_id` (uuid not null), `device_id` (text not null), `started_at` / `ended_at` (timestamptz), `duration_seconds` (int), `distance_meters` (int), `max_speed_kmh` (numeric null), `start_lat`/`start_lon`/`end_lat`/`end_lon` (numeric), `start_odometer_m`/`end_odometer_m` (bigint null), `start_location_point_id`/`end_location_point_id` (uuid null, FK locations(id)), `created_at` (timestamptz default now()).
- Indexes: `(user_id, started_at desc)`, `(device_id, started_at desc)`.
- RLS: Select/insert/update for own rows (via `user_id`); staff can read for support.

### 2. `public.trip_points` (optional, for fast map draw)
- New table: `id` (uuid PK), `trip_id` (uuid FK trips on delete cascade), `device_id` (text), `point_id` (uuid FK locations(id) on delete cascade), `occurred_at` (timestamptz), `lat`/`lon` (numeric). Denormalized lat/lon/occurred_at for quick polyline fetch without joining locations.
- Index: `(trip_id, occurred_at asc)`.
- RLS: Same as trips (via trip ownership).

### 3. `public.trip_state`
- New table: `device_id` (text PK), `last_processed_at` (timestamptz), `open_trip_id` (uuid null), `updated_at` (timestamptz). Used by recompute job to resume per device.
- RLS: Service role only (or admin); not exposed to end users.

### 4. Locations
- No new columns required for basic trip detection. Optional future: add `odometer_m` to `extra` or a column when ingest/parser emit it; then trip logic can use odometer-based distance with sanity checks.

---

## Summary

| Item            | Exists | Action                    |
|----------------|--------|---------------------------|
| devices        | Yes    | Reuse as-is               |
| locations      | Yes    | Reuse as-is               |
| trips          | No     | New table + RLS           |
| trip_points    | No     | New table + RLS           |
| trip_state     | No     | New table (internal only) |

No duplication of location data; trips and trip_points reference existing `locations.id` where useful.
