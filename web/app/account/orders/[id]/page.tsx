'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import {
  ORDER_PROGRESS_STEPS,
  getStatusLabel,
  getStatusStepIndex,
  getOrderCardStatusClass,
  isCancelled,
} from '@/lib/order-status';

type OrderDetail = {
  order: {
    id: string;
    order_number: string | null;
    status: string;
    shipping_name: string | null;
    shipping_mobile: string | null;
    shipping_address_line1: string | null;
    shipping_address_line2: string | null;
    shipping_suburb: string | null;
    shipping_state: string | null;
    shipping_postcode: string | null;
    shipping_country: string | null;
    total_cents: number | null;
    discount_cents?: number | null;
    currency: string;
    tracking_number: string | null;
    sim_plan?: string | null;
    subscription_next_billing_date?: string | null;
    created_at: string;
    updated_at: string;
    items?: {
      id: string;
      product_sku: string;
      quantity: number;
      unit_price_cents: number | null;
      assigned_sim_iccid: string | null;
    }[];
  };
};

function OrderProgressTimeline({ status }: { status: string }) {
  if (isCancelled(status)) {
    return (
      <div className="my-orders-timeline">
        <span className={getOrderCardStatusClass(status)}>{getStatusLabel(status)}</span>
      </div>
    );
  }
  const currentIndex = getStatusStepIndex(status);
  return (
    <div className="my-orders-timeline my-orders-timeline--detail" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={ORDER_PROGRESS_STEPS.length}>
      {ORDER_PROGRESS_STEPS.map((step, i) => {
        const done = i <= currentIndex;
        return (
          <div
            key={step}
            className={`my-orders-timeline__step ${done ? 'my-orders-timeline__step--done' : ''} ${i === currentIndex ? 'my-orders-timeline__step--current' : ''} ${i > 0 && currentIndex >= i - 1 ? 'my-orders-timeline__step--prev-done' : ''}`}
          >
            <div className="my-orders-timeline__step-head">
              {i > 0 && <span className="my-orders-timeline__connector my-orders-timeline__connector--left" />}
              <span className="my-orders-timeline__dot" />
              {i < ORDER_PROGRESS_STEPS.length - 1 && <span className="my-orders-timeline__connector my-orders-timeline__connector--right" />}
            </div>
            <span className="my-orders-timeline__label">{getStatusLabel(step)}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'AUD',
  }).format(cents / 100);
}

export default function AccountOrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<{
    tracking_id: string;
    events: { location?: string; description?: string; date?: string }[];
    track_url: string | null;
    error?: string;
    message?: string;
  } | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      fetch(`/api/orders/${id}`, { credentials: 'include', cache: 'no-store', headers })
        .then((r) => {
          if (!r.ok) throw new Error(r.status === 404 ? 'Order not found' : 'Failed to load');
          return r.json();
        })
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [id]);

  useEffect(() => {
    if (!id || !data?.order?.tracking_number?.trim()) {
      setTracking(null);
      return;
    }
    setTrackingLoading(true);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      fetch(`/api/orders/${id}/tracking`, { credentials: 'include', cache: 'no-store', headers })
        .then((r) => r.json())
        .then((d) => setTracking(d))
        .catch(() => setTracking(null))
        .finally(() => setTrackingLoading(false));
    });
  }, [id, data?.order?.tracking_number]);

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>;
  if (!data?.order) return null;

  const o = data.order;
  const shippingLines = [
    o.shipping_address_line1,
    o.shipping_address_line2,
    o.shipping_suburb,
    [o.shipping_state, o.shipping_postcode].filter(Boolean).join(' '),
    o.shipping_country,
  ].filter(Boolean);

  return (
    <div className="dashboard-orders my-orders-page my-orders-detail-page">
      <nav className="my-orders-breadcrumb" aria-label="Breadcrumb">
        <Link href="/track">Dashboard</Link>
        <span className="my-orders-breadcrumb-sep">›</span>
        <Link href="/account/orders">My orders</Link>
        <span className="my-orders-breadcrumb-sep">›</span>
        <span>Order {o.order_number ?? o.id.slice(0, 8)}</span>
      </nav>

      <div className="my-orders-detail-card">
        <header className="my-orders-detail-header">
          <h1 className="my-orders-detail-title">Order {o.order_number ?? o.id.slice(0, 8)}</h1>
          <p className="my-orders-detail-dates">
            Placed {new Date(o.created_at).toLocaleString()}
            {o.updated_at !== o.created_at && (
              <> · Updated {new Date(o.updated_at).toLocaleString()}</>
            )}
          </p>
          <div className="my-orders-detail-status-row">
            <span className={getOrderCardStatusClass(o.status)}>{getStatusLabel(o.status)}</span>
            <span className="my-orders-detail-meta">Items: {(o.items ?? []).length}</span>
            <span className="my-orders-detail-meta">Total: {formatMoney(o.total_cents, o.currency)}</span>
          </div>
        </header>

        <section className="my-orders-detail-section">
          <h2 className="my-orders-detail-section-title">Order progress</h2>
          <OrderProgressTimeline status={o.status} />
        </section>

        {o.subscription_next_billing_date && (
          <section className="my-orders-detail-section">
            <h2 className="my-orders-detail-section-title">SIM subscription</h2>
            <div className="my-orders-detail-section-body">
              <p className="my-orders-detail-muted">
                Next billing: {new Date(o.subscription_next_billing_date).toLocaleDateString(undefined, { dateStyle: 'long' })}
                {o.sim_plan && ` (${o.sim_plan === 'yearly' ? 'yearly' : 'monthly'} plan)`}
              </p>
            </div>
          </section>
        )}

        <section className="my-orders-detail-section">
          <h2 className="my-orders-detail-section-title">Delivery details</h2>
          <div className="my-orders-detail-section-body">
            {o.shipping_name && <p className="my-orders-detail-name">{o.shipping_name}</p>}
            {o.shipping_mobile && <p className="my-orders-detail-muted">{o.shipping_mobile}</p>}
            {shippingLines.length > 0 ? (
              <p className="my-orders-detail-address">{shippingLines.join(', ')}</p>
            ) : (
              <p className="my-orders-detail-muted">No address provided</p>
            )}
          </div>
        </section>

        {o.tracking_number && (
          <section className="my-orders-detail-section">
            <h2 className="my-orders-detail-section-title">Tracking</h2>
            <div className="my-orders-detail-section-body">
              <p className="my-orders-detail-tracking">
                <strong>Tracking number:</strong> <span className="admin-mono">{o.tracking_number}</span>
              </p>
              {trackingLoading ? (
                <p className="my-orders-detail-muted">Loading tracking…</p>
              ) : tracking ? (
                <>
                  {tracking.events && tracking.events.length > 0 && (
                    <ul className="my-orders-tracking-events">
                      {tracking.events.map((e, i) => (
                        <li key={i} className="my-orders-tracking-event">
                          <span className="my-orders-tracking-event__desc">{e.description ?? '—'}</span>
                          {e.location && <span className="my-orders-tracking-event__loc">{e.location}</span>}
                          {e.date && (
                            <span className="my-orders-tracking-event__date">
                              {new Date(e.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {tracking.message && tracking.events?.length === 0 && (
                    <p className="my-orders-detail-muted">{tracking.message}</p>
                  )}
                  {tracking.track_url && (
                    <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                      <a href={tracking.track_url} target="_blank" rel="noopener noreferrer" className="my-orders-tracking-link">
                        Track on Australia Post →
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  <a
                    href={`https://auspost.com.au/track/${encodeURIComponent(o.tracking_number)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="my-orders-tracking-link"
                  >
                    Track on Australia Post →
                  </a>
                </p>
              )}
            </div>
          </section>
        )}

        <section className="my-orders-detail-section">
          <h2 className="my-orders-detail-section-title">Items in order</h2>
          <div className="my-orders-detail-section-body">
            <ul className="my-orders-items-list">
              {(o.items ?? []).map((item) => (
                <li key={item.id} className="my-orders-item">
                  <span className="my-orders-item__name">{item.product_sku}</span>
                  <span className="my-orders-item__qty">× {item.quantity}</span>
                  {item.unit_price_cents != null && (
                    <span className="my-orders-item__price">
                      {formatMoney(item.unit_price_cents * item.quantity, o.currency)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="my-orders-detail-section">
          <h2 className="my-orders-detail-section-title">Order summary</h2>
          <div className="my-orders-detail-section-body my-orders-summary">
            {(o.discount_cents ?? 0) > 0 && (
              <div className="my-orders-summary__row">
                <span>Discount</span>
                <span className="my-orders-summary__discount">−{formatMoney(o.discount_cents, o.currency)}</span>
              </div>
            )}
            <div className="my-orders-summary__row my-orders-summary__total">
              <span>Total</span>
              <span>{formatMoney(o.total_cents, o.currency)} {o.currency}</span>
            </div>
          </div>
        </section>

        <div className="my-orders-detail-actions">
          <Link href="/account/orders" className="admin-btn">← Back to my orders</Link>
          {o.status === 'shipped' && (
            <Link href="/activate" className="admin-btn admin-btn--primary">Activate your device</Link>
          )}
        </div>
      </div>
    </div>
  );
}
