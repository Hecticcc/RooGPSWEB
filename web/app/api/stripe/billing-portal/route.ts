import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { getStripeServer } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/billing-portal
 * Creates a Stripe Customer Billing Portal session so the customer can update payment method
 * or pay overdue subscription. Returns { url } to redirect the customer.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });

  const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('user_id', user.id).single();
  const customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    return NextResponse.json(
      { error: 'No billing account found. Place an order first or contact support.' },
      { status: 400 }
    );
  }

  const stripe = getStripeServer();
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'http://localhost:3000';
  const baseUrl = origin.replace(/\/$/, '');

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/account/subscription`,
  });

  return NextResponse.json({ url: session.url });
}
