import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripeServer, STRIPE_WEBHOOK_SECRET, STRIPE_PRODUCT_SIM } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/admin-auth';

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
        .select('id, status, user_id')
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
        const anchor = new Date();
        if (simPlan === 'yearly') anchor.setFullYear(anchor.getFullYear() + 1);
        else anchor.setMonth(anchor.getMonth() + 1);

        try {
          const price = await stripe.prices.create({
            product: STRIPE_PRODUCT_SIM,
            currency: 'aud',
            unit_amount: unitAmount,
            recurring: { interval: simPlan === 'yearly' ? 'year' : 'month' },
          });

          const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: price.id }],
            billing_cycle_anchor: Math.floor(anchor.getTime() / 1000),
            proration_behavior: 'none',
            metadata: { order_id: orderId, sim_plan: simPlan },
          });
          const sub = subscription as Stripe.Subscription & { current_period_end?: number };
          const periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : anchor.toISOString();

          await admin.from('orders').update({
            stripe_subscription_id: sub.id,
            subscription_next_billing_date: periodEnd,
            updated_at: new Date().toISOString(),
          }).eq('id', orderId);

          logEvent(admin, orderId, 'subscription.created', event.id, sub.id, {
            subscription_id: sub.id,
            sim_plan: simPlan,
            price_id: price.id,
            unit_amount: unitAmount,
            current_period_end: periodEnd,
          });
        } catch (subErr) {
          const errMsg = subErr instanceof Error ? subErr.message : String(subErr);
          logEvent(admin, orderId, 'subscription.create_failed', event.id, null, { error: errMsg, sim_plan: simPlan });
        }
      }
      return NextResponse.json({ received: true });
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id?: string } };
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subscriptionId) return NextResponse.json({ received: true });

      const { data: orderRow } = await admin
        .from('orders')
        .select('id')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
      const orderId = orderRow?.id ?? null;

      const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null;
      if (orderId && periodEnd) {
        await admin.from('orders').update({
          subscription_next_billing_date: periodEnd,
          updated_at: new Date().toISOString(),
        }).eq('id', orderId);
      }

      logEvent(admin, orderId, event.type, event.id, invoice.id, {
        subscription_id: subscriptionId,
        period_end: periodEnd,
        amount_paid: invoice.amount_paid,
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
