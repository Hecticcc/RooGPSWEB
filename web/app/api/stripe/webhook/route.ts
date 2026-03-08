import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripeServer, STRIPE_WEBHOOK_SECRET, STRIPE_PRODUCT_SIM } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { setSimbaseSimState } from '@/lib/simbase';
import { trialEndUnixFromMonths } from '@/lib/trial';
import { scheduleEmailEvent } from '@/lib/email/emailDispatcher';
import { EMAIL_EVENTS } from '@/lib/email/emailEvents';
import { getEmailForUserId } from '@/lib/email/getRecipients';

export const dynamic = 'force-dynamic';

function logEvent(admin: ReturnType<typeof createServiceRoleClient>, orderId: string | null, eventType: string, stripeEventId: string, stripeObjectId: string | null, payload: Record<string, unknown>) {
  if (!admin) return;
  const p = admin.from('stripe_payment_log').insert({
    order_id: orderId,
    event_type: eventType,
    stripe_event_id: stripeEventId,
    stripe_object_id: stripeObjectId,
    payload,
  });
  void Promise.resolve(p).then(() => {}, () => {});
}

const BILLING_STATES = ['trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'incomplete', 'incomplete_expired'] as const;
function normalizeBillingState(stripeStatus: string): (typeof BILLING_STATES)[number] {
  const s = (stripeStatus ?? '').toLowerCase();
  if (BILLING_STATES.includes(s as (typeof BILLING_STATES)[number])) return s as (typeof BILLING_STATES)[number];
  if (s === 'canceled') return 'cancelled';
  return 'active';
}

/**
 * POST /api/stripe/webhook
 * Stripe sends events here. Verify signature, then:
 * - checkout.session.completed: mark order paid, store stripe_payment_id, create subscription for SIM (recurring only).
 * - invoice.paid: update order subscription_next_billing_date when it's a renewal.
 */
export async function POST(request: Request) {
  const stripe = getStripeServer();
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  if (!STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: 'Webhook secret not set' }, { status: 503 });

  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.client_reference_id ?? session.metadata?.order_id ?? null;
      if (!orderId) {
        logEvent(admin, null, event.type, event.id, session.id, { message: 'No order_id in session' });
        return NextResponse.json({ received: true });
      }

      const simPlan = (session.metadata?.sim_plan === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly';
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

      const { data: order, error: fetchErr } = await admin
        .from('orders')
        .select('id, status, user_id, order_number, created_at')
        .eq('id', orderId)
        .single();
      if (fetchErr || !order) {
        logEvent(admin, orderId, event.type, event.id, session.id, { error: fetchErr?.message ?? 'Order not found' });
        return NextResponse.json({ received: true });
      }
      if (order.status !== 'pending') {
        logEvent(admin, orderId, event.type, event.id, session.id, { message: 'Order already processed', status: order.status });
        return NextResponse.json({ received: true });
      }

      await admin.from('orders').update({
        status: 'paid',
        stripe_payment_id: paymentIntentId ?? session.payment_intent ?? session.id,
        updated_at: new Date().toISOString(),
      }).eq('id', orderId);

      logEvent(admin, orderId, event.type, event.id, session.id, {
        payment_intent: paymentIntentId,
        sim_plan: simPlan,
        amount_total: session.amount_total,
      });

      const orderEmail = await getEmailForUserId((order as { user_id: string }).user_id);
      if (orderEmail) {
        scheduleEmailEvent(EMAIL_EVENTS.ORDER_CONFIRMATION, {
          orderId: String(order.id),
          orderNumber: (order as { order_number?: string }).order_number ?? String(order.id),
          recipientEmail: orderEmail,
          orderDate: (order as { created_at?: string }).created_at ?? new Date().toISOString(),
        });
      }

      // Create subscription for SIM only (recurring); price from product_pricing (DB) so sales/price changes apply without env changes
      const sku = simPlan === 'yearly' ? 'sim_yearly' : 'sim_monthly';
      const { data: pricingRow } = await admin
        .from('product_pricing')
        .select('price_cents, sale_price_cents')
        .eq('sku', sku)
        .single();

      const unitAmount = pricingRow
        ? (pricingRow.sale_price_cents != null && pricingRow.sale_price_cents <= (pricingRow.price_cents ?? 0)
            ? pricingRow.sale_price_cents
            : pricingRow.price_cents ?? 0)
        : 0;

      if (!STRIPE_PRODUCT_SIM || !session.customer) {
        if (session.customer && !STRIPE_PRODUCT_SIM) {
          logEvent(admin, orderId, 'subscription.skipped', event.id, null, { reason: 'STRIPE_PRODUCT_SIM not set' });
        }
      } else if (unitAmount < 50) {
        logEvent(admin, orderId, 'subscription.skipped', event.id, null, { reason: 'Invalid or missing product_pricing', sku, unit_amount: unitAmount });
      }

      if (STRIPE_PRODUCT_SIM && session.customer && unitAmount >= 50) {
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
        const now = new Date();
        let trialEndUnix: number | undefined;
        let trialMonthsApplied: number | null = null;
        const { data: sysSettings } = await admin
          .from('system_settings')
          .select('stripe_trial_enabled, stripe_trial_default_months')
          .eq('id', 'default')
          .single();
        const trialEnabled = (sysSettings as { stripe_trial_enabled?: boolean } | null)?.stripe_trial_enabled === true;
        const trialDefaultMonths = (sysSettings as { stripe_trial_default_months?: number | null } | null)?.stripe_trial_default_months;
        if (trialEnabled && typeof trialDefaultMonths === 'number' && trialDefaultMonths > 0) {
          trialEndUnix = trialEndUnixFromMonths(now, trialDefaultMonths);
          trialMonthsApplied = trialDefaultMonths;
        }
        const anchor = new Date(now);
        if (trialEndUnix != null) {
          anchor.setTime(trialEndUnix * 1000);
        } else {
          if (simPlan === 'yearly') anchor.setFullYear(anchor.getFullYear() + 1);
          else anchor.setMonth(anchor.getMonth() + 1);
        }

        try {
          const price = await stripe.prices.create({
            product: STRIPE_PRODUCT_SIM,
            currency: 'aud',
            unit_amount: unitAmount,
            recurring: { interval: simPlan === 'yearly' ? 'year' : 'month' },
          });

          const subscriptionParams: {
            customer: string;
            items: Stripe.SubscriptionCreateParams.Item[];
            billing_cycle_anchor?: number;
            trial_end?: number;
            proration_behavior: 'none' | 'create_prorations';
            metadata: Record<string, string>;
          } = {
            customer: customerId,
            items: [{ price: price.id }],
            proration_behavior: 'none',
            metadata: { order_id: orderId, sim_plan: simPlan },
          };
          if (trialEndUnix != null) {
            subscriptionParams.trial_end = trialEndUnix;
          } else {
            subscriptionParams.billing_cycle_anchor = Math.floor(anchor.getTime() / 1000);
          }

          const subscription = await stripe.subscriptions.create(subscriptionParams);
          const sub = subscription as Stripe.Subscription & { current_period_end?: number; trial_end?: number | null };
          const periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : anchor.toISOString();
          const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

          const orderUpdates: Record<string, unknown> = {
            stripe_subscription_id: sub.id,
            stripe_subscription_status: sub.status,
            billing_state_normalized: sub.status === 'trialing' ? 'trialing' : (sub.status === 'active' ? 'active' : sub.status),
            subscription_next_billing_date: periodEnd,
            updated_at: new Date().toISOString(),
          };
          if (trialMonthsApplied != null && sub.status === 'trialing') {
            (orderUpdates as Record<string, unknown>).trial_enabled_at_signup = true;
            (orderUpdates as Record<string, unknown>).trial_months_applied = trialMonthsApplied;
            (orderUpdates as Record<string, unknown>).trial_started_at = now.toISOString();
            (orderUpdates as Record<string, unknown>).trial_ends_at = trialEndsAt;
          }
          await admin.from('orders').update(orderUpdates).eq('id', orderId);

          logEvent(admin, orderId, 'subscription.created', event.id, sub.id, {
            subscription_id: sub.id,
            sim_plan: simPlan,
            price_id: price.id,
            unit_amount: unitAmount,
            current_period_end: periodEnd,
            trial_end: trialEndUnix ?? null,
            trial_months_applied: trialMonthsApplied,
          });

          const billingRecipient = await getEmailForUserId((order as { user_id: string }).user_id);
          if (billingRecipient) {
            const planName = simPlan === 'yearly' ? 'SIM Yearly' : 'SIM Monthly';
            if (trialMonthsApplied != null && trialEndsAt) {
              scheduleEmailEvent(EMAIL_EVENTS.BILLING_TRIAL_STARTED, {
                recipientEmail: billingRecipient,
                planName,
                trialEndsAt,
                billingPeriod: simPlan === 'yearly' ? 'year' : 'month',
              });
            } else {
              scheduleEmailEvent(EMAIL_EVENTS.BILLING_SUBSCRIPTION_STARTED, {
                recipientEmail: billingRecipient,
                planName,
                nextBillingDate: periodEnd,
                billingPeriod: simPlan === 'yearly' ? 'year' : 'month',
              });
            }
          }
        } catch (subErr) {
          const errMsg = subErr instanceof Error ? subErr.message : String(subErr);
          logEvent(admin, orderId, 'subscription.create_failed', event.id, null, { error: errMsg, sim_plan: simPlan });
        }
      }
      return NextResponse.json({ received: true });
    }

    // When a subscription is created (e.g. by Stripe Checkout subscription mode or Dashboard) with our order_id in metadata, link it and sync trial/billing state.
    if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object as Stripe.Subscription & { current_period_end?: number; trial_end?: number | null };
      const orderId = subscription.metadata?.order_id ?? null;
      if (!orderId || !subscription.id) return NextResponse.json({ received: true });
      const { data: orderRow } = await admin
        .from('orders')
        .select('id, stripe_subscription_id')
        .eq('id', orderId)
        .maybeSingle();
      if (!orderRow || (orderRow as { stripe_subscription_id?: string | null }).stripe_subscription_id) return NextResponse.json({ received: true });
      const periodEndTs = subscription.current_period_end;
      const periodEnd = periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null;
      const normalized = normalizeBillingState(subscription.status);
      const updates: Record<string, unknown> = {
        stripe_subscription_id: subscription.id,
        stripe_subscription_status: subscription.status,
        billing_state_normalized: normalized,
        updated_at: new Date().toISOString(),
      };
      if (periodEnd) (updates as Record<string, unknown>).subscription_next_billing_date = periodEnd;
      if (subscription.status === 'trialing' && subscription.trial_end) {
        (updates as Record<string, unknown>).trial_started_at = subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : new Date().toISOString();
        (updates as Record<string, unknown>).trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
      }
      await admin.from('orders').update(updates).eq('id', orderId);
      logEvent(admin, orderId, 'subscription.linked', event.id, subscription.id, {
        subscription_id: subscription.id,
        current_period_end: periodEnd,
        status: subscription.status,
      });
      return NextResponse.json({ received: true });
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription & { current_period_end?: number; trial_end?: number | null };
      const orderId = subscription.metadata?.order_id ?? null;
      if (!orderId) return NextResponse.json({ received: true });
      const normalized = normalizeBillingState(subscription.status);
      const periodEndTs = subscription.current_period_end;
      const periodEnd = periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null;
      const updates: Record<string, unknown> = {
        stripe_subscription_status: subscription.status,
        billing_state_normalized: normalized,
        updated_at: new Date().toISOString(),
      };
      if (periodEnd) (updates as Record<string, unknown>).subscription_next_billing_date = periodEnd;
      await admin.from('orders').update(updates).eq('id', orderId).eq('stripe_subscription_id', subscription.id);
      logEvent(admin, orderId, 'customer.subscription.updated', event.id, subscription.id, {
        status: subscription.status,
        billing_state_normalized: normalized,
      });
      return NextResponse.json({ received: true });
    }

    if (event.type === 'customer.subscription.trial_will_end') {
      const subscription = event.data.object as Stripe.Subscription & { trial_end?: number | null };
      const orderId = subscription.metadata?.order_id ?? null;
      if (!orderId) return NextResponse.json({ received: true });
      const { data: orderRow } = await admin
        .from('orders')
        .select('id, user_id')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle();
      const uid = orderRow ? (orderRow as { user_id?: string }).user_id : null;
      const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : undefined;
      const recipient = uid ? await getEmailForUserId(uid) : null;
      if (recipient) {
        scheduleEmailEvent(EMAIL_EVENTS.BILLING_TRIAL_ENDING, {
          recipientEmail: recipient,
          planName: 'SIM subscription',
          trialEndsAt: trialEndsAt ?? '',
        });
      }
      logEvent(admin, orderId, event.type, event.id, subscription.id, {
        trial_end: subscription.trial_end,
        user_id: uid,
        email_sent: !!recipient,
      });
      return NextResponse.json({ received: true });
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } };
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subscriptionId) return NextResponse.json({ received: true });
      const { data: orderRow } = await admin
        .from('orders')
        .select('id, user_id')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
      const orderId = orderRow?.id ?? null;
      if (orderId) {
        await admin.from('orders').update({
          status: 'suspended',
          billing_state_normalized: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('id', orderId);
        const { data: tokens } = await admin
          .from('activation_tokens')
          .select('sim_iccid')
          .eq('order_id', orderId)
          .not('sim_iccid', 'is', null);
        const iccids = Array.from(new Set((tokens ?? []).map((t) => t.sim_iccid).filter(Boolean))) as string[];
        for (const iccid of iccids) {
          await setSimbaseSimState(iccid, 'disabled');
        }
        const recipient = orderRow && (orderRow as { user_id?: string }).user_id
          ? await getEmailForUserId((orderRow as { user_id: string }).user_id)
          : null;
        if (recipient) {
          scheduleEmailEvent(EMAIL_EVENTS.BILLING_PAYMENT_FAILED, {
            recipientEmail: recipient,
            planName: 'SIM subscription',
            idempotencyKey: `payment_failed:${orderId}:${invoice.id}`,
          });
        }
        logEvent(admin, orderId, event.type, event.id, invoice.id, {
          subscription_id: subscriptionId,
          suspended: true,
          sims_disabled: iccids.length,
        });
      }
      return NextResponse.json({ received: true });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const orderId = subscription.metadata?.order_id ?? null;
      if (!orderId) return NextResponse.json({ received: true });
      await admin.from('orders').update({
        stripe_subscription_status: subscription.status,
        billing_state_normalized: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', orderId).eq('stripe_subscription_id', subscription.id);
      logEvent(admin, orderId, event.type, event.id, subscription.id, { status: subscription.status });
      return NextResponse.json({ received: true });
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id?: string } };
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subscriptionId) return NextResponse.json({ received: true });

      const { data: orderRow } = await admin
        .from('orders')
        .select('id, status, user_id')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
      const orderId = orderRow?.id ?? null;
      const wasSuspended = orderRow && (orderRow as { status?: string }).status === 'suspended';

      const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null;
      if (orderId && periodEnd) {
        await admin.from('orders').update({
          subscription_next_billing_date: periodEnd,
          updated_at: new Date().toISOString(),
          ...(wasSuspended ? { status: 'paid', billing_state_normalized: 'active' } : {}),
        }).eq('id', orderId);
      }

      if (orderId && wasSuspended) {
        const { data: tokens } = await admin
          .from('activation_tokens')
          .select('sim_iccid')
          .eq('order_id', orderId)
          .not('sim_iccid', 'is', null);
        const iccids = Array.from(new Set((tokens ?? []).map((t) => t.sim_iccid).filter(Boolean))) as string[];
        for (const iccid of iccids) {
          await setSimbaseSimState(iccid, 'enabled');
        }
      }

      const recipient = orderRow && (orderRow as { user_id?: string }).user_id
        ? await getEmailForUserId((orderRow as { user_id: string }).user_id)
        : null;
      if (recipient) {
        scheduleEmailEvent(EMAIL_EVENTS.BILLING_PAYMENT_SUCCESS, {
          recipientEmail: recipient,
          planName: 'SIM subscription',
          amountCents: invoice.amount_paid ?? 0,
          currency: (invoice.currency ?? 'aud').toUpperCase(),
          nextBillingDate: periodEnd ?? undefined,
          idempotencyKey: `payment_success:${orderId}:${invoice.id}`,
        });
      }

      logEvent(admin, orderId, event.type, event.id, invoice.id, {
        subscription_id: subscriptionId,
        period_end: periodEnd,
        amount_paid: invoice.amount_paid,
        reinstated: wasSuspended,
      });
      return NextResponse.json({ received: true });
    }

    // Log other events for audit (e.g. invoice.payment_failed)
    const obj = event.data.object as { id?: string; metadata?: { order_id?: string } };
    const metaOrderId = obj.metadata?.order_id ?? null;
    logEvent(admin, metaOrderId ?? null, event.type, event.id, obj.id ?? null, { type: event.type });
    return NextResponse.json({ received: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logEvent(admin, null, 'webhook_error', event.id, null, { error: errMsg, event_type: event.type });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
