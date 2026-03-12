-- Speeds up WHERE user_id = $1 scan on devices table.
-- Every /api/devices call filters by user_id; without this index Postgres
-- does a full table scan (fine for small datasets, meaningful as data grows).
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);

-- Composite index for the activation_tokens lookup in /api/devices:
--   WHERE user_id = $1 AND device_id IS NOT NULL AND device_id IN (...)
-- The existing single-column idx_activation_tokens_user_id satisfies the user_id
-- predicate but then requires a heap scan to filter by device_id.
-- This composite + partial index covers both filters in one index scan.
CREATE INDEX IF NOT EXISTS idx_activation_tokens_user_device
  ON public.activation_tokens(user_id, device_id)
  WHERE device_id IS NOT NULL;
