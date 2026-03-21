'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../AdminAuthContext';
import DashboardMap, { MapMarker } from '@/components/DashboardMap';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import { Search, RefreshCw, Users, X } from 'lucide-react';

type AdminDevice = {
  id: string;
  name: string | null;
  model_name: string | null;
  user_id: string | null;
  user_email: string | null;
  lat: number | null;
  lng: number | null;
  last_seen_at: string | null;
  device_state: 'ONLINE' | 'SLEEPING' | 'OFFLINE';
  battery_percent: number | null;
  battery_voltage: number | null;
  marker_color: string;
  marker_icon: string | null;
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StateChip({ state }: { state: 'ONLINE' | 'SLEEPING' | 'OFFLINE' }) {
  const label = state === 'ONLINE' ? 'Online' : state === 'SLEEPING' ? 'Sleep' : 'Offline';
  const color =
    state === 'ONLINE' ? 'var(--success)' :
    state === 'SLEEPING' ? 'var(--sleep, #a78bfa)' :
    'var(--muted)';
  return (
    <span className="admin-map-state-chip" style={{ color }}>
      <span className="admin-map-state-dot" style={{ background: color }} />
      {label}
    </span>
  );
}

export default function AdminMapPage() {
  const { getAuthHeaders } = useAdminAuth();
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(true);
  const [stateFilter, setStateFilter] = useState<'all' | 'ONLINE' | 'SLEEPING' | 'OFFLINE'>('all');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    fetch('/api/admin/map/devices', {
      credentials: 'include',
      headers: getAuthHeaders(),
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((data: AdminDevice[]) => {
        setDevices(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  useEffect(() => {
    load();
    refreshTimer.current = setInterval(load, 30_000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [load]);

  // Sidebar list: apply search + state filter
  const filteredList = useMemo(() => {
    const q = search.toLowerCase().trim();
    return devices.filter((d) => {
      const matchSearch =
        !q ||
        (d.name ?? '').toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        (d.user_email ?? '').toLowerCase().includes(q) ||
        (d.model_name ?? '').toLowerCase().includes(q);
      const matchState = stateFilter === 'all' || d.device_state === stateFilter;
      return matchSearch && matchState;
    });
  }, [devices, search, stateFilter]);

  // Which devices to show on map
  const visibleIds = useMemo(() => {
    if (showAll) return new Set(filteredList.map((d) => d.id));
    return selectedIds;
  }, [showAll, filteredList, selectedIds]);

  const markers: MapMarker[] = useMemo(() =>
    devices
      .filter((d) => d.lat != null && d.lng != null && visibleIds.has(d.id))
      .map((d) => ({
        id: d.id,
        name: d.name || d.id,
        lat: d.lat!,
        lng: d.lng!,
        color: d.marker_color,
        icon: d.marker_icon,
        lastSeen: d.last_seen_at,
        offline: d.device_state === 'OFFLINE',
        device_state: d.device_state,
        batteryPercent: d.battery_percent,
        batteryVoltageV: d.battery_voltage,
      })),
    [devices, visibleIds]
  );

  const toggleDevice = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const stats = useMemo(() => ({
    total: devices.length,
    online: devices.filter((d) => d.device_state === 'ONLINE').length,
    sleeping: devices.filter((d) => d.device_state === 'SLEEPING').length,
    offline: devices.filter((d) => d.device_state === 'OFFLINE').length,
    noLoc: devices.filter((d) => d.lat == null).length,
  }), [devices]);

  if (loading) {
    return (
      <div className="app-loading">
        <AppLoadingIcon />
      </div>
    );
  }

  return (
    <div className="admin-map-page">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="admin-map-sidebar">
        {/* Header */}
        <div className="admin-map-sidebar-header">
          <h1 className="admin-map-sidebar-title">Fleet Map</h1>
          <button
            type="button"
            className="admin-map-refresh-btn"
            onClick={() => { setLoading(false); load(); }}
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Stats row */}
        <div className="admin-map-stats">
          <div className="admin-map-stat">
            <span className="admin-map-stat-value">{stats.total}</span>
            <span className="admin-map-stat-label">Total</span>
          </div>
          <div className="admin-map-stat admin-map-stat--online">
            <span className="admin-map-stat-value">{stats.online}</span>
            <span className="admin-map-stat-label">Online</span>
          </div>
          <div className="admin-map-stat admin-map-stat--sleep">
            <span className="admin-map-stat-value">{stats.sleeping}</span>
            <span className="admin-map-stat-label">Sleep</span>
          </div>
          <div className="admin-map-stat admin-map-stat--offline">
            <span className="admin-map-stat-value">{stats.offline}</span>
            <span className="admin-map-stat-label">Offline</span>
          </div>
        </div>

        {/* Show all / Select toggle */}
        <div className="admin-map-toggle-row">
          <button
            type="button"
            className={`admin-map-toggle-btn${showAll ? ' admin-map-toggle-btn--active' : ''}`}
            onClick={() => setShowAll(true)}
          >
            Show all
          </button>
          <button
            type="button"
            className={`admin-map-toggle-btn${!showAll ? ' admin-map-toggle-btn--active' : ''}`}
            onClick={() => setShowAll(false)}
          >
            Select ({selectedIds.size})
          </button>
        </div>

        {/* Search */}
        <div className="admin-map-search-wrap">
          <Search size={14} className="admin-map-search-icon" />
          <input
            type="search"
            className="admin-map-search"
            placeholder="Search name, email, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="admin-map-search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* State filter tabs */}
        <div className="admin-map-filter-tabs">
          {(['all', 'ONLINE', 'SLEEPING', 'OFFLINE'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`admin-map-filter-tab${stateFilter === f ? ' admin-map-filter-tab--active' : ''}`}
              onClick={() => setStateFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'ONLINE' ? 'Online' : f === 'SLEEPING' ? 'Sleep' : 'Offline'}
            </button>
          ))}
        </div>

        {error && (
          <p className="admin-map-error">{error}</p>
        )}

        {/* Device list */}
        <ul className="admin-map-device-list">
          {filteredList.length === 0 ? (
            <li className="admin-map-device-empty">No trackers match.</li>
          ) : (
            filteredList.map((d) => {
              const isSelected = selectedIds.has(d.id);
              const isFocused = focusedId === d.id;
              const hasLocation = d.lat != null && d.lng != null;
              return (
                <li
                  key={d.id}
                  className={`admin-map-device-item${isFocused ? ' admin-map-device-item--focused' : ''}${!showAll && isSelected ? ' admin-map-device-item--selected' : ''}`}
                  onClick={() => {
                    if (!showAll) toggleDevice(d.id);
                    setFocusedId(d.id);
                  }}
                >
                  {/* Accent dot */}
                  <span
                    className="admin-map-device-dot"
                    style={{ background: d.marker_color }}
                  />
                  <div className="admin-map-device-info">
                    <div className="admin-map-device-name">
                      {d.name || <span className="admin-map-device-id">{d.id.slice(0, 12)}…</span>}
                      {d.model_name && (
                        <span className="admin-map-device-model"> · {d.model_name}</span>
                      )}
                    </div>
                    <div className="admin-map-device-meta">
                      <StateChip state={d.device_state} />
                      {d.user_email && (
                        <span className="admin-map-device-email" title={d.user_email}>
                          <Users size={10} />
                          {d.user_email}
                        </span>
                      )}
                    </div>
                    <div className="admin-map-device-row2">
                      <span className="admin-map-device-time">
                        {formatRelativeTime(d.last_seen_at)}
                      </span>
                      {!hasLocation && (
                        <span className="admin-map-device-noloc" title="No location data">No location</span>
                      )}
                      {d.battery_percent != null && (
                        <span className="admin-map-device-batt">{d.battery_percent}%</span>
                      )}
                    </div>
                  </div>
                  {/* Selection checkbox for "Select" mode */}
                  {!showAll && (
                    <span className={`admin-map-checkbox${isSelected ? ' admin-map-checkbox--checked' : ''}`} aria-hidden />
                  )}
                  {/* View link */}
                  <Link
                    href={`/admin/devices/${d.id}`}
                    className="admin-map-device-link"
                    onClick={(e) => e.stopPropagation()}
                    title="View device"
                  >
                    →
                  </Link>
                </li>
              );
            })
          )}
        </ul>

        <p className="admin-map-footer-note">
          {markers.length} tracker{markers.length !== 1 ? 's' : ''} on map
          {stats.noLoc > 0 && ` · ${stats.noLoc} without location`}
        </p>
      </aside>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div className="admin-map-canvas">
        <DashboardMap
          markers={markers}
          showVoltage
          focusMarkerId={focusedId}
          onMarkerClick={(id) => setFocusedId(id)}
          onPopupClose={() => setFocusedId(null)}
        />
      </div>
    </div>
  );
}
