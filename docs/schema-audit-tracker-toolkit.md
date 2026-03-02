# Schema audit: Tracker Toolkit (device commands + SMS)

## Purpose

Support admin-only "Tracker Toolkit" on the Device View page: send SMS commands to tracker SIM (diagnostics, config), track jobs, parse replies. SMS is sent via **Simbase** when the device has an ICCID (activation token), or via **SMSPortal** when only `sim_phone` is set.

## Existing schema (audit)

### devices

- `id`, `user_id`, `name`, `created_at`, `last_seen_at`, `ingest_disabled`, etc.
- **`sim_phone`** – added in migration `20250316000001_tracker_toolkit_device_commands.sql`. Tracker SIM phone number (E.164 or national) for SMS commands when not using Simbase ICCID.

### device_command_jobs

- **Exists** in migration `20250316000001_tracker_toolkit_device_commands.sql`.
- Columns: `id`, `device_id`, `user_id`, `created_at`, `status`, `command_name`, `command_text`, `target_phone`, `provider`, `provider_message_id`, `sent_at`, `replied_at`, `reply_raw`, `reply_parsed`, `error`.
- **`target_iccid`** – added in `20250317000001_tracker_toolkit_simbase_sms.sql`. When set, sending uses Simbase API (POST /simcards/{iccid}/sms).
- Status: `queued`, `sending`, `sent`, `failed`, `timeout`, `replied`, `manual_reply`.
- Indexes: `(device_id, created_at desc)`, `(status)`.
- RLS: Staff+ SELECT; StaffPlus/Admin INSERT and UPDATE.

### user_roles

- Roles: customer, staff, staff_plus, administrator. Staff and above can view Toolkit; StaffPlus/Admin can create jobs and SET commands.

## SMS integration

### Simbase (when device has ICCID)

- **Send:** `POST /simcards/{iccid}/sms` with body `{ "message": "..." }` (1–180 chars). Scope `simcards.sms:send`. 202 Accepted.
- **List (receive):** `GET /simcards/{iccid}/sms` with `direction=mt|mo`, `day`, `limit`, `cursor`. Scope `simcards.sms:read`. Used to sync MO replies to pending jobs.
- Implemented in `web/lib/simbase.ts`: `sendSimbaseSms(iccid, message)`, `listSimbaseSms(iccid, options)`.

### SMSPortal (when only sim_phone)

- **Send:** Existing `sendSms(destination, content)` in `web/lib/smsportal.ts`. Returns `messageId` when API provides it (e.g. eventId); stored in `provider_message_id`.
- **Inbound:** No webhook in codebase; use **manual reply** (StaffPlus/Admin pastes reply in job detail → status `manual_reply`, parse into `reply_parsed`).

## Worker and APIs

- **Worker:** `web/lib/tracker-command-worker.ts` – processes queued jobs: Simbase or SMSPortal send, timeout (120s), sync Simbase MO replies.
- **Reply parsing:** `web/lib/tracker-command-replies.ts` – 800 (live location), 802 (work status); unit tests in `tracker-command-replies.test.ts`.
- **APIs:**  
  - `POST /api/admin/devices/[id]/commands` – create job (StaffPlus/Admin).  
  - `GET /api/admin/devices/[id]/commands` – list jobs (Staff+).  
  - `GET /api/admin/commands/[jobId]` – poll job, trigger sync/timeout (Staff+).  
  - `PATCH /api/admin/commands/[jobId]` – manual reply (StaffPlus/Admin).  
  - `GET /api/admin/devices/[id]/diagnostics` – last seen, GPS/GSM/battery, suggested fixes.  
  - `GET /api/admin/devices/[id]/sms` – Simbase SMS list for device SIM (Staff+).

## Summary

- **No new migrations required.** `devices.sim_phone` and `device_command_jobs` (including `target_iccid`) already exist.
- Simbase send/list implemented per API docs; SMSPortal reused for send when no ICCID.
- Tracker Toolkit modal on Device view: Diagnostics, Commands, Command Log, SMS (Simbase) tabs; role checks and zod validation on server.
