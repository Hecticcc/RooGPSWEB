'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../AdminAuthContext';
import { getStatusLabel, getStatusBadgeClass } from '@/lib/order-status';
import { Search, ExternalLink, CreditCard, AlertTriangle, Pencil, X, Loader2 } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';

type SubRow = {
  order_id: string;
  order_number: string | null;
  user_id: string | null;
  user_email: string | null;
  status: string;
  stripe_status: string | null;
  stripe_subscription_id: string | null;
  total_cents: number | null;
  currency: string;
  period: 'month' | 'year';
  next_due_estimate: string;
  days_until_due: number;
  created_at: string;
  trial_enabled_at_signup?: boolean;
  trial_months_applied?: number | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  stripe_subscription_status?: string | null;
  billing_state_normalized?: string | null;
};

function formatMoney(cents: number | null, currency: string): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'AUD' }).format(cents / 100);
}

function stripeStatusLabel(s: string | null): string {
  if (!s) return '—';
  const lower = s.toLowerCase();
  if (lower === 'active') return 'Active';
  if (lower === 'past_due') return 'Past due';
  if (lower === 'canceled' || lower === 'cancelled') return 'Canceled';
  if (lower === 'unpaid') return 'Unpaid';
  if (lower === 'trialing') return 'Trialing';
  if (lower === 'incomplete' || lower === 'incomplete_expired') return lower.replace('_', ' ');
  return s.replace(/_/g, ' ');
}

const ORDER_STATUS_OPTIONS = [
  { value: 'activated', label: 'Activated' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'paid', label: 'Paid' },
  { value: 'fulfilled', label: 'Stock Assigned' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export default function AdminSubscriptionsPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [subscriptions, setSubscriptions] = useState<SubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalSubscriptions, setTotalSubscriptions] = useState(0);
  const [totalSuspended, setTotalSuspended] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manageSub, setManageSub] = useState<SubRow | null>(null);
  const [manageStatus, setManageStatus] = useState('');
  const [manageNextDue, setManageNextDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    const q = params.toString() ? `?${params.toString()}` : '';
    fetch(`/api/admin/subscriptions${q}`, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error((body as { error?: string })?.error ?? 'Failed to load subscriptions');
        }
        return r.json();
      })
      .then((data) => {
        setSubscriptions(data.subscriptions ?? []);
        setTotal(data.total ?? 0);
        setTotalSubscriptions(data.total_subscriptions ?? data.total ?? 0);
        setTotalSuspended(data.total_suspended ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [statusFilter, search, getAuthHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!manageSub) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setManageSub(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [manageSub, saving]);

  useEffect(() => {
    if (!manageSub) return;
    setManageStatus(manageSub.status);
    const d = new Date(manageSub.next_due_estimate);
    setManageNextDue(Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '');
    setSaveError(null);
  }, [manageSub]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  async function handleSaveManage() {
    if (!manageSub) return;
    setSaving(true);
    setSaveError(null);
    const headers = getAuthHeaders();
    const body: { action: string; subscription_next_billing_date?: string | null; status?: string } = {
      action: 'update_subscription',
    };
    const initialDateStr = manageSub.next_due_estimate ? new Date(manageSub.next_due_estimate).toISOString().slice(0, 10) : '';
    if (manageNextDue.trim() !== initialDateStr) {
      if (manageNextDue.trim()) {
        const d = new Date(manageNextDue.trim());
        if (Number.isFinite(d.getTime())) body.subscription_next_billing_date = d.toISOString();
      } else {
        body.subscription_next_billing_date = null;
      }
    }
    if (manageStatus !== manageSub.status) body.status = manageStatus;
    if (!('subscription_next_billing_date' in body) && !('status' in body)) {
      setSaving(false);
      setManageSub(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/orders/${manageSub.order_id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError((data as { error?: string }).error ?? 'Failed to update');
        setSaving(false);
        return;
      }
      setManageSub(null);
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to update');
    }
    setSaving(false);
  }

  if (loading && subscriptions.length === 0) {
    return (
      <div className="app-loading">
        <AppLoadingIcon />
      </div>
    );
  }

  return (
    <div className="admin-orders-page">
      <header className="admin-orders-header">
        <h1 className="admin-page-title">Subscriptions</h1>
      </header>

      <div className="admin-subscriptions-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="admin-card admin-card--with-icon" style={{ minWidth: '160px' }}>
          <span className="admin-card__icon" aria-hidden><CreditCard size={20} /></span>
          <h3 className="admin-subscriptions-stats-label">Total subscriptions</h3>
          <p className="admin-subscriptions-stats-value">{totalSubscriptions}</p>
        </div>
        <div className="admin-card admin-card--with-icon" style={{ minWidth: '160px' }}>
          <span className="admin-card__icon admin-subscriptions-stats-icon--suspended" aria-hidden><AlertTriangle size={20} /></span>
          <h3 className="admin-subscriptions-stats-label">Suspended</h3>
          <p className="admin-subscriptions-stats-value admin-subscriptions-stats-value--suspended">{totalSuspended}</p>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="admin-subscriptions-search" style={{ margin: 0 }}>
            Search:
          </label>
          <input
            id="admin-subscriptions-search"
            type="search"
            placeholder="Order # or customer email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="admin-input"
            style={{ minWidth: '200px' }}
          />
          <button type="submit" className="admin-btn" aria-label="Search">
            <Search size={18} />
          </button>
        </form>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="admin-subscriptions-status" style={{ margin: 0 }}>
            Status:
          </label>
          <select
            id="admin-subscriptions-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="admin-select"
            style={{ minWidth: '140px' }}
          >
            <option value="">All</option>
            <option value="activated">Activated</option>
            <option value="suspended">Suspended</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="admin-time" style={{ color: 'var(--error)', marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <div className="admin-card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Order status</th>
              <th>Stripe status</th>
              <th>Amount</th>
              <th>Period</th>
              <th>Next due</th>
              <th>Days</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.length === 0 ? (
              <tr>
                <td colSpan={9} className="admin-orders-empty">
                  {search || statusFilter ? 'No subscriptions match your filters.' : 'No subscriptions yet.'}
                </td>
              </tr>
            ) : (
              subscriptions.map((s) => (
                <tr key={s.order_id}>
                  <td className="admin-mono">{s.order_number ?? s.order_id.slice(0, 8)}</td>
                  <td>{s.user_email ?? (s.user_id ? `${s.user_id.slice(0, 8)}…` : '—')}</td>
                  <td>
                    <span className={getStatusBadgeClass(s.status)} title={getStatusLabel(s.status)}>
                      {getStatusLabel(s.status)}
                    </span>
                  </td>
                  <td>
                    {s.stripe_status ? (
                      <span
                        className={`admin-badge ${
                          s.stripe_status === 'active'
                            ? 'admin-badge--success'
                            : s.stripe_status === 'past_due' || s.stripe_status === 'unpaid'
                              ? 'admin-badge--warn'
                              : s.stripe_status === 'canceled' || s.stripe_status === 'cancelled'
                                ? 'admin-badge--muted'
                                : 'admin-badge--muted'
                        }`}
                        title={s.stripe_status}
                      >
                        {stripeStatusLabel(s.stripe_status)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{formatMoney(s.total_cents, s.currency)}</td>
                  <td>{s.period === 'year' ? 'Yearly' : 'Monthly'}</td>
                  <td className="admin-time">
                    {new Date(s.next_due_estimate).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td>
                    {s.days_until_due < 0 ? (
                      <span style={{ color: 'var(--warn)' }}>{s.days_until_due} (overdue)</span>
                    ) : (
                      s.days_until_due
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setManageSub(s)}
                        className="admin-btn"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        title="Manage status and next due"
                      >
                        <Pencil size={14} /> Manage
                      </button>
                      <Link href={`/admin/orders/${s.order_id}`} className="admin-btn">
                        View order
                      </Link>
                      {s.stripe_subscription_id && (
                        <a
                          href={`https://dashboard.stripe.com/subscriptions/${s.stripe_subscription_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          Stripe <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {manageSub && (
        <div
          className="admin-subscriptions-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-subscriptions-modal-title"
          onClick={(e) => e.target === e.currentTarget && !saving && setManageSub(null)}
        >
          <div className="admin-subscriptions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-subscriptions-modal-header">
              <h2 id="admin-subscriptions-modal-title">Manage subscription</h2>
              <button
                type="button"
                onClick={() => !saving && setManageSub(null)}
                className="admin-subscriptions-modal-close"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="admin-subscriptions-modal-body">
              <p className="admin-subscriptions-modal-order">
                Order <span className="admin-mono">{manageSub.order_number ?? manageSub.order_id.slice(0, 8)}</span>
                {manageSub.user_email && ` · ${manageSub.user_email}`}
              </p>
              <div className="admin-form-row">
                <label htmlFor="admin-sub-modal-status">Order status</label>
                <select
                  id="admin-sub-modal-status"
                  value={manageStatus}
                  onChange={(e) => setManageStatus(e.target.value)}
                  className="admin-select"
                  style={{ minWidth: '180px' }}
                >
                  {ORDER_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-row">
                <label htmlFor="admin-sub-modal-nextdue">Next due date</label>
                <input
                  id="admin-sub-modal-nextdue"
                  type="date"
                  value={manageNextDue}
                  onChange={(e) => setManageNextDue(e.target.value)}
                  className="admin-input"
                  style={{ minWidth: '160px' }}
                />
              </div>
              {(manageSub.trial_enabled_at_signup || manageSub.billing_state_normalized) && (
                <div className="admin-form-row" style={{ flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Trial & billing</span>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Trial at signup: {manageSub.trial_enabled_at_signup ? 'Yes' : 'No'}
                    {manageSub.trial_months_applied != null && ` · ${manageSub.trial_months_applied} mo`}
                    {manageSub.trial_started_at && ` · Started ${new Date(manageSub.trial_started_at).toLocaleDateString()}`}
                    {manageSub.trial_ends_at && ` · Ends ${new Date(manageSub.trial_ends_at).toLocaleDateString()}`}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Stripe status: {manageSub.stripe_subscription_status ?? '—'} · Billing state: {manageSub.billing_state_normalized ?? '—'}
                  </p>
                </div>
              )}
              {saveError && (
                <p style={{ color: 'var(--error)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{saveError}</p>
              )}
            </div>
            <div className="admin-subscriptions-modal-actions">
              <button type="button" onClick={() => !saving && setManageSub(null)} className="admin-btn" disabled={saving}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveManage} className="admin-btn admin-btn--primary" disabled={saving}>
                {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
