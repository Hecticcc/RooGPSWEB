'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Route,
  ChevronLeft,
  Activity,
  Gauge,
  Clock,
  RefreshCw,
  Copy,
  ExternalLink,
  Wifi,
  AlertTriangle,
  ShieldAlert,
  Info,
  Share2,
} from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import BatteryLevelIcon from '@/components/BatteryLevelIcon';
import TripsTab from '@/app/devices/TripsTab';
import { getBatteryStatus } from '@/lib/battery';
import { getEventCodeInfo } from '@/lib/event-codes';

const MapboxMap = dynamic(() => import('@/components/MapboxMap'), { ssr: false });

type ViewState = 'LIVE' | 'SLEEPING' | 'INDOOR_NO_GPS' | 'OFFLINE';

type Latest = {
  latitude: number | null;
  longitude: number | null;
  gps_time: string | null;
  received_at: string;
  gps_valid: boolean | null;
  speed_kph: number | null;
  course_deg: number | null;
  event_code: string | null;
  battery_percent?: number | null;
  battery_voltage_v?: number | null;
  signal?: { gps?: { valid?: boolean }; gsm?: { csq?: number } } | null;
  view_state?: ViewState | null;
  next_expected_checkin_at?: string | null;
  heartbeat_minutes?: number | null;
  last_seen_iso?: string | null;
  last_seen_relative?: string | null;
  gps_fix_last?: boolean | null;
  battery_voltage_last?: number | null;
  battery_level_label?: string | null;
  csq_last?: number | null;
  signal_bars?: number | null;
  offline_reason?: string | null;
};

type HistoryRow = Latest & { id: string };

function formatHistoryTime(receivedAt: string): string {
  const d = new Date(receivedAt);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium', hour12: false });
}

/** Format a Date as yyyy-MM-ddThh:mm in local time (for datetime-local and API range). */
function toLocalDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

type EmergencyStatus = 'OFF' | 'ENABLING' | 'ON' | 'DISABLING' | 'ERROR';

type ModeTransitionStatus =
  | 'IDLE'
  | 'SENDING'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'PENDING_UNCONFIRMED'
  | 'ERROR_MISMATCH'
  | 'ERROR_SEND';

type Device = {
  id: string;
  name: string | null;
  last_seen_at: string | null;
  emergency_enabled?: boolean;
  emergency_status?: EmergencyStatus | null;
  emergency_activated_at?: string | null;
  emergency_last_error?: string | null;
  desired_mode?: 'NORMAL' | 'EMERGENCY' | null;
  applied_mode?: 'NORMAL' | 'EMERGENCY' | 'UNKNOWN' | null;
  mode_transition_status?: ModeTransitionStatus | null;
  mode_transition_started_at?: string | null;
  mode_verify_deadline_at?: string | null;
  mode_verify_attempt?: number | null;
  mode_verify_details?: { message?: string } | null;
};

type TabId = 'live' | 'trips';
type RangePreset = '1h' | '24h' | '7d' | 'custom';

const VIEW_STATE_LABELS: Record<ViewState, string> = {
  LIVE: 'Live',
  SLEEPING: 'Sleep',
  INDOOR_NO_GPS: 'Indoor / No GPS',
  OFFLINE: 'Offline',
};

const VIEW_STATE_SUBTEXTS: Record<ViewState, (relative: string | null) => string> = {
  LIVE: () => 'Updating while moving.',
  SLEEPING: () => 'Saving battery. Wakes on movement.',
  INDOOR_NO_GPS: () => 'GPS signal blocked. Showing last known location.',
  OFFLINE: (relative) => (relative ? `No connection since ${relative}.` : 'No connection.'),
};

const MAPBOX_TOKEN = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN : '';

async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ place_name?: string }> };
    return data.features?.[0]?.place_name ?? null;
  } catch {
    return null;
  }
}

export default function DeviceDetail() {
  const params = useParams();
  const id = params.id as string;
  const [device, setDevice] = useState<Device | null>(null);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [tab, setTab] = useState<TabId>('live');
  const [rangePreset, setRangePreset] = useState<RangePreset>('24h');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24, 0, 0, 0);
    return toLocalDatetimeLocal(d);
  });
  const [to, setTo] = useState(() => {
    return toLocalDatetimeLocal(new Date());
  });
  const [showAdvancedHistory, setShowAdvancedHistory] = useState(false);
  const [lastAddress, setLastAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [emergencyActionLoading, setEmergencyActionLoading] = useState(false);
  const [showEmergencyEnableModal, setShowEmergencyEnableModal] = useState(false);
  const [showEmergencyDisableModal, setShowEmergencyDisableModal] = useState(false);
  const [showEmergencyInfoPopup, setShowEmergencyInfoPopup] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLinkUrl, setShareLinkUrl] = useState<string | null>(null);
  const [shareLinkExpiresAt, setShareLinkExpiresAt] = useState<string | null>(null);
  const [shareCreating, setShareCreating] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const emergencyInfoRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const HISTORY_PAGE_SIZE = 10;
  const ACTIVITY_PAGE_SIZE = 20;
  const historyPageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const historySlice = history.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );
  const viewState: ViewState = (latest?.view_state as ViewState) ?? 'OFFLINE';
  const historyNewestFirst = [...history].reverse();
  const activityPageCount = Math.max(1, Math.ceil(history.length / ACTIVITY_PAGE_SIZE));
  const activityTimeline = historyNewestFirst.slice(
    (activityPage - 1) * ACTIVITY_PAGE_SIZE,
    activityPage * ACTIVITY_PAGE_SIZE
  );

  const setRangeFromPreset = useCallback((preset: RangePreset) => {
    const now = new Date();
    let fromDate = new Date(now);
    if (preset === '1h') fromDate.setHours(fromDate.getHours() - 1);
    else if (preset === '24h') fromDate.setHours(fromDate.getHours() - 24);
    else if (preset === '7d') fromDate.setDate(fromDate.getDate() - 7);
    setFrom(toLocalDatetimeLocal(fromDate));
    setTo(toLocalDatetimeLocal(now));
    setRangePreset(preset);
  }, []);

  async function fetchDevice() {
    const { data: dev, error: devErr } = await supabase
      .from('devices')
      .select('id, name, last_seen_at, emergency_enabled, emergency_status, emergency_activated_at, emergency_last_error, desired_mode, applied_mode, mode_transition_status, mode_transition_started_at, mode_verify_deadline_at, mode_verify_attempt, mode_verify_details')
      .eq('id', id)
      .single();
    if (!devErr && dev) setDevice(dev);
  }

  async function fetchLatest() {
    const headers = await getAuthHeaders(supabase);
    const res = await fetch(`/api/devices/${id}/latest`, { credentials: 'include', headers });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setLatest(data);
    if (data?.last_seen_iso && device) setDevice((d) => (d ? { ...d, last_seen_at: data.last_seen_iso } : d));
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchLatest();
    await fetchHistory();
    setRefreshing(false);
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    const fromDate = new Date(from).toISOString();
    const toDate = new Date(to).toISOString();
    const headers = await getAuthHeaders(supabase);
    const res = await fetch(
      `/api/devices/${id}/history?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&limit=2000`,
      { credentials: 'include', headers }
    );
    setHistoryLoading(false);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setHistory(data);
    setHistoryPage(1);
    setActivityPage(1);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: dev, error: devErr } = await supabase
        .from('devices')
        .select('id, name, last_seen_at, emergency_enabled, emergency_status, emergency_activated_at, emergency_last_error, desired_mode, applied_mode, mode_transition_status, mode_transition_started_at, mode_verify_deadline_at, mode_verify_attempt, mode_verify_details')
        .eq('id', id)
        .single();
      if (devErr || !dev) {
        router.push('/track');
        return;
      }
      setDevice(dev);
      await fetchLatest();
      setLoading(false);
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (loading) return;
    fetchHistory();
  }, [id, from, to, loading]);

  const deviceModeStatusRef = useRef<ModeTransitionStatus | null>(null);
  deviceModeStatusRef.current = device?.mode_transition_status ?? null;

  useEffect(() => {
    if (!id) return;
    function poll() {
      fetchLatest();
      const status = deviceModeStatusRef.current;
      if (status === 'VERIFYING' || status === 'PENDING_UNCONFIRMED') {
        fetchDevice();
      }
    }
    pollRef.current = setInterval(poll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  useEffect(() => {
    if (!latest?.latitude || !latest?.longitude) {
      setLastAddress(null);
      return;
    }
    let cancelled = false;
    reverseGeocode(latest.longitude, latest.latitude).then((addr) => {
      if (!cancelled) setLastAddress(addr);
    });
    return () => {
      cancelled = true;
    };
  }, [latest?.latitude, latest?.longitude]);

  useEffect(() => {
    if (!showEmergencyInfoPopup) return;
    function handleClickOutside(e: MouseEvent) {
      if (emergencyInfoRef.current && !emergencyInfoRef.current.contains(e.target as Node)) {
        setShowEmergencyInfoPopup(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmergencyInfoPopup]);

  function copyLocation() {
    if (!latest?.latitude || !latest?.longitude) return;
    const text = lastAddress
      ? `${lastAddress} (${latest.latitude.toFixed(5)}, ${latest.longitude.toFixed(5)})`
      : `${latest.latitude}, ${latest.longitude}`;
    navigator.clipboard.writeText(text);
  }

  function openInGoogleMaps() {
    if (!latest?.latitude || !latest?.longitude) return;
    window.open(`https://www.google.com/maps?q=${latest.latitude},${latest.longitude}`, '_blank');
  }

  async function handleCreateShareLink() {
    setShareCreating(true);
    try {
      const headers = await getAuthHeaders(supabase);
      const res = await fetch(`/api/devices/${id}/share-links`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_in: shareExpiry }),
      });
      const data = await res.json();
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to create link');
      }
      const url = data.url ?? (typeof window !== 'undefined' ? `${window.location.origin}/share/${data.token}` : '');
      setShareLinkUrl(url);
      setShareLinkExpiresAt(data.expires_at ?? null);
    } catch (e) {
      setShareLinkUrl('');
      setShareLinkExpiresAt(null);
    } finally {
      setShareCreating(false);
    }
  }

  function copyShareLink() {
    if (!shareLinkUrl) return;
    navigator.clipboard.writeText(shareLinkUrl);
  }

  const modeStatus = device?.mode_transition_status;
  const desiredEmergency = device?.desired_mode === 'EMERGENCY';
  const emergencyOn =
    desiredEmergency ??
    (device?.emergency_enabled === true && (device?.emergency_status === 'ON' || device?.emergency_status === 'ERROR'));
  const emergencyBusy =
    modeStatus === 'SENDING' ||
    modeStatus === 'VERIFYING' ||
    (device?.emergency_status === 'ENABLING' || device?.emergency_status === 'DISABLING');
  const showVerifyNow =
    modeStatus === 'VERIFYING' || modeStatus === 'PENDING_UNCONFIRMED';
  const modeVerifyAttempt = (device?.mode_verify_attempt ?? 0) + 1;
  const modeVerifyDetailsMessage = device?.mode_verify_details?.message;

  async function handleEmergencyEnable() {
    setShowEmergencyEnableModal(false);
    setEmergencyActionLoading(true);
    try {
      const headers = await getAuthHeaders(supabase);
      const res = await fetch(`/api/devices/${id}/emergency/enable`, { method: 'POST', credentials: 'include', headers });
      const data = await res.json();
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to enable Emergency Mode');
      }
      if (data.device) {
        setDevice((d) => (d ? { ...d, ...data.device } : d));
      }
      await fetchDevice();
    } finally {
      setEmergencyActionLoading(false);
    }
  }

  async function handleEmergencyDisable() {
    setShowEmergencyDisableModal(false);
    setEmergencyActionLoading(true);
    try {
      const headers = await getAuthHeaders(supabase);
      const res = await fetch(`/api/devices/${id}/emergency/disable`, { method: 'POST', credentials: 'include', headers });
      const data = await res.json();
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to disable Emergency Mode');
      }
      if (data.device) {
        setDevice((d) => (d ? { ...d, ...data.device } : d));
      }
      await fetchDevice();
    } finally {
      setEmergencyActionLoading(false);
    }
  }

  async function handleVerifyNow() {
    setEmergencyActionLoading(true);
    try {
      const headers = await getAuthHeaders(supabase);
      const res = await fetch(`/api/devices/${id}/emergency/verify`, { method: 'POST', credentials: 'include', headers });
      const data = await res.json();
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (data.device) {
        setDevice((d) => (d ? { ...d, ...data.device } : d));
      }
      await fetchDevice();
    } finally {
      setEmergencyActionLoading(false);
    }
  }

  if (loading || !device) {
    return (
      <main className="dashboard-page">
        <div className="device-view device-view--loading">
          <AppLoadingIcon />
        </div>
      </main>
    );
  }

  const hasCoords = latest && latest.latitude != null && latest.longitude != null;
  const batteryStatus = getBatteryStatus({
    voltage_v: latest?.battery_voltage_last ?? latest?.battery_voltage_v ?? null,
    percent: latest?.battery_percent ?? null,
  });

  return (
    <main className="dashboard-page">
      <div className="device-view">
        <header className="device-view-header">
          <Link href="/track" className="device-view-back">
            <ChevronLeft size={20} strokeWidth={2} aria-hidden />
            <span>Dashboard</span>
          </Link>
          <div className="device-view-title-row">
            <h1 className="device-view-title">{device.name || device.id}</h1>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="device-view-refresh-btn"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw size={18} strokeWidth={2} className={refreshing ? 'device-view-refresh-spin' : ''} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => { setShowShareModal(true); setShareLinkUrl(null); setShareLinkExpiresAt(null); }}
              className="device-view-refresh-btn"
              title="Share tracking link"
              aria-label="Share tracking link"
            >
              <Share2 size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="device-view-header-tabs-row">
            <div className="device-view-tabs" role="tablist" aria-label="View sections">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'live'}
                aria-controls="device-view-panel-live"
                id="device-view-tab-live"
                className={`device-view-tab ${tab === 'live' ? 'device-view-tab--active' : ''}`}
                onClick={() => setTab('live')}
              >
                <MapPin size={18} strokeWidth={2} aria-hidden />
                <span>Live</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'trips'}
                aria-controls="device-view-panel-trips"
                id="device-view-tab-trips"
                className={`device-view-tab ${tab === 'trips' ? 'device-view-tab--active' : ''}`}
                onClick={() => setTab('trips')}
              >
                <Route size={18} strokeWidth={2} aria-hidden />
                <span>Trips</span>
              </button>
            </div>
            <div
              className={`device-view-emergency-header ${emergencyOn ? 'device-view-emergency-header--on' : ''} ${emergencyBusy ? 'device-view-emergency-header--busy' : ''}`}
              ref={emergencyInfoRef}
            >
              {modeStatus === 'SENDING' && (
                <div className="device-view-mode-banner device-view-mode-banner--sending" role="status">
                  <RefreshCw size={16} className="device-view-refresh-spin" aria-hidden />
                  <span>Sending settings to tracker…</span>
                </div>
              )}
              {modeStatus === 'VERIFYING' && (
                <div className="device-view-mode-banner device-view-mode-banner--verifying" role="status">
                  <RefreshCw size={16} className="device-view-refresh-spin" aria-hidden />
                  <span>Verifying tracker settings… (attempt {modeVerifyAttempt}/4)</span>
                  <button type="button" onClick={handleVerifyNow} disabled={emergencyActionLoading} className="device-view-btn device-view-btn--verify-now">
                    Verify now
                  </button>
                </div>
              )}
              {modeStatus === 'CONFIRMED' && (
                <div className="device-view-mode-banner device-view-mode-banner--confirmed" role="status">
                  <span>
                    {device?.desired_mode === 'EMERGENCY' ? 'Emergency Mode Active ✅' : 'Normal Mode Restored ✅'}
                  </span>
                </div>
              )}
              {modeStatus === 'PENDING_UNCONFIRMED' && (
                <div className="device-view-mode-banner device-view-mode-banner--pending" role="status">
                  <span>Mode change sent ⚠️ Waiting for tracker to wake/confirm.</span>
                  {modeVerifyDetailsMessage && <p className="device-view-mode-banner-helper">{modeVerifyDetailsMessage}</p>}
                  <button type="button" onClick={handleVerifyNow} disabled={emergencyActionLoading} className="device-view-btn device-view-btn--verify-now">
                    Verify now
                  </button>
                </div>
              )}
              {(modeStatus === 'ERROR_SEND' || modeStatus === 'ERROR_MISMATCH') && (
                <div className="device-view-mode-banner device-view-mode-banner--error" role="alert">
                  <span>
                    {modeStatus === 'ERROR_SEND'
                      ? 'Failed to send settings. Check signal and try again.'
                      : 'Tracker settings did not match. Try again or contact support.'}
                  </span>
                  {device?.emergency_last_error && <p className="device-view-emergency-header-error">{device.emergency_last_error}</p>}
                  <div className="device-view-mode-banner-actions">
                    <button type="button" onClick={() => (desiredEmergency ? setShowEmergencyDisableModal(true) : setShowEmergencyEnableModal(true))} className="device-view-btn device-view-btn--emergency-on">
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {emergencyBusy && !modeStatus && (
                <div className="device-view-emergency-header-busy" role="status">
                  <RefreshCw size={16} className="device-view-refresh-spin" aria-hidden />
                  <span>Applying…</span>
                </div>
              )}
              {!emergencyBusy && emergencyOn && (
                <div className="device-view-emergency-header-active-wrap">
                  <div className="device-view-emergency-header-active">
                    <ShieldAlert size={16} className="device-view-emergency-header-icon" aria-hidden />
                    <span className="device-view-emergency-header-label">Emergency Mode</span>
                    <button
                      type="button"
                      onClick={() => setShowEmergencyDisableModal(true)}
                      className="device-view-btn device-view-btn--emergency-off"
                    >
                      Disable
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmergencyInfoPopup((v) => !v)}
                      className="device-view-emergency-info-btn"
                      title="How Emergency Mode works"
                      aria-label="How Emergency Mode works"
                      aria-expanded={showEmergencyInfoPopup}
                    >
                      <Info size={16} aria-hidden />
                    </button>
                  </div>
                  {device.emergency_last_error && (
                    <p className="device-view-emergency-header-error" role="alert">
                      {device.emergency_last_error}
                    </p>
                  )}
                </div>
              )}
              {!emergencyBusy && !emergencyOn && (
                <div className="device-view-emergency-header-off">
                  <ShieldAlert size={16} className="device-view-emergency-header-icon" aria-hidden />
                  <span className="device-view-emergency-header-text">Stolen or missing?</span>
                  <button
                    type="button"
                    onClick={() => setShowEmergencyEnableModal(true)}
                    className="device-view-btn device-view-btn--emergency-on"
                  >
                    Activate Emergency Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmergencyInfoPopup((v) => !v)}
                    className="device-view-emergency-info-btn"
                    title="How Emergency Mode works"
                    aria-label="How Emergency Mode works"
                    aria-expanded={showEmergencyInfoPopup}
                  >
                    <Info size={16} aria-hidden />
                  </button>
                </div>
              )}
              {showEmergencyInfoPopup && (
                <div className="device-view-emergency-info-popup" role="dialog" aria-label="Emergency Mode info">
                  <ul className="device-view-emergency-info-list">
                    <li>Can take a couple of minutes to apply (tracker needs signal).</li>
                    <li><strong>Enable:</strong> tracker reports every ~30 seconds so you can follow it in near real time.</li>
                    <li><strong>Disable:</strong> we restore your normal reporting settings.</li>
                    <li className="device-view-emergency-info-warn">Uses more battery — use only when needed for recovery.</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setShowEmergencyInfoPopup(false)}
                    className="device-view-emergency-info-close"
                  >
                    Got it
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {tab === 'live' && (
          <div id="device-view-panel-live" role="tabpanel" aria-labelledby="device-view-tab-live" className="device-view-panel">
            <div className="device-view-grid">
              <section className="device-view-card device-view-card--hero">
                <div className="device-view-hero-inner">
                  {latest ? (
                    <>
                      <div className="device-view-hero-status-block">
                        <span className={`device-view-hero-status-pill device-view-hero-status-pill--${viewState.toLowerCase()}`}>
                          {VIEW_STATE_LABELS[viewState]}
                        </span>
                        <p className="device-view-hero-subtext">
                          {VIEW_STATE_SUBTEXTS[viewState](latest.last_seen_relative ?? null)}
                        </p>
                      </div>
                      <div className="device-view-hero-stats">
                        <div className="device-view-hero-stat">
                          <Clock size={14} className="device-view-hero-stat-icon" aria-hidden />
                          <div>
                            <span className="device-view-hero-stat-label">Last seen</span>
                            <span className="device-view-hero-stat-value" title={latest.last_seen_iso ? new Date(latest.last_seen_iso).toLocaleString() : undefined}>
                              {latest.last_seen_relative ?? (latest.gps_time ? new Date(latest.gps_time).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'medium' }) : '—')}
                            </span>
                          </div>
                        </div>
                        <div className="device-view-hero-stat">
                          <Gauge size={14} className="device-view-hero-stat-icon" aria-hidden />
                          <div>
                            <span className="device-view-hero-stat-label">Speed</span>
                            <span className="device-view-hero-stat-value">{latest.speed_kph != null ? `${latest.speed_kph} km/h` : '—'}</span>
                          </div>
                        </div>
                        <div className="device-view-hero-stat">
                          <BatteryLevelIcon tier={batteryStatus.tier} size={14} color={batteryStatus.color.text} aria-hidden className="device-view-hero-stat-icon" />
                          <div>
                            <span className="device-view-hero-stat-label">Battery</span>
                            <span className="device-view-hero-stat-value" style={{ color: batteryStatus.color.text }}>
                              {latest.battery_level_label ?? batteryStatus.label}
                            </span>
                          </div>
                        </div>
                        <div className="device-view-hero-stat">
                          <Wifi size={14} className="device-view-hero-stat-icon" aria-hidden />
                          <div>
                            <span className="device-view-hero-stat-label">Signal</span>
                            <span className="device-view-hero-stat-value">
                              {latest.signal_bars != null ? (
                                <span className="device-view-signal-bars" aria-label={`${latest.signal_bars} bars`}>
                                  {[1, 2, 3, 4].map((i) => (
                                    <span key={i} className={`device-view-signal-bar ${i <= latest.signal_bars! ? 'device-view-signal-bar--on' : ''}`} />
                                  ))}
                                </span>
                              ) : null}
                              {latest.csq_last != null ? ` CSQ ${latest.csq_last}` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {viewState === 'SLEEPING' && latest.next_expected_checkin_at && (
                        <div className="device-view-next-checkin">
                          <Clock size={16} className="device-view-next-checkin-icon" aria-hidden />
                          <div className="device-view-next-checkin-content">
                            <span className="device-view-next-checkin-label">Next check-in</span>
                            <span className="device-view-next-checkin-time">
                              {new Date(latest.next_expected_checkin_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <span className="device-view-next-checkin-note">
                            Every {latest.heartbeat_minutes != null ? (latest.heartbeat_minutes >= 60 ? `${Math.round(latest.heartbeat_minutes / 60)}h` : `${latest.heartbeat_minutes}m`) : '12h'} from last transmission
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="device-view-muted">No location data yet.</p>
                  )}
                </div>
              </section>

              <section className="device-view-card device-view-card--map">
                <h2 className="device-view-card-title">Location</h2>
                {hasCoords ? (
                  <>
                    <div className="device-view-map-wrap">
                      <MapboxMap
                        lat={latest!.latitude!}
                        lng={latest!.longitude!}
                        history={history.filter((h) => h.latitude != null && h.longitude != null) as { latitude: number; longitude: number }[]}
                      />
                    </div>
                    {viewState === 'INDOOR_NO_GPS' && (
                      <div className="device-view-indoor-banner" role="status">
                        <AlertTriangle size={16} aria-hidden />
                        <span>GPS unavailable — last known location shown.</span>
                      </div>
                    )}
                    <div className="device-view-address-bar">
                      <span className="device-view-address-text" title={lastAddress ?? undefined}>
                        {lastAddress ?? 'Resolving…'}
                      </span>
                      <div className="device-view-address-actions">
                        <button type="button" onClick={copyLocation} className="device-view-address-btn" title="Copy location" aria-label="Copy location">
                          <Copy size={16} aria-hidden />
                        </button>
                        <button type="button" onClick={openInGoogleMaps} className="device-view-address-btn" title="Open in Google Maps" aria-label="Open in Google Maps">
                          <ExternalLink size={16} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="device-view-empty">No position to show on map</div>
                )}
              </section>
            </div>

            <section className="device-view-card device-view-card--history">
              <div className="device-view-history-header">
                <h2 className="device-view-card-title">Activity</h2>
                <div className="device-view-history-header-right">
                  <div className="device-view-range-row">
                    <span className="device-view-range-label">Range:</span>
                    <div className="device-view-range-btns">
                      {(['1h', '24h', '7d'] as const).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRangeFromPreset(preset)}
                          className={`device-view-btn device-view-btn--range ${rangePreset === preset ? 'device-view-btn--range-active' : ''}`}
                        >
                          {preset === '1h' ? 'Last 1h' : preset === '24h' ? 'Last 24h' : 'Last 7d'}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setRangePreset('custom')}
                        className={`device-view-btn device-view-btn--range ${rangePreset === 'custom' ? 'device-view-btn--range-active' : ''}`}
                      >
                        Custom
                      </button>
                    </div>
                    {rangePreset === 'custom' && (
                      <div className="device-view-history-controls">
                        <label className="device-view-history-label">
                          <span>From</span>
                          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="device-view-input" />
                        </label>
                        <label className="device-view-history-label">
                          <span>To</span>
                          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="device-view-input" />
                        </label>
                        <button type="button" onClick={fetchHistory} disabled={historyLoading} className="device-view-btn device-view-btn--primary">
                          {historyLoading ? 'Loading…' : 'Load'}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedHistory((v) => !v)}
                    className="device-view-btn device-view-btn--raw-log"
                    aria-label={showAdvancedHistory ? 'Back to timeline' : 'Show raw log table'}
                  >
                    {showAdvancedHistory ? 'Timeline' : 'Raw log'}
                  </button>
                </div>
              </div>

              {!showAdvancedHistory ? (
                <>
                  <ul className="device-view-timeline" aria-label="Recent activity">
                    {activityTimeline.length === 0 && !historyLoading && <li className="device-view-muted">No activity in this range.</li>}
                    {activityTimeline.map((row) => {
                      const info = getEventCodeInfo(row.event_code);
                      return (
                        <li key={row.id} className={`device-view-timeline-item device-view-timeline-item--${info.severity}`}>
                          <span className="device-view-timeline-time">{formatHistoryTime(row.received_at)}</span>
                          <span className="device-view-timeline-label">{info.label}</span>
                          {row.speed_kph != null && <span className="device-view-timeline-meta">{row.speed_kph} km/h</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {history.length > ACTIVITY_PAGE_SIZE && (
                    <div className="device-view-pagination device-view-pagination--activity">
                      <p className="device-view-pagination-info">
                        Page {activityPage} of {activityPageCount} · {history.length} entries
                      </p>
                      <div className="device-view-pagination-btns">
                        <button type="button" onClick={() => setActivityPage((p) => Math.max(1, p - 1))} disabled={activityPage <= 1} className="device-view-btn device-view-btn--secondary">
                          Previous
                        </button>
                        <button type="button" onClick={() => setActivityPage((p) => Math.min(activityPageCount, p + 1))} disabled={activityPage >= activityPageCount} className="device-view-btn device-view-btn--secondary">
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="device-view-table-wrap">
                    <table className="device-view-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>GPS Fix</th>
                          <th>Speed</th>
                          <th>Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historySlice.map((row) => {
                          const info = getEventCodeInfo(row.event_code);
                          return (
                            <tr key={row.id}>
                              <td>{formatHistoryTime(row.received_at)}</td>
                              <td>
                                <span className="device-view-gps-dot" data-valid={row.gps_valid === true ? 'yes' : row.gps_valid === false ? 'no' : 'unknown'} aria-hidden />
                                {row.gps_valid == null ? '—' : row.gps_valid ? 'Yes' : 'No'}
                              </td>
                              <td>{row.speed_kph != null ? row.speed_kph : '—'}</td>
                              <td>{info.label}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {history.length > 0 && (
                    <div className="device-view-pagination">
                      <p className="device-view-pagination-info">
                        Page {historyPage} of {historyPageCount} · {history.length} total
                      </p>
                      <div className="device-view-pagination-btns">
                        <button type="button" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage <= 1} className="device-view-btn device-view-btn--secondary">
                          Previous
                        </button>
                        <button type="button" onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))} disabled={historyPage >= historyPageCount} className="device-view-btn device-view-btn--secondary">
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {tab === 'trips' && (
          <div id="device-view-panel-trips" role="tabpanel" aria-labelledby="device-view-tab-trips" className="device-view-panel device-view-panel--trips">
            <TripsTab deviceId={id} />
          </div>
        )}
      </div>

      {showEmergencyEnableModal && (
        <div className="device-view-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="emergency-enable-title">
          <div className="device-view-modal">
            <h2 id="emergency-enable-title" className="device-view-modal-title">Activate Emergency Mode?</h2>
            <div className="device-view-modal-body">
              <ul>
                <li>Tracker will update every 30 seconds to help recovery.</li>
                <li>This will reduce battery life significantly.</li>
              </ul>
            </div>
            <div className="device-view-modal-actions">
              <button type="button" onClick={() => setShowEmergencyEnableModal(false)} className="device-view-btn device-view-btn--secondary">
                Cancel
              </button>
              <button type="button" onClick={handleEmergencyEnable} className="device-view-btn device-view-btn--emergency">
                Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmergencyDisableModal && (
        <div className="device-view-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="emergency-disable-title">
          <div className="device-view-modal">
            <h2 id="emergency-disable-title" className="device-view-modal-title">Disable Emergency Mode?</h2>
            <p className="device-view-modal-body">
              Return to normal tracking (e.g. 120s moving interval, 12h heartbeat when stopped).
            </p>
            <div className="device-view-modal-actions">
              <button type="button" onClick={() => setShowEmergencyDisableModal(false)} className="device-view-btn device-view-btn--secondary">
                Cancel
              </button>
              <button type="button" onClick={handleEmergencyDisable} className="device-view-btn device-view-btn--primary">
                Disable
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="device-view-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="share-tracking-title" onClick={() => setShowShareModal(false)}>
          <div className="device-view-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="share-tracking-title" className="device-view-modal-title">Share tracking link</h2>
            <p className="device-view-modal-body">
              Create a secure, time-limited link to share your tracker&apos;s location and recent travel path. This view-only link can be shared with police or recovery services and will automatically expire.
            </p>
            {!shareLinkUrl ? (
              <>
                <label className="device-view-history-label" style={{ display: 'block', marginBottom: '0.75rem' }}>
                  <span style={{ display: 'block', marginBottom: '0.35rem' }}>Link expires in</span>
                  <select
                    value={shareExpiry}
                    onChange={(e) => setShareExpiry(e.target.value as '1h' | '6h' | '24h' | '7d')}
                    className="device-view-input"
                    style={{ width: '100%' }}
                  >
                    <option value="1h">1 hour</option>
                    <option value="6h">6 hours</option>
                    <option value="24h">24 hours</option>
                    <option value="7d">7 days</option>
                  </select>
                </label>
                <div className="device-view-modal-actions">
                  <button type="button" onClick={() => setShowShareModal(false)} className="device-view-btn device-view-btn--secondary">
                    Cancel
                  </button>
                  <button type="button" onClick={handleCreateShareLink} disabled={shareCreating} className="device-view-btn device-view-btn--primary">
                    {shareCreating ? 'Creating…' : 'Create link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="device-view-modal-body" style={{ marginBottom: '0.5rem' }}>
                  Share this URL. It expires {shareLinkExpiresAt ? new Date(shareLinkExpiresAt).toLocaleString() : ''}.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input
                    type="text"
                    readOnly
                    value={shareLinkUrl}
                    className="device-view-input"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                  <button type="button" onClick={copyShareLink} className="device-view-btn device-view-btn--primary" title="Copy link">
                    <Copy size={18} aria-hidden />
                  </button>
                </div>
                <div className="device-view-modal-actions">
                  <button type="button" onClick={() => setShowShareModal(false)} className="device-view-btn device-view-btn--primary">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
