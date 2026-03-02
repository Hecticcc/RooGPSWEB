import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { getStripeServer } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/checkout-session
 * Body: { order_id: string }
 * Creates a Stripe Checkout Session for the order (one-time payment for full total).
 * Returns { url } to redirect the customer to Stripe Checkout.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { order_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : null;
  if (!orderId) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, user_id, status, total_cents, currency, sim_plan')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .single();
  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.status !== 'pending') return NextResponse.json({ error: 'Order is not pending' }, { status: 400 });

  const totalCents = order.total_cents ?? 0;
  if (totalCents < 50) return NextResponse.json({ error: 'Order total too low for Stripe' }, { status: 400 });

  const stripe = getStripeServer();
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  // Get or create Stripe customer (store on profile for reuse)
  let customerId: string | null = null;
  const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('user_id', user.id).single();
  if (profile?.stripe_customer_id) {
    customerId = profile.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from('profiles').upsert(
      { user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }

  const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'http://localhost:3000';
  const baseUrl = origin.replace(/\/$/, '');

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId ?? undefined,
    client_reference_id: orderId,
    line_items: [
      {
        price_data: {
          currency: (order.currency ?? 'aud').toLowerCase(),
          unit_amount: totalCents,
          product_data: {
            name: 'RooGPS – Tracker + SIM plan',
            description: 'GPS tracker and SIM connectivity (first period included)',
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      order_id: orderId,
      sim_plan: order.sim_plan ?? 'monthly',
    },
    success_url: `${baseUrl}/account/orders?paid=1`,
    cancel_url: `${baseUrl}/order/pay?orderId=${encodeURIComponent(orderId)}&cancelled=1`,
  });

  return NextResponse.json({ url: session.url });
}
