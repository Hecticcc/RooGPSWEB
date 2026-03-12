-- Returns the latest N location rows per device in a single query,
-- replacing the N+1 per-device fan-out in /api/devices.
-- Uses a window function so only one round-trip to the DB is needed.
-- SECURITY INVOKER (default) means RLS on 'locations' still applies.
CREATE OR REPLACE FUNCTION get_latest_locations_per_device(p_device_ids text[], p_n int)
RETURNS TABLE(
  device_id  text,
  latitude   float8,
  longitude  float8,
  received_at timestamptz,
  extra      jsonb,
  ingest_server text
)
LANGUAGE sql STABLE AS $$
  SELECT device_id, latitude, longitude, received_at, extra, ingest_server
  FROM (
    SELECT
      device_id, latitude, longitude, received_at, extra, ingest_server,
      ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY received_at DESC) AS rn
    FROM locations
    WHERE device_id = ANY(p_device_ids)
  ) ranked
  WHERE rn <= p_n;
$$;

-- Allow authenticated users to call this function (RLS on locations still applies)
GRANT EXECUTE ON FUNCTION get_latest_locations_per_device(text[], int) TO authenticated;
