-- Track carrier changes per device over time.
-- Populated by the ingest carrier-poller (carrier-poller.ts) which calls
-- the Simbase API every 30 minutes and inserts a row whenever the carrier
-- changes. Used to colour the Network History bar in the Signal tab.

CREATE TABLE IF NOT EXISTS device_carrier_log (
  id          bigserial PRIMARY KEY,
  device_id   text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  carrier     text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_carrier_log_device_recorded
  ON device_carrier_log (device_id, recorded_at DESC);

-- RLS: users can only read their own devices' carrier log.
-- Service-role (ingest) bypasses RLS and can insert freely.
ALTER TABLE device_carrier_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_carrier_log_select ON device_carrier_log
  FOR SELECT USING (
    device_id IN (
      SELECT id FROM devices WHERE user_id = auth.uid()
    )
  );
