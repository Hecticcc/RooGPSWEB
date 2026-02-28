'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Smartphone, MessageSquare, Check, Loader2, AlertCircle } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';

type SettingsData = {
  email: string | null;
  mobile: string | null;
  sms_alerts_enabled: boolean;
  sms_usage_this_month: number;
  sms_monthly_limit: number;
  battery_alert_enabled?: boolean;
  battery_alert_percent?: number;
  battery_alert_email?: boolean;
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [mobile, setMobile] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);

  useEffect(() => {
    const headers: HeadersInit = { 'Cache-Control': 'no-cache' };
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      fetch('/api/account/settings', { credentials: 'include', headers })
        .then((r) => {
          if (!r.ok) throw new Error('Failed to load');
          return r.json();
        })
        .then((d: SettingsData) => {
          setData(d);
          setMobile(d.mobile ?? '');
          setSmsEnabled(d.sms_alerts_enabled ?? false);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveSuccess(false);
    setSaving(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    const res = await fetch('/api/account/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        mobile: mobile.trim() || null,
        sms_alerts_enabled: smsEnabled,
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
            sms_alerts_enabled: smsEnabled,
          }
        : null
    );
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-settings" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <AppLoadingIcon />
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-settings">
        <h1 className="dashboard-settings-title">Settings</h1>

        <section className="dashboard-settings-section">
          <h2 className="dashboard-settings-section-title">Account</h2>
          <p className="dashboard-settings-email">
            Signed in as <strong>{data?.email ?? '—'}</strong>
          </p>
        </section>

        <section className="dashboard-settings-section">
          <h2 className="dashboard-settings-section-title">
            <Smartphone size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
            Phone number
          </h2>
          <p className="dashboard-settings-muted" style={{ marginBottom: 8 }}>
            Used for GPS tracking SMS alerts (e.g. WatchDog). Set when you signed up, or add one below if you don&apos;t have one.
          </p>
          <form onSubmit={handleSave} className="dashboard-settings-form">
            <label className="dashboard-settings-label" htmlFor="settings-mobile">
              Mobile
            </label>
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
          </form>
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
      </div>
    </main>
  );
}
