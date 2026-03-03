'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../AdminAuthContext';
import { Power, PowerOff } from 'lucide-react';
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
  sim_iccid: string | null;
  sim_status: string | null;
};

function simStatusLabel(status: string | null): string {
  if (!status) return '—';
  const s = status.toLowerCase().trim();
  if (s === 'enabled') return 'Enabled';
  if (s === 'disabled') return 'Disabled';
  if (s === 'enabling') return 'Enabling';
  if (s === 'disabling') return 'Disabling';
  if (s === 'unknown') return 'Unknown';
  if (s === 'active') return 'Active';
  if (s === 'inactive') return 'Inactive';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function simStatusBadgeClass(status: string | null): string {
  if (!status) return 'admin-badge--muted';
  const s = status.toLowerCase().trim();
  if (s === 'enabled' || s === 'active') return 'admin-badge--success';
  if (s === 'disabled' || s === 'inactive') return 'admin-badge--warn';
  if (s === 'enabling' || s === 'disabling') return 'admin-badge--muted';
  return 'admin-badge--muted';
}

export default function AdminDevicesPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [filter, setFilter] = useState('');
  const [searchDeviceId, setSearchDeviceId] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [simTogglingIccid, setSimTogglingIccid] = useState<string | null>(null);

  function loadDevices() {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (searchDeviceId.trim()) params.set('searchDeviceId', searchDeviceId.trim());
    if (searchUser.trim()) params.set('searchUser', searchUser.trim());
    const q = params.toString() ? `?${params.toString()}` : '';
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
  }, [filter, searchDeviceId, searchUser, getAuthHeaders]);

  async function handleSimToggle(d: DeviceRow) {
    if (!d.sim_iccid || simTogglingIccid === d.sim_iccid) return;
    const nextState = d.sim_status === 'enabled' ? 'disabled' : 'enabled';
    setSimTogglingIccid(d.sim_iccid);
    try {
      const res = await fetch(`/api/admin/stock/simcards/${encodeURIComponent(d.sim_iccid)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string })?.error ?? 'Failed to update SIM state');
        return;
      }
      setDevices((prev) =>
        prev.map((row) =>
          row.id === d.id ? { ...row, sim_status: nextState } : row
        )
      );
    } finally {
      setSimTogglingIccid(null);
    }
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;

  return (
    <>
      <h1 className="admin-page-title">Devices</h1>
      <div className="admin-card" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <div className="admin-form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="admin-devices-filter" style={{ margin: 0 }}>Filter:</label>
          <select
            id="admin-devices-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="admin-select"
            style={{ minWidth: '140px' }}
          >
            <option value="">All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="unassigned">Unassigned</option>
            <option value="low_battery">Low battery (&lt;20%)</option>
          </select>
        </div>
        <div className="admin-form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="admin-devices-search-id" style={{ margin: 0 }}>Device ID:</label>
          <input
            id="admin-devices-search-id"
            type="search"
            placeholder="Search by Device ID"
            value={searchDeviceId}
            onChange={(e) => setSearchDeviceId(e.target.value)}
            className="admin-input"
            style={{ minWidth: '180px' }}
          />
        </div>
        <div className="admin-form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="admin-devices-search-user" style={{ margin: 0 }}>Assigned user:</label>
          <input
            id="admin-devices-search-user"
            type="search"
            placeholder="Search by email"
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            className="admin-input"
            style={{ minWidth: '180px' }}
          />
        </div>
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
              <th>Sim status</th>
              <th>Actions</th>
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
                <td>
                  {d.sim_iccid ? (
                    <>
                      <span className={`admin-badge ${simStatusBadgeClass(d.sim_status)}`} title={d.sim_status ?? undefined}>
                        {simStatusLabel(d.sim_status)}
                      </span>
                      {d.sim_status != null && (d.sim_status.toLowerCase() === 'enabled' || d.sim_status.toLowerCase() === 'disabled') && (
                        <button
                          type="button"
                          className="admin-btn"
                          style={{ marginLeft: '0.5rem', padding: '0.35rem', minWidth: '28px', minHeight: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => handleSimToggle(d)}
                          disabled={simTogglingIccid === d.sim_iccid}
                          title={d.sim_status?.toLowerCase() === 'enabled' ? 'Disable SIM' : 'Enable SIM'}
                          aria-label={d.sim_status?.toLowerCase() === 'enabled' ? 'Disable SIM' : 'Enable SIM'}
                        >
                          {simTogglingIccid === d.sim_iccid ? (
                            <span style={{ fontSize: '0.75rem' }}>…</span>
                          ) : d.sim_status?.toLowerCase() === 'enabled' ? (
                            <PowerOff size={14} aria-hidden />
                          ) : (
                            <Power size={14} aria-hidden />
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
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
