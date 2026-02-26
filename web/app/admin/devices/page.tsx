'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../AdminAuthContext';

const AU_TZ = 'Australia/Sydney';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

type DeviceRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  name: string | null;
  status: 'online' | 'offline';
  battery_percent: number | null;
  last_seen_at: string | null;
  created_at: string;
  ingest_disabled: boolean;
};

export default function AdminDevicesPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = filter ? `?filter=${encodeURIComponent(filter)}` : '';
    fetch(`/api/admin/devices${q}`, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load devices');
        return r.json();
      })
      .then(setDevices)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter, getAuthHeaders]);

  if (loading) return <p className="admin-time">Loading…</p>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <>
      <h1 className="admin-page-title">Devices</h1>
      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '0.5rem' }}>Filter:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="admin-form-row"
          style={{ display: 'inline-block', margin: 0, minWidth: '140px' }}
        >
          <option value="">All</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="unassigned">Unassigned</option>
          <option value="low_battery">Low battery (&lt;20%)</option>
        </select>
      </div>
      <div className="admin-card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Device ID</th>
              <th>Assigned user</th>
              <th>Status</th>
              <th>Battery</th>
              <th>Last seen (AU)</th>
              <th>Created</th>
              <th>Ingest</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td className="admin-mono">{d.id}</td>
                <td>{d.user_email ?? (d.user_id ? '—' : 'Unassigned')}</td>
                <td>
                  <span className={`admin-badge admin-badge--${d.status === 'online' ? 'success' : 'warn'}`}>
                    {d.status}
                  </span>
                </td>
                <td>{d.battery_percent != null ? `${d.battery_percent}%` : '—'}</td>
                <td className="admin-time">{formatDate(d.last_seen_at)}</td>
                <td className="admin-time">{formatDate(d.created_at)}</td>
                <td>{d.ingest_disabled ? <span className="admin-badge admin-badge--error">Disabled</span> : '—'}</td>
                <td>
                  <Link href={`/admin/devices/${encodeURIComponent(d.id)}`} className="admin-btn">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
