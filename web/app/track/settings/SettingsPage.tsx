'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Smartphone, MessageSquare, Check, Loader2, AlertCircle, Share2, Copy, Trash2, Clock, Lock } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';

type SettingsData = {
  email: string | null;
  mobile: string | null;
  first_name?: string | null;
  last_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  sms_alerts_enabled: boolean;
  sms_low_reminder_enabled?: boolean;
  sms_usage_this_month: number;
  sms_monthly_limit: number;
  battery_alert_enabled?: boolean;
  battery_alert_percent?: number;
  battery_alert_email?: boolean;
};

type ShareLinkRow = {
  id: string;
  device_id: string;
  device_name: string;
  token: string;
  url: string;
  expires_at: string;
  created_at: string;
};

type TabId = 'account' | 'shared-links';

const EXTEND_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
] as const;

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = Date.now();
  if (d.getTime() <= now) return 'Expired';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function formatExpiryRelative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  if (d.getTime() <= now) return 'Expired';
  const s = Math.floor((d.getTime() - now) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  if (day > 0) return `${day}d left`;
  if (h > 0) return `${h}h left`;
  if (m > 0) return `${m}m left`;
  return `${s}s left`;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>('account');
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [mobile, setMobile] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('Australia');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsLowReminderEnabled, setSmsLowReminderEnabled] = useState(true);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>([]);
  const [shareLinksLoading, setShareLinksLoading] = useState(false);
  const [shareLinksError, setShareLinksError] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendBy, setExtendBy] = useState<string>('24h');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
    const { data: { session } } = await createClient().auth.getSession();
    if (session?.access_token) (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
    return headers;
  }, []);

  useEffect(() => {
    const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
      fetch('/api/account/settings', { credentials: 'include', headers })
        .then((r) => {
          if (!r.ok) throw new Error('Failed to load');
          return r.json();
        })
        .then((d: SettingsData) => {
          setData(d);
          setMobile(d.mobile ?? '');
          setFirstName(d.first_name ?? '');
          setLastName(d.last_name ?? '');
          setAddressLine1(d.address_line1 ?? '');
          setAddressLine2(d.address_line2 ?? '');
          setSuburb(d.suburb ?? '');
          setState(d.state ?? '');
          setPostcode(d.postcode ?? '');
          setCountry(d.country ?? 'Australia');
          setSmsEnabled(d.sms_alerts_enabled ?? false);
          setSmsLowReminderEnabled(d.sms_low_reminder_enabled ?? true);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, []);

  const fetchShareLinks = useCallback(async () => {
    setShareLinksLoading(true);
    setShareLinksError(null);
    const headers = await getAuthHeaders();
    fetch('/api/account/share-links', { credentials: 'include', headers })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load share links');
        return r.json();
      })
      .then((body: { links: ShareLinkRow[] }) => setShareLinks(body.links ?? []))
      .catch((e) => setShareLinksError(e.message))
      .finally(() => setShareLinksLoading(false));
  }, [getAuthHeaders]);

  useEffect(() => {
    if (tab === 'shared-links') fetchShareLinks();
  }, [tab, fetchShareLinks]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveSuccess(false);
    setSaving(true);
    const headers = await getAuthHeaders();
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
    const res = await fetch('/api/account/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        mobile: mobile.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        suburb: suburb.trim() || null,
        state: state.trim() || null,
        postcode: postcode.trim() || null,
        country: country.trim() || 'Australia',
        sms_alerts_enabled: smsEnabled,
        sms_low_reminder_enabled: smsLowReminderEnabled,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? res.statusText);
      return;
    }
    setSaveSuccess(true);
    setData((prev) =>
      prev
        ? {
            ...prev,
            mobile: mobile.trim() || null,
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            address_line1: addressLine1.trim() || null,
            address_line2: addressLine2.trim() || null,
            suburb: suburb.trim() || null,
            state: state.trim() || null,
            postcode: postcode.trim() || null,
            country: country.trim() || 'Australia',
            sms_alerts_enabled: smsEnabled,
            sms_low_reminder_enabled: smsLowReminderEnabled,
          }
        : null
    );
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  async function handleExtend(linkId: string) {
    setExtendingId(linkId);
    const headers = await getAuthHeaders();
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
    const res = await fetch(`/api/account/share-links/${linkId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({ extend_by: extendBy }),
    });
    setExtendingId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setShareLinksError(err.error ?? 'Failed to extend');
      return;
    }
    const updated = await res.json();
    setShareLinks((prev) =>
      prev.map((l) => (l.id === linkId ? { ...l, expires_at: updated.expires_at } : l))
    );
  }

  async function handleDelete(linkId: string) {
    if (!confirm('Revoke this share link? It will stop working immediately.')) return;
    setDeletingId(linkId);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/account/share-links/${linkId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers,
    });
    setDeletingId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setShareLinksError(err.error ?? 'Failed to delete');
      return;
    }
    setShareLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordChanging(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordChanging(false);
    if (err) {
      setPasswordError(err.message ?? 'Failed to update password');
      return;
    }
    setPasswordSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSuccess(false), 3000);
  }

  function handleCopyUrl(link: ShareLinkRow) {
    const fullUrl = link.url.startsWith('http') ? link.url : (typeof window !== 'undefined' ? `${window.location.origin}${link.url}` : link.url);
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-settings dashboard-settings--loading">
          <AppLoadingIcon />
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-settings">
        <h1 className="dashboard-settings-title">Settings</h1>

        <div className="dashboard-settings-tabs" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'account'}
            aria-controls="dashboard-settings-panel-account"
            id="dashboard-settings-tab-account"
            className={`dashboard-settings-tab ${tab === 'account' ? 'dashboard-settings-tab--active' : ''}`}
            onClick={() => setTab('account')}
          >
            <Smartphone size={18} aria-hidden />
            <span>Account</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'shared-links'}
            aria-controls="dashboard-settings-panel-shared-links"
            id="dashboard-settings-tab-shared-links"
            className={`dashboard-settings-tab ${tab === 'shared-links' ? 'dashboard-settings-tab--active' : ''}`}
            onClick={() => setTab('shared-links')}
          >
            <Share2 size={18} aria-hidden />
            <span>Shared links</span>
          </button>
        </div>

        <div
          id="dashboard-settings-panel-account"
          role="tabpanel"
          aria-labelledby="dashboard-settings-tab-account"
          className="dashboard-settings-panel"
          hidden={tab !== 'account'}
        >
          <section className="dashboard-settings-section">
            <h2 className="dashboard-settings-section-title">Account</h2>
            <form onSubmit={handleSave} className="dashboard-settings-form">
              <div className="dashboard-settings-form-row">
                <label className="dashboard-settings-label" htmlFor="settings-first-name">
                  First name
                </label>
                <input
                  id="settings-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  autoComplete="given-name"
                  className="dashboard-settings-input"
                  disabled={saving}
                />
              </div>
              <div className="dashboard-settings-form-row">
                <label className="dashboard-settings-label" htmlFor="settings-last-name">
                  Last name
                </label>
                <input
                  id="settings-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  autoComplete="family-name"
                  className="dashboard-settings-input"
                  disabled={saving}
                />
              </div>
              <div className="dashboard-settings-form-row">
                <label className="dashboard-settings-label" htmlFor="settings-address-line1">
                  Address
                </label>
                <input
                  id="settings-address-line1"
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Street address"
                  autoComplete="address-line1"
                  className="dashboard-settings-input"
                  disabled={saving}
                />
              </div>
              <div className="dashboard-settings-form-row">
                <label className="dashboard-settings-label" htmlFor="settings-address-line2">
                  Address line 2 <span className="dashboard-settings-optional">(optional)</span>
                </label>
                <input
                  id="settings-address-line2"
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Unit, building, etc."
                  autoComplete="address-line2"
                  className="dashboard-settings-input"
                  disabled={saving}
                />
              </div>
              <div className="dashboard-settings-form-row dashboard-settings-form-row--grid">
                <div>
                  <label className="dashboard-settings-label" htmlFor="settings-suburb">
                    Suburb
                  </label>
                  <input
                    id="settings-suburb"
                    type="text"
                    value={suburb}
                    onChange={(e) => setSuburb(e.target.value)}
                    placeholder="Suburb"
                    autoComplete="address-level2"
                    className="dashboard-settings-input"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="dashboard-settings-label" htmlFor="settings-state">
                    State
                  </label>
                  <input
                    id="settings-state"
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    autoComplete="address-level1"
                    className="dashboard-settings-input"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="dashboard-settings-label" htmlFor="settings-postcode">
                    Postcode
                  </label>
                  <input
                    id="settings-postcode"
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="Postcode"
                    autoComplete="postal-code"
                    className="dashboard-settings-input"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="dashboard-settings-label" htmlFor="settings-country">
                    Country
                  </label>
                  <input
                    id="settings-country"
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                    autoComplete="country-name"
                    className="dashboard-settings-input"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="dashboard-settings-form-row">
                <label className="dashboard-settings-label" htmlFor="settings-mobile">
                  Phone number
                </label>
                <p className="dashboard-settings-muted" style={{ marginBottom: 6, marginTop: 0 }}>
                  Used for SMS alerts and as contact for orders.
                </p>
                <input
                  id="settings-mobile"
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. 0412 345 678"
                  autoComplete="tel"
                  className="dashboard-settings-input"
                  disabled={saving}
                />
              </div>
              {error && (
                <p className="dashboard-settings-error" role="alert">
                  <AlertCircle size={14} aria-hidden /> {error}
                </p>
              )}
              {saveSuccess && (
                <p className="dashboard-settings-success" role="status">
                  <Check size={14} aria-hidden /> Saved
                </p>
              )}
              <button type="submit" disabled={saving} className="dashboard-settings-submit">
                {saving ? <><Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> Saving…</> : 'Save profile'}
              </button>
            </form>
            <p className="dashboard-settings-signed-in" aria-label="Account email">
              Signed in as <strong>{data?.email ?? '—'}</strong>
            </p>
          </section>

          <section className="dashboard-settings-section">
            <h2 className="dashboard-settings-section-title">
              <MessageSquare size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
              SMS alerts
            </h2>
            <p className="dashboard-settings-muted" style={{ marginBottom: 12 }}>
              When enabled, GPS tracking alerts (e.g. WatchDog movement) can be sent to your phone via SMS. Limit: <strong>{data?.sms_monthly_limit ?? 30} per month</strong>.
            </p>
            <div className="dashboard-settings-sms-usage" style={{ marginBottom: 12 }}>
              <span className="dashboard-settings-usage-label">This month:</span>{' '}
              <strong>{data?.sms_usage_this_month ?? 0}</strong> / {data?.sms_monthly_limit ?? 30} SMS
            </div>
            <form onSubmit={handleSave} className="dashboard-settings-form">
              <label className="dashboard-settings-toggle-wrap">
                <span className="dashboard-settings-toggle-label">Enable SMS alerts</span>
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  disabled={saving}
                  className="dashboard-settings-toggle"
                />
              </label>
              <label className="dashboard-settings-toggle-wrap">
                <span className="dashboard-settings-toggle-label">Remind me when I have 5 SMS left</span>
                <input
                  type="checkbox"
                  checked={smsLowReminderEnabled}
                  onChange={(e) => setSmsLowReminderEnabled(e.target.checked)}
                  disabled={saving}
                  className="dashboard-settings-toggle"
                />
              </label>
              {error && (
                <p className="dashboard-settings-error" role="alert">
                  <AlertCircle size={14} aria-hidden /> {error}
                </p>
              )}
              {saveSuccess && (
                <p className="dashboard-settings-success" role="status">
                  <Check size={14} aria-hidden /> Saved
                </p>
              )}
              <button type="submit" disabled={saving} className="dashboard-settings-submit">
                {saving ? <><Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> Saving…</> : 'Save changes'}
              </button>
            </form>
          </section>

          <section className="dashboard-settings-section">
            <h2 className="dashboard-settings-section-title">
              <Lock size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
              Change password
            </h2>
            <p className="dashboard-settings-muted" style={{ marginBottom: 12 }}>
              Set a new password for your account. You will stay signed in.
            </p>
            <form onSubmit={handleChangePassword} className="dashboard-settings-form">
              <div className="dashboard-settings-form-row">
                <label className="dashboard-settings-label" htmlFor="settings-new-password">
                  New password
                </label>
                <input
                  id="settings-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="dashboard-settings-input"
                  disabled={passwordChanging}
                  minLength={8}
                />
              </div>
              <div className="dashboard-settings-form-row">
                <label className="dashboard-settings-label" htmlFor="settings-confirm-password">
                  Confirm new password
                </label>
                <input
                  id="settings-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className="dashboard-settings-input"
                  disabled={passwordChanging}
                />
              </div>
              {passwordError && (
                <p className="dashboard-settings-error" role="alert">
                  <AlertCircle size={14} aria-hidden /> {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p className="dashboard-settings-success" role="status">
                  <Check size={14} aria-hidden /> Password updated
                </p>
              )}
              <button type="submit" disabled={passwordChanging || !newPassword || !confirmPassword} className="dashboard-settings-submit">
                {passwordChanging ? <><Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} /> Updating…</> : 'Update password'}
              </button>
            </form>
          </section>
        </div>

        <div
          id="dashboard-settings-panel-shared-links"
          role="tabpanel"
          aria-labelledby="dashboard-settings-tab-shared-links"
          className="dashboard-settings-panel"
          hidden={tab !== 'shared-links'}
        >
          <section className="dashboard-settings-section">
            <h2 className="dashboard-settings-section-title">
              <Share2 size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
              Shared tracking links
            </h2>
            <p className="dashboard-settings-muted" style={{ marginBottom: 16 }}>
              Time-limited links you created to share a tracker&apos;s location. Extend the expiry or revoke a link early.
            </p>
            {shareLinksError && (
              <p className="dashboard-settings-error" role="alert" style={{ marginBottom: 12 }}>
                <AlertCircle size={14} aria-hidden /> {shareLinksError}
              </p>
            )}
            {shareLinksLoading ? (
              <div className="dashboard-settings-share-links-loading">
                <AppLoadingIcon />
              </div>
            ) : shareLinks.length === 0 ? (
              <p className="dashboard-settings-muted" style={{ margin: 0 }}>
                You have no active share links. Create one from a tracker&apos;s page via the share button.
              </p>
            ) : (
              <div className="dashboard-settings-share-links-table-wrap">
                <table className="dashboard-settings-share-links-table">
                  <thead>
                    <tr>
                      <th scope="col">Tracker</th>
                      <th scope="col">Expires</th>
                      <th scope="col">Link</th>
                      <th scope="col">Copy</th>
                      <th scope="col">Extend</th>
                      <th scope="col">Revoke</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shareLinks.map((link) => {
                      const isExpired = new Date(link.expires_at).getTime() <= Date.now();
                      const fullUrl = link.url.startsWith('http') ? link.url : (typeof window !== 'undefined' ? `${window.location.origin}${link.url}` : link.url);
                      return (
                        <tr key={link.id} className={isExpired ? 'dashboard-settings-share-link-row--expired' : ''}>
                          <td className="dashboard-settings-share-link-cell dashboard-settings-share-link-cell--device">
                            {link.device_name}
                          </td>
                          <td className="dashboard-settings-share-link-cell dashboard-settings-share-link-cell--expires">
                            <span className="dashboard-settings-share-link-expires-text">
                              {formatExpiry(link.expires_at)}
                            </span>
                            {!isExpired && (
                              <span className="dashboard-settings-share-link-relative">
                                {' '}({formatExpiryRelative(link.expires_at)})
                              </span>
                            )}
                          </td>
                          <td className="dashboard-settings-share-link-cell dashboard-settings-share-link-cell--url">
                            <code className="dashboard-settings-share-link-url">{fullUrl}</code>
                          </td>
                          <td className="dashboard-settings-share-link-cell dashboard-settings-share-link-cell--copy">
                            <button
                              type="button"
                              onClick={() => handleCopyUrl(link)}
                              className="dashboard-settings-share-link-copy"
                              title="Copy full link"
                              aria-label="Copy full link"
                            >
                              {copiedId === link.id ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                              {copiedId === link.id ? ' Copied' : ' Copy'}
                            </button>
                          </td>
                          <td className="dashboard-settings-share-link-cell dashboard-settings-share-link-cell--extend">
                            <div className="dashboard-settings-share-link-extend">
                              <select
                                value={extendBy}
                                onChange={(e) => setExtendBy(e.target.value)}
                                className="dashboard-settings-share-link-select"
                                aria-label="Extend by"
                              >
                                {EXTEND_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleExtend(link.id)}
                                disabled={extendingId === link.id}
                                className="dashboard-settings-share-link-btn dashboard-settings-share-link-btn--secondary"
                              >
                                {extendingId === link.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                                {extendingId === link.id ? ' …' : ' Extend'}
                              </button>
                            </div>
                          </td>
                          <td className="dashboard-settings-share-link-cell dashboard-settings-share-link-cell--revoke">
                            <button
                              type="button"
                              onClick={() => handleDelete(link.id)}
                              disabled={deletingId === link.id}
                              className="dashboard-settings-share-link-btn dashboard-settings-share-link-btn--danger"
                              title="Revoke link"
                              aria-label="Revoke link"
                            >
                              {deletingId === link.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}
                              {deletingId === link.id ? ' …' : ' Revoke'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
