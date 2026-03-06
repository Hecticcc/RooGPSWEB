'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { useAdminAuth } from '../../AdminAuthContext';
import TrackerToolkitModal from './TrackerToolkitModal';
import { Wrench } from 'lucide-react';

function SearchableSimSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  minWidth = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { iccid: string }[];
  placeholder: string;
  disabled?: boolean;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [listPosition, setListPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = value.trim()
    ? options.filter((o) => o.iccid.toLowerCase().includes(value.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open || !containerRef.current) {
      setListPosition(null);
      return;
    }
    const el = containerRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setListPosition({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, minWidth),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, minWidth]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const list = document.querySelector('.searchable-select__list--fixed');
        if (list && list.contains(e.target as Node)) return;
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const listEl = open && listPosition && typeof document !== 'undefined' && (
    <ul
      className="searchable-select__list searchable-select__list--fixed"
      role="listbox"
      style={{
        position: 'fixed',
        top: listPosition.top,
        left: listPosition.left,
        width: listPosition.width,
        zIndex: 9999,
      }}
    >
      {filtered.length === 0 ? (
        <li className="searchable-select__item searchable-select__item--empty">No matches — type to search or enter ICCID</li>
      ) : (
        filtered.slice(0, 100).map((opt) => (
          <li
            key={opt.iccid}
            role="option"
            aria-selected={value === opt.iccid}
            className="searchable-select__item"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(opt.iccid);
              setOpen(false);
            }}
          >
            <span className="admin-mono">{opt.iccid}</span>
          </li>
        ))
      )}
    </ul>
  );

  return (
    <>
      <div ref={containerRef} className="searchable-select" style={{ minWidth, position: 'relative' }}>
        <input
          type="text"
          className="admin-input searchable-select__input admin-device-actions__input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          autoComplete="off"
          aria-label="SIM ICCID (search or type)"
          style={{ width: '100%', minWidth: 140 }}
        />
      </div>
      {listEl && createPortal(listEl, document.body)}
    </>
  );
}

const AU_TZ = 'Australia/Sydney';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AU_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

function payloadsToCsv(rows: PayloadRow[]): string {
  const headers = ['Received (AU)', 'GPS time', 'Lat', 'Lon', 'Speed', 'GPS valid', 'Battery %', 'Battery V', 'bat_hex', 'Raw'];
  const csvRows = rows.map((p) => [
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
  return [headers.join(','), ...csvRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\r\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const exportWrapRef = useRef<HTMLDivElement>(null);
  const PAYLOAD_PAGE_SIZE = 20;

  useEffect(() => {
    if (!deviceId) return;
    setPayloadPage(1);
  }, [deviceId]);

  useEffect(() => {
    if (!exportDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (exportWrapRef.current && !exportWrapRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportDropdownOpen]);

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
  const [simIccidInput, setSimIccidInput] = useState('');
  const [simUpdateError, setSimUpdateError] = useState<string | null>(null);
  const [simcards, setSimcards] = useState<{ iccid: string }[]>([]);
  const [simcardsLoading, setSimcardsLoading] = useState(false);
  const [simUpdateModalOpen, setSimUpdateModalOpen] = useState(false);
  const [pendingNewIccid, setPendingNewIccid] = useState<string | null>(null);
  const [simUpdateOptionOld, setSimUpdateOptionOld] = useState(true);
  const [simUpdateOptionNew, setSimUpdateOptionNew] = useState(true);

  useEffect(() => {
    if (!canWrite) return;
    setSimcardsLoading(true);
    fetch('/api/admin/stock/simcards', { credentials: 'include', cache: 'no-store', headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { simcards: [] }))
      .then((data) => setSimcards((data.simcards ?? []).map((s: { iccid?: string }) => ({ iccid: s.iccid ?? '' })).filter((s: { iccid: string }) => s.iccid)))
      .catch(() => setSimcards([]))
      .finally(() => setSimcardsLoading(false));
  }, [canWrite, getAuthHeaders]);

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
            <tr><td>Assigned SIM (ICCID)</td><td className="admin-mono">{d.sim_iccid ?? '—'}</td></tr>
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
            <div className="admin-device-actions__row">
              <span className="admin-device-actions__label">Support & diagnostics</span>
              <div className="admin-device-actions__controls">
                <button
                  type="button"
                  className="admin-device-actions__btn admin-device-actions__btn--toolkit"
                  onClick={() => setToolkitOpen(true)}
                >
                  <Wrench size={14} strokeWidth={2} aria-hidden />
                  <span>Tracker Toolkit</span>
                </button>
              </div>
            </div>
          )}
          {canWrite && (
            <div className="admin-device-actions__row">
              <span className="admin-device-actions__label">Update SIM</span>
              <div className="admin-device-actions__controls admin-device-actions__controls--wrap">
                <SearchableSimSelect
                  value={simIccidInput}
                  onChange={(v) => { setSimIccidInput(v); setSimUpdateError(null); }}
                  options={simcards}
                  placeholder={simcardsLoading ? 'Loading…' : d.sim_iccid ? `Current: ${d.sim_iccid}` : 'Search or enter ICCID'}
                  disabled={simcardsLoading || acting}
                  minWidth={220}
                />
                <button
                  type="button"
                  className="admin-device-actions__btn admin-device-actions__btn--primary"
                  disabled={acting || !simIccidInput.trim()}
                  onClick={() => {
                    const iccid = simIccidInput.trim();
                    if (!iccid) return;
                    setSimUpdateError(null);
                    setPendingNewIccid(iccid);
                    setSimUpdateOptionOld(true);
                    setSimUpdateOptionNew(true);
                    setSimUpdateModalOpen(true);
                  }}
                >
                  Update
                </button>
                {simUpdateError && (
                  <span className="admin-device-actions__error">{simUpdateError}</span>
                )}
              </div>
              <p className="admin-device-actions__hint">Search Simbase SIMs or type any ICCID.</p>
            </div>
          )}
          {canWrite && users.length > 0 && (
            <div className="admin-device-actions__row">
              <span className="admin-device-actions__label">Reassign</span>
              <div className="admin-device-actions__controls">
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
                  className="admin-device-actions__btn admin-device-actions__btn--primary"
                  onClick={reassign}
                  disabled={acting || !reassignUserId}
                >
                  Reassign
                </button>
              </div>
            </div>
          )}
          {canWrite && (
            <div className="admin-device-actions__row">
              <span className="admin-device-actions__label">Status</span>
              <div className="admin-device-actions__controls">
                <button
                  type="button"
                  className="admin-device-actions__btn admin-device-actions__btn--secondary"
                  onClick={setOffline}
                  disabled={acting}
                >
                  Force mark offline
                </button>
                <button
                  type="button"
                  className="admin-device-actions__btn admin-device-actions__btn--secondary"
                  onClick={() => setIngestDisabled(!d.ingest_disabled)}
                  disabled={acting}
                >
                  {d.ingest_disabled ? 'Enable ingest' : 'Disable ingest'}
                </button>
              </div>
            </div>
          )}
          {isAdmin && (
            <div className="admin-device-actions__row admin-device-actions__row--danger">
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
              <div ref={exportWrapRef} className="admin-payloads-export-wrap">
                <button
                  type="button"
                  className="admin-payloads-export"
                  onClick={() => setExportDropdownOpen((o) => !o)}
                  disabled={exportingAll}
                  aria-expanded={exportDropdownOpen}
                  aria-haspopup="true"
                >
                  {exportingAll ? 'Exporting…' : 'Export CSV'}
                </button>
                {exportDropdownOpen && (
                  <div className="admin-payloads-export-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="admin-payloads-export-item"
                      onClick={() => {
                        downloadCsv(payloadsToCsv(data.last_payloads), `payloads-page-${data.payload_page}.csv`);
                        setExportDropdownOpen(false);
                      }}
                    >
                      Current page ({data.last_payloads.length})
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="admin-payloads-export-item"
                      onClick={async () => {
                        setExportDropdownOpen(false);
                        setExportingAll(true);
                        try {
                          const headers = getAuthHeaders();
                          const limit = 100;
                          const total = data.total_payloads;
                          const all: PayloadRow[] = [];
                          for (let page = 1; (page - 1) * limit < total; page++) {
                            const res = await fetch(
                              `/api/admin/devices/${encodeURIComponent(deviceId)}?page=${page}&limit=${limit}`,
                              { credentials: 'include', cache: 'no-store', headers }
                            );
                            if (!res.ok) throw new Error('Failed to fetch');
                            const json = await res.json();
                            all.push(...(json.last_payloads ?? []));
                          }
                          downloadCsv(payloadsToCsv(all), `payloads-all-${data.total_payloads}.csv`);
                        } finally {
                          setExportingAll(false);
                        }
                      }}
                    >
                      All ({data.total_payloads})
                    </button>
                  </div>
                )}
              </div>
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

      {simUpdateModalOpen && pendingNewIccid && (
        <div
          className="admin-delete-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-sim-update-modal-title"
          onClick={(e) => e.target === e.currentTarget && (setSimUpdateModalOpen(false), setPendingNewIccid(null))}
        >
          <div className="admin-delete-confirm-modal admin-sim-update-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 id="admin-sim-update-modal-title" className="admin-delete-confirm-title">Update assigned SIM?</h3>
            <p className="admin-time" style={{ marginBottom: 16 }}>
              Assign <span className="admin-mono">{pendingNewIccid}</span> to this device. Update name and tags in Stock:
            </p>
            <div className="admin-sim-update-options">
              <label className="admin-sim-update-option">
                <input
                  type="checkbox"
                  checked={simUpdateOptionOld}
                  onChange={(e) => setSimUpdateOptionOld(e.target.checked)}
                />
                <span><strong>Old SIM</strong> ({d.sim_iccid ?? 'current'}): clear name and set to <strong>Pending</strong></span>
              </label>
              <label className="admin-sim-update-option">
                <input
                  type="checkbox"
                  checked={simUpdateOptionNew}
                  onChange={(e) => setSimUpdateOptionNew(e.target.checked)}
                />
                <span><strong>New SIM</strong> ({pendingNewIccid}): set name to <strong>{d.owner_email ?? d.name ?? 'current customer'}</strong> and set to <strong>Assigned</strong></span>
              </label>
            </div>
            {simUpdateError && (
              <p className="admin-time" style={{ color: 'var(--error)', marginTop: 8 }}>{simUpdateError}</p>
            )}
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => { setSimUpdateModalOpen(false); setPendingNewIccid(null); setSimUpdateError(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={acting || (!simUpdateOptionOld && !simUpdateOptionNew)}
                onClick={async () => {
                  const iccid = pendingNewIccid;
                  if (!iccid) return;
                  if (!simUpdateOptionOld && !simUpdateOptionNew) return;
                  setSimUpdateError(null);
                  setActing(true);
                  try {
                    const res = await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}`, {
                      method: 'PATCH',
                      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ sim_iccid: iccid }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setSimUpdateError((json as { error?: string }).error ?? 'Failed to update');
                      return;
                    }
                    setSimUpdateModalOpen(false);
                    setPendingNewIccid(null);
                    setSimIccidInput('');
                    setData((prev) => prev ? { ...prev, device: { ...prev.device, sim_iccid: iccid } } : null);
                  } finally {
                    setActing(false);
                  }
                }}
              >
                {acting ? 'Updating…' : 'Update SIM'}
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
