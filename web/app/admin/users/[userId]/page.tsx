'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { useAdminAuth } from '../../AdminAuthContext';
import { roleLabel } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';
import { MessageSquare, User, Smartphone, CreditCard, Hash, FileText, Mail, DollarSign, RotateCcw } from 'lucide-react';

const AU_TZ = 'Australia/Sydney';
const PAGE_SIZE = 10;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'AUD',
  }).format(cents / 100);
}

type UserDetail = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  last_login_ip?: string | null;
  role: string;
  role_created_at: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    address_line1: string | null;
    address_line2: string | null;
    suburb: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
    mobile: string | null;
  } | null;
  devices: { id: string; name: string | null; created_at: string; last_seen_at: string | null; ingest_disabled: boolean }[];
  subscriptions: {
    order_id: string;
    order_number: string | null;
    status: string;
    created_at: string;
    total_cents: number | null;
    currency: string;
    period: 'month' | 'year';
    next_due_estimate: string;
    stripe_subscription_id: string | null;
  }[];
  devices_with_sim: {
    activation_token_id: string;
    order_id: string;
    order_number: string | null;
    device_id: string;
    device_name: string | null;
    sim_iccid: string;
    sim_status: 'enabled' | 'disabled' | 'unknown' | null;
  }[];
  orders?: {
    id: string;
    order_number: string | null;
    status: string;
    total_cents: number | null;
    currency: string;
    created_at: string;
  }[];
  total_paid_cents?: number;
  overdue_cents?: number;
  currency?: string;
  sms_usage?: {
    total: number;
    current_month: number;
    current_period: string;
    by_period: { period: string; count: number }[];
  };
};

export default function AdminUserViewPage() {
  const params = useParams();
  const router = useRouter();
  const { getAuthHeaders } = useAdminAuth();
  const userId = typeof params.userId === 'string' ? params.userId : '';
  const [data, setData] = useState<UserDetail | null>(null);
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [simTogglingIccid, setSimTogglingIccid] = useState<string | null>(null);
  const [smsModal, setSmsModal] = useState(false);
  const [smsTo, setSmsTo] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [smsStatus, setSmsStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [smsError, setSmsError] = useState<string | null>(null);
  const [manageSubscription, setManageSubscription] = useState<UserDetail['subscriptions'][0] | null>(null);
  const [subModalPrice, setSubModalPrice] = useState('');
  const [subModalRenewal, setSubModalRenewal] = useState('');
  const [subModalStripeSubId, setSubModalStripeSubId] = useState('');
  const [subModalSaving, setSubModalSaving] = useState(false);
  const [subModalError, setSubModalError] = useState<string | null>(null);
  const [subModalSuccess, setSubModalSuccess] = useState<string | null>(null);
  const [devicesPage, setDevicesPage] = useState(1);
  const [simsPage, setSimsPage] = useState(1);
  const [subscriptionsPage, setSubscriptionsPage] = useState(1);
  const [manualOrderPreset, setManualOrderPreset] = useState('gps_tracker_sim_monthly');
  const [manualOrderTotal, setManualOrderTotal] = useState('');
  const [manualOrderStatus, setManualOrderStatus] = useState('paid');
  const [manualOrderSubmitting, setManualOrderSubmitting] = useState(false);
  const [manualOrderError, setManualOrderError] = useState<string | null>(null);
  type UserTab = 'profile' | 'devices' | 'subscriptions' | 'invoices';
  const [activeTab, setActiveTab] = useState<UserTab>('profile');
  const [emailsList, setEmailsList] = useState<{ id: string; subject: string; sent_at: string }[]>([]);
  const [emailsPage, setEmailsPage] = useState(1);
  const [emailsTotal, setEmailsTotal] = useState(0);
  const [emailsTotalPages, setEmailsTotalPages] = useState(1);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [emailDetail, setEmailDetail] = useState<{ id: string; subject: string; body_html: string | null; sent_at: string } | null>(null);
  const [emailDetailLoading, setEmailDetailLoading] = useState(false);
  const [smsResetStatus, setSmsResetStatus] = useState<'idle' | 'resetting' | 'done' | 'err'>('idle');
  const [smsResetError, setSmsResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const headers = getAuthHeaders();
    Promise.all([
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { credentials: 'include', cache: 'no-store', headers }).then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'User not found' : 'Failed to load');
        return r.json();
      }),
    ])
      .then(([meData, detail]) => {
        setMe(meData ?? null);
        setData(detail);
        setSmsTo(detail?.profile?.mobile ?? detail?.email ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId, getAuthHeaders]);

  useEffect(() => {
    if (!userId || activeTab !== 'profile' || !data?.email) return;
    const headers = getAuthHeaders();
    setEmailsLoading(true);
    fetch(`/api/admin/users/${encodeURIComponent(userId)}/emails?page=${emailsPage}&per_page=5`, {
      credentials: 'include',
      cache: 'no-store',
      headers,
    })
      .then((r) => (r.ok ? r.json() : { emails: [], total: 0, total_pages: 1 }))
      .then((body: { emails: { id: string; subject: string; sent_at: string }[]; total: number; total_pages: number }) => {
        setEmailsList(body.emails ?? []);
        setEmailsTotal(body.total ?? 0);
        setEmailsTotalPages(body.total_pages ?? 1);
      })
      .catch(() => { setEmailsList([]); setEmailsTotal(0); setEmailsTotalPages(1); })
      .finally(() => setEmailsLoading(false));
  }, [userId, activeTab, data?.email, emailsPage, getAuthHeaders]);

  async function openEmailDetail(logId: string) {
    if (!userId) return;
    setEmailDetailLoading(true);
    setEmailDetail(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/emails/${encodeURIComponent(logId)}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const body = await res.json();
      setEmailDetail({
        id: body.id,
        subject: body.subject ?? '—',
        body_html: body.body_html ?? null,
        sent_at: body.sent_at,
      });
    } finally {
      setEmailDetailLoading(false);
    }
  }

  const isAdmin = me?.role === 'administrator';
  const canCreateManualOrder = me?.role === 'staff_plus' || isAdmin;

  async function handleCreateManualOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !canCreateManualOrder) return;
    setManualOrderError(null);
    setManualOrderSubmitting(true);
    try {
      const totalCents = manualOrderTotal.trim() === '' ? undefined : Math.round(Number(manualOrderTotal) * 100);
      const items = [{ product_sku: manualOrderPreset, quantity: 1 }];
      const res = await fetch('/api/admin/orders/manual', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: data.id,
          status: manualOrderStatus,
          items,
          total_cents: totalCents,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setManualOrderError((json as { error?: string }).error ?? 'Failed to create order');
        return;
      }
      const orderId = (json as { order_id?: string }).order_id;
      if (orderId) window.location.href = `/admin/orders/${orderId}`;
      else setManualOrderError('Order created but redirect failed.');
    } finally {
      setManualOrderSubmitting(false);
    }
  }

  async function handleSimToggle(iccid: string, currentStatus: string) {
    if (simTogglingIccid) return;
    const nextState = currentStatus === 'enabled' ? 'disabled' : 'enabled';
    setSimTogglingIccid(iccid);
    try {
      const res = await fetch(`/api/admin/stock/simcards/${encodeURIComponent(iccid)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string })?.error ?? 'Failed to update SIM');
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              devices_with_sim: prev.devices_with_sim.map((row) =>
                row.sim_iccid === iccid ? { ...row, sim_status: nextState as 'enabled' | 'disabled' } : row
              ),
            }
          : null
      );
    } finally {
      setSimTogglingIccid(null);
    }
  }

  function openSmsModal() {
    setSmsTo(data?.profile?.mobile ?? data?.email ?? '');
    setSmsMessage('');
    setSmsStatus('idle');
    setSmsError(null);
    setSmsModal(true);
  }

  async function sendSms() {
    const to = smsTo.trim();
    const message = smsMessage.trim();
    if (!to || !message) {
      setSmsStatus('err');
      setSmsError('Enter a phone number and message.');
      return;
    }
    setSmsStatus('sending');
    setSmsError(null);
    try {
      const res = await fetch('/api/admin/sms/test', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to, message }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSmsStatus('err');
        setSmsError((d as { error?: string }).error ?? 'Failed to send');
        return;
      }
      setSmsStatus('ok');
    } catch (e) {
      setSmsStatus('err');
      setSmsError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  async function disableUser() {
    if (!isAdmin || !data) return;
    if (!confirm('Disable this user? They will not be able to sign in.')) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/users/${data.id}/disable`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert((d as { error?: string }).error ?? 'Failed');
        return;
      }
      router.push('/admin/users');
    } finally {
      setActing(false);
    }
  }

  async function handleResetSmsUsage(period?: string) {
    if (!isAdmin || !data) return;
    const label = period ? `the ${period} SMS count` : 'ALL SMS usage history';
    if (!confirm(`Reset ${label} for this user? This cannot be undone.`)) return;
    setSmsResetStatus('resetting');
    setSmsResetError(null);
    try {
      const res = await fetch(`/api/admin/users/${data.id}/sms-usage`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: period ? JSON.stringify({ period }) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSmsResetStatus('err');
        setSmsResetError((json as { error?: string }).error ?? 'Reset failed');
        return;
      }
      // Update local state to reflect the reset
      setData((prev) => {
        if (!prev?.sms_usage) return prev;
        const filtered = period
          ? prev.sms_usage.by_period.filter((r) => r.period !== period)
          : [];
        return {
          ...prev,
          sms_usage: {
            ...prev.sms_usage,
            total: filtered.reduce((s, r) => s + r.count, 0),
            current_month: filtered.find((r) => r.period === prev.sms_usage!.current_period)?.count ?? 0,
            by_period: filtered,
          },
        };
      });
      setSmsResetStatus('done');
      setTimeout(() => setSmsResetStatus('idle'), 3000);
    } catch (e) {
      setSmsResetStatus('err');
      setSmsResetError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  function openManageSubscription(s: UserDetail['subscriptions'][0]) {
    setManageSubscription(s);
    setSubModalPrice(s.total_cents != null ? (s.total_cents / 100).toFixed(2) : '');
    const d = new Date(s.next_due_estimate);
    const pad = (n: number) => String(n).padStart(2, '0');
    setSubModalRenewal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setSubModalStripeSubId(s.stripe_subscription_id ?? '');
    setSubModalError(null);
  }

  async function activateSubscription() {
    if (!manageSubscription) return;
    setSubModalSaving(true);
    setSubModalError(null);
    setSubModalSuccess(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(manageSubscription.order_id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_subscription', status: 'activated' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubModalError((d as { error?: string }).error ?? 'Failed to activate');
        return;
      }
      setSubModalSuccess('Subscription activated.');
      setData((prev) =>
        prev
          ? {
              ...prev,
              subscriptions: prev.subscriptions.map((sub) =>
                sub.order_id === manageSubscription.order_id ? { ...sub, status: 'activated' } : sub
              ),
            }
          : prev
      );
      setManageSubscription((prev) => prev ? { ...prev, status: 'activated' } : prev);
    } catch {
      setSubModalError('Failed to activate');
    } finally {
      setSubModalSaving(false);
    }
  }

  async function saveManageSubscription() {
    if (!manageSubscription) return;
    const priceVal = parseFloat(subModalPrice);
    const totalCents = Number.isFinite(priceVal) && priceVal >= 0 ? Math.round(priceVal * 100) : manageSubscription.total_cents ?? undefined;
    const renewalVal = subModalRenewal.trim();
    const subscription_next_billing_date = renewalVal ? new Date(renewalVal).toISOString() : null;
    const stripeSubIdVal = subModalStripeSubId.trim() || undefined;
    if (totalCents === undefined && !renewalVal && stripeSubIdVal === undefined) {
      setSubModalError('Set price, renewal date, and/or Stripe Subscription ID.');
      return;
    }
    setSubModalSaving(true);
    setSubModalError(null);
    setSubModalSuccess(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(manageSubscription.order_id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_subscription',
          ...(totalCents !== undefined && { total_cents: totalCents }),
          subscription_next_billing_date,
          ...(stripeSubIdVal !== undefined && { stripe_subscription_id: stripeSubIdVal }),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubModalError((d as { error?: string }).error ?? 'Failed to update');
        return;
      }
      const message = (d as { message?: string }).message ?? 'Saved.';
      setSubModalSuccess(message);
      setData((prev) =>
        prev
          ? {
              ...prev,
              subscriptions: prev.subscriptions.map((sub) =>
                sub.order_id === manageSubscription.order_id
                  ? {
                      ...sub,
                      total_cents: totalCents ?? sub.total_cents,
                      next_due_estimate: subscription_next_billing_date ?? sub.next_due_estimate,
                    }
                  : sub
              ),
            }
          : null
      );
      setTimeout(() => {
        setManageSubscription(null);
        setSubModalSuccess(null);
      }, 1800);
    } finally {
      setSubModalSaving(false);
    }
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;
  if (!data) return null;

  const p = data.profile;
  const addressParts = [p?.address_line1, p?.address_line2, p?.suburb, p?.state, p?.postcode, p?.country].filter(Boolean);
  const addressLine = addressParts.length > 0 ? addressParts.join(', ') : '—';

  const devicesTotal = data.devices.length;
  const devicesTotalPages = Math.max(1, Math.ceil(devicesTotal / PAGE_SIZE));
  const devicesPageClamped = Math.min(Math.max(1, devicesPage), devicesTotalPages);
  const devicesPaginated = data.devices.slice((devicesPageClamped - 1) * PAGE_SIZE, devicesPageClamped * PAGE_SIZE);

  const simsTotal = data.devices_with_sim.length;
  const simsTotalPages = Math.max(1, Math.ceil(simsTotal / PAGE_SIZE));
  const simsPageClamped = Math.min(Math.max(1, simsPage), simsTotalPages);
  const simsPaginated = data.devices_with_sim.slice((simsPageClamped - 1) * PAGE_SIZE, simsPageClamped * PAGE_SIZE);

  const subsTotal = data.subscriptions.length;
  const subsTotalPages = Math.max(1, Math.ceil(subsTotal / PAGE_SIZE));
  const subsPageClamped = Math.min(Math.max(1, subscriptionsPage), subsTotalPages);
  const subsPaginated = data.subscriptions.slice((subsPageClamped - 1) * PAGE_SIZE, subsPageClamped * PAGE_SIZE);

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/admin/users" className="admin-btn">← Users</Link>
      </div>
      <h1 className="admin-page-title">User: {data.email ?? data.id}</h1>

      <div className="admin-stock-tabs" role="tablist" aria-label="User sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          aria-controls="user-tabpanel-profile"
          id="user-tab-profile"
          className={`admin-stock-tab ${activeTab === 'profile' ? 'admin-stock-tab--active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
          Profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'devices'}
          aria-controls="user-tabpanel-devices"
          id="user-tab-devices"
          className={`admin-stock-tab ${activeTab === 'devices' ? 'admin-stock-tab--active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          <Smartphone size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
          Devices + SIMs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'subscriptions'}
          aria-controls="user-tabpanel-subscriptions"
          id="user-tab-subscriptions"
          className={`admin-stock-tab ${activeTab === 'subscriptions' ? 'admin-stock-tab--active' : ''}`}
          onClick={() => setActiveTab('subscriptions')}
        >
          <CreditCard size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
          Subscriptions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'invoices'}
          aria-controls="user-tabpanel-invoices"
          id="user-tab-invoices"
          className={`admin-stock-tab ${activeTab === 'invoices' ? 'admin-stock-tab--active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          <FileText size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
          Invoices
        </button>
      </div>

      {activeTab === 'profile' && (
        <div id="user-tabpanel-profile" role="tabpanel" aria-labelledby="user-tab-profile">
          <div className="admin-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={18} aria-hidden /> Profile & contact
            </h3>
            <table className="admin-table">
              <tbody>
                <tr><td>Email</td><td>{data.email ?? '—'}</td></tr>
                <tr><td>First name</td><td>{p?.first_name ?? '—'}</td></tr>
                <tr><td>Last name</td><td>{p?.last_name ?? '—'}</td></tr>
                <tr><td>Address</td><td>{addressLine}</td></tr>
                <tr>
                  <td>Phone</td>
                  <td>
                    {p?.mobile ?? '—'}
                    {(p?.mobile ?? data.email) && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="admin-btn admin-btn--icon"
                          onClick={openSmsModal}
                          aria-label="Send SMS"
                          title="Send SMS"
                        >
                          <MessageSquare size={14} aria-hidden />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="admin-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Hash size={18} aria-hidden /> IDs & account
            </h3>
            <table className="admin-table">
              <tbody>
                <tr><td>User ID</td><td className="admin-mono" style={{ wordBreak: 'break-all' }}>{data.id}</td></tr>
                <tr><td>Role</td><td>{roleLabel(data.role as UserRole)}</td></tr>
                <tr><td>Created</td><td className="admin-time">{formatDate(data.created_at)}</td></tr>
                <tr><td>Last login</td><td className="admin-time">{formatDate(data.last_sign_in_at)}</td></tr>
                <tr><td>Last login IP</td><td className="admin-mono">{data.last_login_ip ?? '—'}</td></tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <div className="admin-card" style={{ flex: '1 1 280px', minWidth: 0 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarSign size={18} aria-hidden /> Payment summary
              </h3>
              <table className="admin-table">
                <tbody>
                  <tr>
                    <td>Total paid</td>
                    <td>{formatMoney(data.total_paid_cents ?? 0, data.currency ?? 'AUD')}</td>
                  </tr>
                  <tr>
                    <td>Overdue</td>
                    <td>{(data.overdue_cents ?? 0) > 0 ? formatMoney(data.overdue_cents, data.currency ?? 'AUD') : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="admin-card" style={{ flex: '1 1 280px', minWidth: 0 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={18} aria-hidden /> SMS usage
              </h3>
              <table className="admin-table">
                <tbody>
                  <tr>
                    <td>Total sent (all time)</td>
                    <td><strong>{data.sms_usage?.total ?? 0}</strong></td>
                  </tr>
                  <tr>
                    <td>This month ({data.sms_usage?.current_period ?? '—'})</td>
                    <td><strong>{data.sms_usage?.current_month ?? 0}</strong></td>
                  </tr>
                </tbody>
              </table>
              {(data.sms_usage?.by_period ?? []).length > 0 && (
                <details style={{ marginTop: '0.75rem' }}>
                  <summary className="admin-time" style={{ cursor: 'pointer', fontSize: '0.8125rem' }}>
                    History by month
                  </summary>
                  <table className="admin-table" style={{ marginTop: '0.5rem' }}>
                    <thead>
                      <tr><th>Period</th><th>Count</th>{isAdmin && <th></th>}</tr>
                    </thead>
                    <tbody>
                      {(data.sms_usage?.by_period ?? []).map((r) => (
                        <tr key={r.period}>
                          <td className="admin-mono">{r.period}</td>
                          <td>{r.count}</td>
                          {isAdmin && (
                            <td>
                              <button
                                type="button"
                                className="admin-btn admin-btn--small"
                                onClick={() => handleResetSmsUsage(r.period)}
                                disabled={smsResetStatus === 'resetting'}
                                title={`Reset ${r.period} count`}
                              >
                                Reset
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
              {isAdmin && (
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--small"
                    onClick={() => handleResetSmsUsage()}
                    disabled={smsResetStatus === 'resetting' || (data.sms_usage?.total ?? 0) === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <RotateCcw size={13} aria-hidden />
                    {smsResetStatus === 'resetting' ? 'Resetting…' : 'Reset all usage'}
                  </button>
                  {smsResetStatus === 'done' && (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--success)' }}>Reset.</span>
                  )}
                  {smsResetStatus === 'err' && smsResetError && (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--error)' }}>{smsResetError}</span>
                  )}
                </div>
              )}
            </div>

            <div className="admin-card" style={{ flex: '1 1 380px', minWidth: 0 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={18} aria-hidden /> Emails sent
              </h3>
            <p className="admin-time" style={{ marginBottom: '0.75rem' }}>
              Emails sent via RooGPS (orders, billing, support, password reset). Click a row to preview.
            </p>
            {emailsLoading ? (
              <p className="admin-time">Loading…</p>
            ) : emailsList.length === 0 ? (
              <p className="admin-time">No emails recorded.</p>
            ) : (
              <>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Sent (AU)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailsList.map((em) => (
                        <tr
                          key={em.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openEmailDetail(em.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEmailDetail(em.id); } }}
                          aria-label={`View email: ${em.subject}`}
                        >
                          <td>{em.subject}</td>
                          <td className="admin-time">{formatDate(em.sent_at)}</td>
                          <td><span className="admin-time" style={{ fontSize: '0.8125rem' }}>View →</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {emailsTotalPages > 1 && (
                  <div className="admin-pagination" role="navigation" aria-label="Emails pagination" style={{ marginTop: '0.75rem' }}>
                    <span className="admin-pagination-info">
                      Page {emailsPage} of {emailsTotalPages} ({emailsTotal} total)
                    </span>
                    <button type="button" className="admin-btn admin-btn--small" onClick={() => setEmailsPage((p) => Math.max(1, p - 1))} disabled={emailsPage <= 1}>← Prev</button>
                    <button type="button" className="admin-btn admin-btn--small" onClick={() => setEmailsPage((p) => p + 1)} disabled={emailsPage >= emailsTotalPages}>Next →</button>
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div id="user-tabpanel-devices" role="tabpanel" aria-labelledby="user-tab-devices">
          <div className="admin-card">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Smartphone size={18} aria-hidden /> Devices assigned
              </h3>
              {devicesTotal > PAGE_SIZE && (
                <div className="admin-pagination" role="navigation" aria-label="Devices pagination">
                  <span className="admin-pagination-info">
                    Page {devicesPageClamped} of {devicesTotalPages} ({devicesTotal} total)
                  </span>
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => setDevicesPage((p) => Math.max(1, p - 1))} disabled={devicesPageClamped <= 1} aria-label="Previous page">← Prev</button>
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => setDevicesPage((p) => p + 1)} disabled={devicesPageClamped >= devicesTotalPages} aria-label="Next page">Next →</button>
                </div>
              )}
            </div>
            {data.devices.length === 0 ? (
              <p className="admin-time">No devices assigned.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Device ID</th>
                      <th>Name</th>
                      <th>Last seen (AU)</th>
                      <th>Created</th>
                      <th>Ingest</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {devicesPaginated.map((d) => (
                      <tr key={d.id}>
                        <td className="admin-mono">{d.id}</td>
                        <td>{d.name ?? '—'}</td>
                        <td className="admin-time">{formatDate(d.last_seen_at)}</td>
                        <td className="admin-time">{formatDate(d.created_at)}</td>
                        <td>{d.ingest_disabled ? 'Disabled' : 'Enabled'}</td>
                        <td>
                          <Link href={`/admin/devices/${encodeURIComponent(d.id)}`} className="admin-btn">
                            View device
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-card">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>SIMs assigned (device ↔ SIM ↔ order)</h3>
              {simsTotal > PAGE_SIZE && (
                <div className="admin-pagination" role="navigation" aria-label="SIMs pagination">
                  <span className="admin-pagination-info">
                    Page {simsPageClamped} of {simsTotalPages} ({simsTotal} total)
                  </span>
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => setSimsPage((p) => Math.max(1, p - 1))} disabled={simsPageClamped <= 1} aria-label="Previous page">← Prev</button>
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => setSimsPage((p) => p + 1)} disabled={simsPageClamped >= simsTotalPages} aria-label="Next page">Next →</button>
                </div>
              )}
            </div>
            {data.devices_with_sim.length === 0 ? (
              <p className="admin-time">No SIMs linked to devices for this user.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Device ID</th>
                      <th>SIM ICCID</th>
                      <th>Order</th>
                      <th>SIM status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simsPaginated.map((row) => (
                      <tr key={row.activation_token_id}>
                        <td>{row.device_name ?? row.device_id}</td>
                        <td className="admin-mono">{row.device_id}</td>
                        <td className="admin-mono">{row.sim_iccid}</td>
                        <td>
                          <Link href={`/admin/orders/${row.order_id}`}>{row.order_number ?? row.order_id}</Link>
                        </td>
                        <td>
                          <span className={`admin-badge admin-badge--${row.sim_status === 'enabled' ? 'success' : row.sim_status === 'disabled' ? 'warn' : 'muted'}`}>
                            {row.sim_status === 'enabled' ? 'Enabled' : row.sim_status === 'disabled' ? 'Disabled' : 'Unknown'}
                          </span>
                        </td>
                        <td>
                          {(row.sim_status === 'enabled' || row.sim_status === 'disabled') && (
                            <button
                              type="button"
                              className="admin-btn"
                              onClick={() => {
                                const iccid = row.sim_iccid;
                                const status = row.sim_status;
                                if (iccid != null && (status === 'enabled' || status === 'disabled')) handleSimToggle(iccid, status);
                              }}
                              disabled={simTogglingIccid === row.sim_iccid}
                              title={row.sim_status === 'enabled' ? 'Disable SIM (suspend)' : 'Enable SIM'}
                            >
                              {simTogglingIccid === row.sim_iccid ? '…' : row.sim_status === 'enabled' ? 'Disable SIM' : 'Enable SIM'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'subscriptions' && (
        <div id="user-tabpanel-subscriptions" role="tabpanel" aria-labelledby="user-tab-subscriptions">
          <div className="admin-card">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={18} aria-hidden /> Subscriptions
              </h3>
              {subsTotal > PAGE_SIZE && (
                <div className="admin-pagination" role="navigation" aria-label="Subscriptions pagination">
                  <span className="admin-pagination-info">
                    Page {subsPageClamped} of {subsTotalPages} ({subsTotal} total)
                  </span>
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => setSubscriptionsPage((p) => Math.max(1, p - 1))} disabled={subsPageClamped <= 1} aria-label="Previous page">← Prev</button>
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => setSubscriptionsPage((p) => p + 1)} disabled={subsPageClamped >= subsTotalPages} aria-label="Next page">Next →</button>
                </div>
              )}
            </div>
            <p className="admin-time" style={{ marginBottom: '0.75rem' }}>
              Price, next renewal (estimate), status. Suspend = disable the SIM for that order (use Disable SIM in Devices + SIMs tab).
            </p>
            {data.subscriptions.length === 0 ? (
              <p className="admin-time">No subscription orders.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Status</th>
                      <th>Price</th>
                      <th>Period</th>
                      <th>Next renewal (est.)</th>
                      <th>Subscription ID</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsPaginated.map((s) => (
                      <tr key={s.order_id}>
                        <td>
                          <Link href={`/admin/orders/${s.order_id}`}>{s.order_number ?? s.order_id}</Link>
                        </td>
                        <td>
                          <span className={`admin-badge admin-badge--${['paid', 'fulfilled', 'processing', 'shipped', 'activated'].includes(s.status) ? 'success' : 'muted'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td>{formatMoney(s.total_cents, s.currency)}</td>
                        <td>{s.period === 'year' ? 'Yearly' : 'Monthly'}</td>
                        <td className="admin-time">{formatDate(s.next_due_estimate)}</td>
                        <td className="admin-mono" style={{ fontSize: '0.8125rem' }}>{s.stripe_subscription_id ?? '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-btn"
                            onClick={() => openManageSubscription(s)}
                          >
                            Manage order
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {canCreateManualOrder && data && (
            <div className="admin-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={18} aria-hidden /> Create manual order
              </h3>
              <p className="admin-time" style={{ marginBottom: '1rem' }}>
                Create an order for this user without Stripe. Then open the order to assign devices/SIMs and optionally link a Stripe subscription or invoice later.
              </p>
              <form onSubmit={handleCreateManualOrder}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label htmlFor="manual-order-preset" className="admin-label">Product</label>
                    <select
                      id="manual-order-preset"
                      className="admin-input admin-select"
                      value={manualOrderPreset}
                      onChange={(e) => setManualOrderPreset(e.target.value)}
                    >
                      <option value="gps_tracker_sim_monthly">GPS tracker + SIM (monthly)</option>
                      <option value="gps_tracker_sim_yearly">GPS tracker + SIM (yearly)</option>
                      <option value="sim_monthly">SIM only (monthly)</option>
                      <option value="sim_yearly">SIM only (yearly)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="manual-order-status" className="admin-label">Initial status</label>
                    <select
                      id="manual-order-status"
                      className="admin-input admin-select"
                      value={manualOrderStatus}
                      onChange={(e) => setManualOrderStatus(e.target.value)}
                    >
                      <option value="paid">Paid</option>
                      <option value="fulfilled">Fulfilled</option>
                      <option value="shipped">Shipped</option>
                      <option value="activated">Activated</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="manual-order-total" className="admin-label">Total (AUD, optional)</label>
                    <input
                      id="manual-order-total"
                      type="number"
                      min="0"
                      step="0.01"
                      className="admin-input"
                      value={manualOrderTotal}
                      onChange={(e) => setManualOrderTotal(e.target.value)}
                      placeholder="e.g. 125.99"
                      style={{ width: 120 }}
                    />
                  </div>
                </div>
                {manualOrderError && <p className="admin-time" style={{ color: 'var(--error)', marginBottom: '0.75rem' }}>{manualOrderError}</p>}
                <button type="submit" className="admin-btn" disabled={manualOrderSubmitting}>
                  {manualOrderSubmitting ? 'Creating…' : 'Create order'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div id="user-tabpanel-invoices" role="tabpanel" aria-labelledby="user-tab-invoices">
          <div className="admin-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} aria-hidden /> Invoices
            </h3>
            <p className="admin-time" style={{ marginBottom: '0.75rem' }}>
              All orders (invoices) for this user — paid, pending, cancelled, etc. Click an order to view details and line items.
            </p>
            {(data.orders ?? []).length === 0 ? (
              <p className="admin-time">No orders.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.orders ?? []).map((o) => (
                      <tr key={o.id}>
                        <td className="admin-mono">{o.order_number ?? o.id.slice(0, 8)}</td>
                        <td className="admin-time">{formatDate(o.created_at)}</td>
                        <td>
                          <span className={`admin-badge admin-badge--${
                            ['paid', 'fulfilled', 'processing', 'shipped', 'activated'].includes(o.status) ? 'success' :
                            ['pending', 'processing'].includes(o.status) ? 'warn' : 'muted'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                        <td>{formatMoney(o.total_cents, o.currency)}</td>
                        <td>
                          <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="admin-btn">
                            View order
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="admin-card">
          <h3>Danger zone</h3>
          <p style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="admin-btn" onClick={disableUser} disabled={acting}>
              Disable user
            </button>
          </p>
        </div>
      )}

      {manageSubscription && (
        <div
          className="admin-confirm-overlay admin-manage-subscription-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-subscription-title"
          onClick={() => setManageSubscription(null)}
        >
          <div className="admin-confirm-modal admin-manage-subscription-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="manage-subscription-title" className="admin-confirm-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard size={24} aria-hidden /> Manage subscription
            </h2>
            <p className="admin-time" style={{ marginBottom: '1rem' }}>
              Order {manageSubscription.order_number ?? manageSubscription.order_id}. Update recurring charge or next renewal date.
            </p>
            <table className="admin-table" style={{ marginBottom: '1.25rem', width: '100%' }}>
              <tbody>
                <tr><td>Order</td><td>{manageSubscription.order_number ?? manageSubscription.order_id}</td></tr>
                <tr><td>Status</td><td><span className={`admin-badge admin-badge--${['paid', 'fulfilled', 'processing', 'shipped', 'activated'].includes(manageSubscription.status) ? 'success' : 'muted'}`}>{manageSubscription.status}</span></td></tr>
                <tr><td>Billing period</td><td>{manageSubscription.period === 'year' ? 'Yearly' : 'Monthly'}</td></tr>
              </tbody>
            </table>
            <label className="admin-form-row" style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                Recurring price ({manageSubscription.currency}) — {manageSubscription.period === 'year' ? 'per year' : 'per month'}
              </span>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                Amount the customer is charged each {manageSubscription.period === 'year' ? 'year' : 'month'}.
              </p>
              <input
                type="number"
                min={0}
                step={0.01}
                value={subModalPrice}
                onChange={(e) => setSubModalPrice(e.target.value)}
                className="admin-input"
                style={{ width: '100%', padding: '0.6rem 0.75rem' }}
                disabled={subModalSaving}
              />
            </label>
            <label className="admin-form-row" style={{ display: 'block', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Next renewal date</span>
              <input
                type="datetime-local"
                value={subModalRenewal}
                onChange={(e) => setSubModalRenewal(e.target.value)}
                className="admin-input"
                style={{ width: '100%', padding: '0.6rem 0.75rem' }}
                disabled={subModalSaving}
              />
            </label>
            <label className="admin-form-row" style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Stripe Subscription ID</span>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                {manageSubscription.stripe_subscription_id
                  ? `Linked: ${manageSubscription.stripe_subscription_id} — changing the date above will sync to Stripe.`
                  : 'Not linked. Renewal date is saved in DB only. Paste the ID from Stripe (e.g. sub_xxx) to link and sync.'}
              </p>
              <input
                type="text"
                placeholder="sub_..."
                value={subModalStripeSubId}
                onChange={(e) => setSubModalStripeSubId(e.target.value)}
                className="admin-input admin-mono"
                style={{ width: '100%', padding: '0.6rem 0.75rem' }}
                disabled={subModalSaving}
              />
            </label>
            {subModalError && <p style={{ color: 'var(--error)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{subModalError}</p>}
            {subModalSuccess && <p style={{ color: 'var(--success)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{subModalSuccess}</p>}
            {manageSubscription.status === 'suspended' && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 8 }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--warn)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  This subscription is suspended.
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  If the renewal date above has been updated and the account is no longer overdue, click Activate to restore access.
                </p>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary admin-btn--small"
                  onClick={activateSubscription}
                  disabled={subModalSaving}
                  style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                >
                  {subModalSaving ? 'Activating…' : 'Activate subscription'}
                </button>
              </div>
            )}
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              <Link href={`/admin/orders/${manageSubscription.order_id}`} className="admin-btn" style={{ marginRight: '0.5rem' }} onClick={() => setManageSubscription(null)}>
                View full order
              </Link>
            </p>
            <div className="admin-confirm-actions admin-manage-subscription-actions">
              <button type="button" className="admin-btn admin-btn--small" onClick={() => setManageSubscription(null)} disabled={subModalSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary admin-btn--small"
                onClick={saveManageSubscription}
                disabled={subModalSaving}
              >
                {subModalSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {smsModal && (
        <div
          className="admin-confirm-overlay admin-sms-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sms-modal-title"
          onClick={() => setSmsModal(false)}
        >
          <div className="admin-confirm-modal admin-sms-modal" onClick={(e) => e.stopPropagation()}>
            <header className="admin-sms-modal__header">
              <h2 id="sms-modal-title" className="admin-sms-modal__title">
                <MessageSquare size={26} aria-hidden /> Send SMS
              </h2>
              <p className="admin-sms-modal__desc">Sends via SMSPortal. Does not count against user usage.</p>
            </header>
            <div className="admin-sms-modal__body">
              <label className="admin-sms-modal__label">
                <span className="admin-sms-modal__label-text">Phone number</span>
                <input
                  type="text"
                  value={smsTo}
                  onChange={(e) => setSmsTo(e.target.value)}
                  placeholder="04xxxxxxxx or +61..."
                  className="admin-input"
                  disabled={smsStatus === 'sending'}
                />
              </label>
              <label className="admin-sms-modal__label">
                <span className="admin-sms-modal__label-text">Message</span>
                <textarea
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder="Message..."
                  className="admin-input"
                  rows={4}
                  style={{ resize: 'vertical' }}
                  disabled={smsStatus === 'sending'}
                />
              </label>
              {smsStatus === 'ok' && <p className="admin-sms-modal__status admin-sms-modal__status--success">Sent successfully.</p>}
              {smsStatus === 'err' && smsError && <p className="admin-sms-modal__status admin-sms-modal__status--error">{smsError}</p>}
            </div>
            <div className="admin-sms-modal__actions">
              <button type="button" className="admin-btn" onClick={() => setSmsModal(false)}>
                Close
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={sendSms}
                disabled={smsStatus === 'sending'}
              >
                {smsStatus === 'sending' ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(emailDetail !== null || emailDetailLoading) && (
        <div
          className="admin-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-detail-title"
          onClick={() => { if (!emailDetailLoading) setEmailDetail(null); }}
        >
          <div className="admin-confirm-modal" style={{ maxWidth: '42rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <h2 id="email-detail-title" className="admin-confirm-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={24} aria-hidden /> Email
            </h2>
            {emailDetailLoading ? (
              <p className="admin-time">Loading…</p>
            ) : emailDetail ? (
              <>
                <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{emailDetail.subject}</p>
                <p className="admin-time" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>{formatDate(emailDetail.sent_at)}</p>
                {emailDetail.body_html ? (
                  <div
                    className="admin-email-body"
                    style={{ overflow: 'auto', flex: 1, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1rem', maxHeight: '60vh', background: 'var(--surface)' }}
                    dangerouslySetInnerHTML={{ __html: emailDetail.body_html }}
                  />
                ) : (
                  <p className="admin-time" style={{ marginBottom: '1rem' }}>Content not stored.</p>
                )}
                <div className="admin-confirm-actions">
                  <button type="button" className="admin-btn admin-btn--small" onClick={() => setEmailDetail(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
