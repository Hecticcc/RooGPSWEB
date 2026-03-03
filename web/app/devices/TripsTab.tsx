'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import { Route, Loader2, X, Calendar, RefreshCw, Eye } from 'lucide-react';
import TripRouteMap from '@/components/TripRouteMap';

const TIMEZONE = 'Australia/Melbourne';

/** Melbourne offset in hours (10 = AEST, 11 = AEDT) for a given local date. */
function getMelbourneOffsetHours(year: number, month: number, day: number): number {
  if (month < 4 || month > 10) return 11;
  if (month > 4 && month < 10) return 10;
  const firstSunday = (y: number, m: number) => {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const dow = first.getUTCDay();
    return 1 + (dow === 0 ? 0 : 7 - dow);
  };
  if (month === 4) return day < firstSunday(year, 4) ? 11 : 10;
  return day < firstSunday(year, 10) ? 10 : 11;
}

/** Start/end of a calendar day in Australia/Melbourne as ISO strings (UTC). */
function getDayBoundsInTimezone(day: 'today' | 'yesterday'): { from: string; to: string } {
  const now = new Date();
  const melbourneDateStr = now.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const [yStr, mStr, dStr] = melbourneDateStr.split('-').map(Number);
  let y = yStr!;
  let m = mStr!;
  let d = dStr!;
  if (day === 'yesterday') {
    d -= 1;
    if (d < 1) {
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      d += new Date(Date.UTC(y, m, 0)).getUTCDate();
    }
  }
  const offset = getMelbourneOffsetHours(y, m, d);
  const offsetMs = offset * 60 * 60 * 1000;
  const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMs);
  const to = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMs);
  return { from: from.toISOString(), to: to.toISOString() };
}

function getLast7DaysBoundsInTimezone(): { from: string; to: string } {
  const now = new Date();
  const melbourneDateStr = now.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const [yStr, mStr, dStr] = melbourneDateStr.split('-').map(Number);
  let y = yStr!;
  let m = mStr!;
  let d = dStr!;
  d -= 6;
  while (d < 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    d += new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  const offsetTo = getMelbourneOffsetHours(yStr!, mStr!, dStr!);
  const offsetFrom = getMelbourneOffsetHours(y, m, d);
  const to = new Date(Date.UTC(yStr!, mStr! - 1, dStr!, 23, 59, 59, 999) - offsetTo * 60 * 60 * 1000);
  const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetFrom * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

type Trip = {
  id: string;
  device_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  distance_meters: number;
  max_speed_kmh: number | null;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
};

type TripPoint = { lat: number; lon: number; occurred_at?: string; speed_kph?: number | null };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  });
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} sec`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

function isFutureYear(iso: string): boolean {
  const y = new Date(iso).getUTCFullYear();
  return y > new Date().getUTCFullYear();
}

type FilterKind = 'today' | 'yesterday' | 'last7' | 'all' | 'custom';

type Props = {
  deviceId: string;
  onClose?: () => void;
};

export default function TripsTab({ deviceId, onClose }: Props) {
  const [filter, setFilter] = useState<FilterKind>('last7');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [detailTrip, setDetailTrip] = useState<Trip | null>(null);
  const [detailPoints, setDetailPoints] = useState<TripPoint[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const supabase = createClient();

  const fetchTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    let from = '';
    let to = '';
    if (filter === 'today' || filter === 'yesterday') {
      const b = getDayBoundsInTimezone(filter);
      from = b.from;
      to = b.to;
    } else if (filter === 'last7') {
      const b = getLast7DaysBoundsInTimezone();
      from = b.from;
      to = b.to;
    } else if (filter === 'all') {
      // No date filter - fetch all trips for device
    } else {
      from = customFrom ? new Date(customFrom).toISOString() : '';
      to = customTo ? new Date(customTo + 'T23:59:59.999').toISOString() : '';
    }
    if (from && to && new Date(from) >= new Date(to)) {
      const fromDate = new Date(from);
      fromDate.setUTCHours(0, 0, 0, 0);
      const toDate = new Date(fromDate);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      toDate.setUTCMilliseconds(-1);
      from = fromDate.toISOString();
      to = toDate.toISOString();
      if (typeof window !== 'undefined') {
        console.warn('[RooGPS Trips] Date range was invalid (from >= to); expanded to full day.');
      }
    }
    const headers = await getAuthHeaders(supabase);
    const params = new URLSearchParams({ deviceId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    if (typeof window !== 'undefined') {
      console.group('[RooGPS Trips] Fetch');
      console.log('Filter:', filter, '| deviceId:', deviceId);
      console.log('Date range:', from || '(none)', '→', to || '(none)');
      console.log('URL:', `/api/trips?${params.toString()}`);
    }

    try {
      const res = await fetch(`/api/trips?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { ...headers, 'Cache-Control': 'no-cache' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTrips([]);
        const message = typeof data?.error === 'string' ? data.error : res.status === 401 ? 'Please sign in again' : 'Failed to load trips';
        setError(message);
        setLoading(false);
        if (typeof window !== 'undefined') {
          console.warn('[RooGPS Trips] Error:', res.status, message);
          console.groupEnd();
        }
        return;
      }
      const rawList = Array.isArray(data) ? data : [];
      const seenIds = new Set<string>();
      const tripList = rawList.filter((t: Trip) => {
        if (!t?.id || seenIds.has(t.id)) return false;
        seenIds.add(t.id);
        return true;
      });
      if (tripList.length !== rawList.length && typeof window !== 'undefined') {
        console.warn('[RooGPS Trips] Dropped', rawList.length - tripList.length, 'duplicate trip(s) by id');
      }
      setTrips(tripList);
      setError(null);

      if (typeof window !== 'undefined') {
        console.log('Trips returned:', tripList.length, rawList.length !== tripList.length ? `(from ${rawList.length} raw)` : '');
        tripList.forEach((t: Trip, i: number) => {
          const start = t.started_at ? new Date(t.started_at).toISOString() : '—';
          const end = t.ended_at ? new Date(t.ended_at).toISOString() : '—';
          console.log(
            `  #${i + 1} id=${t.id ?? '—'} | ${start} → ${end} | ${t.duration_seconds}s | ${t.distance_meters}m | max ${t.max_speed_kmh ?? '—'} km/h`
          );
        });
        console.table(
          tripList.map((t: Trip) => ({
            id: t.id ?? '—',
            started_at: t.started_at ?? '—',
            ended_at: t.ended_at ?? '—',
            duration_sec: t.duration_seconds,
            distance_m: t.distance_meters,
            max_kmh: t.max_speed_kmh ?? '—',
          }))
        );
        console.groupEnd();
      }
    } catch (e) {
      setTrips([]);
      setError('Failed to load trips');
      if (typeof window !== 'undefined') {
        console.warn('[RooGPS Trips] Fetch failed:', e);
        console.groupEnd();
      }
    }
    setLoading(false);
  }, [deviceId, filter, customFrom, customTo, supabase]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    if (!selectedTripId) {
      setDetailTrip(null);
      setDetailPoints([]);
      return;
    }
    setDetailLoading(true);
    let cancelled = false;
    getAuthHeaders(supabase).then((headers) => {
      if (cancelled) return;
      return Promise.all([
        fetch(`/api/trips/${selectedTripId}`, { credentials: 'include', headers: { ...headers, 'Cache-Control': 'no-cache' } }),
        fetch(`/api/trips/${selectedTripId}/points`, { credentials: 'include', headers: { ...headers, 'Cache-Control': 'no-cache' } }),
      ]).then(async ([tr, pt]) => {
        if (cancelled) return;
        if (!tr.ok || !pt.ok) {
          setDetailTrip(null);
          setDetailPoints([]);
          return;
        }
        const tripData = await tr.json();
        const pointsData = await pt.json();
        const pointsList = Array.isArray(pointsData) ? pointsData : [];
        setDetailTrip(tripData);
        setDetailPoints(pointsList);

        if (typeof window !== 'undefined') {
          console.group('[RooGPS Trips] Trip detail');
          console.log('Trip id:', selectedTripId);
          console.log('Trip:', { started_at: tripData?.started_at, ended_at: tripData?.ended_at, duration_seconds: tripData?.duration_seconds, distance_meters: tripData?.distance_meters, max_speed_kmh: tripData?.max_speed_kmh });
          console.log('Points for this trip:', pointsList.length);
          pointsList.forEach((p: TripPoint, i: number) => {
            console.log(`  point ${i + 1}: lat=${p.lat}, lon=${p.lon}${p.occurred_at ? ` at ${p.occurred_at}` : ''}`);
          });
          console.groupEnd();
        }
      }).finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    });
    return () => { cancelled = true; };
  }, [selectedTripId, supabase]);

  return (
    <div id="tracker-settings-panel-trips" role="tabpanel" aria-labelledby="tracker-settings-tab-trips" className="tracker-settings-modal-panel">
      <div className="tracker-settings-modal-section">
        <h3 className="tracker-settings-modal-section-title">Trips</h3>
        <p className="tracker-settings-modal-hint">
          Trips are created when your vehicle moves. Choose a period to view.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <button
            type="button"
            className="trips-filter-btn"
            onClick={() => { setError(null); fetchTrips(); }}
            disabled={loading}
            aria-label="Refresh trips"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden />
            Refresh
          </button>
        </div>
        <div className="trips-filters" role="group" aria-label="Date range">
          {(['today', 'yesterday', 'last7', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`trips-filter-btn${filter === f ? ' trips-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'today' ? 'Today' : f === 'yesterday' ? 'Yesterday' : f === 'last7' ? 'Last 7 days' : 'All'}
            </button>
          ))}
          <button
            type="button"
            className={`trips-filter-btn${filter === 'custom' ? ' trips-filter-btn--active' : ''}`}
            onClick={() => setFilter('custom')}
          >
            <Calendar size={14} aria-hidden />
            Custom
          </button>
        </div>

        {filter === 'custom' && (
          <div className="trips-custom-dates">
            <label>
              <span className="trips-custom-label">From</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="trips-custom-input"
              />
            </label>
            <label>
              <span className="trips-custom-label">To</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="trips-custom-input"
              />
            </label>
          </div>
        )}

        {error && (
          <p className="trips-error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="trips-loading" aria-busy="true">
            <Loader2 size={24} className="animate-spin" />
            <span>Loading trips…</span>
          </div>
        ) : trips.length === 0 ? (
          <div className="trips-empty">
            <Route size={32} strokeWidth={1.5} aria-hidden />
            <p>No trips in this range.</p>
            <p className="trips-empty-hint">
              Try <button type="button" className="trips-empty-link" onClick={() => setFilter('last7')}>Last 7 days</button> or <button type="button" className="trips-empty-link" onClick={() => setFilter('all')}>All</button>. Trips are created when your vehicle moves (at least ~2 min or 300 m) and can take a few minutes to appear after a drive.
            </p>
          </div>
        ) : (
          <div className="trips-table-wrap">
            <table className="trips-table" aria-label="Trip list">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                  <th scope="col" className="trips-table-distance">Distance</th>
                  <th scope="col" className="trips-table-num">Duration</th>
                  <th scope="col" className="trips-table-num">Max speed</th>
                  <th scope="col" className="trips-table-view-col">View</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr
                    key={t.id}
                    className="trips-table-row"
                    onClick={() => setSelectedTripId(t.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), setSelectedTripId(t.id)) : undefined}
                    aria-label={`Trip ${formatDate(t.started_at)} ${formatTime(t.started_at)} to ${formatTime(t.ended_at)}`}
                  >
                    <td className="trips-table-date">
                      {formatDate(t.started_at)}
                      {isFutureYear(t.started_at) && (
                        <span className="trips-card-date-warn" title="Trip date is in the future; check tracker clock (e.g. timezone or year).">
                          {' '}(check clock)
                        </span>
                      )}
                    </td>
                    <td>{formatTime(t.started_at)}</td>
                    <td>{formatTime(t.ended_at)}</td>
                    <td className="trips-table-distance">{(t.distance_meters / 1000).toFixed(1)} km</td>
                    <td className="trips-table-num">{formatDuration(t.duration_seconds)}</td>
                    <td className="trips-table-num">
                      {t.max_speed_kmh != null ? `${Math.round(t.max_speed_kmh)} km/h` : '—'}
                    </td>
                    <td className="trips-table-view-col">
                      <button
                        type="button"
                        className="trips-table-view-btn"
                        onClick={(e) => { e.stopPropagation(); setSelectedTripId(t.id); }}
                        aria-label={`View trip ${formatDate(t.started_at)}`}
                      >
                        <Eye size={16} aria-hidden />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTripId && (
        <div
          className="trips-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Trip detail"
          onClick={(e) => e.target === e.currentTarget && setSelectedTripId(null)}
        >
          <div className="trips-detail-modal">
            <div className="trips-detail-header">
              <h4>Trip details</h4>
              <button
                type="button"
                className="trips-detail-close"
                onClick={() => setSelectedTripId(null)}
                aria-label="Close"
              >
                <X size={22} strokeWidth={2} />
              </button>
            </div>
            <div className="trips-detail-body">
              {detailLoading ? (
                <div className="trips-detail-loading">
                  <Loader2 size={28} className="animate-spin" />
                  <span>Loading route…</span>
                </div>
              ) : detailTrip ? (
                <>
                  <div className="trips-detail-map-wrap">
                    <TripRouteMap
                      points={detailPoints}
                      startLat={detailTrip.start_lat}
                      startLon={detailTrip.start_lon}
                      endLat={detailTrip.end_lat}
                      endLon={detailTrip.end_lon}
                    />
                  </div>
                  <div className="trips-detail-stats">
                    <div className="trips-detail-stat">
                      <span className="trips-detail-stat-label">Distance</span>
                      <span className="trips-detail-stat-value">{(detailTrip.distance_meters / 1000).toFixed(1)} km</span>
                    </div>
                    <div className="trips-detail-stat">
                      <span className="trips-detail-stat-label">Duration</span>
                      <span className="trips-detail-stat-value">{formatDuration(detailTrip.duration_seconds)}</span>
                    </div>
                    {detailTrip.max_speed_kmh != null && (
                    <div className="trips-detail-stat">
                      <span className="trips-detail-stat-label">Max speed</span>
                      <span className="trips-detail-stat-value">{Math.round(detailTrip.max_speed_kmh)} km/h</span>
                    </div>
                    )}
                    <div className="trips-detail-stat">
                      <span className="trips-detail-stat-label">Started</span>
                      <span className="trips-detail-stat-value">{formatTime(detailTrip.started_at)}, {formatDate(detailTrip.started_at)}</span>
                    </div>
                    <div className="trips-detail-stat">
                      <span className="trips-detail-stat-label">Ended</span>
                      <span className="trips-detail-stat-value">{formatTime(detailTrip.ended_at)}, {formatDate(detailTrip.ended_at)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="trips-detail-error">Could not load trip.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
