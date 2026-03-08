'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Clock, AlertCircle, ExternalLink } from 'lucide-react';
import AppLoadingIcon from '@/components/AppLoadingIcon';
import Logo from '@/components/Logo';

const MapboxMap = dynamic(() => import('@/components/MapboxMap'), { ssr: false });

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

type ViewState = 'LIVE' | 'SLEEPING' | 'INDOOR_NO_GPS' | 'OFFLINE';
type Motion = 'in_motion' | 'stopped';

type ShareData = {
  device: { id: string; name: string };
  expires_at: string;
  view_state?: ViewState;
  motion?: Motion;
  latest: {
    latitude: number;
    longitude: number;
    received_at: string;
    speed_kph: number | null;
    gps_valid: boolean | null;
  } | null;
  history: Array<{
    latitude: number;
    longitude: number;
    received_at: string;
    speed_kph: number | null;
  }>;
};

const POLL_INTERVAL_MS = 30_000;

function formatTimeRemaining(expiresAt: Date): string {
  const now = Date.now();
  const end = expiresAt.getTime();
  if (end <= now) return 'Expired';
  const s = Math.floor((end - now) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m % 60}m left`;
  if (m > 0) return `${m}m ${s % 60}s left`;
  return `${s}s left`;
}

function formatLastUpdate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

export default function ShareTrackingPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [status, setStatus] = useState<'loading' | 'invalid' | 'expired' | 'ok'>('loading');
  const [data, setData] = useState<ShareData | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [address, setAddress] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');

  const fetchShare = useCallback(async () => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
    const body = await res.json().catch(() => ({}));
    if (res.status === 410 || body.error === 'expired') {
      setStatus('expired');
      setData(null);
      return;
    }
    if (!res.ok || body.error === 'invalid') {
      setStatus('invalid');
      setData(null);
      return;
    }
    setData(body);
    setStatus('ok');
  }, [token]);

  useEffect(() => {
    fetchShare();
  }, [fetchShare]);

  useEffect(() => {
    if (status !== 'ok' || !data) return;
    const expiresAt = new Date(data.expires_at);
    function tick() {
      if (expiresAt.getTime() <= Date.now()) {
        setStatus('expired');
        setData(null);
        return;
      }
      setTimeLeft(formatTimeRemaining(expiresAt));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status, data]);

  useEffect(() => {
    if (status !== 'ok' || !data) return;
    const expiresAt = new Date(data.expires_at);
    if (expiresAt.getTime() <= Date.now()) return;
    const poll = setInterval(fetchShare, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [status, data, fetchShare]);

  useEffect(() => {
    if (status !== 'ok' || !data?.latest || data.latest.latitude == null || data.latest.longitude == null) return;
    const lat = data.latest.latitude;
    const lng = data.latest.longitude;
    let cancelled = false;
    reverseGeocode(lng, lat).then((addr) => {
      if (!cancelled) setAddress(addr);
    });
    return () => { cancelled = true; };
  }, [status, data?.latest?.latitude, data?.latest?.longitude]);

  if (status === 'loading') {
    return (
      <div className="share-page share-page--loading">
        <div className="share-loading-center">
          <AppLoadingIcon />
          <p className="share-loading-text">Loading shared tracking…</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid' || status === 'expired') {
    return (
      <div className="share-page">
        <div className="share-page-inner share-page-inner--centered">
          <AlertCircle size={48} className="share-icon-error" aria-hidden />
          <h1 className="share-title">
            {status === 'expired' ? 'Link expired' : 'Invalid link'}
          </h1>
          <p className="share-muted">
            {status === 'expired'
              ? 'This tracking link has expired and is no longer valid.'
              : 'This link is invalid or has been removed.'}
          </p>
        </div>
      </div>
    );
  }

  const hasCoords = data?.latest?.latitude != null && data?.latest?.longitude != null;
  const historyForMap: { latitude: number; longitude: number }[] = []; /* share page: show current position only, no path lines */

  if (!data) return null;

  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${data.latest!.latitude},${data.latest!.longitude}`
    : null;

  return (
    <div className="share-page">
      <div className="share-page-inner">
        <header className="share-header">
          <div className="share-header-top">
            <a href="/" className="share-logo-link" aria-label="RooGPS home">
              <Logo size={36} wide inline />
            </a>
            <div className="share-timer-pill" role="timer" aria-live="polite">
              <Clock size={20} aria-hidden />
              <span className="share-timer-text">{timeLeft}</span>
            </div>
          </div>
          <h1 className="share-title">Shared tracking: {data.device.name}{data.device.model_name ? ` · ${data.device.model_name}` : ''}</h1>
        </header>

        <div className="share-status-row">
          <div className="share-status-card">
            <div className="share-status-label">Status</div>
            <div className={`share-status-value share-status-value--${(data.view_state ?? 'OFFLINE').toLowerCase().replace(/_/g, '-')}`}>
              {data.view_state === 'LIVE' || data.view_state === 'INDOOR_NO_GPS' ? 'Online' : data.view_state === 'SLEEPING' ? 'Sleep' : 'Offline'}
            </div>
          </div>
          <div className="share-status-card">
            <div className="share-status-label">Motion</div>
            <div className={`share-status-value share-status-value--${data.motion === 'in_motion' ? 'in-motion' : 'stopped'}`}>
              {data.motion === 'in_motion' ? 'In motion' : 'Stopped'}
            </div>
          </div>
        </div>

        {data.latest && (
          <div className="share-last-update-card">
            <div className="share-last-update-label">Last update</div>
            <div className="share-last-update-time">{formatLastUpdate(data.latest.received_at)}</div>
            {data.latest.speed_kph != null && (
              <div className="share-last-update-speed">Speed: {data.latest.speed_kph.toFixed(0)} km/h</div>
            )}
          </div>
        )}

        <section className="share-section share-section--map">
          <div className="share-map-header">
            <h2 className="share-section-title">Location</h2>
            <div className="share-map-style-toggle">
              <button
                type="button"
                onClick={() => setMapStyle('dark')}
                className={mapStyle === 'dark' ? 'share-map-btn share-map-btn--active' : 'share-map-btn'}
              >
                Map
              </button>
              <button
                type="button"
                onClick={() => setMapStyle('satellite')}
                className={mapStyle === 'satellite' ? 'share-map-btn share-map-btn--active' : 'share-map-btn'}
              >
                Satellite
              </button>
            </div>
          </div>
          {hasCoords ? (
            <>
              <div className="device-view-map-wrap" key={mapStyle}>
                <MapboxMap
                  lat={data.latest!.latitude}
                  lng={data.latest!.longitude}
                  history={historyForMap}
                  markerVariant="circle-car"
                  mapStyle={mapStyle}
                />
              </div>
              {(address || googleMapsUrl) && (
                <div className="share-address-card">
                  <div className="share-address-card-head">
                    <span className="share-address-card-label">Approximate address</span>
                    {googleMapsUrl && (
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="share-gmaps-btn share-gmaps-btn--subtle"
                      >
                        <ExternalLink size={16} aria-hidden />
                        Open in Google Maps
                      </a>
                    )}
                  </div>
                  {address && (
                    <>
                      <p className="share-address-card-text">{address}</p>
                      <p className="share-address-card-disclaimer">This is an estimate.</p>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="device-view-empty">No position to show on map</div>
          )}
        </section>
      </div>
    </div>
  );
}
