'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import dynamic from 'next/dynamic';
import { MapPin, Route, ChevronLeft, Activity, Gauge, Clock } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import BatteryLevelIcon from '@/components/BatteryLevelIcon';
import TripsTab from '@/app/devices/TripsTab';
import { getBatteryStatus } from '@/lib/battery';

const MapboxMap = dynamic(() => import('@/components/MapboxMap'), { ssr: false });

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
};

type HistoryRow = Latest & { id: string };

function formatHistoryTime(receivedAt: string): string {
  const d = new Date(receivedAt);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium', hour12: false });
}

type Device = {
  id: string;
  name: string | null;
  last_seen_at: string | null;
};

type TabId = 'live' | 'trips';

export default function DeviceDetail() {
  const params = useParams();
  const id = params.id as string;
  const [device, setDevice] = useState<Device | null>(null);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [tab, setTab] = useState<TabId>('live');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const router = useRouter();

  const HISTORY_PAGE_SIZE = 10;
  const historyPageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const historySlice = history.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );
  const supabase = createClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    const fromDate = new Date(from).toISOString();
    const toDate = new Date(to).toISOString();
    const headers = await getAuthHeaders(supabase);
    const res = await fetch(`/api/devices/${id}/history?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&limit=2000`, { credentials: 'include', headers });
    setHistoryLoading(false);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setHistory(data);
    setHistoryPage(1);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: dev, error: devErr } = await supabase.from('devices').select('id, name, last_seen_at').eq('id', id).single();
      if (devErr || !dev) {
        router.push('/track');
        return;
      }
      setDevice(dev);
      await fetchLatest();
      await fetchHistory();
      setLoading(false);
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    pollRef.current = setInterval(fetchLatest, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

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
  const lastSeenDate = device.last_seen_at ? new Date(device.last_seen_at) : null;
  const isRecent = lastSeenDate && (Date.now() - lastSeenDate.getTime() < 5 * 60 * 1000);

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
            <span className={`device-view-status ${isRecent ? 'device-view-status--online' : ''}`}>
              {device.last_seen_at
                ? new Date(device.last_seen_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
                : 'Never'}
            </span>
          </div>

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
        </header>

        {tab === 'live' && (
          <div id="device-view-panel-live" role="tabpanel" aria-labelledby="device-view-tab-live" className="device-view-panel">
            <div className="device-view-grid">
              <section className="device-view-card device-view-card--map">
                <h2 className="device-view-card-title">Location</h2>
                {hasCoords ? (
                  <div className="device-view-map-wrap">
                    <MapboxMap
                      lat={latest!.latitude!}
                      lng={latest!.longitude!}
                      history={history.filter((h) => h.latitude != null && h.longitude != null) as { latitude: number; longitude: number }[]}
                    />
                  </div>
                ) : (
                  <div className="device-view-empty">No position to show on map</div>
                )}
              </section>

              <section className="device-view-card device-view-card--stats">
                <h2 className="device-view-card-title">Latest update</h2>
                {latest ? (
                  (() => {
                    const batteryStatus = getBatteryStatus({ voltage_v: latest.battery_voltage_v ?? null, percent: latest.battery_percent ?? null });
                    return (
                  <>
                  <div className="device-view-stats">
                    <div className="device-view-stat">
                      <Clock size={16} className="device-view-stat-icon" aria-hidden />
                      <div>
                        <span className="device-view-stat-label">Time</span>
                        <span className="device-view-stat-value">
                          {latest.gps_time ? new Date(latest.gps_time).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="device-view-stat">
                      <Gauge size={16} className="device-view-stat-icon" aria-hidden />
                      <div>
                        <span className="device-view-stat-label">Speed</span>
                        <span className="device-view-stat-value">{latest.speed_kph != null ? `${latest.speed_kph} km/h` : '—'}</span>
                      </div>
                    </div>
                    <div className="device-view-stat">
                      <BatteryLevelIcon tier={batteryStatus.tier} size={16} color={batteryStatus.color.ring} className="device-view-stat-icon" aria-hidden />
                      <div>
                        <span className="device-view-stat-label">Battery</span>
                        <span className="device-view-stat-value" style={{ color: batteryStatus.color.text }}>
                          {batteryStatus.label}
                        </span>
                      </div>
                    </div>
                    <div className="device-view-stat">
                      <Activity size={16} className="device-view-stat-icon" aria-hidden />
                      <div>
                        <span className="device-view-stat-label">GPS</span>
                        <span className="device-view-stat-value">{latest.gps_valid == null ? '—' : latest.gps_valid ? 'Valid' : 'Invalid'}</span>
                      </div>
                    </div>
                  </div>
                  </>
                    );
                  })()
                ) : (
                  <p className="device-view-muted">No location data yet.</p>
                )}
              </section>
            </div>

            <section className="device-view-card device-view-card--history">
              <h2 className="device-view-card-title">History</h2>
              <div className="device-view-history-controls">
                <label className="device-view-history-label">
                  <span>From</span>
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="device-view-input"
                  />
                </label>
                <label className="device-view-history-label">
                  <span>To</span>
                  <input
                    type="datetime-local"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="device-view-input"
                  />
                </label>
                <button type="button" onClick={fetchHistory} disabled={historyLoading} className="device-view-btn device-view-btn--primary">
                  {historyLoading ? 'Loading…' : 'Load'}
                </button>
              </div>
              <div className="device-view-table-wrap">
                <table className="device-view-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>GPS</th>
                      <th>Speed</th>
                      <th>Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historySlice.map((row) => (
                      <tr key={row.id}>
                        <td>{formatHistoryTime(row.received_at)}</td>
                        <td>{row.gps_valid == null ? '—' : row.gps_valid ? 'Yes' : 'No'}</td>
                        <td>{row.speed_kph != null ? row.speed_kph : '—'}</td>
                        <td>{row.event_code || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {history.length > 0 && (
                <div className="device-view-pagination">
                  <p className="device-view-pagination-info">
                    Page {historyPage} of {historyPageCount} · {history.length} total
                  </p>
                  <div className="device-view-pagination-btns">
                    <button
                      type="button"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage <= 1}
                      className="device-view-btn device-view-btn--secondary"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}
                      disabled={historyPage >= historyPageCount}
                      className="device-view-btn device-view-btn--secondary"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              {history.length === 0 && !historyLoading && (
                <p className="device-view-muted">No history in this range.</p>
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
    </main>
  );
}
