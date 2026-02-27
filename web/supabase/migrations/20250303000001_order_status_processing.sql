-- Add 'processing' step: after stock assigned (fulfilled), before shipped.
-- Flow: pending -> paid -> fulfilled (Stock Assigned) -> processing -> shipped -> activated
alter type public.order_status add value 'processing';
