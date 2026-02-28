'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { getAuthHeaders } from '@/lib/api-auth';
import { Route, Loader2, X, Calendar } from 'lucide-react';
import TripRouteMap from '@/components/TripRouteMap';

const TIMEZONE = 'Australia/Melbourne';

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

type TripPoint = { lat: number; lon: number; occurred_at?: string };

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

function getDayBounds(day: 'today' | 'yesterday'): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (day === 'yesterday') {
    const prev = new Date(Date.UTC(y, m, d - 1));
    const y2 = prev.getUTCFullYear();
    const m2 = prev.getUTCMonth();
    const d2 = prev.getUTCDate();
    return {
      from: new Date(Date.UTC(y2, m2, d2, 0, 0, 0, 0)).toISOString(),
      to: new Date(Date.UTC(y2, m2, d2, 23, 59, 59, 999)).toISOString(),
    };
  }
  return {
    from: new Date(Date.UTC(y, m, d, 0, 0, 0, 0)).toISOString(),
    to: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)).toISOString(),
  };
}

function getLast7DaysBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const to = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
  const fromDate = new Date(Date.UTC(y, m, d - 6, 0, 0, 0, 0));
  return {
    from: fromDate.toISOString(),
    to: to.toISOString(),
  };
}

type FilterKind = 'today' | 'yesterday' | 'last7' | 'custom';

type Props = {
  deviceId: string;
  onClose?: () => void;
};

export default function TripsTab({ deviceId, onClose }: Props) {
  const [filter, setFilter] = useState<FilterKind>('today');
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
      const b = getDayBounds(filter);
      from = b.from;
      to = b.to;
    } else if (filter === 'last7') {
      const b = getLast7DaysBounds();
      from = b.from;
      to = b.to;
    } else {
      from = customFrom ? new Date(customFrom).toISOString() : '';
      to = customTo ? new Date(customTo + 'T23:59:59.999').toISOString() : '';
    }
    const headers = await getAuthHeaders(supabase);
    const params = new URLSearchParams({ deviceId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
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
        return;
      }
      setTrips(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setTrips([]);
      setError('Failed to load trips');
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
        setDetailTrip(tripData);
        setDetailPoints(Array.isArray(pointsData) ? pointsData : []);
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

        <div className="trips-filters" role="group" aria-label="Date range">
          {(['today', 'yesterday', 'last7'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`trips-filter-btn${filter === f ? ' trips-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'today' ? 'Today' : f === 'yesterday' ? 'Yesterday' : 'Last 7 days'}
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
            <p>No trips yet.</p>
            <p className="trips-empty-hint">Trips appear when your vehicle moves.</p>
          </div>
        ) : (
          <ul className="trips-list" aria-label="Trip list">
            {trips.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="trips-card"
                  onClick={() => setSelectedTripId(t.id)}
                >
                  <span className="trips-card-title">
                    Trip • {formatTime(t.started_at)} → {formatTime(t.ended_at)}
                  </span>
                  <span className="trips-card-subtitle">
                    {(t.distance_meters / 1000).toFixed(1)} km • {formatDuration(t.duration_seconds)}
                    {t.max_speed_kmh != null ? ` • Max ${Math.round(t.max_speed_kmh)} km/h` : ''}
                  </span>
                  <span className="trips-card-date">{formatDate(t.started_at)}</span>
                </button>
              </li>
            ))}
          </ul>
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
              <h4>Trip</h4>
              <button
                type="button"
                className="trips-detail-close"
                onClick={() => setSelectedTripId(null)}
                aria-label="Close"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
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
      )}
    </div>
  );
}
