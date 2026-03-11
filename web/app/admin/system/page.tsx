'use client';

import { useEffect, useState, useRef } from 'react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { useAdminAuth } from '../AdminAuthContext';
import { MessageSquare, Info } from 'lucide-react';

const RETENTION_TOOLTIP_TEXT = 'Deletes locations older than ADMIN_RETENTION_DAYS (default 90).';
const TOOLTIP_SHOW_DELAY_MS = 80;

type SystemData = {
  supabase_connected: boolean;
  ingest_health_url_configured: boolean;
  ingest_status: string;
  ingest_uptime_seconds: number | null;
  /** Count of locations in last 24h by ingest_server (e.g. { Skippy: 1234, Joey: 567 }) */
  ingest_server_usage_24h?: Record<string, number>;
  maintenance_mode: boolean;
  ingest_accept: boolean;
  login_disabled: boolean;
  stripe_trial_enabled?: boolean;
  stripe_trial_default_months?: number | null;
  stripe_trial_updated_at?: string | null;
  stripe_trial_updated_by?: string | null;
  app_version: string | null;
  git_commit: string | null;
  environment: string;
};

export default function AdminSystemPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [data, setData] = useState<SystemData | null>(null);
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [pendingActions, setPendingActions] = useState<{ maintenance_mode: boolean; ingest_accept: boolean; login_disabled: boolean } | null>(null);
  const [actionsToast, setActionsToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [smsTestTo, setSmsTestTo] = useState('');
  const [smsTestMessage, setSmsTestMessage] = useState('');
  const [smsTestStatus, setSmsTestStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [smsTestError, setSmsTestError] = useState<string | null>(null);
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialMonths, setTrialMonths] = useState<string>('');
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialToast, setTrialToast] = useState<string | null>(null);
  const [retentionTooltipVisible, setRetentionTooltipVisible] = useState(false);
  const retentionTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (retentionTooltipTimerRef.current) clearTimeout(retentionTooltipTimerRef.current);
    };
  }, []);

  function showRetentionTooltip() {
    retentionTooltipTimerRef.current = setTimeout(() => setRetentionTooltipVisible(true), TOOLTIP_SHOW_DELAY_MS);
  }
  function hideRetentionTooltip() {
    if (retentionTooltipTimerRef.current) {
      clearTimeout(retentionTooltipTimerRef.current);
      retentionTooltipTimerRef.current = null;
    }
    setRetentionTooltipVisible(false);
  }

  useEffect(() => {
    const headers = getAuthHeaders();
    Promise.all([
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers }).then((r) => r.ok ? r.json() : null),
      fetch('/api/admin/system', { credentials: 'include', cache: 'no-store', headers }).then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      }),
    ])
      .then(([meData, sys]) => {
        setMe(meData ?? null);
        setData(sys);
        setPendingActions({
          maintenance_mode: sys?.maintenance_mode ?? false,
          ingest_accept: sys?.ingest_accept ?? true,
          login_disabled: sys?.login_disabled ?? false,
        });
        setTrialEnabled(sys?.stripe_trial_enabled ?? false);
        setTrialMonths(sys?.stripe_trial_default_months != null ? String(sys.stripe_trial_default_months) : '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  const isAdmin = me?.role === 'administrator';

  async function updateSystem(updates: { maintenance_mode?: boolean; ingest_accept?: boolean; login_disabled?: boolean; stripe_trial_enabled?: boolean; stripe_trial_default_months?: number | null }) {
    if (!isAdmin) return;
    setActing(true);
    try {
      const res = await fetch('/api/admin/system', {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed');
        return;
      }
      setData((prev) => (prev ? { ...prev, ...updates } : null));
    } finally {
      setActing(false);
    }
  }

  async function saveActions() {
    if (!isAdmin || !pendingActions) return;
    setActing(true);
    setActionsToast(null);
    try {
      const res = await fetch('/api/admin/system', {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingActions),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionsToast({ ok: false, msg: (d as { error?: string }).error ?? 'Failed to save' });
        return;
      }
      setData((prev) => (prev ? { ...prev, ...pendingActions } : null));
      setActionsToast({ ok: true, msg: 'Saved.' });
      setTimeout(() => setActionsToast(null), 3000);
    } finally {
      setActing(false);
    }
  }

  const actionsDirty = pendingActions && data && (
    pendingActions.maintenance_mode !== data.maintenance_mode ||
    pendingActions.ingest_accept !== data.ingest_accept ||
    pendingActions.login_disabled !== data.login_disabled
  );

  async function runRetention() {
    if (!isAdmin) return;
    if (!confirm('Run retention cleanup (delete locations older than configured days)?')) return;
    setActing(true);
    try {
      const res = await fetch('/api/admin/system/retention', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed');
        return;
      }
      const d = await res.json();
      alert(`Done. Deleted ${d.deleted_count ?? 0} location(s).`);
    } finally {
      setActing(false);
    }
  }

  async function saveTrialSettings() {
    if (!isAdmin) return;
    const monthsVal = trialMonths.trim() === '' ? null : parseInt(trialMonths, 10);
    if (monthsVal != null && (Number.isNaN(monthsVal) || monthsVal < 0 || monthsVal > 24)) {
      setTrialToast('Trial months must be 0–24 or empty.');
      return;
    }
    setTrialSaving(true);
    setTrialToast(null);
    try {
      const res = await fetch('/api/admin/system', {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripe_trial_enabled: trialEnabled, stripe_trial_default_months: monthsVal }),
        credentials: 'include',
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTrialToast((d as { error?: string }).error ?? 'Failed to save');
        return;
      }
      setData((prev) => (prev ? { ...prev, stripe_trial_enabled: trialEnabled, stripe_trial_default_months: monthsVal } : null));
      setTrialToast('Trial settings saved.');
      setTimeout(() => setTrialToast(null), 3000);
    } finally {
      setTrialSaving(false);
    }
  }

  async function sendTestSms() {
    const to = smsTestTo.trim();
    const message = smsTestMessage.trim();
    if (!to || !message) {
      setSmsTestStatus('err');
      setSmsTestError('Enter a phone number and message.');
      return;
    }
    setSmsTestStatus('sending');
    setSmsTestError(null);
    try {
      const res = await fetch('/api/admin/sms/test', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSmsTestStatus('err');
        setSmsTestError((data as { error?: string }).error ?? 'Failed to send');
        return;
      }
      setSmsTestStatus('ok');
      setSmsTestError(null);
    } catch (e) {
      setSmsTestStatus('err');
      setSmsTestError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;
  if (!data) return null;

  return (
    <>
      <h1 className="admin-page-title">System</h1>

      <div className="admin-card">
        <h3>Status</h3>
        <table className="admin-table">
          <tbody>
            <tr><td>Supabase</td><td>{data.supabase_connected ? 'Connected' : '—'}</td></tr>
            <tr><td>Ingest URL configured</td><td>{data.ingest_health_url_configured ? 'Yes' : 'No'}</td></tr>
            <tr><td>Ingest status</td><td>{data.ingest_status}</td></tr>
            <tr><td>Ingest uptime (s)</td><td>{data.ingest_uptime_seconds ?? '—'}</td></tr>
            <tr><td>App version</td><td>{data.app_version ?? '—'}</td></tr>
            <tr><td>Git commit</td><td className="admin-mono">{data.git_commit ?? '—'}</td></tr>
            <tr><td>Environment</td><td>{data.environment}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="admin-card admin-system-ingest-card">
        <h3>Ingest server usage (24h)</h3>
        {data.ingest_server_usage_24h && Object.keys(data.ingest_server_usage_24h).length > 0 ? (
          <div className="admin-system-ingest-usage-block">
            {(() => {
              const entries = Object.entries(data.ingest_server_usage_24h)
                .sort(([, a], [, b]) => b - a);
              const total = entries.reduce((s, [, n]) => s + n, 0);
              return (
                <>
                  <div className="admin-system-ingest-usage-total">
                    <strong>{total.toLocaleString()}</strong> location packets in last 24h
                  </div>
                  <div className="admin-system-ingest-usage-bars">
                    {entries.map(([server, count]) => {
                      const pct = total > 0 ? (100 * count) / total : 0;
                      const isLeader = entries[0][0] === server;
                      return (
                        <div key={server} className="admin-system-ingest-usage-row">
                          <div className="admin-system-ingest-usage-row-head">
                            <span className="admin-system-ingest-usage-server">
                              {server === '(none)' ? 'Unknown' : server}
                              {isLeader && <span className="admin-system-ingest-usage-leader"> (most traffic)</span>}
                            </span>
                            <span className="admin-system-ingest-usage-meta">
                              {count.toLocaleString()} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="admin-system-ingest-usage-bar-bg">
                            <div
                              className="admin-system-ingest-usage-bar-fill"
                              style={{ width: `${Math.max(2, pct)}%` }}
                              role="presentation"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <p className="admin-system-ingest-usage-empty">—</p>
        )}
      </div>

      {isAdmin && (
        <div className="admin-system-actions-grid">
          <section className="admin-system-card">
            <h3 className="admin-system-card-title">Actions (Administrator only)</h3>
            <div className="admin-system-toggles">
              <label className="admin-system-toggle">
                <input
                  type="checkbox"
                  checked={pendingActions?.maintenance_mode ?? data.maintenance_mode}
                  onChange={(e) => setPendingActions((p) => p ? { ...p, maintenance_mode: e.target.checked } : p)}
                  disabled={acting}
                />
                <span className="admin-system-toggle-label">Maintenance mode</span>
              </label>
              <label className="admin-system-toggle">
                <input
                  type="checkbox"
                  checked={pendingActions?.ingest_accept ?? data.ingest_accept}
                  onChange={(e) => setPendingActions((p) => p ? { ...p, ingest_accept: e.target.checked } : p)}
                  disabled={acting}
                />
                <span className="admin-system-toggle-label">Ingest accept</span>
                <span className="admin-system-toggle-hint">Uncheck to reject new data</span>
              </label>
              <label className="admin-system-toggle">
                <input
                  type="checkbox"
                  checked={pendingActions?.login_disabled ?? data.login_disabled}
                  onChange={(e) => setPendingActions((p) => p ? { ...p, login_disabled: e.target.checked } : p)}
                  disabled={acting}
                />
                <span className="admin-system-toggle-label admin-system-toggle-label--danger">
                  Disable logins
                </span>
                <span className="admin-system-toggle-hint">
                  Blocks customer logins. Staff+ and administrators can always log in.
                </span>
              </label>
            </div>
            <div className="admin-system-actions-row" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={saveActions}
                disabled={acting || !actionsDirty}
              >
                {acting ? 'Saving…' : 'Save'}
              </button>
              {actionsDirty && !acting && (
                <span className="admin-system-dirty-hint">Unsaved changes</span>
              )}
              {actionsToast && (
                <span className={`admin-system-status ${actionsToast.ok ? 'admin-system-status--success' : 'admin-system-status--error'}`}>
                  {actionsToast.msg}
                </span>
              )}
            </div>
            <div className="admin-system-retention">
              <div className="admin-system-retention-row">
                <button
                  type="button"
                  className="admin-btn admin-btn--subtle"
                  onClick={runRetention}
                  disabled={acting}
                >
                  Trigger retention cleanup
                </button>
                <span
                  className="admin-system-retention-info-wrap"
                  onMouseEnter={showRetentionTooltip}
                  onMouseLeave={hideRetentionTooltip}
                  onFocus={showRetentionTooltip}
                  onBlur={hideRetentionTooltip}
                >
                  <span
                    className="admin-system-retention-info"
                    aria-label={RETENTION_TOOLTIP_TEXT}
                    tabIndex={0}
                  >
                    <Info size={16} strokeWidth={2} aria-hidden />
                  </span>
                  {retentionTooltipVisible && (
                    <span className="admin-system-retention-tooltip" role="tooltip">
                      {RETENTION_TOOLTIP_TEXT}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </section>

          <section className="admin-system-card">
            <h3 className="admin-system-card-title">Subscription Trial Settings</h3>
            <p className="admin-system-card-desc">
              Applies to new subscriptions only. Existing subscriptions keep the trial they were created with.
            </p>
            <div className="admin-system-toggles">
              <label className="admin-system-toggle">
                <input
                  type="checkbox"
                  checked={trialEnabled}
                  onChange={(e) => setTrialEnabled(e.target.checked)}
                  disabled={trialSaving}
                />
                <span className="admin-system-toggle-label">Enable free trial</span>
              </label>
            </div>
            <div className="admin-system-field">
              <label className="admin-system-field-label">
                Default trial length (months) <span className="admin-system-field-hint">0–24</span>
              </label>
              <input
                type="number"
                min={0}
                max={24}
                value={trialMonths}
                onChange={(e) => setTrialMonths(e.target.value)}
                className="admin-input admin-system-input-narrow"
                placeholder="e.g. 6"
                disabled={trialSaving}
              />
            </div>
            <div className="admin-system-card-footer">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={saveTrialSettings}
                disabled={trialSaving}
              >
                {trialSaving ? 'Saving…' : 'Save trial settings'}
              </button>
              {trialToast && (
                <p className={`admin-system-toast ${trialToast.startsWith('Trial') && trialToast.includes('saved') ? 'admin-system-toast--success' : 'admin-system-toast--error'}`}>
                  {trialToast}
                </p>
              )}
            </div>
          </section>

          <section className="admin-system-card">
            <h3 className="admin-system-card-title admin-system-card-title--with-icon">
              <MessageSquare size={18} aria-hidden /> SMS testing
            </h3>
            <p className="admin-system-card-desc">
              Send a test SMS via SMSPortal. Does not count against user usage.
            </p>
            <div className="admin-system-form">
              <div className="admin-system-field">
                <label className="admin-system-field-label">Phone number</label>
                <input
                  type="text"
                  value={smsTestTo}
                  onChange={(e) => setSmsTestTo(e.target.value)}
                  placeholder="04xxxxxxxx or +61..."
                  className="admin-input"
                  disabled={smsTestStatus === 'sending'}
                />
              </div>
              <div className="admin-system-field">
                <label className="admin-system-field-label">Message</label>
                <textarea
                  value={smsTestMessage}
                  onChange={(e) => setSmsTestMessage(e.target.value)}
                  placeholder="Test message..."
                  className="admin-input"
                  rows={3}
                  disabled={smsTestStatus === 'sending'}
                />
              </div>
              <div className="admin-system-actions-row">
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  onClick={sendTestSms}
                  disabled={smsTestStatus === 'sending'}
                >
                  {smsTestStatus === 'sending' ? 'Sending…' : 'Send test SMS'}
                </button>
                {smsTestStatus === 'ok' && <span className="admin-system-status admin-system-status--success">Sent successfully.</span>}
                {smsTestStatus === 'err' && smsTestError && <span className="admin-system-status admin-system-status--error">{smsTestError}</span>}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
