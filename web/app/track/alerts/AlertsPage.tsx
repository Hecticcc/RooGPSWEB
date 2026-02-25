'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Battery, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import AppLoadingIcon from '@/components/AppLoadingIcon';

const GeofencePickerMap = dynamic(() => import('@/components/GeofencePickerMap'), { ssr: false });

type Device = { id: string; name: string | null };
type BatteryAlert = {
  id: string;
  device_id: string;
  threshold_percent: number;
  notify_email: boolean;
  enabled: boolean;
  created_at: string;
};
type Geofence = {
  id: string;
  device_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  alert_email: boolean;
  alert_type?: 'keep_in' | 'keep_out';
  created_at: string;
};

type TabId = 'battery' | 'geo';

const supabase = createClient();

export default function AlertsPage() {
  const [tab, setTab] = useState<TabId>('battery');
  const [devices, setDevices] = useState<Device[]>([]);
  const [batteryAlerts, setBatteryAlerts] = useState<BatteryAlert[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authHeaders = await getAuthHeaders(supabase);
        const [devRes, batRes, geoRes] = await Promise.all([
          fetch('/api/devices', { credentials: 'include', headers: authHeaders }),
          fetch('/api/alerts/battery', { credentials: 'include', headers: authHeaders }),
          fetch('/api/geofences', { credentials: 'include', headers: authHeaders }),
        ]);
        if (cancelled) return;
        if (!devRes.ok) throw new Error('Failed to load devices');
        if (!batRes.ok) throw new Error('Failed to load battery alerts');
        if (!geoRes.ok) throw new Error('Failed to load geofences');
        const devList = await devRes.json();
        const batList = await batRes.json();
        const geoList = await geoRes.json();
        setDevices(Array.isArray(devList) ? devList.map((d: Device) => ({ id: d.id, name: d.name })) : []);
        setBatteryAlerts(Array.isArray(batList) ? batList : []);
        setGeofences(Array.isArray(geoList) ? geoList : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name || id;

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-alerts">
          <h1 className="dashboard-alerts-title">Alerts</h1>
          <div className="dashboard-content-loading">
            <AppLoadingIcon />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-alerts">
        <h1 className="dashboard-alerts-title">Alerts</h1>
        {error && (
          <p style={{ marginBottom: 16, color: 'var(--error)', fontSize: 14 }}>{error}</p>
        )}

        <div className="dashboard-alerts-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'battery'}
            className={`dashboard-alerts-tab ${tab === 'battery' ? 'dashboard-alerts-tab--active' : ''}`}
            onClick={() => setTab('battery')}
          >
            <Battery size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Battery Alerts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'geo'}
            className={`dashboard-alerts-tab ${tab === 'geo' ? 'dashboard-alerts-tab--active' : ''}`}
            onClick={() => setTab('geo')}
          >
            <MapPin size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Geo Alerts
          </button>
        </div>

        <div className="dashboard-alerts-tab-content">
          {tab === 'battery' && (
            <BatteryTab
              devices={devices}
              batteryAlerts={batteryAlerts}
              deviceName={deviceName}
              getAuthHeaders={() => getAuthHeaders(supabase)}
              onUpdate={async () => {
                const headers = await getAuthHeaders(supabase);
                const r = await fetch('/api/alerts/battery', { credentials: 'include', headers });
                if (r.ok) {
                  const data = await r.json();
                  if (Array.isArray(data)) setBatteryAlerts(data);
                }
              }}
              onError={setError}
            />
          )}
          {tab === 'geo' && (
            <GeoTab
              devices={devices}
              geofences={geofences}
              deviceName={deviceName}
              getAuthHeaders={() => getAuthHeaders(supabase)}
              onUpdate={async () => {
                const headers = await getAuthHeaders(supabase);
                const r = await fetch('/api/geofences', { credentials: 'include', headers });
                if (r.ok) {
                  const data = await r.json();
                  if (Array.isArray(data)) setGeofences(data);
                }
              }}
              onError={setError}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function BatteryTab({
  devices,
  batteryAlerts,
  deviceName,
  getAuthHeaders,
  onUpdate,
  onError,
}: {
  devices: Device[];
  batteryAlerts: BatteryAlert[];
  deviceName: (id: string) => string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onUpdate: () => void | Promise<void>;
  onError: (s: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [threshold, setThreshold] = useState(20);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (devices.length && !deviceId) setDeviceId(devices[0].id);
  }, [devices, deviceId]);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceId) return;
    setAdding(true);
    onError(null);
    try {
      const headers = { ...await getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch('/api/alerts/battery', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          device_id: deviceId,
          threshold_percent: threshold,
          notify_email: notifyEmail,
          enabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add');
      }
      onUpdate();
      setThreshold(20);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setAdding(false);
    }
  }

  async function toggleEnabled(alert: BatteryAlert) {
    try {
      const headers = { ...await getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/alerts/battery/${alert.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ enabled: !alert.enabled }),
      });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch {
      onError('Failed to update');
    }
  }

  async function deleteRule(id: string) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/alerts/battery/${id}`, { method: 'DELETE', credentials: 'include', headers });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch {
      onError('Failed to delete');
    }
  }

  return (
    <section className="dashboard-alerts-section">
      <h2 className="dashboard-alerts-section-title">Battery Alerts</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Get notified when a tracker&apos;s battery drops below a threshold. Choose the device and options for each alert.
      </p>

      {batteryAlerts.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Your battery alerts
          </h3>
          <ul className="dashboard-alerts-list">
            {batteryAlerts.map((a) => (
              <li key={a.id}>
                <div>
                  <div className="dashboard-alerts-geofence-name">
                    {deviceName(a.device_id)} — below {a.threshold_percent}%
                  </div>
                  <div className="dashboard-alerts-geofence-meta">
                    Email {a.notify_email ? 'on' : 'off'} · {a.enabled ? 'Enabled' : 'Paused'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="dashboard-alerts-delete"
                    style={{ borderColor: a.enabled ? 'var(--border)' : 'var(--accent)' }}
                    onClick={() => toggleEnabled(a)}
                  >
                    {a.enabled ? 'Pause' : 'Enable'}
                  </button>
                  <button type="button" className="dashboard-alerts-delete" onClick={() => deleteRule(a.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 20, marginBottom: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }} />
        </>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Add battery alert
      </h3>
      <form className="dashboard-alerts-form" onSubmit={addRule}>
        <div className="dashboard-alerts-field">
          <label>Device</label>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required>
            {devices.length === 0 && <option value="">No devices</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name || d.id}</option>
            ))}
          </select>
        </div>
        <div className="dashboard-alerts-field">
          <label>Alert when battery below (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <label className="dashboard-alerts-check">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
          <span>Send by email</span>
        </label>
        <label className="dashboard-alerts-check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Enabled</span>
        </label>
        <button type="submit" className="dashboard-alerts-submit" disabled={adding || devices.length === 0}>
          {adding ? 'Adding…' : 'Add alert'}
        </button>
      </form>
    </section>
  );
}

function GeoTab({
  devices,
  geofences,
  deviceName,
  getAuthHeaders,
  onUpdate,
  onError,
}: {
  devices: Device[];
  geofences: Geofence[];
  deviceName: (id: string) => string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  onUpdate: () => void | Promise<void>;
  onError: (s: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRadius, setEditRadius] = useState('500');
  const [editAlertType, setEditAlertType] = useState<'keep_in' | 'keep_out'>('keep_in');
  const [editNotifyEmail, setEditNotifyEmail] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [alertType, setAlertType] = useState<'keep_in' | 'keep_out'>('keep_in');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('500');
  const [notifyEmail, setNotifyEmail] = useState(true);

  useEffect(() => {
    if (devices.length && !deviceId) setDeviceId(devices[0].id);
  }, [devices, deviceId]);

  async function addGeofence(e: React.FormEvent) {
    e.preventDefault();
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseInt(radius, 10);
    const nameTrimmed = name.trim();
    if (!nameTrimmed) {
      onError('Name is required.');
      return;
    }
    if (!deviceId || Number.isNaN(latNum) || Number.isNaN(lngNum) || Number.isNaN(radiusNum) || radiusNum < 1 || radiusNum > 50000) {
      onError('Enter valid device, coordinates, and radius (1–50000 m).');
      return;
    }
    setAdding(true);
    onError(null);
    try {
      const headers = { ...await getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch('/api/geofences', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          device_id: deviceId,
          name: nameTrimmed,
          alert_type: alertType,
          center_lat: latNum,
          center_lng: lngNum,
          radius_meters: radiusNum,
          alert_email: notifyEmail,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add');
      }
      onUpdate();
      setName('');
      setLat('');
      setLng('');
      setRadius('500');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(g: Geofence) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditRadius(String(g.radius_meters));
    setEditAlertType(g.alert_type === 'keep_out' ? 'keep_out' : 'keep_in');
    setEditNotifyEmail(g.alert_email);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditRadius('500');
    setEditAlertType('keep_in');
    setEditNotifyEmail(true);
  }

  async function saveEdit(id: string) {
    const nameTrimmed = editName.trim();
    if (!nameTrimmed) {
      onError('Name is required.');
      return;
    }
    const radiusNum = parseInt(editRadius, 10);
    if (Number.isNaN(radiusNum) || radiusNum < 1 || radiusNum > 50000) {
      onError('Radius must be 1–50000 m.');
      return;
    }
    setSavingId(id);
    onError(null);
    try {
      const headers = { ...await getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/geofences/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          name: nameTrimmed,
          radius_meters: radiusNum,
          alert_type: editAlertType,
          alert_email: editNotifyEmail,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update');
      }
      onUpdate();
      setEditingId(null);
      setEditName('');
      setEditRadius('500');
      setEditAlertType('keep_in');
      setEditNotifyEmail(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSavingId(null);
    }
  }

  async function deleteGeofence(id: string) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/geofences/${id}`, { method: 'DELETE', credentials: 'include', headers });
      if (!res.ok) throw new Error();
      onUpdate();
      if (editingId === id) cancelEdit();
    } catch {
      onError('Failed to delete');
    }
  }

  return (
    <section className="dashboard-alerts-section">
      <h2 className="dashboard-alerts-section-title">Geo Alerts</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Create an area (center + radius). <strong>Keep In</strong>: notified when the tracker leaves the area. <strong>Keep Out</strong>: notified when the tracker enters the area. Each alert is for one device.
      </p>

      {geofences.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Your geofences
          </h3>
          <ul className="dashboard-alerts-list">
            {geofences.map((g) => (
              <li key={g.id}>
                {editingId === g.id ? (
                  <div className="dashboard-alerts-form" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 'none' }}>
                    <div className="dashboard-alerts-field">
                      <label>Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Geofence name"
                        required
                      />
                    </div>
                    <div className="dashboard-alerts-field">
                      <label>Radius (meters)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <input
                          type="range"
                          className="geofence-radius-range"
                          min={50}
                          max={50000}
                          step={100}
                          value={Math.min(50000, Math.max(50, parseInt(editRadius, 10) || 50))}
                          onChange={(e) => setEditRadius(e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: 120,
                            ['--range-percent' as string]: `${((Math.min(50000, Math.max(50, parseInt(editRadius, 10) || 50)) - 50) / (50000 - 50)) * 100}%`,
                          }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 52 }}>
                          {parseInt(editRadius, 10) || 0} m
                        </span>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={50000}
                        value={editRadius}
                        onChange={(e) => setEditRadius(e.target.value)}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                    <div className="dashboard-alerts-field">
                      <label>Alert type</label>
                      <select
                        value={editAlertType}
                        onChange={(e) => setEditAlertType(e.target.value as 'keep_in' | 'keep_out')}
                        className={`geofence-alert-type-select geofence-alert-type-select--${editAlertType}`}
                      >
                        <option value="keep_in">Keep in — notify when tracker leaves the area</option>
                        <option value="keep_out">Keep out — notify when tracker enters the area</option>
                      </select>
                    </div>
                    <label className="dashboard-alerts-check">
                      <input type="checkbox" checked={editNotifyEmail} onChange={(e) => setEditNotifyEmail(e.target.checked)} />
                      <span>Send by email</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="dashboard-alerts-submit"
                        disabled={savingId === g.id || !editName.trim()}
                        onClick={() => saveEdit(g.id)}
                      >
                        {savingId === g.id ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="dashboard-alerts-delete" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="dashboard-alerts-geofence-name">{g.name}</div>
                      <div className="dashboard-alerts-geofence-meta">
                        {g.alert_type === 'keep_out' ? 'Keep out' : 'Keep in'} · {deviceName(g.device_id)} · {g.radius_meters} m · Email {g.alert_email ? 'on' : 'off'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="dashboard-alerts-delete" onClick={() => startEdit(g)}>
                        Edit
                      </button>
                      <button type="button" className="dashboard-alerts-delete" onClick={() => deleteGeofence(g.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 20, marginBottom: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }} />
        </>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Add geofence
      </h3>
      <form className="dashboard-alerts-form dashboard-alerts-form--full-width" onSubmit={addGeofence}>
        <div className="dashboard-alerts-field">
          <label>Device</label>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required>
            {devices.length === 0 && <option value="">No devices</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name || d.id}</option>
            ))}
          </select>
        </div>
        <div className="dashboard-alerts-field">
          <label>Name</label>
          <input
            type="text"
            placeholder="e.g. Home"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="dashboard-alerts-field">
          <label>Alert type</label>
          <select
            value={alertType}
            onChange={(e) => setAlertType(e.target.value as 'keep_in' | 'keep_out')}
            className={`geofence-alert-type-select geofence-alert-type-select--${alertType}`}
          >
            <option value="keep_in">Keep in — notify when tracker leaves the area</option>
            <option value="keep_out">Keep out — notify when tracker enters the area</option>
          </select>
        </div>
        <div className="dashboard-alerts-field" style={{ width: '100%' }}>
          <label>Location & radius</label>
          <GeofencePickerMap
            centerLat={lat === '' || !Number.isFinite(parseFloat(lat)) ? null : parseFloat(lat)}
            centerLng={lng === '' || !Number.isFinite(parseFloat(lng)) ? null : parseFloat(lng)}
            radiusMeters={parseInt(radius, 10) || 500}
            alertType={alertType}
            existingGeofences={geofences}
            onCenterChange={(latitude, longitude) => {
              setLat(String(latitude));
              setLng(String(longitude));
            }}
            onRadiusChange={(meters) => setRadius(String(meters))}
            showRadiusSlider={true}
          />
        </div>
        <div className="dashboard-alerts-field">
          <label>Radius (meters)</label>
          <input type="number" min={1} max={50000} value={radius} onChange={(e) => setRadius(e.target.value)} />
        </div>
        <label className="dashboard-alerts-check">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
          <span>Send by email</span>
        </label>
        <button
          type="submit"
          className="dashboard-alerts-submit"
          disabled={adding || devices.length === 0 || !name.trim() || !lat.trim() || !lng.trim()}
        >
          {adding ? 'Adding…' : 'Add geofence'}
        </button>
      </form>
    </section>
  );
}
