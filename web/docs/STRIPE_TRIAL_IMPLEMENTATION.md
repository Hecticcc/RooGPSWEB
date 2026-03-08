# Stripe subscription trial – implementation summary

## Admin trial setting

- **Where it lives:** `system_settings` table (single row `id = 'default'`). New columns:
  - `stripe_trial_enabled` (boolean, default false)
  - `stripe_trial_default_months` (integer, 0–24 or null)
  - `stripe_trial_updated_at`, `stripe_trial_updated_by`
- **API:** `GET/PATCH /api/admin/system` (PATCH is administrator-only). Response includes `stripe_trial_enabled`, `stripe_trial_default_months`.
- **UI:** Admin → System. “Subscription Trial Settings” section: “Enable free trial” checkbox, “Default trial length (months)” (0–24), helper text that it applies to new subscriptions only, Save + toast.

## How trial months are applied to new subscriptions

- **When:** In the Stripe webhook on `checkout.session.completed`, after the order is marked paid and before creating the Stripe subscription.
- **Logic:** Server reads `system_settings` (`stripe_trial_enabled`, `stripe_trial_default_months`). If trial is enabled and `stripe_trial_default_months` is a number > 0, it computes `trial_end` as **signup date + N calendar months** (via `lib/trial.ts`: `trialEndUnixFromMonths(now, N)`), and creates the subscription with `trial_end` (no `billing_cycle_anchor` in that case). Otherwise it keeps the existing behaviour: no trial, `billing_cycle_anchor` set as before.
- **Existing subscriptions:** Never modified when the admin later changes the default trial months; only the row in `system_settings` is updated.

## Where the applied trial is stored per subscription

- **Table:** `orders` (each order is the local “subscription” record for that SIM order).
- **Columns added (migration `20250324000002_orders_trial_and_billing_state.sql`):**
  - `trial_enabled_at_signup` (boolean)
  - `trial_months_applied` (integer, 0–24 or null)
  - `trial_started_at`, `trial_ends_at` (timestamptz)
  - `stripe_subscription_status` (text, from Stripe)
  - `billing_state_normalized` (text: `trialing` | `active` | `past_due` | `unpaid` | `cancelled` | `incomplete` | `incomplete_expired`)
- These are set when the subscription is created (in the webhook) and updated by `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`. Trial fields are **never** retroactively changed for existing subscriptions.

## How trialing transitions to active billing

- **Stripe:** When the trial ends, Stripe charges the saved payment method and moves the subscription from `trialing` to `active` (or to `past_due`/`unpaid` if the charge fails).
- **Webhooks:**
  - `customer.subscription.updated`: We update `orders.stripe_subscription_status` and `orders.billing_state_normalized` from the subscription status (e.g. trialing → active).
  - `invoice.paid`: We update `subscription_next_billing_date`; if the order was suspended we set `status = 'paid'` and `billing_state_normalized = 'active'` and re-enable SIMs.
- **Service access:** Trialing is treated as active: `hasActiveSimSubscription` and “active” subscription lists consider `billing_state_normalized === 'trialing'` as active. The suspend-overdue cron explicitly excludes orders with `billing_state_normalized = 'trialing'`.

## How failed post-trial payments connect to overdue suspension

- **`invoice.payment_failed`:** We find the order by `stripe_subscription_id`, set `status = 'suspended'`, `billing_state_normalized = 'past_due'`, disable the order’s SIM(s) in Simbase (same as the existing “suspend on overdue” behaviour). No separate trial-failure path.
- **Suspend-overdue cron** (`/api/internal/subscription/suspend-overdue`): Continues to suspend orders that are past due (by `subscription_next_billing_date` and active status). We exclude orders with `billing_state_normalized = 'trialing'` so trial-period orders are never suspended by the cron. When the trial ends and the first charge fails, Stripe sends `invoice.payment_failed`, and we suspend and disable SIMs in that handler; the existing overdue/suspension UI and “Pay now” flow are used as today.

## Files touched (summary)

- **Migrations:** `20250324000001_stripe_trial_settings.sql`, `20250324000002_orders_trial_and_billing_state.sql`
- **Admin:** `app/api/admin/system/route.ts`, `app/admin/system/page.tsx`
- **Webhook:** `app/api/stripe/webhook/route.ts` (trial subscription creation, `customer.subscription.*`, `invoice.payment_failed`, `customer.subscription.deleted`, `normalizeBillingState`)
- **Subscription API:** `app/api/subscription/route.ts` (trial/billing fields, trialing = active)
- **Internal cron:** `app/api/internal/subscription/suspend-overdue/route.ts` (exclude trialing, set `billing_state_normalized` on suspend)
- **Customer UI:** `app/account/subscription/page.tsx` (trial banner, trial badge, trial_ends_soon)
- **Admin UI:** `app/admin/subscriptions/page.tsx` (trial in Manage modal), `app/admin/orders/[id]/page.tsx` (trial/billing in Payment & subscription card), `app/api/admin/subscriptions/route.ts` (trial fields in list)
- **Lib:** `lib/trial.ts` (trial end from months), `lib/trial.test.ts` (unit tests)

## Trial ending email / notification

- **`customer.subscription.trial_will_end`:** Logged in `stripe_payment_log` with `order_id` and `user_id`. Placeholder left for sending a “Your free trial ends soon” email and in-app notification (e.g. wire to Resend or your notification service when ready).
