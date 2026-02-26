'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '../AdminAuthContext';

const AU_TZ = 'Australia/Sydney';

function formatAuTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

type Stats = {
  total_users: number;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  locations_last_24h: number;
  deadletter_count: number | null;
  ingest_health: { status?: string; uptime_seconds?: number; last_error?: string; last_error_at?: string } | null;
  ingest_error: string | null;
  ingest_started_at: string | null;
  last_location_received_at: string | null;
};

export default function AdminDashboardPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Forbidden' : 'Failed to load');
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  if (loading) return <p className="admin-time">Loading…</p>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;
  if (!stats) return null;

  return (
    <>
      <h1 className="admin-page-title">Dashboard</h1>
      <div className="admin-stats-grid">
        <div className="admin-card">
          <h3>Total users</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.total_users}</p>
        </div>
        <div className="admin-card">
          <h3>Total devices</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.total_devices}</p>
        </div>
        <div className="admin-card">
          <h3>Online devices</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.online_devices}</p>
          <p className="admin-time">last 10 min</p>
        </div>
        <div className="admin-card">
          <h3>Offline devices</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.offline_devices}</p>
        </div>
        <div className="admin-card">
          <h3>Locations (24h)</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stats.locations_last_24h}</p>
        </div>
        <div className="admin-card">
          <h3>Deadletter count</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            {stats.deadletter_count ?? '—'}
          </p>
          <p className="admin-time">unknown devices</p>
        </div>
      </div>
      <div className="admin-card">
        <h3>Ingest service</h3>
        {stats.ingest_error ? (
          <p style={{ color: 'var(--error)' }}>{stats.ingest_error}</p>
        ) : stats.ingest_health ? (
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>Status: <strong>{stats.ingest_health.status ?? '—'}</strong></li>
            <li>Uptime: {stats.ingest_health.uptime_seconds != null ? `${stats.ingest_health.uptime_seconds}s` : '—'}</li>
            {stats.ingest_started_at && (
              <li>Service started: {formatAuTime(stats.ingest_started_at)}</li>
            )}
            {stats.last_location_received_at && (
              <li>Last data received: {formatAuTime(stats.last_location_received_at)}</li>
            )}
            {stats.ingest_health.last_error && (
              <li style={{ color: 'var(--error)' }}>
                Last error: {stats.ingest_health.last_error}
                {stats.ingest_health.last_error_at && (
                  <span className="admin-time" style={{ marginLeft: 6 }}>({formatAuTime(stats.ingest_health.last_error_at)})</span>
                )}
              </li>
            )}
          </ul>
        ) : (
          <p className="admin-time">INGEST_HEALTH_URL not configured</p>
        )}
      </div>
    </>
  );
}
