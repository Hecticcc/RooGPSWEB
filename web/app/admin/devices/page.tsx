'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../AdminAuthContext';
import { Trash2 } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';

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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteDeviceId, setConfirmDeleteDeviceId] = useState<string | null>(null);

  const isAdministrator = userRole === 'administrator';
  const deviceToConfirm = confirmDeleteDeviceId ? devices.find((d) => d.id === confirmDeleteDeviceId) : null;

  function loadDevices() {
    const q = filter ? `?filter=${encodeURIComponent(filter)}` : '';
    return fetch(`/api/admin/devices${q}`, { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const msg = (body as { error?: string })?.error ?? 'Failed to load devices';
          throw new Error(msg);
        }
        return r.json();
      })
      .then(setDevices)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load devices'));
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)),
      loadDevices(),
    ])
      .then(([meData]) => {
        setUserRole(meData?.role ?? null);
      })
      .finally(() => setLoading(false));
  }, [filter, getAuthHeaders]);

  useEffect(() => {
    if (!confirmDeleteDeviceId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDeleteDeviceId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDeleteDeviceId]);

  async function handleDelete(deviceId: string) {
    if (!isAdministrator) return;
    setConfirmDeleteDeviceId(null);
    setDeletingId(deviceId);
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/delete`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string })?.error ?? 'Delete failed');
        return;
      }
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
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
                  {isAdministrator && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="admin-btn admin-btn--danger"
                        onClick={() => setConfirmDeleteDeviceId(d.id)}
                        disabled={deletingId === d.id}
                        title="Delete device and all location history"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDeleteDeviceId && deviceToConfirm && (
        <div
          className="admin-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-confirm-title"
          onClick={() => setConfirmDeleteDeviceId(null)}
        >
          <div className="admin-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-confirm-icon-wrap">
              <Trash2 size={40} strokeWidth={1.5} aria-hidden />
            </div>
            <h2 id="admin-confirm-title" className="admin-confirm-title">
              Delete device?
            </h2>
            <p className="admin-confirm-message">
              This will permanently delete the device and all its location history. This cannot be undone.
            </p>
            <p className="admin-confirm-device-id admin-mono">{deviceToConfirm.id}</p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => setConfirmDeleteDeviceId(null)}
                disabled={deletingId === confirmDeleteDeviceId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={() => handleDelete(confirmDeleteDeviceId)}
                disabled={deletingId === confirmDeleteDeviceId}
              >
                {deletingId === confirmDeleteDeviceId ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
