'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
/** Mapbox CSS loaded here so the dynamic DashboardMap chunk does not create a separate CSS chunk (avoids dev chunk load errors). */
import 'mapbox-gl/dist/mapbox-gl.css';
import { Car, Clock, Plus, ChevronRight, ChevronDown, Settings, Check, Loader2, AlertCircle, X, Palette, Signal, Pencil, Crosshair, Satellite, Radio, HelpCircle, Moon, MapPin, ShieldAlert } from 'lucide-react';
import { FaShieldDog } from 'react-icons/fa6';
import { AppContainer } from '@/components/layout';

const DashboardMap = dynamic(() => import('@/components/DashboardMap'), {
  ssr: false,
  loading: () => (
    <div className="dashboard-map-placeholder" aria-hidden>
      <div className="dashboard-map-placeholder-inner">
        <MapPin size={32} strokeWidth={1.5} style={{ color: 'var(--muted)', opacity: 0.6 }} />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Loading map…</p>
      </div>
    </div>
  ),
});
const GeofencePickerMap = dynamic(() => import('@/components/GeofencePickerMap'), { ssr: false });
import AppLoadingIcon from '@/components/AppLoadingIcon';
import TrackerIconPreview from '@/components/TrackerIconPreview';
import BatteryLevelIcon from '@/components/BatteryLevelIcon';
import { getBatteryStatus } from '@/lib/battery';
import { TRACKER_NAME_MAX, validateTrackerName } from '@/lib/device-constants';

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

const NIGHT_GUARD_TIMEZONES = [
  'Australia/Melbourne',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Darwin',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'UTC',
];

function getBrowserTimezone(): string {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'Australia/Melbourne';
}

type DeviceSignal = {
  gps?: {
    fix_flag?: string;
    valid?: boolean;
    sats?: number;
    hdop?: number;
    speed_kmh?: number;
    course_deg?: number;
    has_signal?: boolean;
    connectivity?: { barPercent: number; tier: string; colour: string };
  };
  gsm?: { csq?: number; percent?: number | null; quality?: string };
} | null;

type Device = {
  id: string;
  name: string | null;
  created_at: string;
  last_seen_at: string | null;
  latest_lat?: number | null;
  latest_lng?: number | null;
  latest_battery_percent?: number | null;
  latest_battery_voltage_v?: number | null;
  latest_signal?: DeviceSignal;
  marker_color?: string | null;
  marker_icon?: string | null;
  watchdog_armed?: boolean;
  watchdog_armed_at?: string | null;
  night_guard_enabled?: boolean;
  night_guard_start_time_local?: string | null;
  night_guard_end_time_local?: string | null;
  night_guard_timezone?: string | null;
  night_guard_radius_m?: number | null;
  night_guard_home_lat?: number | null;
  night_guard_home_lon?: number | null;
  connection_error?: { error_message: string; created_at: string } | null;
  sim_carrier?: string | null;
  device_state?: 'ONLINE' | 'SLEEPING' | 'OFFLINE';
  offline_reason?: string | null;
  gps_lock_last?: boolean | null;
  last_battery_voltage?: number | null;
  emergency_enabled?: boolean;
  emergency_status?: string | null;
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
  onNewIdChange: (v: string) => void;
  onNewNameChange: (v: string) => void;
  onAdd: (e: React.FormEvent) => void;
  onToggleAddForm: () => void;
  onColorChange: (deviceId: string, hex: string) => void;
  onSettingsChange: (deviceId: string, updates: { marker_color?: string; marker_icon?: string; watchdog_armed?: boolean; name?: string | null }) => void;
  onWatchdogToggle: (deviceId: string, armed: boolean) => void;
  onNightGuardToggle: (deviceId: string, enabled: boolean) => void;
  onFetchNightGuardRule: (deviceId: string) => Promise<{ start_time_local: string; end_time_local: string; timezone: string } | null>;
  onSaveNightGuardRule: (deviceId: string, payload: { start_time_local: string; end_time_local: string; timezone: string; radius_m?: number; home_lat?: number | null; home_lon?: number | null }) => void | Promise<void>;
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
    onNewIdChange,
    onNewNameChange,
    onAdd,
    onToggleAddForm,
    onColorChange,
    onSettingsChange,
    onWatchdogToggle,
    onNightGuardToggle,
    onFetchNightGuardRule,
    onSaveNightGuardRule,
    colorSaveStatus,
    highlightedTrackerId,
    onMarkerClick,
    onPopupClose,
    hasActiveSimSubscription,
    onRetry,
  } = props;

  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'alerts' | 'signal'>('appearance');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [nightGuardRule, setNightGuardRule] = useState<{ start_time_local: string; end_time_local: string; timezone: string; radius_m: number; home_lat: number | null; home_lon: number | null } | null>(null);
  const [nightGuardRuleLoading, setNightGuardRuleLoading] = useState(false);
  const [nightGuardAddressInput, setNightGuardAddressInput] = useState('');
  const [nightGuardHomeLoading, setNightGuardHomeLoading] = useState(false);
  const [nightGuardSetupExpanded, setNightGuardSetupExpanded] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settingsOpenId || settingsTab !== 'alerts') {
      setNightGuardRule(null);
      setNightGuardSetupExpanded(false);
      return;
    }
    setNightGuardRuleLoading(true);
    onFetchNightGuardRule(settingsOpenId).then((rule) => {
      if (!rule) {
        setNightGuardRule(null);
        setNightGuardRuleLoading(false);
        return;
      }
      const device = devices.find((d) => d.id === settingsOpenId);
      setNightGuardRule({
        start_time_local: rule.start_time_local,
        end_time_local: rule.end_time_local,
        timezone: rule.timezone,
        radius_m: device?.night_guard_radius_m ?? 50,
        home_lat: device?.night_guard_home_lat ?? null,
        home_lon: device?.night_guard_home_lon ?? null,
      });
      setNightGuardRuleLoading(false);
    }).catch(() => setNightGuardRuleLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when device or tab changes
  }, [settingsOpenId, settingsTab]);

  useEffect(() => {
    if (!settingsOpenId) setEditingNameId(null);
  }, [settingsOpenId]);

  useEffect(() => {
    if (!settingsOpenId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingNameId) setEditingNameId(null);
        else setSettingsOpenId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpenId, editingNameId]);

  useEffect(() => {
    if (editingNameId) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingNameId]);

  const mapMarkers = useMemo(
    () =>
      devices
        .filter((d) => d.latest_lat != null && d.latest_lng != null)
        .map((d) => {
          const emergencyOn = d.emergency_enabled === true && (d.emergency_status === 'ON' || d.emergency_status === 'ERROR');
          return {
            id: d.id,
            name: d.name,
            lat: d.latest_lat!,
            lng: d.latest_lng!,
            color: d.marker_color ?? '#f97316',
            icon: d.marker_icon ?? 'car',
            batteryPercent: d.latest_battery_percent ?? null,
            batteryVoltageV: d.latest_battery_voltage_v ?? null,
            lastSeen: d.last_seen_at ?? null,
            offline: d.device_state === 'OFFLINE',
            device_state: d.device_state,
            emergencyMode: emergencyOn,
          };
        }),
    [devices]
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
      <AppContainer as="div" className="dashboard-content">
        {loading ? (
          <div className="dashboard-content-skeleton" aria-busy="true" aria-label="Loading dashboard">
            <div className="dashboard-cards" style={{ marginBottom: 28 }}>
              <div className="dashboard-skeleton-card dashboard-section dashboard-stats-card">
                <div className="dashboard-skeleton-line dashboard-skeleton-label" />
                <div className="dashboard-skeleton-line dashboard-skeleton-value" />
              </div>
              <div className="dashboard-skeleton-card dashboard-section dashboard-stats-card">
                <div className="dashboard-skeleton-line dashboard-skeleton-label" />
                <div className="dashboard-skeleton-line dashboard-skeleton-value" />
              </div>
              <div className="dashboard-skeleton-card dashboard-section dashboard-stats-card">
                <div className="dashboard-skeleton-line dashboard-skeleton-label" />
                <div className="dashboard-skeleton-line dashboard-skeleton-value" />
              </div>
            </div>
            <section className="dashboard-section trackers-section">
              <div className="trackers-section-header">
                <div className="dashboard-skeleton-line dashboard-skeleton-title" style={{ width: 100, height: 22 }} />
                <div className="dashboard-skeleton-line" style={{ width: 110, height: 36, borderRadius: 'var(--radius-sm)' }} />
              </div>
              <div className="dashboard-skeleton-cards">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="dashboard-skeleton-tracker-card">
                    <div className="dashboard-skeleton-line" style={{ width: '60%', height: 20, marginBottom: 8 }} />
                    <div className="dashboard-skeleton-line" style={{ width: '40%', height: 14, marginBottom: 12 }} />
                    <div className="dashboard-skeleton-line" style={{ width: '100%', height: 12 }} />
                    <div className="dashboard-skeleton-line" style={{ width: '80%', height: 12, marginTop: 6 }} />
                  </div>
                ))}
              </div>
            </section>
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
                    const state = d.device_state ?? 'OFFLINE';
                    const statusLabel = state === 'ONLINE' ? 'Online' : state === 'SLEEPING' ? 'Sleep' : 'Offline';
                    const statusTitle = state === 'SLEEPING'
                      ? 'Device is likely sleeping (stopped) and will check in within the heartbeat interval.'
                      : undefined;
                    const emergencyOn = d.emergency_enabled === true && (d.emergency_status === 'ON' || d.emergency_status === 'ERROR');
                    const batteryStatus = getBatteryStatus({
                      voltage_v: d.last_battery_voltage ?? d.latest_battery_voltage_v ?? null,
                      percent: d.latest_battery_percent ?? null,
                    });
                    return (
                    <article
                      key={d.id}
                      className={`tracker-card tracker-card--${state.toLowerCase()}${highlightedTrackerId === d.id ? ' tracker-card--highlighted' : ''}${emergencyOn ? ' tracker-card--emergency' : ''}`}
                    >
                      <div
                        className="tracker-card-accent"
                        style={{ background: emergencyOn ? '#ef4444' : (d.marker_color ?? '#f97316') }}
                        title={emergencyOn ? 'Emergency Mode active' : 'Map colour'}
                      />
                      <div className="tracker-card-body">
                        <div className="tracker-card-primary">
                          <span className="tracker-card-name">{d.name || d.id}</span>
                        </div>
                        <div className="tracker-card-details-row">
                          <span
                            className={`tracker-card-chip tracker-card-status-chip${state === 'SLEEPING' ? ' tracker-card-status-chip--sleeping' : ''}`}
                            aria-label={statusLabel}
                            title={statusTitle}
                            style={{
                              color: state === 'ONLINE' ? 'var(--success)' : state === 'SLEEPING' ? 'var(--sleep)' : 'var(--muted)',
                            }}
                          >
                            <span className={`tracker-card-status-dot tracker-card-status-dot--${state.toLowerCase()}`} aria-hidden />
                            <span>{statusLabel}</span>
                          </span>
                          <span
                            className="tracker-card-chip tracker-card-battery"
                            title={`Battery: ${batteryStatus.label} — ${batteryStatus.microcopy}`}
                            style={{ color: batteryStatus.color.text }}
                          >
                            <BatteryLevelIcon tier={batteryStatus.tier} size={12} color={batteryStatus.color.text} aria-hidden />
                            <span>{batteryStatus.label}</span>
                          </span>
                          <span className="tracker-card-chip" title={d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : undefined}>
                            <Clock size={12} strokeWidth={2} aria-hidden />
                            <span>
                              {d.last_seen_at
                                ? `${new Date(d.last_seen_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, ${new Date(d.last_seen_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
                                : 'Never'}
                            </span>
                          </span>
                          {d.connection_error && (
                            <span
                              className="tracker-card-chip tracker-card-connection-error"
                              title={`Connection error: ${d.connection_error.error_message} (${new Date(d.connection_error.created_at).toLocaleString()})`}
                              style={{ color: 'var(--error)' }}
                            >
                              <AlertCircle size={12} strokeWidth={2} aria-label="Connection error" />
                              <span>Error</span>
                            </span>
                          )}
                          {(d.gps_lock_last != null || d.latest_signal?.gps != null) && (
                            <>
                              <span
                                className="tracker-card-chip tracker-card-signal-gpsfix"
                                title={(d.gps_lock_last ?? d.latest_signal?.gps?.valid) ? 'GPS lock (last packet)' : 'No GPS lock (last packet)'}
                                style={{ color: (d.gps_lock_last ?? d.latest_signal?.gps?.valid) ? 'var(--success)' : 'var(--muted)' }}
                              >
                                <Crosshair size={12} strokeWidth={2} aria-hidden />
                                <span>{(d.gps_lock_last ?? d.latest_signal?.gps?.valid) ? 'Valid' : 'Invalid'}</span>
                              </span>
                              <span
                                className="tracker-card-chip tracker-card-signal-sats"
                                title={`Satellites: ${d.latest_signal?.gps?.sats ?? '—'}`}
                                style={{
                                  color: (d.latest_signal?.gps?.sats ?? 0) >= 4 ? 'var(--success)' : (d.latest_signal?.gps?.sats ?? 0) >= 1 ? 'var(--warn)' : 'var(--muted)',
                                }}
                              >
                                <Satellite size={12} strokeWidth={2} aria-hidden />
                                <span>{d.latest_signal?.gps?.sats ?? '—'}</span>
                              </span>
                            </>
                          )}
                          {d.latest_signal?.gsm != null && (() => {
                            const q = d.latest_signal!.gsm!.quality;
                            const friendly = q === 'great' ? 'Great' : q === 'good' ? 'Good' : q === 'ok' ? 'Okay' : q === 'poor' ? 'Weak' : 'None';
                            return (
                            <span
                              className="tracker-card-chip tracker-card-signal-gsm"
                              title={`Data signal: ${friendly}`}
                              style={{
                                color: d.latest_signal!.gsm!.quality === 'great' || d.latest_signal!.gsm!.quality === 'good' ? 'var(--success)' : d.latest_signal!.gsm!.quality === 'ok' ? 'var(--warn)' : 'var(--muted)',
                              }}
                            >
                              <Radio size={12} strokeWidth={2} aria-hidden />
                              <span>{friendly}</span>
                            </span>
                            );
                          })()}
                          {d.sim_carrier && (
                            <span className="tracker-card-chip tracker-card-provider" title="Current network provider">
                              <Signal size={12} strokeWidth={2} aria-hidden />
                              <span>{d.sim_carrier}</span>
                            </span>
                          )}
                          <span
                            className={`tracker-card-chip tracker-card-watchdog-icon${d.watchdog_armed ? ' tracker-card-watchdog-icon--armed' : ''}`}
                            title={d.watchdog_armed ? 'WatchDog armed – open settings to disarm' : 'WatchDog off – open settings to arm'}
                            aria-label={d.watchdog_armed ? 'WatchDog armed' : 'WatchDog off'}
                          >
                            <FaShieldDog size={12} aria-hidden />
                            <span>{d.watchdog_armed ? 'Armed' : 'Off'}</span>
                          </span>
                          <span
                            className={`tracker-card-chip tracker-card-nightguard-icon${d.night_guard_enabled ? ' tracker-card-nightguard-icon--on' : ''}`}
                            title={d.night_guard_enabled
                              ? (d.night_guard_start_time_local && d.night_guard_end_time_local
                                ? `Night Guard on ${d.night_guard_start_time_local}–${d.night_guard_end_time_local} (${d.night_guard_timezone ?? 'local'}) – open settings to change`
                                : 'Night Guard on – open settings to change')
                              : 'Night Guard off – open settings to enable'}
                            aria-label={d.night_guard_enabled ? 'Night Guard on' : 'Night Guard off'}
                          >
                            <Moon size={12} aria-hidden />
                            <span>
                              {d.night_guard_enabled && d.night_guard_start_time_local && d.night_guard_end_time_local
                                ? `${d.night_guard_start_time_local}–${d.night_guard_end_time_local}`
                                : d.night_guard_enabled ? 'On' : 'Off'}
                            </span>
                          </span>
                          {emergencyOn && (
                            <span
                              className="tracker-card-chip tracker-card-chip--emergency"
                              title="Emergency Mode – 30s updates for recovery"
                              aria-label="Emergency Mode active"
                            >
                              <ShieldAlert size={12} aria-hidden />
                              <span>Emergency</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSettingsOpenId(d.id); setSettingsTab('appearance' as const); }}
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
      </AppContainer>

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
                {editingNameId === device.id ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    id="tracker-settings-modal-title"
                    className="tracker-settings-modal-title-input"
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value.slice(0, TRACKER_NAME_MAX))}
                    onBlur={() => {
                      const trimmed = editingNameValue.trim();
                      const validation = validateTrackerName(trimmed || null);
                      if (!validation.valid) {
                        alert(validation.error);
                        setEditingNameValue(device.name || device.id);
                        setEditingNameId(null);
                        return;
                      }
                      const newName = trimmed || null;
                      if (newName !== (device.name ?? null)) {
                        onSettingsChange(device.id, { name: newName });
                      }
                      setEditingNameId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') {
                        setEditingNameValue(device.name || device.id);
                        setEditingNameId(null);
                      }
                    }}
                    placeholder="Tracker name"
                    maxLength={TRACKER_NAME_MAX}
                    aria-label="Tracker name"
                  />
                ) : (
                  <div className="tracker-settings-modal-title-row">
                    <h2 id="tracker-settings-modal-title" className="tracker-settings-modal-title">
                      {device.name || device.id}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNameId(device.id);
                        setEditingNameValue(device.name || device.id);
                      }}
                      className="tracker-settings-modal-edit-name"
                      title="Edit name"
                      aria-label="Edit tracker name"
                    >
                      <Pencil size={16} strokeWidth={2} />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (editingNameId === device.id) setEditingNameId(null);
                    setSettingsOpenId(null);
                  }}
                  className="tracker-settings-modal-close"
                  title="Close"
                  aria-label="Close"
                >
                  <X size={20} strokeWidth={2} />
                </button>
              </div>
              <div className="tracker-settings-modal-status" aria-label="Device status (last packet)">
                <div className="tracker-settings-modal-status-row">
                  <span className="tracker-settings-modal-status-label">Last seen</span>
                  <span className="tracker-settings-modal-status-value">
                    {device.last_seen_at
                      ? new Date(device.last_seen_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                      : 'Never'}
                  </span>
                </div>
                <div className="tracker-settings-modal-status-row">
                  <span className="tracker-settings-modal-status-label">GPS lock (last packet)</span>
                  <span className="tracker-settings-modal-status-value">
                    {device.gps_lock_last == null ? '—' : device.gps_lock_last ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="tracker-settings-modal-status-row">
                  <span className="tracker-settings-modal-status-label">Battery (last packet)</span>
                  <span className="tracker-settings-modal-status-value">
                    {device.last_battery_voltage != null ? `${device.last_battery_voltage.toFixed(2)} V` : '—'}
                  </span>
                </div>
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
                  aria-selected={settingsTab === 'alerts'}
                  aria-controls="tracker-settings-panel-alerts"
                  id="tracker-settings-tab-alerts"
                  className={`tracker-settings-modal-tab${settingsTab === 'alerts' ? ' tracker-settings-modal-tab--active' : ''}`}
                  onClick={() => setSettingsTab('alerts')}
                >
                  <AlertCircle size={16} strokeWidth={2} />
                  <span>Movement alerts</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === 'signal'}
                  aria-controls="tracker-settings-panel-signal"
                  id="tracker-settings-tab-signal"
                  className={`tracker-settings-modal-tab${settingsTab === 'signal' ? ' tracker-settings-modal-tab--active' : ''}`}
                  onClick={() => setSettingsTab('signal')}
                >
                  <Radio size={16} strokeWidth={2} />
                  <span>Signal</span>
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
                {settingsTab === 'alerts' && (
                  <div id="tracker-settings-panel-alerts" role="tabpanel" aria-labelledby="tracker-settings-tab-alerts" className="tracker-settings-modal-panel">
                    <div className="tracker-settings-modal-section tracker-settings-modal-guard-section">
                      <h3 className="tracker-settings-modal-section-title tracker-settings-modal-section-title--with-icon">
                            <FaShieldDog size={18} aria-hidden />
                            <span>WatchDog</span>
                          </h3>
                      <p className="tracker-settings-modal-description">
                        When WatchDog is on, you&apos;ll get an alert if this tracker moves—either it goes faster than 5 km/h or travels more than 50 m from where you turned it on.
                      </p>
                      <div className="tracker-settings-modal-watchdog-wrap">
                        <div className="tracker-settings-modal-watchdog-toggle" role="group" aria-label="WatchDog arm state">
                          <button
                            type="button"
                            onClick={() => onWatchdogToggle(device.id, true)}
                            disabled={colorSaveStatus?.deviceId === device.id && colorSaveStatus?.status === 'saving'}
                            className={`tracker-settings-modal-watchdog-btn tracker-settings-modal-watchdog-btn--arm${device.watchdog_armed ? ' tracker-settings-modal-watchdog-btn--active' : ''}`}
                            title="Arm: alert if tracker moves"
                          >
                            {colorSaveStatus?.deviceId === device.id && !device.watchdog_armed ? <Loader2 size={18} className="animate-spin" /> : <FaShieldDog size={18} aria-hidden />}
                            <span>Arm</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onWatchdogToggle(device.id, false)}
                            disabled={colorSaveStatus?.deviceId === device.id && colorSaveStatus?.status === 'saving'}
                            className={`tracker-settings-modal-watchdog-btn tracker-settings-modal-watchdog-btn--disarm${!device.watchdog_armed ? ' tracker-settings-modal-watchdog-btn--active' : ''}`}
                            title="Disarm"
                          >
                            {colorSaveStatus?.deviceId === device.id && device.watchdog_armed ? <Loader2 size={18} className="animate-spin" /> : <FaShieldDog size={18} style={{ opacity: 0.6 }} aria-hidden />}
                            <span>Disarm</span>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="tracker-settings-modal-section tracker-settings-modal-guard-section tracker-settings-nightguard-panel">
                      <div className="tracker-settings-nightguard-header">
                        <h3 className="tracker-settings-modal-section-title tracker-settings-modal-section-title--with-icon">
                        <Moon size={18} aria-hidden />
                        <span>Night Guard</span>
                      </h3>
                        <p className="tracker-settings-nightguard-desc">Alerts if the tracker leaves the Home radius during the active window.</p>
                      </div>
                      {nightGuardRuleLoading ? (
                        <p className="tracker-settings-modal-description"><Loader2 size={16} className="animate-spin" /> Loading…</p>
                      ) : (() => {
                        const deviceId = device.id;
                        const start = nightGuardRule?.start_time_local ?? device.night_guard_start_time_local ?? '21:00';
                        const end = nightGuardRule?.end_time_local ?? device.night_guard_end_time_local ?? '06:00';
                        const tz = nightGuardRule?.timezone ?? device.night_guard_timezone ?? getBrowserTimezone();
                        const radius = nightGuardRule?.radius_m ?? device.night_guard_radius_m ?? 50;
                        const radiusClamped = Math.min(100, Math.max(25, radius));
                        const homeLat = nightGuardRule?.home_lat ?? device.night_guard_home_lat ?? null;
                        const homeLng = nightGuardRule?.home_lon ?? device.night_guard_home_lon ?? null;
                        const timezoneOptions = NIGHT_GUARD_TIMEZONES.includes(getBrowserTimezone())
                          ? NIGHT_GUARD_TIMEZONES
                          : [getBrowserTimezone(), ...NIGHT_GUARD_TIMEZONES];
                        const RADIUS_MIN = 25;
                        const RADIUS_MAX = 100;
                        const mapboxToken = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : undefined;
                        function saveRule(updates: { start_time_local?: string; end_time_local?: string; timezone?: string; radius_m?: number; home_lat?: number | null; home_lon?: number | null }) {
                          const newStart = updates.start_time_local ?? start;
                          const newEnd = updates.end_time_local ?? end;
                          const newTz = updates.timezone ?? tz;
                          const newRadius = updates.radius_m ?? radius;
                          const newHomeLat = updates.home_lat !== undefined ? updates.home_lat : homeLat;
                          const newHomeLng = updates.home_lon !== undefined ? updates.home_lon : homeLng;
                          if (updates.start_time_local !== undefined || updates.end_time_local !== undefined) {
                            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newStart) || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newEnd)) return;
                          }
                          setNightGuardRule({ start_time_local: newStart, end_time_local: newEnd, timezone: newTz, radius_m: newRadius, home_lat: newHomeLat, home_lon: newHomeLng });
                          onSaveNightGuardRule(deviceId, { start_time_local: newStart, end_time_local: newEnd, timezone: newTz, radius_m: newRadius, home_lat: newHomeLat, home_lon: newHomeLng });
                        }
                        async function handleUseMyLocation() {
                          if (!navigator.geolocation) {
                            alert('Location is not supported by your browser.');
                            return;
                          }
                          setNightGuardHomeLoading(true);
                          navigator.geolocation.getCurrentPosition(
                            (pos) => {
                              saveRule({ home_lat: pos.coords.latitude, home_lon: pos.coords.longitude });
                              setNightGuardHomeLoading(false);
                            },
                            () => {
                              alert('Could not get your location. Check permissions or try setting Home on the map.');
                              setNightGuardHomeLoading(false);
                            },
                            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
                          );
                        }
                        async function handleSetFromAddress() {
                          const query = nightGuardAddressInput.trim();
                          if (!query) return;
                          if (!mapboxToken) {
                            alert('Map search is not configured.');
                            return;
                          }
                          setNightGuardHomeLoading(true);
                          try {
                            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(mapboxToken)}&limit=1`;
                            const res = await fetch(url);
                            if (!res.ok) throw new Error('Geocoding failed');
                            const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
                            const center = data.features?.[0]?.center;
                            if (!center || center.length < 2) {
                              alert('No location found for that address.');
                              setNightGuardHomeLoading(false);
                              return;
                            }
                            const [lng, lat] = center;
                            saveRule({ home_lat: lat, home_lon: lng });
                            setNightGuardAddressInput('');
                          } catch {
                            alert('Could not find that address. Try a different search.');
                          }
                          setNightGuardHomeLoading(false);
                        }
                        return (
                          <div className="tracker-settings-nightguard-body">
                            <div className="tracker-settings-nightguard-card">
                              <div className="tracker-settings-nightguard-card-row">
                                <span className="tracker-settings-nightguard-card-label">Status</span>
                                <div className="tracker-settings-modal-watchdog-toggle" role="group" aria-label="Night Guard on/off">
                                  <button
                                    type="button"
                                    onClick={() => onNightGuardToggle(device.id, true)}
                                    className={`tracker-settings-modal-watchdog-btn tracker-settings-modal-watchdog-btn--arm${device.night_guard_enabled ? ' tracker-settings-modal-watchdog-btn--active' : ''}`}
                                    title="Turn Night Guard on"
                                  >
                                    <Moon size={18} aria-hidden />
                                    <span>On</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onNightGuardToggle(device.id, false)}
                                    className={`tracker-settings-modal-watchdog-btn tracker-settings-modal-watchdog-btn--disarm${!device.night_guard_enabled ? ' tracker-settings-modal-watchdog-btn--active' : ''}`}
                                    title="Turn Night Guard off"
                                  >
                                    <Moon size={18} style={{ opacity: 0.6 }} aria-hidden />
                                    <span>Off</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="tracker-settings-nightguard-setup-toggle"
                              onClick={() => setNightGuardSetupExpanded((e) => !e)}
                              aria-expanded={nightGuardSetupExpanded}
                              aria-controls="tracker-settings-nightguard-setup-content"
                              id="tracker-settings-nightguard-setup-toggle"
                            >
                              <span className="tracker-settings-nightguard-setup-cta">
                                {nightGuardSetupExpanded ? 'Hide schedule and location' : 'Click here to set up schedule and home location'}
                              </span>
                              <ChevronDown size={18} className={`tracker-settings-nightguard-setup-chevron${nightGuardSetupExpanded ? ' tracker-settings-nightguard-setup-chevron--open' : ''}`} aria-hidden />
                            </button>
                            {nightGuardSetupExpanded && (
                              <div id="tracker-settings-nightguard-setup-content" className="tracker-settings-nightguard-setup-content" role="region" aria-labelledby="tracker-settings-nightguard-setup-toggle">
                                <div className="tracker-settings-nightguard-card">
                                  <span className="tracker-settings-nightguard-card-label">Schedule</span>
                                  <div className="tracker-settings-nightguard-schedule">
                                    <label className="tracker-settings-nightguard-time-label">
                                      <span>From</span>
                                      <input
                                        type="time"
                                        value={start}
                                        onChange={(e) => saveRule({ start_time_local: e.target.value })}
                                        aria-label="Start time"
                                      />
                                    </label>
                                    <span className="tracker-settings-nightguard-time-sep">to</span>
                                    <label className="tracker-settings-nightguard-time-label">
                                      <span>To</span>
                                      <input
                                        type="time"
                                        value={end}
                                        onChange={(e) => saveRule({ end_time_local: e.target.value })}
                                        aria-label="End time"
                                      />
                                    </label>
                                    <label className="tracker-settings-nightguard-timezone-label">
                                      <span>Timezone</span>
                                      <select
                                        value={tz}
                                        onChange={(e) => saveRule({ timezone: e.target.value })}
                                        aria-label="Timezone"
                                      >
                                        {timezoneOptions.map((z) => (
                                          <option key={z} value={z}>{z}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                </div>
                                <div className="tracker-settings-nightguard-card">
                                  <span className="tracker-settings-nightguard-card-label">Alert radius</span>
                                  <div className="tracker-settings-nightguard-radius-bar-wrap">
                                    <input
                                      type="range"
                                      min={RADIUS_MIN}
                                      max={RADIUS_MAX}
                                      step={1}
                                      value={radiusClamped}
                                      onChange={(e) => saveRule({ radius_m: parseInt(e.target.value, 10) })}
                                      className="tracker-settings-nightguard-radius-bar"
                                      style={{ ['--radius-percent' as string]: `${((radiusClamped - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 100}%` }}
                                      aria-label="Alert radius in metres"
                                    />
                                    <span className="tracker-settings-nightguard-radius-value" aria-hidden>{radiusClamped} m</span>
                                  </div>
                                </div>
                                <div className="tracker-settings-nightguard-card tracker-settings-nightguard-home-card">
                                  <span className="tracker-settings-nightguard-card-label">Home location</span>
                                  <div className="tracker-settings-nightguard-home-tools">
                                    <button
                                      type="button"
                                      onClick={handleUseMyLocation}
                                      disabled={nightGuardHomeLoading}
                                      className="tracker-settings-nightguard-home-btn"
                                      title="Use your current location"
                                    >
                                      {nightGuardHomeLoading ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                                      <span>Use my location</span>
                                    </button>
                                    <div className="tracker-settings-nightguard-address-row">
                                      <input
                                        type="text"
                                        value={nightGuardAddressInput}
                                        onChange={(e) => setNightGuardAddressInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSetFromAddress()}
                                        placeholder="Search address…"
                                        className="tracker-settings-nightguard-address-input"
                                        aria-label="Address search"
                                      />
                                      <button
                                        type="button"
                                        onClick={handleSetFromAddress}
                                        disabled={nightGuardHomeLoading || !nightGuardAddressInput.trim()}
                                        className="tracker-settings-nightguard-home-btn tracker-settings-nightguard-set-btn"
                                      >
                                        Set location
                                      </button>
                                    </div>
                                  </div>
                                  <p className="tracker-settings-nightguard-map-hint">Or click the map to set Home. The circle shows the alert radius.</p>
                                  <div className="tracker-settings-nightguard-map-wrap">
                                    <GeofencePickerMap
                                      centerLat={homeLat}
                                      centerLng={homeLng}
                                      radiusMeters={radius}
                                      alertType="keep_in"
                                      onCenterChange={(lat, lng) => saveRule({ home_lat: lat, home_lon: lng })}
                                      showRadiusSlider={false}
                                      compact
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {settingsTab === 'signal' && (
                  <div id="tracker-settings-panel-signal" role="tabpanel" aria-labelledby="tracker-settings-tab-signal" className="tracker-settings-modal-panel">
                    <div className="tracker-settings-modal-section">
                      {device.latest_signal ? (
                        <>
                          <div className="tracker-settings-signal-simple">
                          {device.latest_signal.gps != null && (
                            <div className="tracker-settings-signal-row">
                              <div className="tracker-settings-signal-row-head">
                                <span>Location Signal</span>
                                <span className="tracker-settings-signal-help" data-tooltip="Indicates the quality and reliability of the current GPS position fix." aria-label="Help: Indicates the quality and reliability of the current GPS position fix."><HelpCircle size={16} aria-hidden /></span>
                              </div>
                              <div
                                className={`tracker-settings-signal-block tracker-settings-signal-block--${device.latest_signal.gps.has_signal ? 'good' : device.latest_signal.gps.valid ? 'weak' : 'none'}`}
                                aria-label={device.latest_signal.gps.has_signal ? 'Strong signal' : device.latest_signal.gps.valid ? 'Weak signal' : 'No signal'}
                              >
                                {device.latest_signal.gps.has_signal ? (
                                  <><Check size={18} strokeWidth={2.5} aria-hidden /><span>Strong signal</span></>
                                ) : device.latest_signal.gps.valid ? (
                                  <><Crosshair size={18} strokeWidth={2} aria-hidden /><span>Weak signal</span></>
                                ) : (
                                  <><X size={18} strokeWidth={2.5} aria-hidden /><span>No signal</span></>
                                )}
                              </div>
                              {!device.latest_signal.gps.has_signal && !device.latest_signal.gps.valid && (
                                <p className="tracker-settings-signal-location-warning">
                                  Ensure the tracker has a clear view of the sky for the best GPS signal.
                                </p>
                              )}
                            </div>
                          )}
                          {device.latest_signal.gps != null && (() => {
                            const gps = device.latest_signal.gps;
                            const connectivity = gps?.connectivity;
                            const barPercent = connectivity != null ? connectivity.barPercent : Math.min(100, ((gps?.sats ?? 0) / 12) * 100);
                            const tier = connectivity != null ? connectivity.tier : (gps?.sats ?? 0) === 0 ? 'poor' : (gps?.sats ?? 0) <= 3 ? 'fair' : (gps?.sats ?? 0) <= 6 ? 'weak' : 'good';
                            return (
                            <div className="tracker-settings-signal-row">
                              <div className="tracker-settings-signal-row-head">
                                <span>Satellite Connectivity</span>
                                <span className="tracker-settings-signal-help" data-tooltip="GPS accuracy based on satellites and signal quality." aria-label="Help: GPS accuracy based on satellites and signal quality."><HelpCircle size={16} aria-hidden /></span>
                              </div>
                              <div
                                className={`tracker-settings-signal-block tracker-settings-signal-block--cellular tracker-settings-signal-block--${tier}`}
                                aria-label={`Satellite connectivity: ${gps?.sats ?? 0} satellites`}
                              >
                                <div className="tracker-settings-signal-bar" role="img" aria-hidden>
                                  <div
                                    className="tracker-settings-signal-bar-fill"
                                    style={{ width: `${barPercent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            );
                          })()}
                          {device.latest_signal.gsm != null && (
                            <div className="tracker-settings-signal-row">
                              <div className="tracker-settings-signal-row-head">
                                <span>Cellular Network Strength</span>
                                <span className="tracker-settings-signal-help" data-tooltip="Reflects the strength of the mobile data connection used to transmit real-time tracking information." aria-label="Help: Reflects the strength of the mobile data connection used to transmit real-time tracking information."><HelpCircle size={16} aria-hidden /></span>
                              </div>
                              <div
                                className={`tracker-settings-signal-block tracker-settings-signal-block--cellular tracker-settings-signal-block--${device.latest_signal.gsm.quality === 'great' || device.latest_signal.gsm.quality === 'good' ? 'good' : device.latest_signal.gsm.quality === 'ok' ? 'weak' : 'none'}`}
                                aria-label={`Cellular signal ${device.latest_signal.gsm.percent ?? 0}%`}
                              >
                                <div className="tracker-settings-signal-bar" role="img" aria-hidden>
                                  <div
                                    className="tracker-settings-signal-bar-fill"
                                    style={{ width: `${device.latest_signal.gsm.percent != null ? device.latest_signal.gsm.percent : 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        </>
                      ) : (
                        <p className="tracker-settings-signal-empty">No signal data yet. It will appear here after your tracker sends its next update.</p>
                      )}
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
