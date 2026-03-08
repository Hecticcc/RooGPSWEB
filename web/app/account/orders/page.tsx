'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import {
  ORDER_PROGRESS_STEPS,
  getStatusLabel,
  getStatusStepIndex,
  getOrderCardStatusClass,
  isCancelled,
} from '@/lib/order-status';

type Order = {
  id: string;
  order_number: string | null;
  status: string;
  total_cents: number | null;
  discount_cents?: number | null;
  currency: string;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
  items_count?: number;
};

function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'AUD',
  }).format(cents / 100);
}

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
    <div className="my-orders-timeline" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={ORDER_PROGRESS_STEPS.length}>
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

export default function AccountOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      fetch('/api/orders', { credentials: 'include', cache: 'no-store', headers })
        .then((r) => {
          if (!r.ok) throw new Error('Failed to load orders');
          return r.json();
        })
        .then((data) => setOrders(data.orders ?? []))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, []);

  const filtered = orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    const num = o.order_number ?? o.id.slice(0, 8);
    if (search.trim() && !num.toLowerCase().includes(search.toLowerCase().trim())) return false;
    return true;
  });

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <div className="dashboard-orders my-orders-page">
      <header className="my-orders-header">
        <div className="my-orders-header-top">
          <nav className="my-orders-breadcrumb" aria-label="Breadcrumb">
            <Link href="/track">Dashboard</Link>
            <span className="my-orders-breadcrumb-sep">›</span>
            <span>My orders</span>
          </nav>
        </div>
        <h1 className="my-orders-title">My orders</h1>
        <p className="my-orders-subtitle">View status and details for all your orders.</p>

        {orders.length > 0 && (
          <div className="my-orders-toolbar">
            <div className="my-orders-filters">
              {['all', 'pending', 'paid', 'fulfilled', 'processing', 'shipped', 'activated', 'suspended'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`my-orders-filter-btn ${filter === s ? 'my-orders-filter-btn--active' : ''}`}
                  onClick={() => setFilter(s)}
                >
                  {s === 'all' ? 'All orders' : getStatusLabel(s)}
                </button>
              ))}
            </div>
            <div className="my-orders-search-wrap">
              <input
                type="search"
                className="my-orders-search admin-input"
                placeholder="Search by order number…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search orders"
              />
            </div>
          </div>
        )}
      </header>

      {orders.length === 0 ? (
        <div className="my-orders-empty">
          <p>No orders yet.</p>
          <Link href="/order" className="admin-btn admin-btn--primary">Place an order</Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="my-orders-empty">
          <p>No orders match your filter or search.</p>
        </div>
      ) : (
        <div className="my-orders-table-wrap admin-table-wrap">
          <table className="admin-table my-orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th aria-label="Show process" style={{ width: 48 }} />
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <React.Fragment key={o.id}>
                  <tr className="my-orders-table-row">
                    <td>
                      <span className="my-orders-table-number">{o.order_number ?? o.id.slice(0, 8)}</span>
                    </td>
                    <td className="my-orders-table-date">
                      {new Date(o.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <span className={getOrderCardStatusClass(o.status)}>{getStatusLabel(o.status)}</span>
                    </td>
                    <td>{(o.items_count ?? 0) || '—'}</td>
                    <td className="my-orders-table-total">{formatMoney(o.total_cents, o.currency)}</td>
                    <td>
                      <button
                        type="button"
                        className="my-orders-expand-btn"
                        onClick={() => setExpandedOrderId((id) => (id === o.id ? null : o.id))}
                        aria-expanded={expandedOrderId === o.id}
                        aria-label={expandedOrderId === o.id ? 'Hide process' : 'Show process'}
                      >
                        {expandedOrderId === o.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </td>
                    <td>
                      <Link href={`/account/orders/${o.id}`} className="admin-btn my-orders-card__view-details">
                        View details
                      </Link>
                      {o.status === 'shipped' && (
                        <>
                          {' '}
                          <Link href="/activate" className="admin-btn">Activate</Link>
                        </>
                      )}
                    </td>
                  </tr>
                  {expandedOrderId === o.id && (
                    <tr className="my-orders-table-expanded">
                      <td colSpan={7} className="my-orders-table-expanded-cell">
                        <div className="my-orders-table-process">
                          <OrderProgressTimeline status={o.status} />
                          {o.tracking_number && (
                            <div className="my-orders-card__tracking">
                              <strong>Tracking:</strong> <span className="admin-mono">{o.tracking_number}</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
