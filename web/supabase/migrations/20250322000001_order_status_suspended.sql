-- Subscription overdue: order can be marked suspended (SIM disabled until payment).
-- Flow: ... -> activated -> [overdue] -> suspended; after payment (invoice.paid) -> paid/activated.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'order_status' AND e.enumlabel = 'suspended'
  ) THEN
    ALTER TYPE public.order_status ADD VALUE 'suspended';
  END IF;
END $$;
