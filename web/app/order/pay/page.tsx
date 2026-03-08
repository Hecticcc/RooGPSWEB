'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Logo from '@/components/Logo';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { getStatusLabel } from '@/lib/order-status';

type Order = {
  id: string;
  order_number?: string | null;
  status: string;
  total_cents: number | null;
  currency: string;
  items?: { product_sku: string; quantity: number }[];
};

function PayPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const cancelled = searchParams.get('cancelled') === '1';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('Missing order');
      setLoading(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      fetch(`/api/orders/${orderId}`, { credentials: 'include', cache: 'no-store', headers })
        .then((r) => {
          if (!r.ok) throw new Error(r.status === 404 ? 'Order not found' : 'Failed to load');
          return r.json();
        })
        .then((data) => setOrder(data.order))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [orderId]);

  async function handlePayWithStripe() {
    if (!orderId || !order || order.status !== 'pending') return;
    setPayError(null);
    setPaying(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    try {
      const res = await fetch('/api/stripe/checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not start payment');
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="checkout-page">
        <div className="checkout-page-bg" aria-hidden="true" />
        <div className="app-loading">
          <AppLoadingIcon />
        </div>
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="checkout-page">
        <div className="checkout-page-bg" aria-hidden="true" />
        <div className="checkout-wrap">
          <p className="admin-time" style={{ color: 'var(--error)' }}>{error ?? 'Order not found'}</p>
          <Link href="/order">Back to checkout</Link>
        </div>
      </div>
    );
  }
  if (order.status !== 'pending') {
    return (
      <div className="checkout-page">
        <div className="checkout-page-bg" aria-hidden="true" />
        <div className="checkout-wrap">
          <p className="admin-time">This order is already {getStatusLabel(order.status)}.</p>
          <Link href="/account/orders">View my orders</Link>
        </div>
      </div>
    );
  }

  const total = order.total_cents != null ? (order.total_cents / 100).toFixed(2) : '—';

  return (
    <div className="checkout-page">
      <div className="checkout-page-bg" aria-hidden="true" />
      <div className="checkout-wrap">
        <header className="checkout-header">
          <div className="checkout-header-inner">
            <Link href="/" className="checkout-header-logo">
              <Logo size={36} wide />
            </Link>
            <h1 className="checkout-title">Payment</h1>
            <Link href="/order" className="checkout-back-link">← Back to checkout</Link>
          </div>
          <p className="checkout-subtitle">Complete your order securely with Stripe.</p>
        </header>

        {cancelled && (
          <p className="checkout-voucher-error" style={{ marginBottom: '1rem' }}>
            Payment was cancelled. You can try again below.
          </p>
        )}

        <div className="pay-page-grid">
          <section className="pay-page-main">
            <div className="checkout-card pay-card">
              <h2 className="checkout-card-heading">Payment</h2>
              <p className="checkout-card-desc">You will be redirected to Stripe Checkout to pay securely. Your card is charged once for the amount below. Your SIM subscription is set up separately—if you have a free trial, you&apos;ll be charged for SIM after the trial unless you cancel.</p>
              {payError && <p className="checkout-voucher-error">{payError}</p>}
              <button
                type="button"
                className="admin-btn admin-btn--primary checkout-btn"
                onClick={handlePayWithStripe}
                disabled={paying}
              >
                {paying ? 'Redirecting…' : `Pay $${total}`}
              </button>
            </div>
          </section>

          <aside className="pay-page-sidebar">
            <div className="checkout-summary-card pay-summary-card">
              <h2 className="checkout-summary-title">Order summary</h2>
              <p className="pay-order-id">Order #{order.order_number ?? order.id.slice(0, 8)}</p>
              <div className="checkout-summary-divider" />
              <div className="checkout-summary-total">
                <span>Total</span>
                <span>${total} {order.currency}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function OrderPayPage() {
  return (
    <Suspense fallback={
      <div className="checkout-page">
        <div className="checkout-page-bg" aria-hidden="true" />
        <div className="app-loading"><AppLoadingIcon /></div>
      </div>
    }>
      <PayPageContent />
    </Suspense>
  );
}
