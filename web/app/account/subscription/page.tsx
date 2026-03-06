'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { CreditCard, FileText, Smartphone, Info } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { getStatusLabel } from '@/lib/order-status';

const PER_PAGE = 10;

function usePagination<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * PER_PAGE;
  const paginated = items.slice(start, start + PER_PAGE);
  return { paginated, currentPage, totalPages, hasPrev: currentPage > 1, hasNext: currentPage < totalPages };
}

type Subscription = {
  order_id: string;
  order_number: string | null;
  status: string;
  created_at: string;
  total_cents: number | null;
  currency: string;
  period: 'month' | 'year';
  next_due_estimate: string;
  days_until_due?: number;
};

type SimTrackerLink = {
  order_id: string;
  order_number: string | null;
  device_id: string;
  device_name: string | null;
  sim_linked: boolean;
  sim_status: 'enabled' | 'disabled' | 'unknown' | null;
};

type SubscriptionData = {
  hasActiveSimSubscription: boolean;
  subscriptions: Subscription[];
  simTrackerLinks: SimTrackerLink[];
};

function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'AUD',
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'payments' | 'sim'>('plan');
  const [planPage, setPlanPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [simPage, setSimPage] = useState(1);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);

  async function openBillingPortal() {
    setBillingPortalLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const r = await fetch('/api/stripe/billing-portal', { method: 'POST', credentials: 'include', headers });
      const j = await r.json();
      if (j.url) {
        window.location.href = j.url;
      } else {
        setError(j.error ?? 'Could not open billing');
      }
    } finally {
      setBillingPortalLoading(false);
    }
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      fetch('/api/subscription', { credentials: 'include', cache: 'no-store', headers })
        .then((r) => {
          if (!r.ok) throw new Error('Failed to load');
          return r.json();
        })
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>;
  if (!data) return null;

  const activeSubs = data.subscriptions.filter((s) =>
    ['paid', 'fulfilled', 'processing', 'shipped', 'activated'].includes(s.status)
  );
  const suspendedSubs = data.subscriptions.filter((s) => s.status === 'suspended');
  const showPayButton = data.subscriptions.some(
    (s) => s.status === 'suspended' || (['paid', 'fulfilled', 'processing', 'shipped', 'activated'].includes(s.status) && (s.days_until_due ?? 999) <= 14)
  );
  const planPagination = usePagination(data.subscriptions, planPage);
  const paymentsPagination = usePagination(data.subscriptions, paymentsPage);
  const invoicesPagination = usePagination(data.subscriptions, invoicesPage);
  const simPagination = usePagination(data.simTrackerLinks, simPage);

  function simStatusForOrder(orderId: string): { label: string; variant: 'enabled' | 'disabled' | 'mixed' } {
    const links = (data?.simTrackerLinks ?? []).filter((l) => l.order_id === orderId);
    if (links.length === 0) return { label: '—', variant: 'mixed' };
    const enabled = links.filter((l) => l.sim_status === 'enabled').length;
    const disabled = links.filter((l) => l.sim_status === 'disabled').length;
    if (enabled > 0 && disabled === 0) return { label: 'Enabled', variant: 'enabled' };
    if (disabled > 0 && enabled === 0) return { label: 'Disabled', variant: 'disabled' };
    return { label: `${enabled} enabled, ${disabled} disabled`, variant: 'mixed' };
  }

  function PaginationControls({
    currentPage,
    totalPages,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
  }: {
    currentPage: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  }) {
    if (totalPages <= 1) return null;
    return (
      <div className="subscription-pagination">
        <span className="subscription-pagination__info">
          Page {currentPage} of {totalPages}
        </span>
        <div className="subscription-pagination__buttons">
          <button type="button" className="admin-btn admin-btn--small" onClick={onPrev} disabled={!hasPrev}>
            Previous
          </button>
          <button type="button" className="admin-btn admin-btn--small" onClick={onNext} disabled={!hasNext}>
            Next
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-orders subscription-page">
      <header className="my-orders-header">
        <div className="my-orders-header-top">
          <nav className="my-orders-breadcrumb" aria-label="Breadcrumb">
            <Link href="/track">Dashboard</Link>
            <span className="my-orders-breadcrumb-sep">›</span>
            <span>Subscription</span>
          </nav>
        </div>
        <h1 className="my-orders-title">Subscription</h1>
        <p className="my-orders-subtitle">
          Your SIM plan, payment history and tracker links.
        </p>
      </header>

      <div className="subscription-tabs" role="tablist" aria-label="Subscription sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'plan'}
          className={`subscription-tab ${activeTab === 'plan' ? 'subscription-tab--active' : ''}`}
          onClick={() => setActiveTab('plan')}
        >
          <CreditCard size={18} aria-hidden />
          Current plan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'payments'}
          className={`subscription-tab ${activeTab === 'payments' ? 'subscription-tab--active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <FileText size={18} aria-hidden />
          Payments & invoices
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sim'}
          className={`subscription-tab ${activeTab === 'sim' ? 'subscription-tab--active' : ''}`}
          onClick={() => setActiveTab('sim')}
        >
          <Smartphone size={18} aria-hidden />
          SIM linked
        </button>
      </div>

      <div className="subscription-sections">
        {suspendedSubs.length > 0 && (
          <div className="subscription-overdue-banner" role="alert">
            <p className="subscription-overdue-banner__title">Overdue on payment – SIM suspended</p>
            <p className="subscription-overdue-banner__detail">
              Order{suspendedSubs.length > 1 ? 's' : ''}: {suspendedSubs.map((s) => s.order_number ?? s.order_id.slice(0, 8)).join(', ')}.
              Pay now to restore your SIM.
            </p>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={openBillingPortal}
              disabled={billingPortalLoading}
            >
              {billingPortalLoading ? 'Opening…' : 'Pay now'}
            </button>
          </div>
        )}
        {showPayButton && suspendedSubs.length === 0 && (
          <div className="subscription-pay-reminder">
            <div className="subscription-pay-reminder__content">
              <Info size={20} className="subscription-pay-reminder__icon" aria-hidden />
              <p className="subscription-pay-reminder__text">
                Your subscription renews in 14 days or less. Update payment method or pay early.
              </p>
            </div>
            <button
              type="button"
              className="subscription-pay-reminder__btn"
              onClick={openBillingPortal}
              disabled={billingPortalLoading}
            >
              {billingPortalLoading ? 'Opening…' : 'Pay invoice'}
            </button>
          </div>
        )}
        {activeTab === 'plan' && (
        <section className="subscription-section subscription-section--plan" role="tabpanel" aria-labelledby="subscription-tab-plan">
          <h2 id="subscription-tab-plan" className="subscription-section-title">
            <CreditCard size={20} aria-hidden />
            Current plan
          </h2>
          {data.subscriptions.length === 0 ? (
            <div className="subscription-card subscription-card--empty">
              <p>No active SIM subscription.</p>
              <Link href="/order" className="admin-btn admin-btn--primary">
                View plans
              </Link>
            </div>
          ) : (
            <>
              <div className="subscription-table-wrap">
                <table className="admin-table subscription-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Order</th>
                      <th>Status</th>
                      <th>SIM status</th>
                      <th>Next due (estimated)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {planPagination.paginated.map((s) => (
                      <tr key={s.order_id}>
                        <td>{s.period === 'year' ? 'Yearly SIM plan' : 'Monthly SIM plan'}</td>
                        <td>
                          <Link href={`/account/orders/${s.order_id}`} className="subscription-link">
                            {s.order_number ?? s.order_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td>
                          <span className={`subscription-badge subscription-badge--status-${s.status}`}>
                            {getStatusLabel(s.status)}
                          </span>
                          {s.status === 'suspended' && (
                            <p className="subscription-row-note" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--error)' }}>
                              Overdue on payment – Order #{s.order_number ?? s.order_id.slice(0, 8)}
                            </p>
                          )}
                        </td>
                        <td>
                          {(() => {
                            const { label, variant } = simStatusForOrder(s.order_id);
                            if (variant === 'enabled') {
                              return <span className="subscription-badge subscription-badge--enabled">{label}</span>;
                            }
                            if (variant === 'disabled') {
                              return <span className="subscription-badge subscription-badge--disabled">{s.status === 'suspended' ? 'Suspended' : label}</span>;
                            }
                            return <span className="subscription-badge subscription-badge--unknown">{label}</span>;
                          })()}
                        </td>
                        <td>{formatDate(s.next_due_estimate)}</td>
                        <td>
                          <div className="subscription-plan-actions">
                            <Link href={`/account/orders/${s.order_id}`} className="subscription-link">
                              View order
                            </Link>
                            {(s.status === 'suspended' || ((s.days_until_due ?? 999) <= 14 && s.status !== 'suspended')) ? (
                              <button
                                type="button"
                                className="subscription-btn-pay"
                                onClick={openBillingPortal}
                                disabled={billingPortalLoading}
                              >
                                {billingPortalLoading ? 'Opening…' : 'Pay now'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={planPagination.currentPage}
                totalPages={planPagination.totalPages}
                hasPrev={planPagination.hasPrev}
                hasNext={planPagination.hasNext}
                onPrev={() => setPlanPage((p) => Math.max(1, p - 1))}
                onNext={() => setPlanPage((p) => p + 1)}
              />
              <p className="subscription-plan-note" style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                Next billing date is updated when Stripe processes your renewal.
              </p>
            </>
          )}
        </section>
        )}

        {activeTab === 'payments' && (
        <>
        <section className="subscription-section" role="tabpanel" aria-labelledby="subscription-tab-payments">
          <h2 id="subscription-tab-payments" className="subscription-section-title">
            <FileText size={20} aria-hidden />
            Recent payments & status
          </h2>
          {data.subscriptions.length === 0 ? (
            <p className="admin-time">No subscription orders yet.</p>
          ) : (
            <>
              <div className="subscription-table-wrap">
                <table className="admin-table subscription-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Period</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsPagination.paginated.map((s) => (
                      <tr key={s.order_id}>
                        <td className="admin-mono">{s.order_number ?? s.order_id.slice(0, 8)}</td>
                        <td>
                          <span className={`subscription-badge subscription-badge--status-${s.status}`}>
                            {getStatusLabel(s.status)}
                          </span>
                        </td>
                        <td>{formatDate(s.created_at)}</td>
                        <td>{formatMoney(s.total_cents, s.currency)}</td>
                        <td>{s.period === 'year' ? 'Yearly' : 'Monthly'}</td>
                        <td>
                          <Link href={`/account/orders/${s.order_id}`} className="subscription-link">
                            View order
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={paymentsPagination.currentPage}
                totalPages={paymentsPagination.totalPages}
                hasPrev={paymentsPagination.hasPrev}
                hasNext={paymentsPagination.hasNext}
                onPrev={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                onNext={() => setPaymentsPage((p) => p + 1)}
              />
            </>
          )}
        </section>

        <section className="subscription-section">
          <h2 className="subscription-section-title">
            <FileText size={20} aria-hidden />
            Invoices
          </h2>
          <p className="subscription-section-desc" style={{ marginBottom: '0.75rem' }}>
            Invoices and order details are available from each order.
          </p>
          {data.subscriptions.length === 0 ? (
            <p className="admin-time">No orders yet.</p>
          ) : (
            <>
              <div className="subscription-table-wrap">
                <table className="admin-table subscription-table">
                  <thead>
                    <tr>
                      <th>Order number</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Plan</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesPagination.paginated.map((s) => (
                      <tr key={s.order_id}>
                        <td className="admin-mono">{s.order_number ?? s.order_id.slice(0, 8)}</td>
                        <td>{formatDate(s.created_at)}</td>
                        <td>{formatMoney(s.total_cents, s.currency)}</td>
                        <td>{s.period === 'year' ? 'Yearly SIM' : 'Monthly SIM'}</td>
                        <td>
                          <Link href={`/account/orders/${s.order_id}`} className="subscription-link">
                            View order / invoice
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={invoicesPagination.currentPage}
                totalPages={invoicesPagination.totalPages}
                hasPrev={invoicesPagination.hasPrev}
                hasNext={invoicesPagination.hasNext}
                onPrev={() => setInvoicesPage((p) => Math.max(1, p - 1))}
                onNext={() => setInvoicesPage((p) => p + 1)}
              />
            </>
          )}
        </section>
        </>
        )}

        {activeTab === 'sim' && (
        <section className="subscription-section" role="tabpanel" aria-labelledby="subscription-tab-sim">
          <h2 id="subscription-tab-sim" className="subscription-section-title">
            <Smartphone size={20} aria-hidden />
            SIM linked to tracker (by order)
          </h2>
          {data.simTrackerLinks.length === 0 ? (
            <p className="admin-time">No tracker–SIM links yet. Activate a device from an order to see links here.</p>
          ) : (
            <>
              <div className="subscription-table-wrap">
                <table className="admin-table subscription-table">
                  <thead>
                    <tr>
                      <th>Order number</th>
                      <th>Tracker</th>
                      <th>SIM status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simPagination.paginated.map((link, i) => (
                      <tr key={link.device_id + (link.order_number ?? '') + i}>
                        <td>
                          <Link href={`/account/orders/${link.order_id}`} className="subscription-link">
                            {link.order_number ?? '—'}
                          </Link>
                        </td>
                        <td>{link.device_name ?? link.device_id}</td>
                        <td>
                          {link.sim_status === 'enabled' && (
                            <span className="subscription-badge subscription-badge--enabled">Enabled</span>
                          )}
                          {link.sim_status === 'disabled' && (
                            <span className="subscription-badge subscription-badge--disabled">Disabled</span>
                          )}
                          {link.sim_status === 'unknown' && (
                            <span className="subscription-badge subscription-badge--unknown">Unknown</span>
                          )}
                          {(link.sim_status === null || link.sim_status === undefined) && (
                            <span className="subscription-badge subscription-badge--unknown" title="Simbase status not available">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={simPagination.currentPage}
                totalPages={simPagination.totalPages}
                hasPrev={simPagination.hasPrev}
                hasNext={simPagination.hasNext}
                onPrev={() => setSimPage((p) => Math.max(1, p - 1))}
                onNext={() => setSimPage((p) => p + 1)}
              />
            </>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
