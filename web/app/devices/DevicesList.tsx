'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import { validateTrackerName } from '@/lib/device-constants';
import type { UserRole } from '@/lib/roles';
import DevicesListView from './DevicesListView';

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
  night_guard_enabled?: boolean;
  night_guard_start_time_local?: string | null;
  night_guard_end_time_local?: string | null;
  night_guard_timezone?: string | null;
  night_guard_radius_m?: number | null;
  night_guard_home_lat?: number | null;
  night_guard_home_lon?: number | null;
  connection_error?: { error_message: string; created_at: string } | null;
  sim_carrier?: string | null;
};

/** Consider device online if last_seen within this window. Must be > GPS ping interval (e.g. 10 min) so we don't flip offline between pings. */
const ONLINE_MS = 20 * 60 * 1000; // 20 min (allows ~2 missed 10-min pings before offline)
const POLL_INTERVAL_MS = 30 * 1000; // refresh trackers and map every 30s

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;
}

export default function DevicesList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [colorSaveStatus, setColorSaveStatus] = useState<{ deviceId: string; status: 'saving' | 'saved' | 'error' } | null>(null);
  const [highlightedTrackerId, setHighlightedTrackerId] = useState<string | null>(null);
  const [canShowMap, setCanShowMap] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const colorSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (colorSaveTimeoutRef.current) clearTimeout(colorSaveTimeoutRef.current);
    };
  }, []);

  async function load(retried = false) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    const authHeaders = await getAuthHeaders(supabase);
    let res = await fetch('/api/devices', { credentials: 'include', headers: authHeaders });
    if (res.status === 401 && !retried) {
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr) {
        const newHeaders = await getAuthHeaders(supabase);
        res = await fetch('/api/devices', { credentials: 'include', headers: newHeaders });
      }
    }
    if (!res.ok) {
      setError(res.status === 401 ? 'Session expired' : 'Failed to load devices');
      setLoading(false);
      return;
    }
    const data = await res.json();
    setDevices(Array.isArray(data) ? data : []);
    setError(null);

    const [subRes, meRes] = await Promise.all([
      fetch('/api/subscription', { credentials: 'include', headers: authHeaders }),
      fetch('/api/me', { credentials: 'include', cache: 'no-store', headers: authHeaders }),
    ]);
    const role: UserRole = meRes.ok ? ((await meRes.json())?.role ?? 'customer') : 'customer';
    const isCustomerOnly = role === 'customer';
    if (subRes.ok) {
      const subData = await subRes.json();
      const hasActive = subData.hasActiveSimSubscription === true;
      setCanShowMap(isCustomerOnly ? hasActive : true);
    } else {
      setCanShowMap(isCustomerOnly ? false : true);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Auto-refresh trackers and map when tab is visible
  useEffect(() => {
    if (loading) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function tick() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load();
      }
    }

    function startPolling() {
      if (intervalId) return;
      intervalId = setInterval(tick, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        load();
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === 'visible') {
      startPolling();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loading]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newId.trim()) return;
    const nameToSave = newName.trim() || null;
    const nameValidation = validateTrackerName(nameToSave ?? '');
    if (!nameValidation.valid) {
      setError(nameValidation.error ?? 'Invalid name');
      return;
    }
    setAdding(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    const { error: err } = await supabase.from('devices').insert({
      id: newId.trim(),
      user_id: user.id,
      name: nameToSave,
    });
    setAdding(false);
    if (err) {
      setError(err.message);
      return;
    }
    const addedId = newId.trim();
    const addedName = nameToSave;
    setNewId('');
    setNewName('');
    setAddFormOpen(false);
    // Show new device immediately (list + map when it has location)
    const newDevice: Device = {
      id: addedId,
      name: addedName,
      created_at: new Date().toISOString(),
      last_seen_at: null,
      latest_lat: null,
      latest_lng: null,
      marker_color: '#f97316',
      watchdog_armed: false,
      night_guard_enabled: false,
    };
    setDevices((prev) => [newDevice, ...prev]);
    setError(null);
    // Refresh full list from API; if 401, keep optimistic device and show soft message
    const authHeaders = await getAuthHeaders(supabase);
    const res = await fetch('/api/devices', { credentials: 'include', headers: authHeaders });
    if (res.ok) {
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    }
    // If 401, list already has the new device; don't overwrite with "Session expired" blocking UI
  }

  async function handleSettingsChange(
    deviceId: string,
    updates: { marker_color?: string; marker_icon?: string; watchdog_armed?: boolean; name?: string | null }
  ) {
    if (updates.marker_color === undefined && updates.marker_icon === undefined && updates.watchdog_armed === undefined && updates.name === undefined) return;
    setColorSaveStatus({ deviceId, status: 'saving' });
    const authHeaders = await getAuthHeaders(supabase);
    const body: { marker_color?: string; marker_icon?: string; watchdog_armed?: boolean; name?: string | null } = {};
    if (updates.marker_color !== undefined && /^#[0-9A-Fa-f]{6}$/.test(updates.marker_color)) body.marker_color = updates.marker_color;
    if (updates.marker_icon !== undefined) body.marker_icon = updates.marker_icon;
    if (updates.watchdog_armed !== undefined) body.watchdog_armed = updates.watchdog_armed;
    if (updates.name !== undefined) body.name = updates.name === '' ? null : (updates.name ?? null);
    if (Object.keys(body).length === 0) {
      setColorSaveStatus(null);
      return;
    }
    const res = await fetch(`/api/devices/${deviceId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setColorSaveStatus({ deviceId, status: 'error' });
      setTimeout(() => setColorSaveStatus(null), 3000);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, ...body, name: body.name !== undefined ? body.name ?? null : d.name, ...(data.watchdog_armed_at !== undefined && { watchdog_armed_at: data.watchdog_armed_at }) } : d))
    );
    setColorSaveStatus({ deviceId, status: 'saved' });
    setTimeout(() => setColorSaveStatus(null), 2000);
  }

  async function handleWatchdogToggle(deviceId: string, armed: boolean) {
    await handleSettingsChange(deviceId, { watchdog_armed: armed });
  }

  async function handleNightGuardToggle(deviceId: string, enabled: boolean) {
    const authHeaders = await getAuthHeaders(supabase);
    const res = await fetch(`/api/devices/${deviceId}/night-guard`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) return;
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, night_guard_enabled: enabled } : d))
    );
  }

  async function fetchNightGuardRule(deviceId: string): Promise<{ start_time_local: string; end_time_local: string; timezone: string; radius_m: number; home_lat: number | null; home_lon: number | null } | null> {
    const authHeaders = await getAuthHeaders(supabase);
    const res = await fetch(`/api/devices/${deviceId}/night-guard`, { credentials: 'include', headers: authHeaders });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      start_time_local: data.start_time_local ?? '21:00',
      end_time_local: data.end_time_local ?? '06:00',
      timezone: data.timezone ?? 'Australia/Melbourne',
      radius_m: (() => { const r = Number(data.radius_m); return Number.isInteger(r) && r >= 25 && r <= 100 ? r : 50; })(),
      home_lat: data.home_lat != null ? Number(data.home_lat) : null,
      home_lon: data.home_lon != null ? Number(data.home_lon) : null,
    };
  }

  async function saveNightGuardRule(
    deviceId: string,
    payload: { start_time_local: string; end_time_local: string; timezone: string; radius_m?: number; home_lat?: number | null; home_lon?: number | null }
  ) {
    const authHeaders = await getAuthHeaders(supabase);
    const res = await fetch(`/api/devices/${deviceId}/night-guard`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              night_guard_start_time_local: payload.start_time_local,
              night_guard_end_time_local: payload.end_time_local,
              night_guard_timezone: payload.timezone,
              ...(payload.radius_m !== undefined && { night_guard_radius_m: payload.radius_m }),
              ...(payload.home_lat !== undefined && { night_guard_home_lat: payload.home_lat }),
              ...(payload.home_lon !== undefined && { night_guard_home_lon: payload.home_lon }),
            }
          : d
      )
    );
  }

  function handleColorChange(deviceId: string, hex: string) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, marker_color: hex } : d))
    );
    if (colorSaveTimeoutRef.current) {
      clearTimeout(colorSaveTimeoutRef.current);
      colorSaveTimeoutRef.current = null;
    }
    colorSaveTimeoutRef.current = setTimeout(() => {
      colorSaveTimeoutRef.current = null;
      handleSettingsChange(deviceId, { marker_color: hex });
    }, 500);
  }

  const onlineCount = devices.filter((d) => isOnline(d.last_seen_at)).length;
  const offlineCount = devices.length - onlineCount;

  return (
    <DevicesListView
      devices={devices}
      loading={loading}
      newId={newId}
      newName={newName}
      adding={adding}
      error={error}
      addFormOpen={addFormOpen}
      onlineCount={onlineCount}
      offlineCount={offlineCount}
      isOnline={isOnline}
      onNewIdChange={setNewId}
      onNewNameChange={setNewName}
      onAdd={handleAdd}
      onToggleAddForm={() => setAddFormOpen((v) => !v)}
      onColorChange={handleColorChange}
      onSettingsChange={handleSettingsChange}
      onWatchdogToggle={handleWatchdogToggle}
      onNightGuardToggle={handleNightGuardToggle}
      onFetchNightGuardRule={fetchNightGuardRule}
      onSaveNightGuardRule={saveNightGuardRule}
      colorSaveStatus={colorSaveStatus}
      highlightedTrackerId={highlightedTrackerId}
      onMarkerClick={setHighlightedTrackerId}
      onPopupClose={() => setHighlightedTrackerId(null)}
      hasActiveSimSubscription={canShowMap}
      onRetry={() => {
        setError(null);
        setLoading(true);
        load();
      }}
    />
  );
}
