# Night Guard – architecture and scalability

Night Guard is a real-time scheduled movement alert evaluated in the **VPS ingest service** (Node.js) on every incoming location packet. It is not implemented in Supabase Edge or DB triggers.

## Why rules are cached in memory

- **Goal:** Support thousands of devices without DB read amplification.
- **At startup:** Ingest loads all enabled `night_guard_rules` into a single in-memory `Map<deviceId, NightGuardRule>`.
- **Every 60 seconds:** Ingest refreshes enabled rules from the DB, diffs, and updates the cache.
- **Per packet:** Evaluation uses only the in-memory rule for that device. There are **zero DB reads** per packet for Night Guard.

## Why DB reads are avoided per packet

- Location volume can be very high (e.g. one packet every 10–30 s per device). A DB round-trip per packet would not scale and would add latency.
- Rules change infrequently; a 60 s refresh is enough for enable/disable and parameter changes.
- Arming and alerting write back to the DB (update rule, insert alert, insert notification queue); those writes are rare and acceptable.

## Why notifications are queued

- **Do not send SMS/email inline** in the ingest process. Ingest must stay fast and non-blocking.
- On trigger, ingest:
  1. Inserts into `device_alert_events` (alert_type = `night_guard`).
  2. Updates `night_guard_rules.last_alert_at`.
  3. Inserts into `notifications_queue` (type = `night_guard`, payload = device_id, user_id, lat, lon, distance_m, etc.).
- A **separate worker process** (cron or long-running) polls `notifications_queue` for `status = 'pending'`, sends SMS/email, then marks `status = 'sent'` or `'failed'`.

## Horizontal scaling (multiple ingest instances)

- **Single instance:** Consecutive “outside radius” count is kept in an in-memory `Map<deviceId, state>`. No shared state table required.
- **Multiple instances:** If the same device can be handled by more than one ingest node, each node has its own in-memory state and rule cache. To avoid duplicate alerts and to share consecutive count:
  - **Option A:** Use the `night_guard_state` table. On each packet, read/upsert `night_guard_state` for that device (consecutive_outside_count, last_outside_at). This adds one DB read/write per packet for devices with a Night Guard rule (only when armed and in window).
  - **Option B:** Sticky device routing so that all packets for a given device always go to the same ingest instance. Then in-memory state remains correct and no shared state table is needed.
  - **Option C:** Use Redis (or similar) for shared per-device state (consecutive count, last outside time). Ingest and worker read/write Redis instead of Postgres for that state.

Current implementation assumes **single ingest instance** or **sticky routing**; `night_guard_state` exists for a future multi-instance implementation.

## Summary

| Concern | Approach |
|--------|----------|
| Rule lookup | In-memory cache, refreshed every 60 s; no per-packet DB read. |
| Per-packet DB | Writes only when arming or when an alert triggers. |
| Notifications | Queued in `notifications_queue`; worker sends SMS/email. |
| Scaling | Single instance: in-memory state. Multi-instance: sticky routing or `night_guard_state` / Redis. |
