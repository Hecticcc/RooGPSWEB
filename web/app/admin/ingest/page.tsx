'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '../AdminAuthContext';

type DeadletterEntry = { ts: string; device_id: string; raw: string };
type DeadletterData = { entries: DeadletterEntry[]; total_writes: number };

export default function AdminIngestPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [deadletter, setDeadletter] = useState<DeadletterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimUserId, setClaimUserId] = useState('');
  const [users, setUsers] = useState<{ id: string; email: string | null }[]>([]);

  useEffect(() => {
    const headers = getAuthHeaders();
    Promise.all([
      fetch('/api/admin/ingest/health', { credentials: 'include', cache: 'no-store', headers }).then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        setHealthError(body?.error ?? `HTTP ${r.status}`);
        return null;
      }),
      fetch('/api/admin/ingest/deadletter', { credentials: 'include', cache: 'no-store', headers }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch('/api/admin/users', { credentials: 'include', cache: 'no-store', headers }).then((r) =>
        r.ok ? r.json() : []
      ),
    ])
      .then(([h, d, u]) => {
        setHealth(h ?? null);
        setDeadletter(d ?? null);
        setUsers(u ?? []);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  function formatUptime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h}h ${min}m`;
  }

  async function copyRaw(raw: string) {
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      // ignore
    }
  }

  async function claim(deviceId: string) {
    if (!claimUserId) return;
    setClaiming(deviceId);
    try {
      const res = await fetch('/api/admin/ingest/claim', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, user_id: claimUserId }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed');
        return;
      }
      setDeadletter((prev) =>
        prev
          ? { ...prev, entries: prev.entries.filter((e) => e.device_id !== deviceId) }
          : null
      );
    } finally {
      setClaiming(null);
    }
  }

  if (loading) return <p className="admin-time">Loading…</p>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <>
      <h1 className="admin-page-title">Ingest</h1>

      <div className="admin-card">
        <h3>Health</h3>
        {health ? (
          <div className="admin-ingest-health">
            <div className="admin-ingest-health-grid">
              {health.status != null && (
                <div className="admin-ingest-health-item">
                  <span className="admin-ingest-health-label">Status</span>
                  <span className={`admin-ingest-health-value admin-ingest-health-value--${String(health.status)}`}>
                    {String(health.status)}
                  </span>
                </div>
              )}
              {health.uptime_seconds != null && (
                <div className="admin-ingest-health-item">
                  <span className="admin-ingest-health-label">Uptime</span>
                  <span className="admin-ingest-health-value">{formatUptime(Number(health.uptime_seconds))}</span>
                </div>
              )}
              {health.connections != null && (
                <div className="admin-ingest-health-item">
                  <span className="admin-ingest-health-label">Connections</span>
                  <span className="admin-ingest-health-value">{Number(health.connections)}</span>
                </div>
              )}
              {health.inserted_rows != null && (
                <div className="admin-ingest-health-item">
                  <span className="admin-ingest-health-label">Inserted rows</span>
                  <span className="admin-ingest-health-value">{Number(health.inserted_rows).toLocaleString()}</span>
                </div>
              )}
              {health.deadletter_writes != null && (
                <div className="admin-ingest-health-item">
                  <span className="admin-ingest-health-label">Deadletter writes</span>
                  <span className="admin-ingest-health-value">{Number(health.deadletter_writes).toLocaleString()}</span>
                </div>
              )}
              {health.rejected_unknown_device != null && (
                <div className="admin-ingest-health-item">
                  <span className="admin-ingest-health-label">Rejected (unknown device)</span>
                  <span className="admin-ingest-health-value">{Number(health.rejected_unknown_device).toLocaleString()}</span>
                </div>
              )}
              {health.errors != null && Number(health.errors) > 0 && (
                <div className="admin-ingest-health-item">
                  <span className="admin-ingest-health-label">Errors</span>
                  <span className="admin-ingest-health-value" style={{ color: 'var(--error)' }}>{Number(health.errors)}</span>
                </div>
              )}
            </div>
            {health.last_error != null && String(health.last_error) !== '' ? (
              <p className="admin-ingest-health-last-error">
                Last error: <span style={{ color: 'var(--error)' }}>{String(health.last_error)}</span>
                {health.last_error_at != null && String(health.last_error_at) !== '' ? (
                  <span className="admin-time" style={{ marginLeft: 8 }}>
                    at {new Date(String(health.last_error_at)).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Australia/Sydney' })}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="admin-time" style={{ color: 'var(--error)' }}>
            {healthError ?? 'INGEST_HEALTH_URL not configured or unreachable'}
          </p>
        )}
        {!health && (
          <p className="admin-time" style={{ marginTop: '0.5rem' }}>
            If INGEST_HEALTH_URL is in .env.local, restart the dev server (npm run dev) so the server picks it up.
          </p>
        )}
      </div>

      <div className="admin-card">
        <h3>Deadletter (unknown devices)</h3>
        <p className="admin-time">
          Total writes: {deadletter?.total_writes ?? '—'}. Select a user below, then click Claim on a row to assign that device to them.
        </p>
        <div className="admin-form-row admin-ingest-claim-row">
          <label>Claim to user:</label>
          <select
            className="admin-select"
            value={claimUserId}
            onChange={(e) => setClaimUserId(e.target.value)}
          >
            <option value="">Select user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email ?? u.id}
              </option>
            ))}
          </select>
          {claimUserId && (
            <span className="admin-time admin-ingest-claim-hint">Selected user will be used when you click Claim on a row.</span>
          )}
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Device ID</th>
                <th>Raw payload</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(deadletter?.entries ?? []).map((e, i) => (
                <tr key={`${e.device_id}-${e.ts}-${i}`}>
                  <td className="admin-time">{e.ts}</td>
                  <td className="admin-mono">{e.device_id}</td>
                  <td className="admin-mono" style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.raw}>
                    {e.raw}
                  </td>
                  <td>
                    <button type="button" className="admin-btn" onClick={() => copyRaw(e.raw)}>
                      Copy raw
                    </button>
                    {' '}
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      onClick={() => claim(e.device_id)}
                      disabled={!claimUserId || claiming === e.device_id}
                    >
                      Claim
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deadletter && (deadletter.entries?.length ?? 0) === 0 && (
          <div className="admin-ingest-empty">
            <p className="admin-time">No recent deadletter entries.</p>
            <p className="admin-time admin-ingest-empty-note">
              The <strong>Claim</strong> button appears on each row when unknown devices are listed here. When a device sends data but isn’t assigned to any user, it appears in this table—then you select a user above and click Claim on that row to assign the device.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
