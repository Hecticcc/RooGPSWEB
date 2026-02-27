'use client';

import { useEffect, useState } from 'react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { useAdminAuth } from '../AdminAuthContext';

type SystemData = {
  supabase_connected: boolean;
  ingest_health_url_configured: boolean;
  ingest_status: string;
  ingest_uptime_seconds: number | null;
  maintenance_mode: boolean;
  ingest_accept: boolean;
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
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  const isAdmin = me?.role === 'administrator';

  async function updateSystem(updates: { maintenance_mode?: boolean; ingest_accept?: boolean }) {
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

      {isAdmin && (
        <div className="admin-card admin-system-actions">
          <h3>Actions (Administrator only)</h3>
          <div className="admin-system-toggles">
            <label className="admin-system-toggle">
              <input
                type="checkbox"
                checked={data.maintenance_mode}
                onChange={(e) => updateSystem({ maintenance_mode: e.target.checked })}
                disabled={acting}
              />
              <span className="admin-system-toggle-label">Maintenance mode</span>
            </label>
            <label className="admin-system-toggle">
              <input
                type="checkbox"
                checked={data.ingest_accept}
                onChange={(e) => updateSystem({ ingest_accept: e.target.checked })}
                disabled={acting}
              />
              <span className="admin-system-toggle-label">Ingest accept</span>
              <span className="admin-system-toggle-hint">Uncheck to reject new data</span>
            </label>
          </div>
          <div className="admin-system-retention">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={runRetention}
              disabled={acting}
            >
              Trigger retention cleanup
            </button>
            <p className="admin-system-retention-hint">Deletes locations older than ADMIN_RETENTION_DAYS (default 90).</p>
          </div>
        </div>
      )}
    </>
  );
}
