# Schema audit: Tracker Toolkit (device commands + SMSPortal)

## Purpose

Support admin-only "Tracker Toolkit" on the Device View page: send SMS commands to tracker SIM (diagnostics, config), track jobs, parse replies. All SMS via existing **SMSPortal** integration (`web/lib/smsportal.ts` → `sendSms(to, message)`).

## Existing schema (relevant)

### devices (20240223000001_devices_and_locations.sql)

- `id` text PK, `user_id`, `name`, `created_at`, `last_seen_at`
- Later migrations added: `marker_icon`, `marker_color`, `watchdog_*`, `ingest_disabled`
- **No `sim_phone` / `msisdn`** → add `sim_phone text` for tracker SIM (MSISDN) used for command SMS.

### locations

- `extra` jsonb holds `battery`, `power`, `signal` (gps: sats, hdop; gsm: csq). Used for diagnostics.

### user_roles (20250224000001_user_roles.sql)

- `user_role`: customer, staff, staff_plus, administrator
- RLS: users read own role; only administrator can update roles.

### Other tables

- No existing `device_command_*` or `command_jobs` table.

## New / changed

### 1. devices.sim_phone

- **Add:** `sim_phone text` (nullable). Tracker SIM phone number (E.164 or national) for sending command SMS.

### 2. device_command_jobs (new)

- **Create** table with: id, device_id, user_id, created_at, status, command_name, command_text, target_phone, provider, provider_message_id, sent_at, replied_at, reply_raw, reply_parsed, error.
- **Status:** queued, sending, sent, failed, timeout, replied, manual_reply.
- **Indexes:** (device_id, created_at desc), (status).
- **RLS:** Staff and above SELECT; StaffPlus/Admin INSERT and UPDATE.

## SMSPortal reuse

- **Send:** Use existing `sendSms(destination, content)` from `@/lib/smsportal`. No new provider.
- **Message ID:** SMSPortal v3 response may include `sendResponse.eventId`; extend `sendSms` to return it as `messageId` and store in `provider_message_id`.
- **Inbound:** No existing SMSPortal inbound webhook in codebase; support **manual reply** only (StaffPlus/Admin pastes reply → status `manual_reply`, parse and store `reply_parsed`).
