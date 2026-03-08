-- Single source of truth: devices.sim_iccid.
-- Backfill from activation_tokens so existing activated devices have ICCID on the device row.
-- After this, activation flow will set devices.sim_iccid when linking token; manual admin sets it too.
-- All readers use devices.sim_iccid (with optional token fallback during transition).

update public.devices d
set sim_iccid = t.sim_iccid
from public.activation_tokens t
where t.device_id = d.id
  and t.sim_iccid is not null
  and trim(t.sim_iccid) <> ''
  and (d.sim_iccid is null or trim(d.sim_iccid) = '');
