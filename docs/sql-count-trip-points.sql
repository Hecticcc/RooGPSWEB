-- Count points for a trip (run in Supabase SQL Editor)
-- Ford Ranger device_id: 866069069149704

-- ---------------------------------------------------------------------------
-- 1) Find trips for Ford Ranger (866069069149704) on 1 Mar 2026
-- ---------------------------------------------------------------------------
SELECT id AS trip_id,
       device_id,
       started_at,
       ended_at,
       duration_seconds,
       distance_meters
FROM public.trips
WHERE device_id = '866069069149704'
  AND started_at >= '2026-03-01 00:00:00+00'
  AND started_at <  '2026-03-02 00:00:00+00'
ORDER BY started_at DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 2) Count trip_points for a specific trip (paste trip_id from query 1)
-- ---------------------------------------------------------------------------
-- SET your trip_id, e.g. replace '00000000-0000-0000-0000-000000000000' with the actual UUID:
SELECT count(*) AS trip_points_count
FROM public.trip_points
WHERE trip_id = '00000000-0000-0000-0000-000000000000';

-- Optional: list the first 20 trip_points (lat, lon, time) for that trip
-- SELECT occurred_at, lat, lon
-- FROM public.trip_points
-- WHERE trip_id = '00000000-0000-0000-0000-000000000000'
-- ORDER BY occurred_at ASC
-- LIMIT 20;

-- ---------------------------------------------------------------------------
-- 3) Count locations for Ford Ranger (866069069149704) during trip timeframe (9:51–10:21 + 20 min buffer)
--    Adjust timestamps if your trip has different started_at/ended_at (from query 1).
-- ---------------------------------------------------------------------------
SELECT count(*) AS locations_count
FROM public.locations
WHERE device_id = '866069069149704'
  AND received_at >= '2026-03-01 09:51:00+00'   -- trip started_at
  AND received_at <= '2026-03-01 10:41:00+00'; -- ended_at + 20 min

-- Optional: list locations in that window (id, time, lat, lon)
-- SELECT id, received_at, latitude, longitude
-- FROM public.locations
-- WHERE device_id = '866069069149704'
--   AND received_at >= '2026-03-01 09:51:00+00'
--   AND received_at <= '2026-03-01 10:41:00+00'
-- ORDER BY received_at ASC;

-- ---------------------------------------------------------------------------
-- 4) One-shot: for a known trip_id, show both counts (replace the trip_id)
-- ---------------------------------------------------------------------------
WITH t AS (
  SELECT id, device_id, started_at, ended_at
  FROM public.trips
  WHERE id = '00000000-0000-0000-0000-000000000000'
)
SELECT
  (SELECT count(*) FROM public.trip_points tp WHERE tp.trip_id = t.id) AS trip_points_count,
  (SELECT count(*)
   FROM public.locations l
   WHERE l.device_id = t.device_id
     AND l.received_at >= t.started_at
     AND l.received_at <= t.ended_at + interval '20 minutes') AS locations_in_window
FROM t;
