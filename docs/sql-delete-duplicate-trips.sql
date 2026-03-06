-- Delete duplicate trips (same device, started_at within 2 minutes).
-- Matches recompute logic: one trip per "start window"; we keep the one with latest ended_at.
-- trip_points are ON DELETE CASCADE; trip_state.open_trip_id is ON DELETE SET NULL.
--
-- Usage: run section 1 and 2 first (dry run), then uncomment section 3 to perform the delete.

-- 1) Dry run: list trips that would be deleted (duplicates) and the keeper per group
WITH dupes AS (
  SELECT
    t.id,
    t.device_id,
    t.started_at,
    t.ended_at,
    t.duration_seconds,
    t.distance_meters,
    (SELECT count(*) FROM public.trip_points tp WHERE tp.trip_id = t.id) AS point_count,
    (SELECT o.id
     FROM public.trips o
     WHERE o.device_id = t.device_id
       AND o.started_at >= t.started_at - interval '2 minutes'
       AND o.started_at <= t.started_at + interval '2 minutes'
     ORDER BY o.ended_at DESC, o.id DESC
     LIMIT 1) AS keeper_id
  FROM public.trips t
)
SELECT id, device_id, started_at, ended_at, duration_seconds, distance_meters, point_count, keeper_id,
       CASE WHEN id = keeper_id THEN 'KEEP' ELSE 'DELETE' END AS action
  FROM dupes
 WHERE keeper_id IS NOT NULL
 ORDER BY device_id, started_at, action DESC;

-- 2) Count how many trip rows would be deleted (run after 1 to confirm)
SELECT count(*) AS would_delete
  FROM public.trips t
 WHERE EXISTS (
   SELECT 1 FROM public.trips o
   WHERE o.device_id = t.device_id
     AND o.id <> t.id
     AND o.started_at >= t.started_at - interval '2 minutes'
     AND o.started_at <= t.started_at + interval '2 minutes'
     AND (o.ended_at > t.ended_at OR (o.ended_at = t.ended_at AND o.id > t.id))
 );

-- 3) Delete duplicates (keep trip with latest ended_at per device/start-window; ties broken by id)
-- Uncomment the block below to run the actual delete.
/*
DELETE FROM public.trips t
WHERE EXISTS (
  SELECT 1 FROM public.trips o
  WHERE o.device_id = t.device_id
    AND o.id <> t.id
    AND o.started_at >= t.started_at - interval '2 minutes'
    AND o.started_at <= t.started_at + interval '2 minutes'
    AND (
      o.ended_at > t.ended_at
      OR (o.ended_at = t.ended_at AND o.id > t.id)
    )
);
*/
