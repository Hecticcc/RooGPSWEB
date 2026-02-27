'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Car, Battery, Clock, Plus, ChevronRight, Settings, Check, Loader2, AlertCircle, X, Shield, ShieldOff, Palette, Signal } from 'lucide-react';
import DashboardMap from '@/components/DashboardMap';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import TrackerIconPreview from '@/components/TrackerIconPreview';
import { TRACKER_NAME_MAX } from '@/lib/device-constants';

const TRACKER_ICONS = [
  { id: 'car', label: 'Car' },
  { id: 'car_alt', label: 'Car 2' },
  { id: 'caravan', label: 'Caravan' },
  { id: 'trailer', label: 'Trailer' },
  { id: 'truck', label: 'Truck' },
  { id: 'misc', label: 'Misc' },
] as const;

const COLOUR_PRESETS = [
  '#f97316', '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308',
] as const;

type Device = {
  id: string;
  name: string | null;
  created_at: string;
  last_seen_at: string | null;
  latest_lat?: number | null;
  latest_lng?: number | null;
  latest_battery_percent?: number | null;
  latest_battery_voltage_v?: number | null;
  marker_color?: string | null;
  marker_icon?: string | null;
  watchdog_armed?: boolean;
  watchdog_armed_at?: string | null;
  connection_error?: { error_message: string; created_at: string } | null;
  sim_carrier?: string | null;
};

type Props = {
  devices: Device[];
  loading: boolean;
  newId: string;
  newName: string;
  adding: boolean;
  error: string | null;
  addFormOpen: boolean;
  onlineCount: number;
  offlineCount: number;
  isOnline: (lastSeen: string | null) => boolean;
  onNewIdChange: (v: string) => void;
  onNewNameChange: (v: string) => void;
  onAdd: (e: React.FormEvent) => void;
  onToggleAddForm: () => void;
  onColorChange: (deviceId: string, hex: string) => void;
  onSettingsChange: (deviceId: string, updates: { marker_color?: string; marker_icon?: string; watchdog_armed?: boolean }) => void;
  onWatchdogToggle: (deviceId: string, armed: boolean) => void;
  colorSaveStatus: { deviceId: string; status: 'saving' | 'saved' | 'error' } | null;
  highlightedTrackerId: string | null;
  onMarkerClick: (markerId: string) => void;
  onPopupClose?: () => void;
  hasActiveSimSubscription?: boolean | null;
  onRetry?: () => void;
};

export default function DevicesListView(props: Props) {
  const {
    devices,
    loading,
    newId,
    newName,
    adding,
    error,
    addFormOpen,
    onlineCount,
    offlineCount,
    isOnline,
    onNewIdChange,
    onNewNameChange,
    onAdd,
    onToggleAddForm,
    onColorChange,
    onSettingsChange,
    onWatchdogToggle,
    colorSaveStatus,
    highlightedTrackerId,
    onMarkerClick,
    onPopupClose,
    hasActiveSimSubscription,
    onRetry,
  } = props;

  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'watchdog'>('appearance');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpenId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpenId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpenId]);

  const mapMarkers = useMemo(
    () =>
      devices
        .filter((d) => d.latest_lat != null && d.latest_lng != null)
        .map((d) => ({
          id: d.id,
          name: d.name,
          lat: d.latest_lat!,
          lng: d.latest_lng!,
          color: d.marker_color ?? '#f97316',
          icon: d.marker_icon ?? 'car',
          batteryPercent: d.latest_battery_percent ?? null,
          batteryVoltageV: d.latest_battery_voltage_v ?? null,
          lastSeen: d.last_seen_at ?? null,
          offline: !isOnline(d.last_seen_at),
        })),
    [devices, isOnline]
  );

  return (
    <main className="dashboard-page">
      <section className="dashboard-map-wrap">
        {hasActiveSimSubscription === true ? (
          <DashboardMap markers={mapMarkers} onMarkerClick={onMarkerClick} onPopupClose={onPopupClose} />
        ) : (
          <div className="dashboard-map-placeholder">
            {hasActiveSimSubscription === null ? (
              <AppLoadingIcon />
            ) : (
              <>
                <img src="/logo.png" alt="RooGPS" className="dashboard-map-placeholder__logo" width={140} height={56} style={{ height: 56, width: 'auto', objectFit: 'contain' }} />
                <p className="dashboard-map-placeholder__text">Active subscription required to view live map</p>
                <Link href="/account/subscription" className="dashboard-map-placeholder__link">View subscription</Link>
              </>
            )}
          </div>
        )}
      </section>
      <div className="dashboard-content">
        {loading ? (
          <div className="dashboard-content-loading">
            <AppLoadingIcon />
          </div>
        ) : (
          <>
            <div className="dashboard-cards" style={{ marginBottom: 28 }}>
              <div className="dashboard-section dashboard-stats-card">
                <div className="dashboard-stats-label">Online</div>
                <div className="dashboard-stats-value" style={{ color: 'var(--success)' }}>{onlineCount}</div>
              </div>
              <div className="dashboard-section dashboard-stats-card">
                <div className="dashboard-stats-label">Offline</div>
                <div className="dashboard-stats-value">{offlineCount}</div>
              </div>
              <div className="dashboard-section dashboard-stats-card">
                <div className="dashboard-stats-label">All trackers</div>
                <div className="dashboard-stats-value">{devices.length}</div>
              </div>
            </div>

            <section className="dashboard-section trackers-section">
              <div className="trackers-section-header">
                <h2 className="trackers-section-title">Trackers</h2>
                <button
                  type="button"
                  onClick={onToggleAddForm}
                  className={`trackers-add-btn${addFormOpen ? ' trackers-add-btn-open' : ''}`}
                >
                  <Plus size={18} strokeWidth={2.5} />
                  {addFormOpen ? 'Cancel' : 'Add tracker'}
                </button>
              </div>
              {addFormOpen && (
                <div className="dashboard-add-form-wrap">
                  <form onSubmit={onAdd} className="dashboard-add-form" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted)' }}>Device ID</label>
                      <input
                        className="input-id"
                        value={newId}
                        onChange={(e) => onNewIdChange(e.target.value)}
                        placeholder="e.g. 123456789012345"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--muted)' }}>Name (optional, max {TRACKER_NAME_MAX} characters)</label>
                      <input
                        className="input-name"
                        value={newName}
                        onChange={(e) => onNewNameChange(e.target.value)}
                        placeholder="My tracker"
                        maxLength={TRACKER_NAME_MAX}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={adding}
                      style={{
                        padding: '10px 20px',
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: 'white',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      {adding ? 'Adding…' : 'Add'}
                    </button>
                  </form>
                  {error ? (
                    <p style={{ color: 'var(--error)', fontSize: 14, marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span>{error}</span>
                      {onRetry ? (
                        <button
                          type="button"
                          onClick={() => onRetry?.()}
                          style={{
                            padding: '6px 12px',
                            fontSize: 13,
                            background: 'var(--accent-muted)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                          }}
                        >
                          Try again
                        </button>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              )}
              {devices.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Car size={40} strokeWidth={1.2} style={{ color: 'var(--muted)', marginBottom: 16, opacity: 0.6 }} />
                  <p style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 4 }}>No trackers yet</p>
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>Add one to start tracking on the map</p>
                </div>
              ) : (
                <div className="trackers-grid">
                  {devices.map((d) => {
                    const online = isOnline(d.last_seen_at);
                    return (
                    <article
                      key={d.id}
                      className={`tracker-card ${online ? 'tracker-card--online' : 'tracker-card--offline'}${highlightedTrackerId === d.id ? ' tracker-card--highlighted' : ''}`}
                    >
                      <div
                        className="tracker-card-accent"
                        style={{ background: d.marker_color ?? '#f97316' }}
                        title="Map colour"
                      />
                      <div className="tracker-card-body">
                        <div className="tracker-card-row">
                          <span className="tracker-card-name">{d.name || d.id}</span>
                          <span
                            className="tracker-card-status-inline"
                            aria-label={online ? 'Online' : 'Offline'}
                          >
                            <span className={`tracker-card-status-dot ${online ? 'tracker-card-status-dot--online' : 'tracker-card-status-dot--offline'}`} aria-hidden />
                            <span className="tracker-card-status-text">{online ? 'Online' : 'Offline'}</span>
                          </span>
                          {d.connection_error && (
                            <span
                              className="tracker-card-detail-inline tracker-card-connection-error"
                              title={`Connection error: ${d.connection_error.error_message} (${new Date(d.connection_error.created_at).toLocaleString()})`}
                              style={{ color: 'var(--error)' }}
                            >
                              <AlertCircle size={14} strokeWidth={2} className="tracker-card-detail-icon" aria-label="Connection error" />
                            </span>
                          )}
                          <span
                            className="tracker-card-detail-inline tracker-card-battery"
                            title={
                              d.latest_battery_percent != null
                                ? (d.latest_battery_voltage_v != null ? `${d.latest_battery_voltage_v} V · ` : '') + `${d.latest_battery_percent}%`
                                : 'Battery: no data in latest update'
                            }
                            style={{
                              color: d.latest_battery_percent != null
                                ? d.latest_battery_percent <= 20
                                  ? 'var(--error)'
                                  : d.latest_battery_percent <= 50
                                    ? 'var(--muted)'
                                    : 'var(--text)'
                                : 'var(--muted)',
                            }}
                          >
                            <Battery size={14} strokeWidth={2} className="tracker-card-detail-icon" aria-hidden />
                            {d.latest_battery_percent != null ? `${d.latest_battery_percent}%` : '—'}
                          </span>
                          <span className="tracker-card-detail-inline">
                            <Clock size={14} strokeWidth={2} className="tracker-card-detail-icon" />
                            {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'Never'}
                          </span>
                          {d.sim_carrier && (
                            <span className="tracker-card-detail-inline tracker-card-provider" title="Current network provider (Simbase)">
                              <Signal size={14} strokeWidth={2} className="tracker-card-detail-icon" aria-hidden />
                              <span>{d.sim_carrier}</span>
                            </span>
                          )}
                          <span
                            className={`tracker-card-watchdog-icon${d.watchdog_armed ? ' tracker-card-watchdog-icon--armed' : ''}`}
                            title={d.watchdog_armed ? 'Watch Dog armed – open settings to disarm' : 'Watch Dog off – open settings to arm'}
                            aria-label={d.watchdog_armed ? 'Watch Dog armed' : 'Watch Dog off'}
                          >
                            <Shield size={16} strokeWidth={2} />
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSettingsOpenId(d.id); setSettingsTab('appearance'); }}
                        title="Tracker settings"
                        className="tracker-card-settings-btn tracker-card-settings-btn--top-right"
                        aria-haspopup="dialog"
                      >
                        <Settings size={18} strokeWidth={2} />
                      </button>
                      <div className="tracker-card-action">
                        <Link href={`/track/${d.id}`}>
                          View <ChevronRight size={16} strokeWidth={2.5} />
                        </Link>
                      </div>
                    </article>
                  );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {settingsOpenId && (() => {
        const device = devices.find((d) => d.id === settingsOpenId);
        if (!device) return null;
        const color = device.marker_color ?? '#f97316';
        const currentIcon = device.marker_icon ?? 'car';
        return (
          <div
            className="tracker-settings-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tracker-settings-modal-title"
            ref={modalRef}
            onClick={(e) => e.target === e.currentTarget && setSettingsOpenId(null)}
          >
            <div className="tracker-settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="tracker-settings-modal-header">
                <h2 id="tracker-settings-modal-title" className="tracker-settings-modal-title">
                  {device.name || device.id}
                </h2>
                <button
                  type="button"
                  onClick={() => setSettingsOpenId(null)}
                  className="tracker-settings-modal-close"
                  title="Close"
                  aria-label="Close"
                >
                  <X size={20} strokeWidth={2} />
                </button>
              </div>
              <div className="tracker-settings-modal-tabs" role="tablist" aria-label="Settings sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === 'appearance'}
                  aria-controls="tracker-settings-panel-appearance"
                  id="tracker-settings-tab-appearance"
                  className={`tracker-settings-modal-tab${settingsTab === 'appearance' ? ' tracker-settings-modal-tab--active' : ''}`}
                  onClick={() => setSettingsTab('appearance')}
                >
                  <Palette size={16} strokeWidth={2} />
                  <span>Appearance</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === 'watchdog'}
                  aria-controls="tracker-settings-panel-watchdog"
                  id="tracker-settings-tab-watchdog"
                  className={`tracker-settings-modal-tab${settingsTab === 'watchdog' ? ' tracker-settings-modal-tab--active' : ''}`}
                  onClick={() => setSettingsTab('watchdog')}
                >
                  <Shield size={16} strokeWidth={2} />
                  <span>Watch Dog</span>
                </button>
              </div>
              <div className="tracker-settings-modal-body">
                {settingsTab === 'appearance' && (
                  <div id="tracker-settings-panel-appearance" role="tabpanel" aria-labelledby="tracker-settings-tab-appearance" className="tracker-settings-modal-panel">
                    <div className="tracker-settings-modal-section">
                      <h3 className="tracker-settings-modal-section-title">Icon</h3>
                      <p className="tracker-settings-modal-hint">Choose how this tracker appears on the map.</p>
                      <div className="tracker-settings-icon-row" role="group" aria-label="Map icon">
                        {TRACKER_ICONS.map((ico) => (
                          <button
                            key={ico.id}
                            type="button"
                            title={ico.label}
                            onClick={() => onSettingsChange(device.id, { marker_icon: ico.id })}
                            className={`tracker-settings-icon-btn${currentIcon === ico.id ? ' tracker-settings-icon-btn--active' : ''}`}
                            aria-pressed={currentIcon === ico.id}
                            aria-label={ico.label}
                          >
                            <TrackerIconPreview iconType={ico.id} color={color} size={28} />
                          </button>
                        ))}
                      </div>
                      <p className="tracker-settings-modal-selected-label">{TRACKER_ICONS.find((i) => i.id === currentIcon)?.label ?? 'Icon'}</p>
                    </div>
                    <div className="tracker-settings-modal-section">
                      <h3 className="tracker-settings-modal-section-title">Colour</h3>
                      <p className="tracker-settings-modal-hint">Marker colour on the map.</p>
                      <div className="tracker-settings-colour-row" role="group" aria-label="Marker colour">
                        {COLOUR_PRESETS.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            title={hex}
                            onClick={() => onColorChange(device.id, hex)}
                            className={`tracker-settings-colour-chip${color.toLowerCase() === hex.toLowerCase() ? ' tracker-settings-colour-chip--active' : ''}`}
                            style={{ backgroundColor: hex }}
                            aria-pressed={color.toLowerCase() === hex.toLowerCase()}
                            aria-label={`Colour ${hex}`}
                          />
                        ))}
                        <label className="tracker-settings-colour-custom" title="Custom colour">
                          <span className="tracker-settings-colour-custom-swatch" style={{ backgroundColor: color }} />
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => onColorChange(device.id, e.target.value)}
                            className="tracker-settings-colour-input"
                            aria-label="Custom colour"
                          />
                        </label>
                      </div>
                      <div className="tracker-settings-modal-colour-footer">
                        {colorSaveStatus?.deviceId === device.id && (
                          <span className="tracker-settings-modal-save-status">
                            {colorSaveStatus.status === 'saving' && (
                              <>
                                <Loader2 size={14} className="tracker-card-save-spinner" />
                                <span>Saving…</span>
                              </>
                            )}
                            {colorSaveStatus.status === 'saved' && (
                              <>
                                <Check size={14} style={{ color: 'var(--success)' }} />
                                <span style={{ color: 'var(--success)' }}>Saved</span>
                              </>
                            )}
                            {colorSaveStatus.status === 'error' && (
                              <>
                                <AlertCircle size={14} style={{ color: 'var(--error)' }} />
                                <span style={{ color: 'var(--error)' }}>Couldn&apos;t save</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === 'watchdog' && (
                  <div id="tracker-settings-panel-watchdog" role="tabpanel" aria-labelledby="tracker-settings-tab-watchdog" className="tracker-settings-modal-panel">
                    <div className="tracker-settings-modal-section">
                      <h3 className="tracker-settings-modal-section-title">Watch Dog</h3>
                      <p className="tracker-settings-modal-description">
                        When Watch Dog is on, you&apos;ll get an alert if this tracker moves—either it goes faster than 5 km/h or travels more than 50 m from where you turned it on.
                      </p>
                      <div className="tracker-settings-modal-watchdog-wrap">
                      <div className="tracker-settings-modal-watchdog-toggle" role="group" aria-label="Watch Dog arm state">
                        <button
                          type="button"
                          onClick={() => onWatchdogToggle(device.id, true)}
                          disabled={colorSaveStatus?.deviceId === device.id && colorSaveStatus?.status === 'saving'}
                          className={`tracker-settings-modal-watchdog-btn tracker-settings-modal-watchdog-btn--arm${device.watchdog_armed ? ' tracker-settings-modal-watchdog-btn--active' : ''}`}
                          title="Arm: alert if tracker moves"
                        >
                          {colorSaveStatus?.deviceId === device.id && !device.watchdog_armed ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} strokeWidth={2} />}
                          <span>Arm</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onWatchdogToggle(device.id, false)}
                          disabled={colorSaveStatus?.deviceId === device.id && colorSaveStatus?.status === 'saving'}
                          className={`tracker-settings-modal-watchdog-btn tracker-settings-modal-watchdog-btn--disarm${!device.watchdog_armed ? ' tracker-settings-modal-watchdog-btn--active' : ''}`}
                          title="Disarm"
                        >
                          {colorSaveStatus?.deviceId === device.id && device.watchdog_armed ? <Loader2 size={18} className="animate-spin" /> : <ShieldOff size={18} strokeWidth={2} />}
                          <span>Disarm</span>
                        </button>
                      </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
