-- Redo trips: reset state (and optionally delete existing trips) then run recompute.
--
-- CHECKLIST (do in order):
--   1. Run this ENTIRE script in Supabase SQL Editor (the DELETE + INSERT below).
--   2. Deploy your app so the recompute endpoint uses the 90-day lookback.
--   3. In PowerShell, run the GET (diagnose) - you should see points_fetched > 3 if reset worked.
--   4. Run the POST (create trips) - then refresh the Trips tab; trips from last 90 days should appear.
--
-- Optional: In SQL Editor, check how many locations exist for this device (last 90 days):
--   SELECT COUNT(*) FROM locations WHERE device_id = '866069069149704' AND received_at > (now() - interval '90 days');

-- ========== OPTION A: One device (e.g. Ford Ranger) ==========
-- 1) Delete existing trips for this device (so recompute creates fresh ones, no duplicates)
DELETE FROM trip_points WHERE device_id = '866069069149704';
DELETE FROM trips WHERE device_id = '866069069149704';
-- 2) Ensure trip_state row exists and reset so recompute uses last 90 days of points
INSERT INTO trip_state (device_id, last_processed_at, open_trip_id, updated_at)
VALUES ('866069069149704', NULL, NULL, now())
ON CONFLICT (device_id) DO UPDATE SET last_processed_at = NULL, updated_at = now();

-- ========== OPTION B: All devices ==========
-- Uncomment to wipe and redo trips for every device:
-- DELETE FROM trip_points;
-- DELETE FROM trips;
-- TRUNCATE trip_state;

-- ========== REQUIRED: Trigger recompute after running above ==========
-- Trips only show again after the recompute job runs. Without this step, the device will have 0 trips.
--
-- *** DO NOT paste the lines below into SQL Editor - they are for your TERMINAL only. ***
/*
  After running the SQL above, run in your terminal:

  --- PowerShell (Windows) ---
  1) Diagnose (GET):
     Invoke-RestMethod -Uri "https://musical-beignet-540a9c.netlify.app/api/internal/trips/recompute?deviceId=866069069149704" -Headers @{ Authorization = "Bearer VMgzSn3Yk4Kh" }

  2) Create trips (POST):
     Invoke-RestMethod -Uri "https://musical-beignet-540a9c.netlify.app/api/internal/trips/recompute?deviceId=866069069149704" -Method POST -Headers @{ Authorization = "Bearer VMgzSn3Yk4Kh" }

  --- Bash / CMD (or PowerShell with real curl) ---
  1) Diagnose:  curl "https://musical-beignet-540a9c.netlify.app/api/internal/trips/recompute?deviceId=866069069149704" -H "Authorization: Bearer VMgzSn3Yk4Kh"
  2) Create:    curl.exe -X POST "https://musical-beignet-540a9c.netlify.app/api/internal/trips/recompute?deviceId=866069069149704" -H "Authorization: Bearer VMgzSn3Yk4Kh"
*/
