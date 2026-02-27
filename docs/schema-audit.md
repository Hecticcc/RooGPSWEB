# Schema Audit: Ordering, Fulfilment & Activation

**Date:** 2025-02-26  
**Purpose:** Map existing Supabase schema to Ordering + Fulfilment + Activation; reuse existing tables and only add what is missing.

---

## 1. Existing Tables (from migrations + codebase)

| Table | Purpose | Key columns | RLS |
|-------|---------|-------------|-----|
| **devices** | GPS tracker bound to a user; receives locations | `id` (PK, text, device/tracker id), `user_id` (FK auth.users), `name`, `created_at`, `last_seen_at`, `ingest_disabled`, `watchdog_armed`, `watchdog_armed_at`, `watchdog_ref_lat/lng`, `marker_color`, `marker_icon` | Yes – owner only |
| **locations** | GPS points from devices | `id`, `device_id` (FK devices), `gps_time`, `received_at`, `latitude`, `longitude`, `speed_kph`, etc. | Yes – via device owner |
| **user_roles** | Role per user (Customer / Staff / StaffPlus / Administrator) | `user_id` (PK, FK auth.users), `role` (enum user_role), `created_at`, `updated_at` | Yes – select own; update admin only |
| **profiles** | User profile: shipping address, mobile | `user_id` (PK), `mobile`, `address_line1`, `address_line2`, `suburb`, `state`, `postcode`, `country` | Yes – own only |
| **tracker_stock** | Physical GPS tracker inventory (IMEI) | `id`, `imei` (unique), `status` (in_stock, assigned, sold, returned, faulty), `notes`, `created_at`, `updated_at` | Yes – no policies (admin API uses service role) |
| **alert_settings** | Per-user alert prefs (battery, email) | `user_id`, `battery_alert_enabled`, `battery_alert_percent`, etc. | Yes – own |
| **geofences** | User geofences per device | `id`, `user_id`, `device_id`, `name`, `center_lat/lng`, `radius_meters`, `alert_type` | Yes – own |
| **battery_alerts** | Per-device battery alert rules | `id`, `user_id`, `device_id`, `threshold_percent`, `notify_email`, `enabled` | Yes – own |
| **device_alert_events** | Emitted alerts (watchdog, geofence, battery) | `id`, `device_id`, `user_id`, `alert_type`, `payload`, `created_at` | Yes – own |
| **device_connection_errors** | Ingest connection errors per device | `id`, `device_id`, `error_message`, `created_at` | Yes – select own |
| **system_settings** | Platform config (maintenance, ingest_accept) | `id` (default 'default'), `maintenance_mode`, `ingest_accept` | Yes – no policies (service role only) |

**Existing enum**

- `public.user_role`: `'customer' | 'staff' | 'staff_plus' | 'administrator'`

**SIM cards**

- No local SIM table. SIMs are managed via **Simbase API** (see `web/app/api/admin/stock/simcards/`). ICCID/state come from Simbase. We only need to **record which ICCID is assigned to which order** (e.g. in order line/fulfilment), not duplicate SIM data.

---

## 2. Target Concepts vs Existing

| Concept | Existing? | Action |
|--------|-----------|--------|
| **A) Product catalog** | No | Optional small table or config; MVP can hardcode SKUs (e.g. “GPS Tracker + SIM monthly/yearly”). |
| **B) Customer orders** | No | **New table: `orders`** (user_id, status, shipping from profiles or snapshot, totals, stripe ref later). |
| **C) Order line items** | No | **New table: `order_items`** (order_id, product/sku, quantity, assigned_tracker_stock_id, assigned_sim_iccid, activation_token_id). |
| **D) Stock – GPS** | Yes: `tracker_stock` | **Reuse.** Add `order_id` (nullable FK) when assigned; keep `status` (in_stock → assigned → sold). |
| **E) Stock – SIM** | No local table | **No new SIM table.** Store `assigned_sim_iccid` on order_items; Simbase remains source of truth for SIM state. |
| **F) Fulfilment** | No | Fulfilment = assign tracker (tracker_stock row) + SIM (ICCID string) to order_item; create activation_token; update tracker_stock.status and order_id. |
| **G) Activation tokens** | No | **New table: `activation_tokens`** (code unique, order_id, user_id, device_id nullable, sim_iccid, used_at; one-time use). |
| **H) Subscriptions** | No | Defer; later Stripe + optional `subscriptions` table. |
| **I) Roles** | Yes: `user_roles` | **Reuse.** Already Customer / Staff / StaffPlus / Administrator. |

---

## 3. What We Can Reuse

- **user_roles** – No change. Use for Staff / StaffPlus / Administrator (order list, assign, ship).
- **profiles** – Shipping address and mobile for checkout/orders. Optionally snapshot into `orders` at creation.
- **tracker_stock** – Single source for GPS tracker inventory. Add nullable `order_id` (and optionally `assigned_at`) to link to order when status = assigned/sold.
- **devices** – After activation, device `id` = tracker identifier; we link device to `user_id`. No schema change required; app creates/updates device on activate.
- **Naming** – Keep `tracker_stock` (do not add `gps_stock` or duplicate). No `sim_stock`; use Simbase + store assigned ICCID on order_items.

---

## 4. What We Must Add (columns / indexes / policies)

**tracker_stock**

- Add `order_id uuid null references orders(id)` (after `orders` exists) or add in same migration as `orders`.
- Add index `idx_tracker_stock_order_id` for lookups by order.
- Keep existing `status` and indexes; RLS stays as-is (admin-only via service role).

**orders** (new)

- Columns: `id` (uuid PK), `user_id` (FK auth.users), `status` (e.g. pending, paid, fulfilled, shipped, activated, cancelled), `shipping_*` snapshot or FK to profile, `total_cents`/`currency`, `stripe_payment_id` (nullable), `tracking_number` (nullable), `created_at`, `updated_at`.
- RLS: customers see own orders; staff+ read all; staff_plus+ update (assign, ship).

**order_items** (new)

- Columns: `id`, `order_id` (FK orders), `product_sku` (text), `quantity` (default 1), `assigned_tracker_stock_id` (FK tracker_stock nullable), `assigned_sim_iccid` (text nullable), `activation_token_id` (FK activation_tokens nullable).
- RLS: via order ownership / staff.

**activation_tokens** (new)

- Columns: `id`, `code` (text unique, for URL/QR), `order_id` (FK orders), `user_id` (FK auth.users), `tracker_stock_id` (FK tracker_stock), `sim_iccid` (text), `device_id` (text nullable – set when device created/linked), `used_at` (timestamptz nullable).
- RLS: user can read own token (by code or user_id); service/API can update used_at and device_id.

---

## 5. New Tables Required (no existing equivalent)

1. **orders** – Customer orders (user, status, shipping, payment ref, tracking).
2. **order_items** – Line items per order; links to assigned tracker_stock + SIM ICCID + activation token.
3. **activation_tokens** – One-time codes for post-delivery activation; link order + user + tracker + SIM.

Optional (MVP can skip or hardcode):

4. **products** – Small catalog (sku, name, type: hardware | sim_plan, price_cents, billing_interval). If omitted, product_sku on order_items is free text.

---

## 6. Migration Order

1. Create **orders** (and order status enum if desired).
2. Create **order_items** (references orders; assigned_tracker_stock_id, assigned_sim_iccid, activation_token_id nullable initially).
3. Create **activation_tokens** (references orders, auth.users, tracker_stock; code unique).
4. **ALTER tracker_stock** add `order_id` nullable FK to orders, index.
5. Add RLS policies for orders, order_items, activation_tokens.
6. (Optional) Add **products** table and FK from order_items.

---

## 7. Summary

| Item | Action |
|------|--------|
| Roles | Reuse `user_roles` |
| Profiles | Reuse for address/mobile |
| GPS stock | Reuse `tracker_stock`; add `order_id` |
| SIM stock | No local table; Simbase + ICCID on order_items |
| Orders | New table `orders` |
| Order items / fulfilment | New table `order_items` |
| Activation | New table `activation_tokens` |
| Product catalog | Optional; MVP can hardcode SKUs in app |

No duplicate concepts (no second “stock” or “order” table). Naming kept consistent with existing (`tracker_stock`, `user_roles`, `profiles`, `devices`).
