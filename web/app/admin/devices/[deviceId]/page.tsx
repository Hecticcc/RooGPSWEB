'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { useAdminAuth } from '../../AdminAuthContext';
import TrackerToolkitModal from './TrackerToolkitModal';
import { Wrench } from 'lucide-react';

const AU_TZ = 'Australia/Sydney';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

type PayloadRow = {
  id: string;
  gps_time: string | null;
  received_at: string;
  lat: number | null;
  lon: number | null;
  speed_kph: number | null;
  gps_valid: boolean | null;
  raw_payload: string;
  battery_percent?: number | null;
  battery_voltage_v?: number | null;
  bat_hex?: string | null;
};

type DeviceDetail = {
  device: {
    id: string;
    user_id: string;
    name: string | null;
    created_at: string;
    last_seen_at: string | null;
    ingest_disabled: boolean;
    owner_email: string | null;
    owner_role: string | null;
    sim_phone?: string | null;
    sim_iccid?: string | null;
  };
  last_payloads: PayloadRow[];
  total_payloads: number;
  payload_page: number;
  payload_limit: number;
};

export default function AdminDeviceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getAuthHeaders } = useAdminAuth();
  const deviceId = typeof params.deviceId === 'string' ? params.deviceId : '';
  const [data, setData] = useState<DeviceDetail | null>(null);
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [payloadPage, setPayloadPage] = useState(1);
  const PAYLOAD_PAGE_SIZE = 20;

  useEffect(() => {
    if (!deviceId) return;
    setPayloadPage(1);
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    const headers = getAuthHeaders();
    Promise.all([
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers }).then((r) => r.ok ? r.json() : null),
      fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}?page=${payloadPage}&limit=${PAYLOAD_PAGE_SIZE}`, { credentials: 'include', cache: 'no-store', headers }).then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Device not found' : 'Failed to load');
        return r.json();
      }),
    ])
      .then(([meData, detail]) => {
        setMe(meData ?? null);
        setData(detail);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [deviceId, payloadPage, getAuthHeaders]);

  const [users, setUsers] = useState<{ id: string; email: string | null }[]>([]);
  const [reassignUserId, setReassignUserId] = useState('');
  const isAdmin = me?.role === 'administrator';
  const canWrite = me?.role === 'staff_plus' || isAdmin;
  const canViewToolkit = me?.role === 'staff' || me?.role === 'staff_plus' || isAdmin;
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!canWrite) return;
    fetch('/api/admin/users', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; email: string | null }[]) => setUsers(list));
  }, [canWrite, getAuthHeaders]);

  async function setOffline() {
    if (!canWrite) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/offline`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed');
        return;
      }
      setData((prev) =>
        prev ? { ...prev, device: { ...prev.device, last_seen_at: null } } : null
      );
    } finally {
      setActing(false);
    }
  }

  async function setIngestDisabled(disabled: boolean) {
    if (!canWrite) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/ingest-disabled`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingest_disabled: disabled }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed');
        return;
      }
      setData((prev) =>
        prev ? { ...prev, device: { ...prev.device, ingest_disabled: disabled } } : null
      );
    } finally {
      setActing(false);
    }
  }

  async function reassign() {
    if (!canWrite || !reassignUserId) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/reassign`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: reassignUserId }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed');
        return;
      }
      const ur = users.find((u) => u.id === reassignUserId);
      setData((prev) =>
        prev
          ? {
              ...prev,
              device: {
                ...prev.device,
                user_id: reassignUserId,
                owner_email: ur?.email ?? null,
                owner_role: null,
              },
            }
          : null
      );
    } finally {
      setActing(false);
    }
  }

  function openDeleteConfirm() {
    if (!isAdmin) return;
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteDevice() {
    if (!isAdmin) return;
    setDeleteConfirmOpen(false);
    setActing(true);
    try {
      const res = await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/delete`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed');
        return;
      }
      router.push('/admin/devices');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="app-loading"><AppLoadingIcon /></div>;
  if (error) return <p className="admin-time" style={{ color: 'var(--error)' }}>{error}</p>;
  if (!data) return null;

  const d = data.device;

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/admin/devices" className="admin-btn">← Devices</Link>
      </div>
      <h1 className="admin-page-title">Device: {d.id}</h1>

      <div className="admin-card">
        <h3>Metadata</h3>
        <table className="admin-table">
          <tbody>
            <tr><td>Device ID</td><td className="admin-mono">{d.id}</td></tr>
            <tr><td>Owner</td><td>{d.owner_email ?? '—'}</td></tr>
            <tr><td>Owner role</td><td>{d.owner_role ?? '—'}</td></tr>
            <tr><td>Name</td><td>{d.name ?? '—'}</td></tr>
            <tr><td>Created</td><td className="admin-time">{formatDate(d.created_at)}</td></tr>
            <tr><td>Last seen</td><td className="admin-time">{formatDate(d.last_seen_at)}</td></tr>
            <tr><td>Ingest disabled</td><td>{d.ingest_disabled ? 'Yes' : 'No'}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="admin-card admin-device-actions">
        <h3 className="admin-device-actions__title">Actions</h3>
        <div className="admin-device-actions__grid">
          {canViewToolkit && (
            <div className="admin-device-actions__item">
              <span className="admin-device-actions__label">Support & diagnostics</span>
              <button
                type="button"
                className="admin-btn admin-btn--primary admin-device-actions__btn admin-device-actions__toolkit-btn"
                onClick={() => setToolkitOpen(true)}
              >
                <Wrench size={16} strokeWidth={2} aria-hidden />
                <span>Tracker Toolkit</span>
              </button>
            </div>
          )}
          {canWrite && users.length > 0 && (
            <div className="admin-device-actions__item admin-device-actions__reassign">
              <span className="admin-device-actions__label">Reassign device</span>
              <div className="admin-device-actions__reassign-row">
                <select
                  value={reassignUserId}
                  onChange={(e) => setReassignUserId(e.target.value)}
                  className="admin-device-actions__select"
                  aria-label="Select user"
                >
                  <option value="">Select user</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email ?? u.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary admin-device-actions__btn"
                  onClick={reassign}
                  disabled={acting || !reassignUserId}
                >
                  Reassign
                </button>
              </div>
            </div>
          )}
          {canWrite && (
            <>
              <div className="admin-device-actions__item">
                <span className="admin-device-actions__label">Status</span>
                <div className="admin-device-actions__btn-row">
                  <button
                    type="button"
                    className="admin-btn admin-device-actions__btn"
                    onClick={setOffline}
                    disabled={acting}
                  >
                    Force mark offline
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-device-actions__btn"
                    onClick={() => setIngestDisabled(!d.ingest_disabled)}
                    disabled={acting}
                  >
                    {d.ingest_disabled ? 'Enable ingest' : 'Disable ingest'}
                  </button>
                </div>
              </div>
            </>
          )}
          {isAdmin && (
            <div className="admin-device-actions__item admin-device-actions__item--danger">
              <span className="admin-device-actions__label">Danger zone</span>
              <button
                type="button"
                className="admin-device-actions__delete-btn"
                onClick={openDeleteConfirm}
                disabled={acting}
              >
                Delete device + history
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-payloads-header">
          <h3 style={{ margin: 0 }}>Raw payloads</h3>
          <div className="admin-payloads-header__right">
            {data.total_payloads > 0 && (
              <button
                type="button"
                className="admin-payloads-export"
                onClick={() => {
                  const headers = ['Received (AU)', 'GPS time', 'Lat', 'Lon', 'Speed', 'GPS valid', 'Battery %', 'Battery V', 'bat_hex', 'Raw'];
                  const rows = data.last_payloads.map((p) => [
                    formatDate(p.received_at),
                    formatDate(p.gps_time),
                    p.lat ?? '',
                    p.lon ?? '',
                    p.speed_kph ?? '',
                    p.gps_valid == null ? '' : p.gps_valid ? 'Y' : 'N',
                    p.battery_percent ?? '',
                    p.battery_voltage_v != null ? `${p.battery_voltage_v}` : '',
                    p.bat_hex ?? '',
                    p.raw_payload,
                  ]);
                  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\r\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `payloads-page-${data.payload_page}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </button>
            )}
            {data.total_payloads > 0 && (
            <div className="admin-pagination" role="navigation" aria-label="Payloads pagination">
              <span className="admin-pagination-info">
                Page {data.payload_page} of {Math.max(1, Math.ceil(data.total_payloads / data.payload_limit))} ({data.total_payloads} total)
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                onClick={() => setPayloadPage((p) => Math.max(1, p - 1))}
                disabled={data.payload_page <= 1}
                aria-label="Previous page"
              >
                ← Prev
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                onClick={() => setPayloadPage((p) => p + 1)}
                disabled={data.payload_page >= Math.ceil(data.total_payloads / data.payload_limit)}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>
          )}
          </div>
        </div>
        <p className="admin-time">Parsed fields: lat, lon, speed, battery % and voltage (iStartek v2.2 ext-V|bat-V), gps_valid. 20 per page.</p>
        <div className="admin-table-wrap admin-table-wrap--scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Received (AU)</th>
                <th>GPS time</th>
                <th>Lat</th>
                <th>Lon</th>
                <th>Speed</th>
                <th>GPS valid</th>
                <th>Battery %</th>
                <th>Battery V</th>
                <th>bat_hex</th>
                <th>Raw</th>
              </tr>
            </thead>
            <tbody>
              {data.last_payloads.map((p) => (
                <tr key={p.id}>
                  <td className="admin-time">{formatDate(p.received_at)}</td>
                  <td className="admin-time">{formatDate(p.gps_time)}</td>
                  <td>{p.lat ?? '—'}</td>
                  <td>{p.lon ?? '—'}</td>
                  <td>{p.speed_kph ?? '—'}</td>
                  <td>{p.gps_valid == null ? '—' : p.gps_valid ? 'Y' : 'N'}</td>
                  <td>{p.battery_percent ?? '—'}</td>
                  <td>{p.battery_voltage_v != null ? `${p.battery_voltage_v} V` : '—'}</td>
                  <td className="admin-mono" style={{ fontSize: '0.85em' }} title="Protocol bat-V hex (V×100)">{p.bat_hex ?? '—'}</td>
                  <td className="admin-mono" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.raw_payload}>
                    {p.raw_payload}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirmOpen && (
        <div
          className="admin-delete-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-delete-confirm-title"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirmOpen(false)}
        >
          <div className="admin-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="admin-delete-confirm-title" className="admin-delete-confirm-title">Delete device?</h3>
            <p className="admin-delete-confirm-message">
              This will permanently delete the device and all its location history. This cannot be undone.
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={confirmDeleteDevice}
                disabled={acting}
              >
                Delete device
              </button>
            </div>
          </div>
        </div>
      )}

      {toolkitOpen && (
        <TrackerToolkitModal
          deviceId={deviceId}
          deviceSimPhone={d.sim_phone ?? null}
          deviceSimIccid={d.sim_iccid ?? null}
          canWrite={canWrite}
          getAuthHeaders={getAuthHeaders}
          onClose={() => setToolkitOpen(false)}
        />
      )}
    </>
  );
}
